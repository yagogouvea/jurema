import type { Express, Request, Response } from "express";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./routers/pdvAuth";
import { resolveStoredMediaToViewUrl } from "./waMediaResolve";

function mysqlRowField(row: Record<string, unknown>, name: string): unknown {
  if (row == null || typeof row !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(row, name)) return (row as any)[name];
  const want = name.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === want) return (row as any)[key];
  }
  return undefined;
}

function guessContentTypeFromWaType(type: string): string {
  switch (type) {
    case "image":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/ogg";
    case "sticker":
      return "image/webp";
    case "document":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

async function openMysqlLikeWaRouter(): Promise<mysql.Connection | null> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return mysql.createConnection(url);
}

const PROXY_MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/pdv/wa-media/:messageId
 *
 * Faz proxy da mídia de `wa_messages` com autenticação PDV (cookie `pdv_token`).
 * Usado quando não há URL https direta (ex.: só `mediaStorageKey` no banco).
 */
export function registerWaMessageMediaRoute(app: Express): void {
  app.get("/api/pdv/wa-media/:messageId", async (req: Request, res: Response) => {
    const seller = await verifyPdvToken(req).catch(() => null);
    if (!seller) {
      res.status(401).type("text/plain").send("Não autenticado");
      return;
    }

    const messageId = Number.parseInt(String(req.params.messageId || ""), 10);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      res.status(400).end();
      return;
    }

    let conn: mysql.Connection | null = null;
    try {
      conn = await openMysqlLikeWaRouter();
      if (!conn) {
        res.status(503).type("text/plain").send("DB indisponível");
        return;
      }

      const [rows] = await conn.execute("SELECT * FROM wa_messages WHERE id = ? LIMIT 1", [messageId]);
      const raw = (rows as any[])[0] as Record<string, unknown> | undefined;
      if (!raw) {
        res.status(404).type("text/plain").send("Mensagem não encontrada");
        return;
      }

      const type = String(mysqlRowField(raw, "type") || "text");
      const mediaUrl = mysqlRowField(raw, "mediaUrl");
      const mediaStorageKey = mysqlRowField(raw, "mediaStorageKey");

      const upstream = await resolveStoredMediaToViewUrl(
        mediaUrl == null ? null : String(mediaUrl),
        mediaStorageKey == null ? null : String(mediaStorageKey)
      );
      if (!upstream) {
        res.status(404).type("text/plain").send("Mídia indisponível");
        return;
      }

      const upstreamRes = await fetch(upstream, {
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
        headers: { "User-Agent": "JuremaPDV/1.0 (wa-media-proxy)" },
      });
      if (!upstreamRes.ok) {
        console.error(`[wa-media] upstream ${upstreamRes.status} messageId=${messageId}`);
        res.status(502).type("text/plain").send("Falha ao carregar mídia");
        return;
      }

      const ct =
        upstreamRes.headers.get("content-type")?.split(";")[0]?.trim()
        || guessContentTypeFromWaType(type);
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "private, max-age=120");

      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      if (buf.length > PROXY_MAX_BYTES) {
        res.status(413).type("text/plain").send("Mídia muito grande");
        return;
      }
      res.setHeader("Content-Length", String(buf.length));
      res.end(buf);
    } catch (err) {
      console.error("[wa-media] erro messageId=", messageId, err);
      if (!res.headersSent) res.status(500).type("text/plain").send("Erro ao servir mídia");
    } finally {
      if (conn) {
        try {
          await conn.end();
        } catch {
          /* ignore */
        }
      }
    }
  });
}
