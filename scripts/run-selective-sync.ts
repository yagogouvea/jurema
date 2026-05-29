/**
 * Executa uma reconciliação SELETIVA da planilha → sistema (uma vez).
 * Seguro: não sobrescreve estoque e não zera custo/pontos (só atualiza se a
 * planilha tiver valor > 0). Atualiza linha/modelo/time/descrição/tipo/preços.
 *
 * Uso: npx tsx --import dotenv/config scripts/run-selective-sync.ts
 *   (requer DATABASE_URL e GOOGLE_SHEETS_API_KEY no ambiente)
 */
import { runAutoSync } from "../server/routers/pdvAutoSync";

const r = await runAutoSync({ skipStockOverwrite: true });
console.log("Resultado da reconciliação seletiva:");
console.log(JSON.stringify(r, null, 2));
process.exit(0);
