import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import { notifyOwner } from "../_core/notification";
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
// Expandido para M2000 para capturar todas as colunas incluindo FOTO e TEMPORADA
const SHEET_RANGE = "PRODUTOS VISUAL!A2:M2000";

// Colunas obrigatórias para validação do produto
// [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
// [11]FOTO e [12]TEMPORADA são IGNORADAS na validação
const REQUIRED_COLS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
const COL_NAMES: Record<number, string> = {
  0: "CODIGO",
  1: "LINHA",
  2: "MODELO",
  3: "TIME",
  4: "DESCRIÇÃO",
  5: "TAM",
  6: "TIPO",
  7: "QTD",
  8: "ATC",
  9: "VAR",
  10: "ATIVO",
  // 11: FOTO — ignorado na validação
  // 12: TEMPORADA — ignorado na validação
};

// Mapeamento de linha para enum do banco
function mapLinha(val: string): string {
  const v = val.toUpperCase().trim();
  if (v.includes("TAILANDESA")) return "TAILANDESA";
  if (v.includes("NACIONAL")) return "NACIONAL";
  if (v.includes("TORCEDOR")) return "TORCEDOR";
  if (v.includes("PECA") || v.includes("PEÇA")) return "PECA";
  return "TAILANDESA";
}

// Mapeamento de modelo para enum do banco
function mapModelo(val: string): string {
  const v = val.toUpperCase().trim();
  if (v.includes("JOGADOR")) return "JOGADOR";
  if (v.includes("TORCEDOR")) return "TORCEDOR";
  if (v.includes("BONE") || v.includes("BONÉ")) return "BONE";
  return "TORCEDOR";
}

// Buscar dados da planilha via Google Sheets API (somente leitura — nunca modifica a planilha)
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
    // Verificar apenas os campos obrigatórios — FOTO (col 11) e TEMPORADA (col 12) são ignorados
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

    const ativo = row[10]?.toString().toUpperCase().trim();
    valid.push({
      codigo: row[0].trim(),
      linha: mapLinha(row[1]),
      modelo: mapModelo(row[2]),
      time: row[3].trim().toUpperCase(),
      descricao: row[4].trim(),
      tamanho: row[5].trim().toUpperCase(),
      estoque: parseInt(row[7]) || 0,
      precoAtacado: parseFloat(row[8]) || 0,
      precoVarejo: parseFloat(row[9]) || 0,
      isActive: ativo === "SIM" || ativo === "1" || ativo === "TRUE" ? 1 : 0,
      // FOTO (col 11) e TEMPORADA (col 12) são lidos mas não salvos no banco PDV
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

    // Verificar quais são novos vs atualizações
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
    const [existing] = await db.execute(
      "SELECT codigo FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
    );
    await db.end();

    const existingCodes = new Set((existing as any[]).map((r: any) => r.codigo));
    const novos = valid.filter(p => !existingCodes.has(p.codigo));
    const atualizacoes = valid.filter(p => existingCodes.has(p.codigo));

    return {
      totalPlanilha: total,
      totalValidos: valid.length,
      totalInvalidos: invalid.length,
      novos: novos.length,
      atualizacoes: atualizacoes.length,
      invalidos: invalid.slice(0, 20),
      amostraValidos: valid.slice(0, 5),
      // Lista dos novos produtos para exibir na prévia
      novosProdutos: novos.slice(0, 10).map(p => `${p.codigo} — ${p.time} ${p.descricao} (${p.tamanho})`),
    };
  }),

  // Sincronização real: upsert dos produtos válidos + notificação de novos produtos
  sync: publicProcedure
    .input(z.object({ confirmar: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAdmin(ctx);

      if (!input.confirmar) {
        throw new Error("Confirmação necessária para sincronizar");
      }

      const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY não configurada");

      const { valid, invalid, total } = await fetchSheetData(apiKey);

      if (valid.length === 0) {
        throw new Error("Nenhum produto válido encontrado na planilha");
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Identificar produtos novos ANTES de inserir (para notificação)
      const [existingRows] = await db.execute(
        "SELECT codigo FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
      );
      const existingCodes = new Set((existingRows as any[]).map((r: any) => r.codigo));
      const novosProdutos = valid.filter(p => !existingCodes.has(p.codigo));

      let inseridos = 0;
      let atualizados = 0;
      let erros = 0;

      for (const produto of valid) {
        try {
          const exists = existingCodes.has(produto.codigo);

          if (exists) {
            await db.execute(
              `UPDATE pdv_products SET
                linha=?, modelo=?, time=?, descricao=?, tamanho=?,
                estoque=?, precoAtacado=?, precoVarejo=?, isActive=?, updatedAt=NOW()
               WHERE codigo=?`,
              [
                produto.linha, produto.modelo, produto.time, produto.descricao,
                produto.tamanho, produto.estoque, produto.precoAtacado,
                produto.precoVarejo, produto.isActive, produto.codigo,
              ]
            );
            atualizados++;
          } else {
            await db.execute(
              `INSERT INTO pdv_products
                (codigo, linha, modelo, time, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                produto.codigo, produto.linha, produto.modelo, produto.time,
                produto.descricao, produto.tamanho, produto.estoque,
                produto.precoAtacado, produto.precoVarejo, produto.isActive,
              ]
            );
            inseridos++;
          }
        } catch (err) {
          erros++;
          console.error(`[PDV Sync] Erro no produto ${produto.codigo}:`, err);
        }
      }

      await db.end();

      const timestamp = new Date().toISOString();
      console.log(`[PDV Sync] ${timestamp} — Inseridos: ${inseridos}, Atualizados: ${atualizados}, Ignorados: ${invalid.length}, Erros: ${erros}`);

      // Notificar o dono se houver produtos novos detectados
      if (inseridos > 0) {
        try {
          const listaResumida = novosProdutos
            .slice(0, 10)
            .map(p => `• ${p.codigo} — ${p.time} ${p.descricao} (${p.tamanho}) | Atacado: R$${p.precoAtacado} / Varejo: R$${p.precoVarejo}`)
            .join("\n");

          const sufixo = novosProdutos.length > 10
            ? `\n... e mais ${novosProdutos.length - 10} produto(s).`
            : "";

          await notifyOwner({
            title: `🆕 ${inseridos} novo(s) produto(s) adicionado(s) ao PDV`,
            content: `Sincronização realizada por: ${seller.name}\nData: ${new Date().toLocaleString("pt-BR")}\n\nNovos produtos:\n${listaResumida}${sufixo}\n\nResumo: ${inseridos} inseridos, ${atualizados} atualizados, ${invalid.length} ignorados (campos incompletos).`,
          });
        } catch (notifErr) {
          console.error("[PDV Sync] Erro ao enviar notificação:", notifErr);
          // Não falha a sincronização por causa da notificação
        }
      }

      return {
        sucesso: true,
        totalPlanilha: total,
        inseridos,
        atualizados,
        ignorados: invalid.length,
        erros,
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
