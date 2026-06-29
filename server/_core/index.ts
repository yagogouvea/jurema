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
import { registerSocialAgentApi } from "../social/agentApi";
import { runScheduledPublications, collectMetricsForPublished } from "../social/socialService";

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
  // API REST do agente Social (MCP) — protegida por SOCIAL_AGENT_KEY
  registerSocialAgentApi(app);
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

  // Diagnóstico do sincronismo de um produto específico (PDV ↔ planilha).
  // ?codigo=TA-JG-BRA-1-X            → mostra o estado no banco e na planilha
  // &push=1&estoque=60               → executa o writeback real (PDV→planilha)
  app.get("/api/diag/product-sync", async (req, res) => {
    const codigo = String(req.query.codigo ?? "").trim();
    if (!codigo) return res.status(400).json({ ok: false, error: "informe ?codigo=" });
    const push = String(req.query.push ?? "") === "1";
    const estoque = req.query.estoque !== undefined ? parseInt(String(req.query.estoque), 10) : undefined;

    const out: any = { ok: true, codigo };
    // Lado banco
    try {
      const mysql = (await import("mysql2/promise")).default;
      const url = process.env.DATABASE_URL;
      if (url) {
        const db = await mysql.createConnection(url);
        const [rows] = await db.execute(
          "SELECT id, codigo, `time`, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive, updatedAt FROM pdv_products WHERE codigo = ? LIMIT 5",
          [codigo]
        );
        out.banco = rows;
        await db.end();
      } else {
        out.banco = "DATABASE_URL ausente";
      }
    } catch (e: any) {
      out.bancoErro = e?.message ?? String(e);
    }
    // Lado planilha (+ writeback opcional)
    try {
      const { diagnoseProductWriteback } = await import("../routers/pdvSheetsWriter");
      out.planilha = await diagnoseProductWriteback(codigo, push, estoque);
    } catch (e: any) {
      out.planilhaErro = e?.message ?? String(e);
    }
    res.json(out);
  });
  // Diagnóstico da notificação de pedido por WhatsApp.
  // ?send=1&to=5511981693476  → tenta enviar uma mensagem de teste real
  // ?send=1&to=all            → envia para todos os números configurados
  // ?tipo=suprimento|sangria   → formato de mensagem de caixa (padrão: pedido)
  app.get("/api/diag/wa-notify", async (req, res) => {
    const out: any = {
      ok: true,
      hasBridgeUrl: !!process.env.WA_BRIDGE_URL,
      hasBridgeKey: !!process.env.WA_BRIDGE_API_KEY,
      bridgeUrl: process.env.WA_BRIDGE_URL ? `${process.env.WA_BRIDGE_URL.slice(0, 40)}...` : null,
    };
    try {
      const mysql = (await import("mysql2/promise")).default;
      const url = process.env.DATABASE_URL;
      if (!url) { out.dbErro = "DATABASE_URL ausente"; return res.json(out); }
      const db = await mysql.createConnection(url);
      try {
        const [insts] = await db.execute(
          "SELECT id, name, phone, instanceId, status, active FROM wa_instances ORDER BY id ASC"
        );
        out.instancias = insts;
      const [cfg] = await db.execute(
        "SELECT value FROM pdv_config WHERE `key` = 'notif_pedido_telefone' LIMIT 1"
        );
        const cfgVal = (cfg as any[])[0];
        const { getNotificationPhones, DEFAULT_NOTIF_PHONES } = await import("../pdvWaNotify");
        const phones = await getNotificationPhones(db);
        out.numerosResolvidos = phones;
        out.codigoVersao = "multi-notify-v2";
        out.telefoneConfig = cfgVal === undefined
          ? `(não definido → padrão ${DEFAULT_NOTIF_PHONES.join(", ")})`
          : phones.length > 0
            ? phones.join(", ")
            : "(vazio → DESATIVADO)";

        // Status REAL da bridge (fonte de verdade da conexão)
        try {
          const bridgeUrl = process.env.WA_BRIDGE_URL;
          const bridgeKey = process.env.WA_BRIDGE_API_KEY;
          if (bridgeUrl) {
            const sres = await fetch(`${bridgeUrl}/status`, {
              headers: { "x-wa-bridge-key": bridgeKey ?? "" },
              signal: AbortSignal.timeout(8_000),
            });
            out.bridgeStatusOk = sres.ok;
            if (sres.ok) {
              const sdata = await sres.json() as any;
              out.bridgeSessions = (sdata?.sessions ?? []).map((s: any) => ({
                instanceId: s.instanceId, status: s.status, phone: s.phone, hasQr: s.hasQr,
              }));
            }
          }
        } catch (e: any) {
          out.bridgeStatusErro = e?.message ?? String(e);
        }

        const { resolveSenderInstanceSlot, sendWaBridgeText, phoneToJid } = await import("../waSend");
        const slot = await resolveSenderInstanceSlot(db);
        out.slotEscolhido = slot;

        const doSend = String(req.query.send ?? "") === "1";
        if (doSend) {
          const tipo = String(req.query.tipo ?? "pedido").toLowerCase();
          const toRaw = String(req.query.to ?? "5511981693476");
          const destinos = toRaw === "all"
            ? phones.length > 0 ? phones : ["5511981693476", "5511992022928"]
            : toRaw.split(/[,;\s]+/).map((p) => p.replace(/\D/g, "")).filter(Boolean);

          out.destinos = destinos;
          out.tipo = tipo;
          if (slot === null) {
            out.envio = "FALHOU: nenhuma instância conectada/ativa";
          } else {
            const { buildCashFlowNotificationMessage } = await import("../pdvWaNotify");
            const contentParam = req.query.content ? String(req.query.content) : "";
            const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const content = contentParam
              ? Buffer.from(contentParam, "base64").toString("utf8")
              : tipo === "suprimento"
                ? buildCashFlowNotificationMessage({
                    tipo: "SUPRIMENTO",
                    descricao: "[TESTE] Entrada de caixa — troco e fundo de operação",
                    valor: 350,
                    usuario: "Sistema (teste)",
                    origem: "manual",
                  })
                : tipo === "sangria"
                  ? buildCashFlowNotificationMessage({
                      tipo: "SANGRIA",
                      descricao: "[TESTE] Retirada para depósito bancário",
                      valor: 200,
                      usuario: "Sistema (teste)",
                      origem: "manual",
                    })
                  : `🔔 Teste de notificação de pedido — ${agora}`;

            const resultados: { phone: string; ok: boolean; erro?: string }[] = [];
            for (const to of destinos) {
              try {
                const okSend = await sendWaBridgeText(slot, phoneToJid(to), content);
                resultados.push({ phone: to, ok: !!okSend });
              } catch (e: any) {
                resultados.push({ phone: to, ok: false, erro: e?.message ?? String(e) });
              }
            }
            out.envio = resultados;
          }
        }
      } finally {
        await db.end();
      }
    } catch (e: any) {
      out.ok = false;
      out.erro = e?.message ?? String(e);
    }
    res.json(out);
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

    // Agendador do módulo Social: publica posts agendados vencidos e coleta métricas.
    startSocialScheduler();
  });
}

