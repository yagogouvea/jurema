import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerUploadRoutes } from "../uploadHandler";
import { registerPdvSofiaPhotoRoute } from "../pdvSofiaPhotoRoute";
import { registerWaMessageMediaRoute } from "../waMessageMediaRoute";
import { runPdvMigration, seedPdvData } from "../routers/pdvMigration";
import { runWaMediaBlobMigration } from "../routers/waMediaBlobMigration";
import { runWaStatusPresetsMigration } from "../routers/waStatusPresetsMigration";
import { runAutoSync } from "../routers/pdvAutoSync";

// `tsx watch` no Windows costuma não definir NODE_ENV; sem isso o Vite não sobe.
const entry = process.argv[1] || "";
if (!process.env.NODE_ENV && /server[/\\]_core[/\\]index\.(ts|mts|cts)$/.test(entry.replace(/\\/g, "/"))) {
  process.env.NODE_ENV = "development";
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.warn(
      "\n[PDV] DATABASE_URL não definido: login PDV e leitura de dados falham. " +
        "Crie `.env` na raiz com DATABASE_URL=mysql://...\n"
    );
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Healthcheck — sempre disponível, sem dependências (nem DB). O Railway
  // chama esse endpoint a cada poucos segundos; precisa responder rápido
  // mesmo se a migration estiver rodando ou o banco estiver lento.
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      ts: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload routes
  registerUploadRoutes(app);
  // Foto Sofia armazenada em MySQL LONGBLOB (servida com cache forte e ?v= cache-buster)
  registerPdvSofiaPhotoRoute(app);
  registerWaMessageMediaRoute(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Endpoint de sincronização da planilha de produtos.
  // Por padrão faz sync COMPLETO (sobrescreve estoque). Para sync seletivo
  // (preserva o estoque dos produtos existentes), use ?stock=keep.
  app.post("/api/scheduled/sync-products", async (req, res) => {
    try {
      const skipStockOverwrite = String(req.query.stock ?? "").toLowerCase() === "keep";
      const result = await runAutoSync({ skipStockOverwrite });
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[AutoSync] Erro:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Diagnóstico do escritor de planilha (PDV → planilha). Mostra se o
  // service account está presente, se o JSON parseia e se o token é gerado.
  // Use ?write=1 para também testar a ESCRITA real (grava e limpa a célula R1).
  // Não expõe a chave privada — apenas client_email/project_id e o status.
  app.get("/api/diag/sheets-writer", async (req, res) => {
    try {
      const { diagnoseSheetsWriter } = await import("../routers/pdvSheetsWriter");
      const doWrite = String(req.query.write ?? "") === "1";
      const result = await diagnoseSheetsWriter(doWrite);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Run PDV migration and seed after server starts
    runPdvMigration()
      .then(() => seedPdvData())
      .then(() => runWaMediaBlobMigration())
      .then(() => runWaStatusPresetsMigration())
      .catch(err => console.error("[PDV] Setup error:", err));

    // Agendador interno de sincronização da planilha → sistema.
    // Substitui a antiga tarefa agendada externa (Manus) que parou após a
    // migração para a Railway. Usa sync SELETIVO (preserva estoque).
    startProductSyncScheduler();
  });
}

/**
 * Roda runAutoSync periodicamente em modo seletivo (sem sobrescrever estoque).
 * - Intervalo via PDV_SYNC_INTERVAL_MIN (padrão 15 min). 0 = desliga.
 * - Lock simples para não sobrepor execuções.
 */
function startProductSyncScheduler() {
  if (!process.env.GOOGLE_SHEETS_API_KEY) {
    console.warn("[AutoSync] GOOGLE_SHEETS_API_KEY ausente — agendador desativado.");
    return;
  }
  const intervalMin = parseInt(process.env.PDV_SYNC_INTERVAL_MIN || "15", 10);
  if (!Number.isFinite(intervalMin) || intervalMin <= 0) {
    console.log("[AutoSync] Agendador desativado (PDV_SYNC_INTERVAL_MIN <= 0).");
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) {
      console.log("[AutoSync] Execução anterior ainda em andamento — pulando este ciclo.");
      return;
    }
    running = true;
    try {
      const r = await runAutoSync({ skipStockOverwrite: true });
      console.log(`[AutoSync] Ciclo agendado OK — novos: ${r.inseridos}, atualizados: ${r.atualizados}, ignorados: ${r.ignorados}.`);
    } catch (err: any) {
      console.error("[AutoSync] Ciclo agendado falhou:", err?.message ?? err);
    } finally {
      running = false;
    }
  };

  // Primeira execução logo após o boot, depois no intervalo configurado.
  setTimeout(tick, 30_000);
  setInterval(tick, intervalMin * 60_000);
  console.log(`[AutoSync] Agendador ativo — sync seletivo a cada ${intervalMin} min.`);
}

startServer().catch(console.error);
