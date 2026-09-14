import type { Express, Request, Response } from "express";
import { createPdvMysqlConnection } from "./pdvMysql";
import { verifyPdvToken } from "./routers/pdvAuth";
import { isValidSofiaPhotoBuffer } from "./pdvSofiaPhotoValidate";

/** GET /api/pdv/pagamento/comprovante/:paymentId — exige sessão PDV. */
export function registerPdvPaymentReceiptRoute(app: Express): void {
  app.get("/api/pdv/pagamento/comprovante/:paymentId", async (req: Request, res: Response) => {
    const seller = await verifyPdvToken(req);
    const q = typeof req.query.t === "string" ? req.query.t.trim() : "";
    let ok = Boolean(seller);
    if (!ok && q) {
      const fakeReq = {
        headers: { authorization: `Bearer ${q}`, cookie: "" },
      } as Request;
      ok = Boolean(await verifyPdvToken(fakeReq));
    }
    if (!ok) {
      res.status(401).type("text/plain").send("Faça login no PDV");
      return;
    }

    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
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
        "SELECT mimeType, data FROM pdv_payment_receipts WHERE paymentId = ? LIMIT 1",
        [paymentId]
      );
      const row = (rows as { mimeType?: string; data?: Buffer }[])[0];
      if (!row?.data) {
        res.status(404).type("text/plain").send("Comprovante não encontrado");
        return;
      }
      const buf: Buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data as Buffer);
      if (!isValidSofiaPhotoBuffer(buf)) {
        res.status(404).type("text/plain").send("Comprovante inválido");
        return;
      }
      res.setHeader("Content-Type", String(row.mimeType || "image/jpeg"));
      res.setHeader("Content-Length", String(buf.length));
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.end(buf);
    } catch (err) {
      console.error("[PDV receipt] erro ao servir comprovante", paymentId, err);
      if (!res.headersSent) res.status(500).type("text/plain").send("Erro ao servir comprovante");
    } finally {
      if (conn) {
        try { await conn.end(); } catch { /* ignore */ }
      }
    }
  });
}
