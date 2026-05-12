import mysql from "mysql2/promise";

/**
 * Conexão PDV com `time_zone = +00:00` para TIMESTAMP / CONVERT_TZ previsíveis no Railway.
 * Sem isso, o fuso da sessão do host pode deslocar o “dia do pedido” vs America/Sao_Paulo.
 */
let warnedTimezone = false;

/**
 * `timezone: 'Z'` faz o driver mysql2 interpretar TIMESTAMP/DATETIME como UTC ao construir
 * `Date`, independente do fuso do host Node. Combinado com `SET time_zone='+00:00'` da sessão,
 * o instante UTC original (NOW() do MySQL) chega ao client como ISO `…Z`, e o browser converte
 * para o fuso local (America/Sao_Paulo). Sem isso, em hosts em -03:00 o `Date` vira “SP como
 * se fosse UTC” e a hora exibida ficava 3h adiantada.
 */
export async function createPdvMysqlConnection(): Promise<mysql.Connection | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const conn = await mysql.createConnection({
    uri: url,
    connectTimeout: 5000,
    timezone: "Z",
    dateStrings: false,
  });
  try {
    await conn.query("SET time_zone = '+00:00'");
  } catch (err) {
    if (!warnedTimezone) {
      warnedTimezone = true;
      console.warn(
        "[pdvMysql] SET time_zone='+00:00' falhou; CONVERT_TZ pode usar fuso da sessão.",
        err instanceof Error ? err.message : err
      );
    }
  }
  return conn;
}

/**
 * Momento em SP derivado de TIMESTAMP em UTC (+ fallback se CONVERT_TZ vier NULL).
 */
export function spLocalDateTimeExpr(col: string): string {
  return `COALESCE(CONVERT_TZ(${col}, '+00:00', '-03:00'), DATE_ADD(${col}, INTERVAL 3 HOUR))`;
}

export function orderDayDateExpr(alias: string): string {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  const c = `${alias}.createdAt`;
  if (mode === "server_date") return `DATE(${c})`;
  if (mode === "add3h") return `DATE(DATE_ADD(${c}, INTERVAL 3 HOUR))`;
  return `DATE(${spLocalDateTimeExpr(c)})`;
}

export function orderDayYmdExpr(alias: string): string {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  const c = `${alias}.createdAt`;
  if (mode === "server_date") return `DATE_FORMAT(${c}, '%Y-%m-%d')`;
  if (mode === "add3h") return `DATE_FORMAT(DATE_ADD(${c}, INTERVAL 3 HOUR), '%Y-%m-%d')`;
  return `DATE_FORMAT(${spLocalDateTimeExpr(c)}, '%Y-%m-%d')`;
}
