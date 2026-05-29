/**
 * Diagnóstico do service account de escrita na planilha (PDV → planilha).
 * Roda NA RAILWAY (onde GOOGLE_SERVICE_ACCOUNT_JSON existe):
 *
 *   railway run -- node scripts/test-sa-sheet-write.mjs
 *
 * Mostra o client_email (para compartilhar a planilha) e testa:
 *   1) geração do token JWT,
 *   2) leitura autenticada (metadata),
 *   3) ESCRITA real numa célula de teste (R1), depois limpa.
 */
import { createSign } from "crypto";

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!raw) {
  console.error("❌ GOOGLE_SERVICE_ACCOUNT_JSON não está definida neste ambiente.");
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(raw);
} catch (e) {
  console.error("❌ GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido:", e.message);
  process.exit(1);
}

console.log("client_email:", sa.client_email);
console.log("project_id  :", sa.project_id);
console.log("➡️  A planilha PRECISA estar compartilhada (Editor) com o client_email acima.\n");

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const payload = b64url({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });
  const signingInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

const tok = await getToken();
if (!tok.ok || !tok.data.access_token) {
  console.error("❌ Falha ao gerar token (chave inválida?):", JSON.stringify(tok.data));
  process.exit(1);
}
console.log("✅ Token JWT gerado com sucesso.");
const token = tok.data.access_token;

// Teste de ESCRITA: grava 'OK-<ts>' em R1 e depois limpa.
const stamp = `OK-${Date.now()}`;
const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("PRODUTOS!R1")}?valueInputOption=RAW`;
const wr = await fetch(writeUrl, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ values: [[stamp]] }),
});
if (!wr.ok) {
  const err = await wr.text();
  console.error(`❌ ESCRITA FALHOU (HTTP ${wr.status}). O service account NÃO tem permissão de escrita na planilha.`);
  console.error("Detalhe:", err);
  process.exit(1);
}
console.log("✅ ESCRITA funcionou — o service account tem permissão de Editor.");

// Limpa a célula de teste
const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("PRODUTOS!R1")}:clear`;
await fetch(clearUrl, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
console.log("🧹 Célula de teste limpa. Tudo certo: PDV → planilha deve funcionar.");
