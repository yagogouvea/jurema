import type { Express, Request, Response } from "express";
import { createPdvMysqlConnection } from "./pdvMysql";

/**
 * Rota pública GET /api/pdv/sofia/foto/:pedidoId
 *
 * Serve o blob da foto Sofia armazenado em `pdv_order_photos.data` (MySQL LONGBLOB).
 *
 * Decisão de auth:
 *  - O caminho é divulgado embarcado no preview/relatório (PDF) do PDV; precisa
 *    ser legível por qualquer browser/cliente que esteja imprimindo, sem cookie.
 *  - O `pedidoId` é gerado aleatoriamente (`PED-XXXXXXXX`), funcionando como
 *    URL não-listável; o conteúdo é foto de produto/comprovante, não dado
 *    sensível. Optamos por endpoint público com cache forte.
 *  - Caso futuramente seja necessário privacidade, basta exigir token PDV aqui.
 */
export function registerPdvSofiaPhotoRoute(app: Express): void {
  app.get("/api/pdv/sofia/foto/:pedidoId", async (req: Request, res: Response) => {
    const pedidoId = String(req.params.pedidoId || "").trim();
    if (!pedidoId || pedidoId.length > 50) {
      res.status(400).end();
      return;
    }
    let conn: Awaited<ReturnType<typeof createPdvMysqlConnection>> = null;
    try {
      conn = await createPdvMysqlConnection();
      if (!conn) {
        res.status(503).type("text/plain").send("DB unavailable");
        return;
      }
      const [rows] = await conn.execute(
        "SELECT mimeType, data, sizeBytes FROM pdv_order_photos WHERE pedidoId = ? LIMIT 1",
        [pedidoId]
      );
      const row = (rows as any[])[0];
      if (!row || !row.data) {
        res.status(404).type("text/plain").send("Foto não encontrada");
        return;
      }
      const mimeType = String(row.mimeType || "image/jpeg");
      const buf: Buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", String(buf.length));
      // Cache imutável: mudanças vêm pela query string `?v=<timestamp>` no fotoUrl.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(buf);
    } catch (err) {
      console.error("[PDV Sofia photo] erro ao servir foto", pedidoId, err);
      if (!res.headersSent) res.status(500).type("text/plain").send("Erro ao servir foto");
    } finally {
      if (conn) {
        try { await conn.end(); } catch { /* ignore */ }
      }
    }
  });
}
