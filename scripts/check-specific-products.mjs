import mysql from 'mysql2/promise';
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({host:u.hostname,port:Number(u.port),user:u.username,password:u.password,database:u.pathname.slice(1),ssl:{rejectUnauthorized:false}});
const [r] = await db.execute(`SELECT id, codigo, descricao, ptAtacado, ptVarejo FROM pdv_products WHERE codigo IN ('TA-JG-FLA-AZUL-X', 'CA-TO-PRO-35-X', 'NA-CO-TIM-VERA-X')`);
console.table(r);
await db.end();
