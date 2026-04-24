/**
 * preencher_codigos.mjs
 * Lê a planilha PRODUTOS, identifica linhas sem código,
 * gera o código no padrão {LINHA}-{MODELO}-{TIME}-{DESC_ABREV}-{TAM}
 * e escreve de volta na planilha via Google Sheets API (Service Account).
 */
import { createSign } from 'crypto';

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const SHEET_RANGE = "PRODUTOS!A2:P2000";

// ─── Lógica de geração de código (idêntica ao pdvSync.ts) ────────────────────
const LINHA_MAP = { TAILANDESA: 'CA', NACIONAL: 'NA', TORCEDOR: 'TO', PECA: 'PE' };
const MODELO_MAP = { JOGADOR: 'JG', TORCEDOR: 'TO', TAILANDESA: 'CA', DRYFIT: 'DR', VENDEDOR: 'VE' };
const STOPWORDS = new Set(['COM','DE','DA','DO','NO','NA','E','A','O','EM','AO','AS','OS','UM','UMA']);
const DESC_OVERRIDE = {
  'FEMI-PRETA COM GOLA AMARELA RIO': 'FEMI-PRET-GOLA-AMAR',
  'FEMI-PRETA GOLA AMARELA RIO':     'FEMI-PRET-GOLA-RIO',
  'FEMI-VERDE GOLA AMARELA':         'FEMI-VERD-GOLA',
  'FEMI-VERDE GOLA AMARELA RIO':     'FEMI-VERD-GOLA-RIO',
  'VERMELHO COM LISTRA PRETA':       'VERM-LIST-PRET',
  'VERMELHA COM LISTRA PRETA NO OMBRO': 'VERM-LIST-OMBR',
};

function removeAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function slugify(s) {
  if (!s) return '';
  let r = removeAcentos(s.trim().toUpperCase());
  r = r.replace(/[^A-Z0-9 \-]/g, '');
  r = r.replace(/\s+/g, '-');
  r = r.replace(/-+/g, '-');
  return r.replace(/^-|-$/g, '');
}
function abreviarCampo(s, mapa, n) {
  if (!s) return '';
  const chave = s.trim().toUpperCase();
  if (mapa[chave]) return mapa[chave];
  return slugify(chave).slice(0, n);
}
function palavrasSig(desc) {
  const s = removeAcentos(desc.toUpperCase());
  const palavras = s.match(/[A-Z0-9]+/g) || [];
  const sig = palavras.filter(p => !STOPWORDS.has(p));
  return sig.length > 0 ? sig : palavras;
}
function abreviarDesc(desc, n = 2) {
  if (!desc) return '';
  const chave = removeAcentos(desc.trim().toUpperCase());
  if (DESC_OVERRIDE[chave]) return DESC_OVERRIDE[chave];
  const sig = palavrasSig(desc);
  return sig.slice(0, n).map(p => p.slice(0, 4)).join('-');
}
function gerarCodigo(linha, modelo, time, desc, tamanho) {
  const partes = [];
  const l = abreviarCampo(linha, LINHA_MAP, 2); if (l) partes.push(l);
  const m = abreviarCampo(modelo, MODELO_MAP, 2); if (m) partes.push(m);
  const t = abreviarCampo(time, {}, 3); if (t) partes.push(t);
  const d = abreviarDesc(desc, 2); if (d) partes.push(d);
  const tam = slugify(tamanho); if (tam) partes.push(tam);
  return partes.join('-');
}
function resolverConflitos(rows) {
  const codigos = rows.map(r => gerarCodigo(...r));
  const grupos = {};
  codigos.forEach((cod, i) => { (grupos[cod] = grupos[cod] || []).push(i); });
  const conflitos = [];
  Object.values(grupos).forEach(indices => {
    if (indices.length > 1) {
      const descs = new Set(indices.map(i => removeAcentos(rows[i][3].trim().toUpperCase())));
      if (descs.size > 1) indices.forEach(i => conflitos.push(i));
    }
  });
  const resultado = [...codigos];
  conflitos.forEach(i => {
    const r = rows[i];
    const partes = [];
    const l = abreviarCampo(r[0], LINHA_MAP, 2); if (l) partes.push(l);
    const m = abreviarCampo(r[1], MODELO_MAP, 2); if (m) partes.push(m);
    const t = abreviarCampo(r[2], {}, 3); if (t) partes.push(t);
    const d = abreviarDesc(r[3], 3); if (d) partes.push(d);
    const tam = slugify(r[4]); if (tam) partes.push(tam);
    resultado[i] = partes.join('-');
  });
  return resultado;
}

// ─── Autenticação Service Account ─────────────────────────────────────────────
async function getAccessToken() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não encontrado');
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const msg = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(msg);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${msg}.${sig}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`Token error: ${await resp.text()}`);
  const data = await resp.json();
  return data.access_token;
}

// ─── Ler planilha ─────────────────────────────────────────────────────────────
async function lerPlanilha(token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets read error: ${await resp.text()}`);
  const data = await resp.json();
  return data.values || [];
}

// ─── Escrever códigos ─────────────────────────────────────────────────────────
async function escreverCodigos(token, updates) {
  if (updates.length === 0) { console.log('Nenhuma atualização necessária.'); return; }
  const data = updates.map(([rowNum, codigo]) => ({
    range: `PRODUTOS!A${rowNum}`,
    values: [[codigo]],
  }));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  if (!resp.ok) throw new Error(`Sheets write error: ${await resp.text()}`);
  const result = await resp.json();
  console.log(`✅ ${result.totalUpdatedCells} células atualizadas na planilha.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('🔑 Obtendo token de acesso...');
const token = await getAccessToken();
console.log('📊 Lendo planilha...');
const rows = await lerPlanilha(token);
console.log(`   Total de linhas: ${rows.length}`);

// Identificar linhas sem código
const semCodigo = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const codigo = (row[0] || '').trim();
  if (!codigo) {
    const linha   = (row[1] || '').trim();
    const modelo  = (row[2] || '').trim();
    const time    = (row[3] || '').trim();
    const desc    = (row[4] || '').trim();
    const tamanho = (row[5] || '').trim();
    if (linha && modelo && time && tamanho) {
      semCodigo.push({ rowNum: i + 2, linha, modelo, time, desc, tamanho });
    }
  }
}

console.log(`   Produtos sem código: ${semCodigo.length}`);
if (semCodigo.length === 0) {
  console.log('✅ Todos os produtos já têm código!');
  process.exit(0);
}

// Gerar códigos com resolução de conflitos
const rowsParaGerar = semCodigo.map(r => [r.linha, r.modelo, r.time, r.desc, r.tamanho]);
const codigosGerados = resolverConflitos(rowsParaGerar);

console.log('\n📋 Códigos a serem gerados:');
const updates = [];
semCodigo.forEach((r, idx) => {
  const cod = codigosGerados[idx];
  console.log(`   Linha ${r.rowNum}: ${cod}  ← ${r.linha} | ${r.modelo} | ${r.time} | ${r.desc || '(sem desc)'} | ${r.tamanho}`);
  updates.push([r.rowNum, cod]);
});

console.log(`\n✍️  Escrevendo ${updates.length} códigos na planilha...`);
await escreverCodigos(token, updates);
console.log('🎉 Concluído! O sistema deve sincronizar em até 1 minuto.');
