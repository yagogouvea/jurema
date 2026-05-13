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

type MediaAuthFail = { ok: false; status: number; text: string };
type MediaAuthOk = { ok: true };
type MediaAuth = MediaAuthOk | MediaAuthFail;

async function authorizeWaMediaRequest(req: Request, messageId: number): Promise<MediaAuth> {
  const cookieUser = await verifyPdvToken(req).catch(() => null);
  if (cookieUser) return { ok: true };

  const raw = req.query?.t;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  if (!String(token).trim()) return { ok: false, status: 401, text: "Não autenticado" };

  try {
    const { jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
    const { payload } = await jwtVerify(String(token).trim(), secret);
    const p = payload as Record<string, unknown>;
    if (p.p !== "wa_media") return { ok: false, status: 403, text: "Token inválido" };
    const mid = Number(p.mid);
    if (!Number.isFinite(mid) || mid !== messageId) {
      return { ok: false, status: 403, text: "Token não corresponde à mensagem" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, text: "Sessão de mídia inválida ou expirada" };
  }
}

const PROXY_MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/pdv/wa-media/:messageId?t=<jwt opcional>
 *
 * Autenticação: cookie `pdv_token` **ou** query `t` (JWT emitido por `wa.getMediaViewTokens`).
 */
export function registerWaMessageMediaRoute(app: Express): void {
  app.get("/api/pdv/wa-media/:messageId", async (req: Request, res: Response) => {
    const messageId = Number.parseInt(String(req.params.messageId || ""), 10);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      res.status(400).end();
      return;
    }

    const auth = await authorizeWaMediaRequest(req, messageId);
    if (!auth.ok) {
      res.status(auth.status).type("text/plain").send(auth.text);
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
        console.warn(`[wa-media] 404 messageId=${messageId} motivo=row_not_found`);
        res.status(404).type("text/plain").send("Mensagem não encontrada");
        return;
      }

      const type = String(mysqlRowField(raw, "type") || "text");
      const mediaUrl = mysqlRowField(raw, "mediaUrl");
      const mediaStorageKey = mysqlRowField(raw, "mediaStorageKey");
      const mediaUrlStr = mediaUrl == null ? "" : String(mediaUrl);
      const mediaKeyStr = mediaStorageKey == null ? "" : String(mediaStorageKey);

      console.log(
        `[wa-media] in messageId=${messageId} type=${type} urlLen=${mediaUrlStr.length} keyLen=${mediaKeyStr.length} urlPrefix=${mediaUrlStr.substring(0, 60)} key=${mediaKeyStr.substring(0, 80)}`
      );

      let upstream: string | null = null;
      let resolutionErr: string | null = null;
      try {
        upstream = await resolveStoredMediaToViewUrl(mediaUrlStr || null, mediaKeyStr || null);
      } catch (e) {
        resolutionErr = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        console.error(`[wa-media] resolveStoredMediaToViewUrl falhou messageId=${messageId}`, e);
      }

      if (!upstream) {
        console.warn(
          `[wa-media] 404 messageId=${messageId} motivo=upstream_null hasUrl=${!!mediaUrlStr} hasKey=${!!mediaKeyStr} err=${resolutionErr ?? "none"}`
        );
        res
          .status(404)
          .type("text/plain")
          .send(
            mediaUrlStr || mediaKeyStr
              ? `Mídia não pôde ser resolvida no storage${resolutionErr ? ` (${resolutionErr})` : ""}`
              : "Mensagem sem mídia gravada no servidor"
          );
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
