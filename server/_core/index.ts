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

  // Endpoint de sincronização automática (chamado por tarefa agendada Manus)
  // Aceita qualquer usuário autenticado (role=user) — a tarefa agendada usa cookie de sessão
  app.post("/api/scheduled/sync-products", async (req, res) => {
    try {
      const result = await runAutoSync();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[AutoSync] Erro:", err);
      res.status(500).json({ ok: false, error: err.message });
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
      .catch(err => console.error("[PDV] Setup error:", err));
  });
}

startServer().catch(console.error);
