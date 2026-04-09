import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import { savePdvNotification } from "./pdvNotifications";
import type { Request } from "express";

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createConnection(url);
}
async function requirePdvAuth(ctx: any) {
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  return seller;
}
async function requirePdvAdmin(ctx: any) {
  const seller = await requirePdvAuth(ctx);
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

const SHEET_ID = "1z-Qr08Oy9tc3c7rd1nspR0F20oP0cRskEXmUxPxvo7M";
const SHEET_RANGE = "PRODUTOS VISUAL!A2:M2000";

// Colunas obrigatórias — FOTO (11) e TEMPORADA (12) são IGNORADAS na validação
// [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
const REQUIRED_COLS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
const COL_NAMES: Record<number, string> = {
  0: "CODIGO", 1: "LINHA", 2: "MODELO", 3: "TIME", 4: "DESCRIÇÃO",
  5: "TAM", 6: "TIPO", 7: "QTD", 8: "ATC", 9: "VAR", 10: "ATIVO",
};

function mapLinha(val: string): string {
  const v = val.toUpperCase().trim();
  if (v.includes("TAILANDESA")) return "TAILANDESA";
  if (v.includes("NACIONAL")) return "NACIONAL";
  if (v.includes("TORCEDOR")) return "TORCEDOR";
  if (v.includes("PECA") || v.includes("PEÇA")) return "PECA";
  return "TAILANDESA";
}

function mapModelo(val: string): string {
  const v = val.toUpperCase().trim();
  if (v.includes("JOGADOR")) return "JOGADOR";
  if (v.includes("TORCEDOR")) return "TORCEDOR";
  if (v.includes("BONE") || v.includes("BONÉ")) return "BONE";
  return "TORCEDOR";
}

// Buscar e validar dados da planilha (somente leitura — nunca modifica a planilha)
async function fetchSheetData(apiKey: string): Promise<{
  valid: any[];
  invalid: any[];
  total: number;
}> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Sheets API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];
  const valid: any[] = [];
  const invalid: any[] = [];

  for (const row of rows) {
    // Verificar campos obrigatórios (FOTO e TEMPORADA excluídos)
    const missingCols = REQUIRED_COLS.filter(i => {
      const val = row[i];
      return val === undefined || val === null || val.toString().trim() === "";
    });

    if (missingCols.length > 0) {
      invalid.push({
        codigo: row[0] || "(sem código)",
        motivo: `Campos faltando: ${missingCols.map(i => COL_NAMES[i] || `col${i}`).join(", ")}`,
      });
      continue;
    }

    // Validação de estoque: QTD deve ser numérico e >= 0
    const qtdRaw = row[7]?.toString().trim();
    const qtd = parseInt(qtdRaw);
    if (isNaN(qtd) || qtd < 0) {
      invalid.push({
        codigo: row[0] || "(sem código)",
        motivo: `QTD inválido: "${qtdRaw}" (deve ser número >= 0)`,
      });
      continue;
    }

    // Validação de preços: ATC e VAR devem ser numéricos e > 0
    const atcRaw = row[8]?.toString().trim();
    const varRaw = row[9]?.toString().trim();
    const atc = parseFloat(atcRaw);
    const varejo = parseFloat(varRaw);
    if (isNaN(atc) || atc <= 0) {
      invalid.push({
        codigo: row[0] || "(sem código)",
        motivo: `Preço atacado inválido: "${atcRaw}" (deve ser número > 0)`,
      });
      continue;
    }
    if (isNaN(varejo) || varejo <= 0) {
      invalid.push({
        codigo: row[0] || "(sem código)",
        motivo: `Preço varejo inválido: "${varRaw}" (deve ser número > 0)`,
      });
      continue;
    }

    const ativo = row[10]?.toString().toUpperCase().trim();
    valid.push({
      codigo: row[0].trim(),
      linha: mapLinha(row[1]),
      modelo: mapModelo(row[2]),
      time: row[3].trim().toUpperCase(),
      descricao: row[4].trim(),
      tamanho: row[5].trim().toUpperCase(),
      estoque: qtd,
      precoAtacado: atc,
      precoVarejo: varejo,
      isActive: ativo === "SIM" || ativo === "1" || ativo === "TRUE" ? 1 : 0,
    });
  }

  return { valid, invalid, total: rows.length };
}

