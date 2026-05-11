/**
 * Corrige a tabela pdv_products no Railway:
 *  1) Para cada `codigo` com múltiplas linhas, mantém somente a mais recente
 *     (updatedAt DESC, id DESC) e remove as demais.
 *  2) Adiciona UNIQUE INDEX em `codigo`.
 *
 * Não altera dados da planilha. Não altera pedidos.
 *
 * Uso:
 *   $env:DATABASE_URL = "<MYSQL_PUBLIC_URL>"
 *   node scripts/fix-products-table.mjs            # dry-run
 *   node scripts/fix-products-table.mjs --apply    # executa
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Faltou DATABASE_URL"); process.exit(1); }
const apply = process.argv.includes("--apply");

const db = await mysql.createConnection(url);

async function q(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

const total = (await q("SELECT COUNT(*) AS n FROM pdv_products"))[0].n;
const totalAtivos = (await q("SELECT COUNT(*) AS n FROM pdv_products WHERE isActive = 1"))[0].n;
const grupos = await q(`
  SELECT codigo, COUNT(*) AS n
  FROM pdv_products
  WHERE codigo IS NOT NULL AND codigo != ''
  GROUP BY codigo
  HAVING COUNT(*) > 1
  ORDER BY n DESC
`);

console.log("ANTES:");
console.log("  total linhas:", total, "| ativas:", totalAtivos);
console.log("  códigos duplicados:", grupos.length);
if (grupos.length) console.log("  exemplo top 5:", grupos.slice(0, 5));

const toDelete = await q(`
  SELECT id FROM pdv_products
  WHERE codigo IS NOT NULL AND codigo != ''
    AND id NOT IN (
      SELECT keepId FROM (
        SELECT (
          SELECT id FROM pdv_products p2
          WHERE p2.codigo = p1.codigo
          ORDER BY p2.updatedAt DESC, p2.id DESC
          LIMIT 1
        ) AS keepId
        FROM pdv_products p1
        WHERE p1.codigo IS NOT NULL AND p1.codigo != ''
        GROUP BY p1.codigo
      ) AS keepers
    )
`);
console.log("\nLinhas a remover (duplicatas):", toDelete.length);

const semCodigo = (await q("SELECT COUNT(*) AS n FROM pdv_products WHERE codigo IS NULL OR codigo = ''"))[0].n;
console.log("Linhas sem código:", semCodigo, "(serão mantidas)");

const indices = await q("SHOW INDEX FROM pdv_products WHERE Key_name = 'codigo'");
const jaTemUnique = indices.length > 0 && indices.every(r => r.Non_unique === 0);
console.log("Já tem UNIQUE em codigo?", jaTemUnique);

if (!apply) {
  console.log("\n--apply não passado — saindo sem alterar.");
  await db.end(); process.exit(0);
}

console.log("\nExecutando…");

if (semCodigo > 0) {
  console.log("  apagando linhas sem código…");
  await db.execute("DELETE FROM pdv_products WHERE codigo IS NULL OR codigo = ''");
}

if (toDelete.length > 0) {
  console.log("  apagando", toDelete.length, "duplicatas em lotes de 500…");
  const ids = toDelete.map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    await db.execute(`DELETE FROM pdv_products WHERE id IN (${placeholders})`, chunk);
  }
}

const existing = await q("SHOW INDEX FROM pdv_products WHERE Key_name = 'codigo'");
if (existing.length > 0) {
  console.log("  removendo índice antigo `codigo`…");
  await db.execute("ALTER TABLE pdv_products DROP INDEX `codigo`");
}
console.log("  criando UNIQUE INDEX uniq_codigo…");
await db.execute("ALTER TABLE pdv_products ADD UNIQUE INDEX uniq_codigo (codigo)");

const totalDepois = (await q("SELECT COUNT(*) AS n FROM pdv_products"))[0].n;
const ativosDepois = (await q("SELECT COUNT(*) AS n FROM pdv_products WHERE isActive = 1"))[0].n;
const dupDepois = await q(`
  SELECT codigo, COUNT(*) AS n FROM pdv_products
  WHERE codigo IS NOT NULL AND codigo != ''
  GROUP BY codigo HAVING COUNT(*) > 1
`);

console.log("\nDEPOIS:");
console.log("  total linhas:", totalDepois, "| ativas:", ativosDepois);
console.log("  códigos duplicados:", dupDepois.length);

const indicesFinal = await q("SHOW INDEX FROM pdv_products WHERE Key_name = 'uniq_codigo'");
console.log("  UNIQUE uniq_codigo criado?", indicesFinal.length > 0 && indicesFinal[0].Non_unique === 0);

await db.end();
console.log("\nPronto.");
