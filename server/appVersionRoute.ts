import type { Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Identidade do build do front-end.
 *
 * O Vite embute um hash no nome do bundle (`/assets/index-XXXX.js`), então esse
 * valor só muda quando sai um deploy que realmente alterou o app. O cliente
 * compara com o valor que carregou e se recarrega sozinho quando fica pra trás
 * (celular que ficou dias com a aba aberta continuava rodando código antigo e
 * batia em validações novas do servidor sem ter como atendê-las).
 */
let cachedVersion: string | null = null;

function indexHtmlCandidates(): string[] {
  return [
    // produção: server bundlado em dist/, front em dist/public/
    path.resolve(import.meta.dirname, "public", "index.html"),
    // dev/tsx: arquivo roda de server/, build do front em dist/public/
    path.resolve(import.meta.dirname, "..", "dist", "public", "index.html"),
    path.resolve(process.cwd(), "dist", "public", "index.html"),
  ];
}

function resolveVersion(): string {
  if (cachedVersion) return cachedVersion;

  for (const file of indexHtmlCandidates()) {
    try {
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, "utf-8");
      const match = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/);
      if (match) {
        cachedVersion = match[0];
        return cachedVersion;
      }
    } catch {
      /* tenta o próximo candidato */
    }
  }

  cachedVersion =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    "dev";
  return cachedVersion;
}

export function registerAppVersionRoute(app: Express): void {
  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({ version: resolveVersion() });
  });
}
