/**
 * pdvProductCode.ts
 * Geração automática de código de produto a partir dos campos da planilha.
 *
 * MÓDULO ÚNICO E CANÔNICO — usado tanto pelo sync manual (pdvSync.ts) quanto
 * pelo sync automático (pdvAutoSync.ts). Antes cada arquivo tinha sua própria
 * versão com mapas divergentes (ex.: TAILANDESA gerava "TA" no manual e "CA" no
 * automático), o que criava códigos diferentes para o mesmo produto.
 */

const LINHA_MAP: Record<string, string> = {
  TAILANDESA: "TA",
  NACIONAL: "NA",
  TORCEDOR: "TO",
  PECA: "PE",
};

const MODELO_MAP: Record<string, string> = {
  JOGADOR: "JG",
  TORCEDOR: "TO",
  TAILANDESA: "TA",
  DRYFIT: "DR",
  VENDEDOR: "VE",
  "CONJ.ADULTO": "CO",
  "CONJ ADULTO": "CO",
  "CONJUNTO ADULTO": "CO",
  "CONJ.INFANTIL": "CI",
  "CONJ INFANTIL": "CI",
  "CONJUNTO INFANTIL": "CI",
  FEMININO: "FE",
  FEMI: "FE",
  MASCULINO: "MA",
  INFANTIL: "IN",
  REGATA: "RG",
  AGASALHO: "AG",
  SHORTS: "SH",
  CALCA: "CL",
  "CALÇA": "CL",
  BERMUDA: "BM",
  MOLETOM: "ML",
  JAQUETA: "JQ",
  BLUSA: "BL",
  CAMISA: "CM",
  CAMISETA: "CT",
  POLO: "PL",
  MEIAS: "ME",
  BONE: "BO",
  "BONÉ": "BO",
  MOCHILA: "MO",
  CHUTEIRA: "CH",
  RETRO: "RE",
  "RETRÔ": "RE",
};

const STOPWORDS = new Set([
  "COM", "DE", "DA", "DO", "NO", "NA", "E", "A", "O", "EM", "AO", "AS", "OS", "UM", "UMA",
]);

const DESC_OVERRIDE: Record<string, string> = {
  "FEMI-PRETA COM GOLA AMARELA RIO": "FEMI-PRET-GOLA-AMAR",
  "FEMI-PRETA GOLA AMARELA RIO": "FEMI-PRET-GOLA-RIO",
  "FEMI-VERDE GOLA AMARELA": "FEMI-VERD-GOLA",
  "FEMI-VERDE GOLA AMARELA RIO": "FEMI-VERD-GOLA-RIO",
  "VERMELHO COM LISTRA PRETA": "VERM-LIST-PRET",
  "VERMELHA COM LISTRA PRETA NO OMBRO": "VERM-LIST-OMBR",
};

export function removeAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function slugifyCode(s: string): string {
  if (!s) return "";
  let r = removeAcentos(s.trim().toUpperCase());
  r = r.replace(/[^A-Z0-9 \-]/g, "");
  r = r.replace(/\s+/g, "-");
  r = r.replace(/-+/g, "-");
  return r.replace(/^-|-$/g, "");
}

function abreviarCampo(s: string, mapa: Record<string, string>, n: number): string {
  if (!s) return "";
  const chave = s.trim().toUpperCase();
  if (mapa[chave]) return mapa[chave];
  return slugifyCode(chave).slice(0, n);
}

function palavrasSignificativas(desc: string): string[] {
  const s = removeAcentos(desc.toUpperCase());
  const palavras = s.match(/[A-Z0-9]+/g) || [];
  const sig = palavras.filter((p) => !STOPWORDS.has(p));
  return sig.length > 0 ? sig : palavras;
}

function abreviarDesc(desc: string, nPalavras = 2, timeParaFiltrar = ""): string {
  if (!desc) return "";
  const chave = removeAcentos(desc.trim().toUpperCase());
  if (DESC_OVERRIDE[chave]) return DESC_OVERRIDE[chave];
  const sig = palavrasSignificativas(desc);
  let filtradas = sig;
  if (timeParaFiltrar) {
    const palavrasTime = new Set(palavrasSignificativas(timeParaFiltrar));
    filtradas = sig.filter((p) => !palavrasTime.has(p));
    if (filtradas.length === 0) filtradas = sig;
  }
  return filtradas.slice(0, nPalavras).map((p) => p.slice(0, 4)).join("-");
}

export function gerarCodigoAuto(
  linha: string,
  modelo: string,
  time: string,
  desc: string,
  tamanho: string
): string {
  const partes: string[] = [];
  const l = abreviarCampo(linha, LINHA_MAP, 2);
  if (l) partes.push(l);
  const m = abreviarCampo(modelo, MODELO_MAP, 2);
  if (m) partes.push(m);
  const t = abreviarCampo(time, {}, 3);
  if (t) partes.push(t);
  const d = abreviarDesc(desc, 1, time);
  if (d) partes.push(d);
  const tam = slugifyCode(tamanho);
  if (tam) partes.push(tam);
  return partes.join("-");
}

/** Detecta e resolve conflitos de código gerado dentro de um batch de linhas. */
export function resolverConflitosDescricao(
  rows: Array<{ linha: string; modelo: string; time: string; desc: string; tamanho: string }>
): string[] {
  const codigos = rows.map((r) => gerarCodigoAuto(r.linha, r.modelo, r.time, r.desc, r.tamanho));
  const grupos: Record<string, number[]> = {};
  codigos.forEach((cod, i) => {
    if (!grupos[cod]) grupos[cod] = [];
    grupos[cod].push(i);
  });
  const conflitos: number[] = [];
  Object.values(grupos).forEach((indices) => {
    if (indices.length > 1) {
      const descs = new Set(indices.map((i: number) => removeAcentos(rows[i].desc.trim().toUpperCase())));
      if (descs.size > 1) indices.forEach((i: number) => conflitos.push(i));
    }
  });
  const resultado = [...codigos];
  conflitos.forEach((i) => {
    const r = rows[i];
    const partes: string[] = [];
    const l = abreviarCampo(r.linha, LINHA_MAP, 2);
    if (l) partes.push(l);
    const m = abreviarCampo(r.modelo, MODELO_MAP, 2);
    if (m) partes.push(m);
    const t = abreviarCampo(r.time, {}, 3);
    if (t) partes.push(t);
    const d = abreviarDesc(r.desc, 2, r.time);
    if (d) partes.push(d);
    const tam = slugifyCode(r.tamanho);
    if (tam) partes.push(tam);
    resultado[i] = partes.join("-");
  });
  return resultado;
}
