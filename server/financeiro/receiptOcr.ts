/**
 * Lê comprovantes de PIX/cartão (foto) e extrai titular/valor para a conciliação.
 * Resultado fica em cache na própria linha do comprovante — não reprocessa.
 */
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { mergePayerNames, toCents } from "./normalize";

export type ReceiptHint = {
  hasReceipt: boolean;
  receiptCount?: number;
  ocrPayerName: string | null;
};

const OCR_COLUMNS_SQL = [
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrPayerName VARCHAR(255) NULL`,
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrAmountCents INT NULL`,
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrDatetime VARCHAR(40) NULL`,
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrLast4 VARCHAR(8) NULL`,
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrJson TEXT NULL`,
  `ALTER TABLE pdv_payment_receipts ADD COLUMN ocrAt TIMESTAMP NULL`,
];

type DbConn = {
  execute: (sql: string, params?: any[]) => Promise<[any, any]>;
};

export async function ensureReceiptOcrColumns(db: DbConn): Promise<void> {
  for (const sql of OCR_COLUMNS_SQL) {
    try {
      await db.execute(sql);
    } catch (e: any) {
      if (e?.errno !== 1060 && !String(e?.message || "").includes("Duplicate")) {
        console.warn("[financeiro] alter receipt ocr:", e?.message || e);
      }
    }
  }
}

function firstText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function parseOcrJson(raw: string): {
  payerName: string | null;
  amountCents: number | null;
  datetime: string | null;
  last4: string | null;
} {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw);
    const payerName = String(parsed.payerName || parsed.titular || "").trim() || null;
    const amountRaw = parsed.amountCents ?? parsed.valor ?? parsed.amount ?? null;
    let amountCents: number | null = null;
    if (typeof amountRaw === "number" && Number.isFinite(amountRaw)) {
      amountCents = amountRaw > 10000 ? Math.round(amountRaw) : toCents(amountRaw);
    } else if (typeof amountRaw === "string" && amountRaw.trim()) {
      amountCents = toCents(amountRaw);
    }
    const datetime = String(parsed.datetime || parsed.dataHora || "").trim() || null;
    const last4 = String(parsed.last4 || parsed.finalCartao || "").replace(/\D/g, "").slice(-4) || null;
    return { payerName, amountCents, datetime, last4 };
  } catch {
    return { payerName: null, amountCents: null, datetime: null, last4: null };
  }
}

async function ocrOneReceipt(mimeType: string, data: Buffer): Promise<ReturnType<typeof parseOcrJson>> {
  const b64 = data.toString("base64");
  const mime = mimeType || "image/jpeg";
  const res = await invokeLLM({
    model: ENV.openaiModel || "gpt-4o-mini",
    maxTokens: 250,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você lê comprovantes de PIX ou cartão (maquininha/app) no Brasil. Responda só JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              'Extraia: payerName (titular/pagador), amountCents (valor em centavos, inteiro), datetime (ISO ou dd/mm/aaaa hh:mm), last4 (final do cartão). Se não achar, use null. Ex.: {"payerName":"JOAO SILVA","amountCents":15000,"datetime":"2026-09-10 14:32","last4":"1234"}',
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${b64}`, detail: "low" },
          },
        ],
      },
    ],
  });
  return parseOcrJson(firstText(res));
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export async function enrichPaymentsFromReceipts<
  T extends { paymentId: number; nomePix: string | null },
>(
  db: DbConn,
  payments: T[],
  opts?: { maxOcr?: number }
): Promise<Map<number, ReceiptHint>> {
  const hints = new Map<number, ReceiptHint>();
  const ids = [...new Set(payments.map((p) => p.paymentId).filter((id) => id > 0))];
  if (ids.length === 0) return hints;

  try {
    await ensureReceiptOcrColumns(db);
  } catch {
    return hints;
  }

  const placeholders = ids.map(() => "?").join(",");
  let rows: any[] = [];
  try {
    const [found] = await db.execute(
      `SELECT id, paymentId, ocrPayerName, ocrAt
       FROM pdv_payment_receipts
       WHERE paymentId IN (${placeholders})`,
      ids
    );
    rows = found as any[];
  } catch (e) {
    console.warn("[financeiro] load receipt meta:", e);
    return hints;
  }

  const pendingRowIds: number[] = [];
  for (const r of rows) {
    const paymentId = Number(r.paymentId);
    const name = r.ocrPayerName ? String(r.ocrPayerName) : null;
    const prev = hints.get(paymentId);
    hints.set(paymentId, {
      hasReceipt: true,
      receiptCount: (prev?.receiptCount || 0) + 1,
      ocrPayerName: mergePayerNames(prev?.ocrPayerName, name),
    });
    if (!r.ocrAt) pendingRowIds.push(Number(r.id));
  }

  const maxOcr = Math.max(0, Math.min(40, opts?.maxOcr ?? 25));
  const toOcr = pendingRowIds.slice(0, maxOcr);

  if (toOcr.length > 0) {
    const ocrPlace = toOcr.map(() => "?").join(",");
    let blobs: any[] = [];
    try {
      const [found] = await db.execute(
        `SELECT id, paymentId, mimeType, data
         FROM pdv_payment_receipts
         WHERE id IN (${ocrPlace})`,
        toOcr
      );
      blobs = found as any[];
    } catch (e) {
      console.warn("[financeiro] load receipt blobs:", e);
    }

    await mapPool(blobs, 3, async (row) => {
      const receiptId = Number(row.id);
      const paymentId = Number(row.paymentId);
      const buf: Buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || []);
      if (buf.length < 256) return;
      try {
        const ocr = await ocrOneReceipt(String(row.mimeType || "image/jpeg"), buf);
        await db.execute(
          `UPDATE pdv_payment_receipts
           SET ocrPayerName = ?, ocrAmountCents = ?, ocrDatetime = ?, ocrLast4 = ?, ocrJson = ?, ocrAt = NOW()
           WHERE id = ?`,
          [
            ocr.payerName,
            ocr.amountCents,
            ocr.datetime,
            ocr.last4,
            JSON.stringify(ocr),
            receiptId,
          ]
        );
        if (ocr.payerName) {
          await db.execute(
            `UPDATE pdv_order_payments
             SET nomePix = ?
             WHERE id = ? AND (nomePix IS NULL OR TRIM(nomePix) = '')`,
            [ocr.payerName.slice(0, 500), paymentId]
          );
          const prev = hints.get(paymentId);
          hints.set(paymentId, {
            hasReceipt: true,
            receiptCount: prev?.receiptCount || 1,
            ocrPayerName: mergePayerNames(prev?.ocrPayerName, ocr.payerName),
          });
        }
      } catch (e) {
        console.warn("[financeiro] ocr receipt", paymentId, e);
      }
    });
  }

  for (const pay of payments) {
    const hint = hints.get(pay.paymentId);
    if (!hint?.ocrPayerName) continue;
    pay.nomePix = mergePayerNames(pay.nomePix, hint.ocrPayerName);
  }

  return hints;
}