export const pdvSyncRouter = router({
  // Prévia: mostra o que seria sincronizado sem alterar o banco
  preview: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY não configurada");

    const { valid, invalid, total } = await fetchSheetData(apiKey);

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    const [existing] = await db.execute(
      "SELECT codigo, linha, modelo, time, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
    );
    await db.end();

    const existingMap = new Map((existing as any[]).map((r: any) => [r.codigo, r]));
    const novos = valid.filter(p => !existingMap.has(p.codigo));

    // Detectar alterações em qualquer campo relevante
    const alterados = valid.filter(p => {
      const ex = existingMap.get(p.codigo);
      if (!ex) return false;
      return (
        Number(ex.estoque) !== p.estoque ||
        parseFloat(ex.precoAtacado) !== p.precoAtacado ||
        parseFloat(ex.precoVarejo) !== p.precoVarejo ||
        ex.descricao !== p.descricao ||
        ex.linha !== p.linha ||
        ex.modelo !== p.modelo ||
        ex.time !== p.time ||
        ex.tamanho !== p.tamanho ||
        Number(ex.isActive) !== p.isActive
      );
    });

    const semAlteracao = valid.filter(p => existingMap.has(p.codigo) && !alterados.includes(p));

    return {
      totalPlanilha: total,
      totalValidos: valid.length,
      totalInvalidos: invalid.length,
      novos: novos.length,
      atualizacoes: alterados.length, // apenas os realmente alterados
      semAlteracao: semAlteracao.length, // já sincronizados e sem mudanças
      alterados: alterados.length,
      invalidos: invalid.slice(0, 20),
      amostraValidos: valid.slice(0, 5),
      novosProdutos: novos.slice(0, 10).map(p => `${p.codigo} — ${p.time} ${p.descricao} (${p.tamanho})`),
      alteradosProdutos: alterados.slice(0, 10).map(p => {
        const ex = existingMap.get(p.codigo);
        const diffs: string[] = [];
        if (ex && Number(ex.estoque) !== p.estoque) diffs.push(`estoque: ${ex.estoque}→${p.estoque}`);
        if (ex && parseFloat(ex.precoAtacado) !== p.precoAtacado) diffs.push(`ATC: R$${ex.precoAtacado}→R$${p.precoAtacado}`);
        if (ex && parseFloat(ex.precoVarejo) !== p.precoVarejo) diffs.push(`VAR: R$${ex.precoVarejo}→R$${p.precoVarejo}`);
        if (ex && ex.descricao !== p.descricao) diffs.push(`descrição: "${ex.descricao}"→"${p.descricao}"`);
        if (ex && Number(ex.isActive) !== p.isActive) diffs.push(`ativo: ${ex.isActive}→${p.isActive}`);
        return `${p.codigo} — ${diffs.join(", ")}`;
      }),
    };
  }),

  // Sincronização em lote: upsert otimizado com INSERT ON DUPLICATE KEY UPDATE
  sync: publicProcedure
    .input(z.object({ confirmar: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAdmin(ctx);
      if (!input.confirmar) throw new Error("Confirmação necessária para sincronizar");

      const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY não configurada");

      const startTime = Date.now();
      const { valid, invalid, total } = await fetchSheetData(apiKey);

      if (valid.length === 0) throw new Error("Nenhum produto válido encontrado na planilha");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Buscar estado atual do banco para comparar alterações
      const [existingRows] = await db.execute(
        "SELECT codigo, estoque, precoAtacado, precoVarejo FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
      );
      const existingMap = new Map((existingRows as any[]).map((r: any) => [r.codigo, r]));

      // Identificar novos e alterados ANTES do upsert
      const novosProdutos = valid.filter(p => !existingMap.has(p.codigo));
      const alteradosProdutos = valid.filter(p => {
        const ex = existingMap.get(p.codigo);
        return ex && (
          Number(ex.estoque) !== p.estoque ||
          parseFloat(ex.precoAtacado) !== p.precoAtacado ||
          parseFloat(ex.precoVarejo) !== p.precoVarejo
        );
      });

      // UPSERT EM LOTE — muito mais rápido que loop de SELECT+UPDATE/INSERT
      // Processa em chunks de 100 para evitar queries muito grandes
      const CHUNK_SIZE = 100;
      let inseridos = 0;
      let atualizados = 0;
      let erros = 0;

      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        try {
          // Construir placeholders para o batch
          const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())").join(", ");
          const values: any[] = [];
          for (const p of chunk) {
            values.push(
              p.codigo, p.linha, p.modelo, p.time, p.descricao,
              p.tamanho, p.estoque, p.precoAtacado, p.precoVarejo, p.isActive
            );
          }

          await db.execute(
            `INSERT INTO pdv_products
              (codigo, linha, modelo, time, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive, createdAt, updatedAt)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
               linha=VALUES(linha), modelo=VALUES(modelo), time=VALUES(time),
               descricao=VALUES(descricao), tamanho=VALUES(tamanho),
               estoque=VALUES(estoque), precoAtacado=VALUES(precoAtacado),
               precoVarejo=VALUES(precoVarejo), isActive=VALUES(isActive),
               updatedAt=NOW()`,
            values
          );

          // Contar inseridos vs atualizados pelo mapa existente
          for (const p of chunk) {
            if (existingMap.has(p.codigo)) atualizados++;
            else inseridos++;
          }
        } catch (err) {
          erros += chunk.length;
          console.error(`[PDV Sync] Erro no chunk ${i}-${i + CHUNK_SIZE}:`, err);
        }
      }

      await db.end();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const timestamp = new Date().toISOString();
      console.log(`[PDV Sync] ${timestamp} — ${elapsed}s — Inseridos: ${inseridos}, Atualizados: ${atualizados}, Ignorados: ${invalid.length}, Erros: ${erros}`);

      // Notificação interna de sincronização (salva no banco PDV, sem dependência do Manus)
      const dataHora = new Date().toLocaleString("pt-BR");

      if (novosProdutos.length > 0) {
        try {
          const lista = novosProdutos.slice(0, 10)
            .map(p => `• ${p.codigo} — ${p.time} ${p.descricao} (${p.tamanho}) | ATC: R$${p.precoAtacado} / VAR: R$${p.precoVarejo}`)
            .join("\n");
          const sufixo = novosProdutos.length > 10 ? `\n... e mais ${novosProdutos.length - 10} produto(s).` : "";
          await savePdvNotification(
            "novo_produto",
            `${novosProdutos.length} novo(s) produto(s) adicionado(s)`,
            `Sincronização por: ${seller.name}\nData: ${dataHora}\n\nNovos produtos:\n${lista}${sufixo}`
          );
        } catch (e) { console.error("[PDV Sync] Erro notificação novos:", e); }
      }

      if (alteradosProdutos.length > 0) {
        try {
          const lista = alteradosProdutos.slice(0, 15)
            .map(p => {
              const ex = existingMap.get(p.codigo);
              const diffs: string[] = [];
              if (ex && Number(ex.estoque) !== p.estoque) diffs.push(`estoque: ${ex.estoque}→${p.estoque}`);
              if (ex && parseFloat(ex.precoAtacado) !== p.precoAtacado) diffs.push(`ATC: R$${ex.precoAtacado}→R$${p.precoAtacado}`);
              if (ex && parseFloat(ex.precoVarejo) !== p.precoVarejo) diffs.push(`VAR: R$${ex.precoVarejo}→R$${p.precoVarejo}`);
              return `• ${p.codigo} — ${p.time} ${p.descricao}: ${diffs.join(", ")}`;
            })
            .join("\n");
          const sufixo = alteradosProdutos.length > 15 ? `\n... e mais ${alteradosProdutos.length - 15} alteração(ões).` : "";
          await savePdvNotification(
            "alteracao_produto",
            `${alteradosProdutos.length} produto(s) com preço ou estoque alterado`,
            `Sincronização por: ${seller.name}\nData: ${dataHora}\n\nAlterações detectadas:\n${lista}${sufixo}`
          );
        } catch (e) { console.error("[PDV Sync] Erro notificação alterados:", e); }
      }

      // Notificação de resumo da sincronização
      try {
        await savePdvNotification(
          "sync_concluido",
          `Sincronização concluída em ${elapsed}s`,
          `Realizada por: ${seller.name}\nData: ${dataHora}\n\nResumo:\n• Inseridos: ${inseridos}\n• Atualizados: ${atualizados}\n• Ignorados (incompletos): ${invalid.length}\n• Erros: ${erros}\n• Alterações de preço/estoque: ${alteradosProdutos.length}`
        );
      } catch (e) { console.error("[PDV Sync] Erro notificação resumo:", e); }

      return {
        sucesso: true,
        totalPlanilha: total,
        inseridos,
        atualizados,
        ignorados: invalid.length,
        erros,
        alterados: alteradosProdutos.length,
        tempoSegundos: parseFloat(elapsed),
        timestamp,
        novosProdutos: novosProdutos.slice(0, 10).map(p => `${p.codigo} — ${p.time} ${p.descricao}`),
      };
    }),

  // Status atual do catálogo
  status: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAuth(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
    const [rows] = await db.execute(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN isActive=1 THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN estoque > 0 THEN 1 ELSE 0 END) as comEstoque,
        MAX(updatedAt) as ultimaAtualizacao
       FROM pdv_products`
    );
    await db.end();
    const r = (rows as any[])[0];
    return {
      totalProdutos: Number(r.total) || 0,
      produtosAtivos: Number(r.ativos) || 0,
      comEstoque: Number(r.comEstoque) || 0,
      ultimaAtualizacao: r.ultimaAtualizacao || null,
      sheetId: SHEET_ID,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}`,
    };
  }),
});
