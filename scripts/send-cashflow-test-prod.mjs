/**
 * Envia testes de suprimento e sangria via endpoint de diagnóstico em produção.
 * Uso: node scripts/send-cashflow-test-prod.mjs
 */
const BASE = process.env.APP_URL || "https://juremasports2.com.br";
const PHONES = ["5511981693476", "5511992022928"];

function buildSuprimento() {
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    "💵 *SUPRIMENTO DE CAIXA*",
    "*JUREMA SPORT*",
    "",
    `🗓️ ${dataHora}`,
    "👤 *Registrado por:* Sistema (teste)",
    "📋 *Origem:* Registro manual",
    "",
    "*Descrição:* [TESTE] Entrada de caixa — troco e fundo de operação",
    "*Valor:* R$ 350,00",
  ].join("\n");
}

function buildSangria() {
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    "🔴 *SANGRIA DE CAIXA*",
    "*JUREMA SPORT*",
    "",
    `🗓️ ${dataHora}`,
    "👤 *Registrado por:* Sistema (teste)",
    "📋 *Origem:* Registro manual",
    "",
    "*Descrição:* [TESTE] Retirada para depósito bancário",
    "*Valor:* R$ 200,00",
  ].join("\n");
}

async function send(phone, content, label) {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const url = `${BASE}/api/diag/wa-notify?send=1&to=${phone}&content=${encodeURIComponent(b64)}`;
  console.log(`→ ${label} → ${phone}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const data = await res.json();
  const envio = data.envio;
  const ok = Array.isArray(envio) ? envio.every((e) => e.ok) : envio === "OK (bridge aceitou)" || envio?.[0]?.ok;
  console.log(ok ? "  ✅ enviado" : `  ⚠️ resposta: ${JSON.stringify(envio)}`);
  return ok;
}

async function main() {
  const jobs = [
    ...PHONES.map((p) => ({ phone: p, content: buildSuprimento(), label: "SUPRIMENTO" })),
    ...PHONES.map((p) => ({ phone: p, content: buildSangria(), label: "SANGRIA" })),
  ];
  let ok = 0;
  for (const j of jobs) {
    if (await send(j.phone, j.content, j.label)) ok++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\n${ok}/${jobs.length} envios aceitos pela bridge.`);
  if (ok < jobs.length) {
    console.log("Se o formato veio como 'teste de pedido', faça deploy do código novo e rode de novo.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
