/**
 * Script de importação dos produtos reais da planilha JUMERA PDV
 * Fonte: ESTOQUE ESTATICO da planilha CópiadePDVJUREMA5.0.xlsx
 *
 * Mapeamento de colunas:
 *   [0] codigo, [1] linha, [2] modelo, [3] time, [4] descricao,
 *   [5] tamanho, [6] tipo, [7] estoque, [8] atacado, [9] varejo,
 *   [10] ativo
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";

// Ler o arquivo xlsx usando a lib xlsx (já disponível via npm)
const { default: XLSX } = await import("xlsx");

const XLSX_PATH = "/home/ubuntu/upload/CópiadePDVJUREMA5.0.xlsx";
const SHEET_NAME = "ESTOQUE ESTATICO";

// Mapeamento de linhas da planilha para os valores aceitos pelo schema
const LINHA_MAP = {
  "TAILANDESA": "TAILANDESA",
  "NACIONAL": "NACIONAL",
  "TORCEDOR": "TORCEDOR",
  "PECA": "PECA",
  "NAO DEFINIDO": "NACIONAL", // fallback para NAO DEFINIDO
};

// Mapeamento de modelos
const MODELO_MAP = {
  "TORCEDOR": "TORCEDOR",
  "JOGADOR": "JOGADOR",
  "PARTICULAR": "VENDEDOR",
  "VENDEDOR": "VENDEDOR",
  "TAILANDESA": "TAILANDESA",
};

// Mapeamento de tipos
const TIPO_MAP = {
  "CAMISETA": "CAMISETA",
  "CONJUNTO": "CONJUNTO",
};

async function main() {
  console.log("📂 Lendo planilha...");
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    console.error(`Aba "${SHEET_NAME}" não encontrada`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`Total de linhas na planilha: ${rows.length}`);

  // Filtrar linhas válidas (time preenchido e atacado > 0)
  const dataRows = rows.slice(1).filter(r =>
    r[3] && String(r[3]).trim() !== "" &&
    r[8] && parseFloat(r[8]) > 0
  );
  console.log(`Linhas válidas para importação: ${dataRows.length}`);

  // Conectar ao banco
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  console.log("🔌 Conectado ao banco de dados");

  // Limpar produtos de demonstração (preservar pedidos existentes)
  console.log("🗑️  Removendo produtos de demonstração...");
  const [delResult] = await db.execute("DELETE FROM pdv_products WHERE 1=1");
  console.log(`   Removidos: ${delResult.affectedRows} produtos`);

  // Resetar auto_increment
  await db.execute("ALTER TABLE pdv_products AUTO_INCREMENT = 1");

  // Preparar insert em batch
  const batchSize = 200;
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  const insertSQL = `
    INSERT INTO pdv_products 
      (codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `;

  console.log("📦 Importando produtos...");

  for (let i = 0; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);

    for (const r of batch) {
      const codigo = r[0] ? String(r[0]).trim() : null;
      const linhaRaw = r[1] ? String(r[1]).trim().toUpperCase() : "";
      const modeloRaw = r[2] ? String(r[2]).trim().toUpperCase() : "";
      const time = r[3] ? String(r[3]).trim().toUpperCase() : "";
      const descricao = r[4] ? String(r[4]).trim() : null;
      const tamanho = r[5] ? String(r[5]).trim().toUpperCase() : "";
      const tipoRaw = r[6] ? String(r[6]).trim().toUpperCase() : "CAMISETA";
      const estoque = r[7] ? Math.round(parseFloat(r[7])) : 0;
      const precoAtacado = r[8] ? parseFloat(r[8]) : 0;
      const precoVarejo = r[9] ? parseFloat(r[9]) : 0;

      // Validar e mapear campos
      const linha = LINHA_MAP[linhaRaw];
      const modelo = MODELO_MAP[modeloRaw];
      const tipo = TIPO_MAP[tipoRaw] || "CAMISETA";

      if (!linha || !modelo || !time || !tamanho) {
        skipped++;
        errors.push({ row: i + 1, reason: `linha=${linhaRaw}, modelo=${modeloRaw}, time=${time}, tamanho=${tamanho}` });
        continue;
      }

      try {
        await db.execute(insertSQL, [
          codigo, linha, modelo, time, descricao, tamanho, tipo,
          estoque, precoAtacado, precoVarejo
        ]);
        inserted++;
      } catch (err) {
        skipped++;
        errors.push({ row: i + 1, reason: err.message });
      }
    }

    process.stdout.write(`\r   Progresso: ${Math.min(i + batchSize, dataRows.length)}/${dataRows.length}`);
  }

  console.log(`\n\n✅ Importação concluída!`);
  console.log(`   Inseridos: ${inserted}`);
  console.log(`   Ignorados: ${skipped}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Primeiros 10 erros/ignorados:`);
    errors.slice(0, 10).forEach(e => console.log(`   - ${e.reason}`));
  }

  // Estatísticas finais
  const [countRows] = await db.execute("SELECT COUNT(*) as total FROM pdv_products WHERE isActive=1");
  const [linhaStats] = await db.execute("SELECT linha, COUNT(*) as cnt FROM pdv_products WHERE isActive=1 GROUP BY linha ORDER BY linha");
  const [timeStats] = await db.execute("SELECT COUNT(DISTINCT time) as total_times FROM pdv_products WHERE isActive=1");

  console.log(`\n📊 Estatísticas do banco:`);
  console.log(`   Total produtos ativos: ${countRows[0].total}`);
  console.log(`   Times únicos: ${timeStats[0].total_times}`);
  console.log(`   Por linha:`);
  linhaStats.forEach(r => console.log(`     ${r.linha}: ${r.cnt}`));

  await db.end();
}

main().catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
