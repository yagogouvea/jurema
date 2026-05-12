/**
 * Insere PED-40872398 (faltante no Railway, presente no Manus).
 * railway run node scripts/insert-ped-40872398.mjs
 */
import mysql from "mysql2/promise";

const url = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina MYSQL_PUBLIC_URL ou DATABASE_URL");
  process.exit(1);
}

const PED = "PED-40872398";

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    const [existRows] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM pdv_orders WHERE pedidoId = ?",
      [PED]
    );
    const cnt = Number(existRows?.[0]?.cnt ?? 0);
    if (cnt > 0) {
      console.log("Já existe — nada a fazer:", PED);
      return;
    }

    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO pdv_orders
       (pedidoId, sellerId, sellerName, canal, clienteNome, clienteTelefone, regime,
        totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente,
        justificativa, isSofia, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PED,
        90009,
        "MURILO",
        "BALCAO",
        "Gian",
        null,
        "ATACADO",
        100.0,
        70.0,
        70.0,
        70.0,
        0.0,
        "Venda gian",
        0,
        "PAGO",
        "2026-04-25 18:14:32",
        "2026-04-25 18:14:32",
      ]
    );

    await conn.execute(
      `INSERT INTO pdv_order_items
       (pedidoId, productId, linha, modelo, time, descricao, tipo, tamanho,
        quantidade, precoUnitario, totalItem, isSofia, comissaoUnitaria,
        comissaoLojaSofia, ptAtacado, ptVarejo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PED,
        302556,
        "TAILANDESA",
        "TORCEDOR",
        "PROMOÇÃO",
        "35,00",
        "CAMISETA",
        "X",
        2,
        35.0,
        70.0,
        0,
        0.5,
        null,
        3.0,
        18.0,
      ]
    );

    await conn.execute(
      `INSERT INTO pdv_order_payments
       (pedidoId, formaPagamento, valor, taxa, valorLiquido, nomePix, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [PED, "PIX", 70.0, 0.0, 70.0, null, "2026-04-25 18:14:32"]
    );

    await conn.commit();
    console.log("Inserido:", PED);
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error(e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
