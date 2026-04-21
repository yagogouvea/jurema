import { createSign } from "crypto";

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";

async function getToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não definido");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Falha ao obter token: " + JSON.stringify(data));
  return data.access_token;
}

const token = await getToken();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// 1. Criar aba Lucro_produtos
const addSheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    requests: [{ addSheet: { properties: { title: "Lucro_produtos", gridProperties: { rowCount: 5000, columnCount: 13 } } } }]
  })
});
const addSheetData = await addSheetRes.json();
if (addSheetData.error) {
  console.log("Aba já existe ou erro:", addSheetData.error.message);
} else {
  console.log("✅ Aba Lucro_produtos criada!");
}

// 2. Adicionar cabeçalho
const cabecalho = [["CODIGO", "LINHA", "MODELO", "TIME", "DESCRIÇÃO", "TAM", "TIPO", "ATC/VAR", "VALOR", "CUSTO", "LUCRO (R$)", "MARGEM (%)", "DATA"]];
const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("Lucro_produtos!A1:M1")}?valueInputOption=RAW`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ values: cabecalho })
});
const headerData = await headerRes.json();
if (headerData.error) {
  console.log("Erro ao adicionar cabeçalho:", headerData.error.message);
} else {
  console.log("✅ Cabeçalho adicionado:", cabecalho[0].join(" | "));
}

// 3. Buscar sheetId da aba criada
const sheetsList = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, { headers }).then(r => r.json());
const lucroSheet = sheetsList.sheets.find((s) => s.properties.title === "Lucro_produtos");
const sheetGid = lucroSheet?.properties?.sheetId;

if (sheetGid !== undefined) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: sheetGid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 13 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                backgroundColor: { red: 0.1, green: 0.4, blue: 0.1 }
              }
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)"
          }
        },
        {
          updateSheetProperties: {
            properties: { sheetId: sheetGid, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount"
          }
        }
      ]
    })
  });
  console.log("✅ Cabeçalho formatado (verde, negrito, linha congelada)!");
}

console.log("🎉 Aba Lucro_produtos pronta!");
