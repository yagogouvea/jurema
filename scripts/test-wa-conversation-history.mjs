/**
 * Teste do recorte + PDF com conversa real do banco.
 * Uso: DATABASE_URL=... node scripts/test-wa-conversation-history.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { jsPDF } from "jspdf";

const url = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL;
if (!url) {
  console.error("FALHOU: DATABASE_URL ausente");
  process.exit(1);
}

const MAX = 1500;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayYmdSp(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd, delta) {
  const ms = new Date(`${ymd}T12:00:00-03:00`).getTime() + delta * 86400000;
  return todayYmdSp(new Date(ms));
}

function bounds(fromYmd, toYmd) {
  const start = fromYmd <= toYmd ? fromYmd : toYmd;
  const end = fromYmd <= toYmd ? toYmd : fromYmd;
  return {
    from: new Date(`${start}T00:00:00-03:00`),
    toExclusive: new Date(`${addDaysYmd(end, 1)}T00:00:00-03:00`),
  };
}

function senderLabel(msg) {
  const fromMe = msg.fromMe === true || msg.fromMe === 1 || msg.fromMe === "1";
  if (!fromMe) return "Cliente";
  if (String(msg.senderType ?? "") === "ai") return "Ju (IA)";
  return "Atendente";
}

function exportText(msg) {
  const type = String(msg.type ?? "text");
  const content = String(msg.content ?? "").trim();
  const caption = String(msg.mediaCaption ?? "").trim();
  const labels = {
    image: "[Imagem]",
    video: "[Vídeo]",
    audio: "[Áudio]",
    ptt: "[Áudio]",
    document: "[Documento]",
    sticker: "[Figurinha]",
    location: "[Localização]",
  };
  if (labels[type]) {
    const extra = caption || (content && !content.startsWith("[") ? content : "");
    return extra ? `${labels[type]} ${extra}` : labels[type];
  }
  return content || "[mensagem]";
}

function buildPdf(meta, messages) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Jurema Sport", 14, y);
  y += 7;
  doc.setFontSize(11);
  doc.text("Historico de conversa", 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Contato: ${meta.contactName || meta.contactPhone || "-"}`, 14, y);
  y += 5;
  doc.text(`Periodo: ${meta.fromYmd} a ${meta.toYmd}`, 14, y);
  y += 5;
  doc.text(`${messages.length} mensagem(ns)`, 14, y);
  y += 8;
  for (const msg of messages.slice(0, 40)) {
    if (y > 270) {
      doc.addPage();
      y = 14;
    }
    doc.setFont("helvetica", "bold");
    doc.text(`${senderLabel(msg)}`, 14, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(exportText(msg), pageW - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 3;
  }
  return Buffer.from(doc.output("arraybuffer"));
}

const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
try {
  const toYmd = todayYmdSp();
  const fromYmd = addDaysYmd(toYmd, -2);
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) throw new Error("ymd invalido");
  const { from, toExclusive } = bounds(fromYmd, toYmd);

  const [convs] = await db.execute(
    `SELECT c.id, c.contactName, c.contactPhone, COUNT(m.id) AS msgCount
     FROM wa_conversations c
     JOIN wa_messages m ON m.conversationId = c.id
       AND m.timestamp >= ? AND m.timestamp < ?
     GROUP BY c.id, c.contactName, c.contactPhone
     ORDER BY msgCount DESC
     LIMIT 1`,
    [from, toExclusive]
  );
  const conv = convs[0];
  if (!conv) {
    console.log(JSON.stringify({ ok: false, reason: "nenhuma conversa no periodo", fromYmd, toYmd }));
    process.exit(2);
  }

  const [rows] = await db.execute(
    `SELECT fromMe, senderType, type, content, mediaCaption, timestamp
     FROM wa_messages
     WHERE conversationId=? AND timestamp >= ? AND timestamp < ?
     ORDER BY timestamp DESC
     LIMIT ${MAX + 1}`,
    [conv.id, from, toExclusive]
  );
  const truncated = rows.length > MAX;
  const messages = (truncated ? rows.slice(0, MAX) : rows).reverse();

  const [outside] = await db.execute(
    `SELECT COUNT(*) AS n
     FROM wa_messages
     WHERE conversationId=? AND (timestamp < ? OR timestamp >= ?)`,
    [conv.id, from, toExclusive]
  );

  const pdf = buildPdf(
    { contactName: conv.contactName, contactPhone: conv.contactPhone, fromYmd, toYmd },
    messages
  );
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp-historico-conversa.pdf");
  writeFileSync(out, pdf);

  const header = pdf.subarray(0, 5).toString("latin1");
  const ok = header === "%PDF-" && pdf.length > 500 && messages.length > 0;
  console.log(JSON.stringify({
    ok,
    conversationId: Number(conv.id),
    contact: String(conv.contactName || conv.contactPhone || "").slice(0, 40),
    fromYmd,
    toYmd,
    inRange: messages.length,
    truncated,
    outsideRange: Number(outside[0]?.n ?? 0),
    pdfBytes: pdf.length,
    pdfHeader: header,
  }, null, 2));
  if (!ok) process.exit(1);
} finally {
  await db.end();
}
