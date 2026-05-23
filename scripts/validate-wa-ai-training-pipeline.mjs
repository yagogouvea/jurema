/**
 * Valida que campos do Treinamento IA chegam ao system prompt usado pela IA.
 * Uso: node --import dotenv/config scripts/validate-wa-ai-training-pipeline.mjs [instanceId]
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { buildSystemPrompt, mergeDbRowWithDefaults, parseExtraLinks } from "../server/routers/waAiTrainingDefaults.ts";

dotenv.config();

const instanceId = Number(process.argv[2] || 1);

const db = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await db.query("SHOW COLUMNS FROM wa_ai_config");
const colNames = cols.map((c) => c.Field);
console.log("Colunas wa_ai_config:", colNames.join(", "));
console.log("pricingRules column:", colNames.includes("pricingRules") ? "SIM" : "NAO");

const [rows] = await db.query("SELECT * FROM wa_ai_config WHERE instanceId=? LIMIT 1", [instanceId]);
if (!rows.length) {
  console.error("Instancia", instanceId, "sem wa_ai_config");
  process.exit(1);
}
const row = rows[0];
const merged = mergeDbRowWithDefaults(row, instanceId);

const runtimePrompt = buildSystemPrompt({
  aiName: row.aiName,
  personality: row.personality,
  businessContext: row.businessContext,
  pricingRules: row.pricingRules ?? undefined,
  catalogLink: row.catalogLink,
  groupLink: row.groupLink,
  instagramLink: row.instagramLink,
  extraLinks: parseExtraLinks(row.extraLinks),
  escalateKeywords: merged.escalateKeywords,
});

function ok(label, pass) {
  console.log(pass ? "OK" : "FALHA", "-", label);
  return pass;
}

const results = [
  ok("businessContext tem endereco/loja fisica", /ENDERE|Shopping Stunt|Conselheiro/i.test(merged.businessContext)),
  ok("businessContext tem horario", /HORARIO|06h|funcionamento/i.test(merged.businessContext)),
  ok("catalogLink gravado", !!merged.catalogLink.trim()),
  ok("catalogLink aparece no prompt", merged.systemPrompt.includes(merged.catalogLink)),
  ok("groupLink aparece no prompt", !merged.groupLink.trim() || merged.systemPrompt.includes(merged.groupLink)),
  ok("instagramLink aparece no prompt", !merged.instagramLink.trim() || merged.systemPrompt.includes(merged.instagramLink)),
  ok("personality aparece no prompt", merged.systemPrompt.includes(merged.personality.slice(0, 30))),
  ok("bloco cordialidade", /TOM CORDIAL/i.test(merged.systemPrompt)),
  ok("bloco precos", /PRE[CÇ]OS BASE|NACIONAL.*50|TAILANDESA.*60/i.test(merged.systemPrompt)),
  ok("bloco catalogo", /ENVIO DO CAT[AÁ]LOGO/i.test(merged.systemPrompt)),
  ok("bloco quantidades", /MULTILINHA E QUANTIDADES/i.test(merged.systemPrompt)),
  ok("palavras escalacao no prompt", merged.escalateKeywords.some((k) => merged.systemPrompt.includes(k))),
  ok("runtime prompt = painel (mergeDbRowWithDefaults)", runtimePrompt.replace(/\s+/g, " ").trim() === merged.systemPrompt.replace(/\s+/g, " ").trim()),
  ok("runtime prompt tem endereco", /ENDERE|Shopping Stunt/i.test(runtimePrompt)),
];

console.log("\nTamanhos inst", instanceId + ":");
console.log("  businessContext:", merged.businessContext.length, "chars");
console.log("  pricingRules:", (merged.pricingRules || "").length, "chars");
console.log("  systemPrompt:", merged.systemPrompt.length, "chars");

const failed = results.filter((r) => !r).length;
console.log("\nResultado:", failed === 0 ? "TUDO OK" : failed + " falha(s)");
await db.end();
process.exit(failed === 0 ? 0 : 1);
