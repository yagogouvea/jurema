import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
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

// Buscar dados da planilha via Google Sheets API (somente leitura)
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

  // Colunas: [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
  const REQUIRED_COLS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
  const COL_NAMES = ["CODIGO", "LINHA", "MODELO", "TIME", "DESCRIÇÃO", "TAM", "TIPO", "QTD", "ATC", "VAR", "ATIVO"];

  const valid: any[] = [];
  const invalid: any[] = [];

  for (const row of rows) {
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
    };
  }),

  // Sincronização real: upsert dos produtos válidos
  sync: publicProcedure
    .input(z.object({ confirmar: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);

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
      let inseridos = 0;
      let atualizados = 0;
      let erros = 0;

      for (const produto of valid) {
        try {
          // Verificar se já existe
          const [existing] = await db.execute(
            "SELECT id FROM pdv_products WHERE codigo = ?",
            [produto.codigo]
          );
          const exists = (existing as any[]).length > 0;

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

      return {
        sucesso: true,
        totalPlanilha: total,
        inseridos,
        atualizados,
        ignorados: invalid.length,
        erros,
        timestamp,
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
