/**
 * Envia mensagens de TESTE de suprimento e sangria para os números de notificação.
 * Uso: node --import dotenv/config scripts/test-cashflow-notify.mjs
 */
import { createPdvMysqlConnection } from "../server/pdvMysql.ts";
import {
  buildCashFlowNotificationMessage,
  getNotificationPhones,
  DEFAULT_NOTIF_PHONES,
} from "../server/pdvWaNotify.ts";
import { resolveSenderInstanceSlot, sendWaBridgeText, phoneToJid } from "../server/waSend.ts";

const PHONES_OVERRIDE = process.argv.includes("--phones")
  ? process.argv[process.argv.indexOf("--phones") + 1]?.split(/[,;\s]+/).map((p) => p.replace(/\D/g, "")).filter(Boolean)
  : null;

async function sendToAll(slot, phones, content) {
  const results = [];
  for (const phone of phones) {
    try {
      const ok = await sendWaBridgeText(slot, phoneToJid(phone), content);
      results.push({ phone, ok: !!ok });
      console.log(ok ? `  ✅ ${phone}` : `  ⚠️ ${phone} (bridge não configurada)`);
    } catch (err) {
      results.push({ phone, ok: false, error: err?.message || String(err) });
      console.error(`  ❌ ${phone}:`, err?.message || err);
    }
  }
  return results;
}

async function main() {
  if (!process.env.WA_BRIDGE_URL) {
    console.error("WA_BRIDGE_URL não definida no .env");
    process.exit(1);
  }

  const db = await createPdvMysqlConnection();
  let phones = PHONES_OVERRIDE;
  let slot = null;
  try {
    if (!phones?.length) phones = await getNotificationPhones(db);
    if (!phones.length) phones = [...DEFAULT_NOTIF_PHONES];
    slot = await resolveSenderInstanceSlot(db);
  } finally {
    await db.end();
  }

  if (slot === null) {
    console.error("Nenhuma instância wa-bridge conectada. Conecte o WhatsApp antes do teste.");
    process.exit(1);
  }

  console.log(`\nInstância wa-bridge: ${slot}`);
  console.log(`Destinos: ${phones.join(", ")}\n`);

  const suprimentoMsg = buildCashFlowNotificationMessage({
    tipo: "SUPRIMENTO",
    descricao: "[TESTE] Entrada de caixa — troco e fundo de operação",
    valor: 350.0,
    usuario: "Sistema (teste)",
    origem: "manual",
  });

  const sangriaMsg = buildCashFlowNotificationMessage({
    tipo: "SANGRIA",
    descricao: "[TESTE] Retirada para depósito bancário",
    valor: 200.0,
    usuario: "Sistema (teste)",
    origem: "manual",
  });

  console.log("── Enviando SUPRIMENTO (teste) ──");
  await sendToAll(slot, phones, suprimentoMsg);

  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n── Enviando SANGRIA (teste) ──");
  await sendToAll(slot, phones, sangriaMsg);

  console.log("\nConcluído. Peça para a cliente conferir os dois números.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
