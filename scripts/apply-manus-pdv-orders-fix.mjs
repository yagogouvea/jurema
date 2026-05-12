/**
 * Aplica no MySQL da Railway os UPDATEs dos 45 pedidos (totalAplicado Manus).
 * Rode na raiz do repo com variáveis do Railway (use URL pública para rodar local):
 *   railway run node scripts/apply-manus-pdv-orders-fix.mjs
 */
import mysql from "mysql2/promise";

const url = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina MYSQL_PUBLIC_URL ou DATABASE_URL (ex.: railway run …)");
  process.exit(1);
}

/** @type {Array<[number, number, number, string]>} totalAplicado, totalVarejo, totalAtacado, pedidoId */
const ROWS = [
  [4045.0, 4420.0, 3840.0, "PED-05669222"],
  [565.0, 690.0, 570.0, "PED-07131385"],
  [3180.0, 4080.0, 3180.0, "PED-14654958"],
  [410.0, 490.0, 410.0, "PED-15514961"],
  [985.0, 1100.0, 975.0, "PED-15523188"],
  [475.0, 560.0, 475.0, "PED-17481258"],
  [470.0, 560.0, 470.0, "PED-29936195"],
  [1090.0, 1200.0, 1080.0, "PED-32206009"],
  [1195.0, 1400.0, 1175.0, "PED-33425588"],
  [560.0, 660.0, 550.0, "PED-34657973"],
  [510.0, 600.0, 510.0, "PED-35517775"],
  [715.0, 840.0, 715.0, "PED-35614977"],
  [655.0, 760.0, 645.0, "PED-35773657"],
  [410.0, 500.0, 400.0, "PED-35822217"],
  [470.0, 560.0, 460.0, "PED-36763387"],
  [1760.0, 2000.0, 1760.0, "PED-37214754"],
  [480.0, 560.0, 480.0, "PED-37790685"],
  [340.0, 400.0, 340.0, "PED-38813128"],
  [515.0, 600.0, 515.0, "PED-40448058"],
  [695.0, 800.0, 695.0, "PED-42009759"],
  [2760.0, 3300.0, 2760.0, "PED-46436685"],
  [255.0, 300.0, 255.0, "PED-49648042"],
  [345.0, 410.0, 335.0, "PED-50795008"],
  [790.0, 920.0, 780.0, "PED-55789772"],
  [350.0, 420.0, 340.0, "PED-59013764"],
  [535.0, 640.0, 515.0, "PED-60107129"],
  [520.0, 620.0, 510.0, "PED-60362405"],
  [1025.0, 1200.0, 1005.0, "PED-63933882"],
  [670.0, 780.0, 670.0, "PED-67513726"],
  [450.0, 540.0, 450.0, "PED-70419512"],
  [535.0, 620.0, 535.0, "PED-70937534"],
  [250.0, 300.0, 250.0, "PED-72083348"],
  [680.0, 800.0, 680.0, "PED-74696664"],
  [740.0, 860.0, 740.0, "PED-74806496"],
  [680.0, 800.0, 680.0, "PED-76811929"],
  [800.0, 940.0, 780.0, "PED-77921417"],
  [570.0, 660.0, 570.0, "PED-80412454"],
  [605.0, 720.0, 595.0, "PED-83304048"],
  [730.0, 860.0, 720.0, "PED-87145615"],
  [1200.0, 1400.0, 1200.0, "PED-90393525"],
  [635.0, 760.0, 615.0, "PED-91402236"],
  [860.0, 1000.0, 860.0, "PED-97032763"],
  [5200.0, 5640.0, 5200.0, "PED-99354646"],
  [745.0, 880.0, 735.0, "PED-99428040"],
  [490.0, 590.0, 470.0, "PED-99747948"],
];

const pedidoList = ROWS.map((r) => r[3]);

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    await conn.beginTransaction();

    let missing = [];
    for (const [totalAplicado, totalVarejo, totalAtacado, pedidoId] of ROWS) {
      const [res] = await conn.execute(
        `UPDATE pdv_orders SET totalAplicado = ?, totalVarejo = ?, totalAtacado = ? WHERE pedidoId = ?`,
        [totalAplicado, totalVarejo, totalAtacado, pedidoId]
      );
      if (res.affectedRows === 0) missing.push(pedidoId);
    }

    if (missing.length) {
      await conn.rollback();
      console.error("Pedido(s) não encontrado(s), ROLLBACK:", missing.join(", "));
      process.exitCode = 1;
      return;
    }

    const placeholders = pedidoList.map(() => "?").join(",");
    const [verify] = await conn.execute(
      `SELECT pedidoId, totalAplicado,
        (SELECT COALESCE(SUM(totalItem),0) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId) AS soma_itens,
        ROUND(totalAplicado - (SELECT COALESCE(SUM(totalItem),0) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId), 2) AS diff_servicos
       FROM pdv_orders o WHERE pedidoId IN (${placeholders}) ORDER BY pedidoId`,
      pedidoList
    );

    if (verify.length !== 45) {
      await conn.rollback();
      console.error(`Esperado 45 linhas na verificação, veio ${verify.length}. ROLLBACK.`);
      process.exitCode = 1;
      return;
    }

    await conn.commit();
    console.log("COMMIT ok — 45 pedidos atualizados.");
    console.table(verify.slice(0, 10));
    if (verify.length > 10) console.log(`… e mais ${verify.length - 10} linhas (total ${verify.length}).`);
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error(e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
