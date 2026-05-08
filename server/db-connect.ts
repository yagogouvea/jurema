/**
 * Helper centralizado de conexão MySQL/TiDB.
 * - Railway MySQL: usa SSL (rejectUnauthorized: false)
 * - TiDB (Manus): usa SSL (rejectUnauthorized: false)
 * - Localhost: sem SSL
 */
import mysql from "mysql2/promise";

export async function getDb(): Promise<mysql.Connection | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const isLocal =
    url.includes("localhost") || url.includes("127.0.0.1");

  return mysql.createConnection({
    uri: url,
    connectTimeout: 8000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}
