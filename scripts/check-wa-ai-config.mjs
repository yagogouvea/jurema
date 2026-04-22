import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await db.execute("SELECT instanceId, aiName, personality, catalogLink, groupLink, instagramLink, awayMessage, awayEnabled, awayStart, awayEnd, maxContextMessages, responseDelayMin, responseDelayMax, escalateKeywords, LENGTH(businessContext) as bcLen, LEFT(businessContext,200) as bcPreview FROM wa_ai_config");
console.log(JSON.stringify(rows, null, 2));
await db.end();