/**
 * Agendador do módulo Social:
 * - A cada SOCIAL_PUBLISH_INTERVAL_MIN (padrão 1 min): publica posts agendados vencidos.
 * - A cada SOCIAL_METRICS_INTERVAL_HOURS (padrão 6 h): coleta métricas dos publicados.
 * Ambos se autodesligam se o publisher (Ayrshare) não estiver configurado.
 */
function startSocialScheduler() {
  const publishMin = parseInt(process.env.SOCIAL_PUBLISH_INTERVAL_MIN || "1", 10);
  const metricsHours = parseInt(process.env.SOCIAL_METRICS_INTERVAL_HOURS || "6", 10);

  let publishing = false;
  const publishTick = async () => {
    if (publishing) return;
    publishing = true;
    try {
      const r = await runScheduledPublications();
      if (!r.skippedNotConfigured && r.attempted > 0) {
        console.log(`[Social] Agendados: ${r.published} publicados, ${r.failed} falharam (de ${r.attempted}).`);
      }
    } catch (err: any) {
      console.error("[Social] Falha ao publicar agendados:", err?.message ?? err);
    } finally {
      publishing = false;
    }
  };

  let collecting = false;
  const metricsTick = async () => {
    if (collecting) return;
    collecting = true;
    try {
      const r = await collectMetricsForPublished();
      if (!r.skippedNotConfigured && r.collected > 0) {
        console.log(`[Social] Métricas coletadas: ${r.collected} registros.`);
      }
    } catch (err: any) {
      console.error("[Social] Falha ao coletar métricas:", err?.message ?? err);
    } finally {
      collecting = false;
    }
  };

  if (Number.isFinite(publishMin) && publishMin > 0) {
    setTimeout(publishTick, 20_000);
    setInterval(publishTick, publishMin * 60_000);
  }
  if (Number.isFinite(metricsHours) && metricsHours > 0) {
    setTimeout(metricsTick, 120_000);
    setInterval(metricsTick, metricsHours * 60 * 60_000);
  }
  console.log(
    `[Social] Agendador ativo — publica a cada ${publishMin} min, métricas a cada ${metricsHours} h.`
  );
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
