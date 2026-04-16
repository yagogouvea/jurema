import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import { savePdvNotification } from "./pdvNotifications";
import { autoSyncProductToSite } from "./pdvSiteSync";
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

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU"; // Nova planilha PDV JUREMA 5.0
const SHEET_RANGE = "PRODUTOS!A2:O2000"; // Aba PRODUTOS (15 colunas: CODIGO,LINHA,MODELO,TIME,DESCRIÇÃO,TAM,TIPO,QTD,ATC,VAR,ATIVO,FOTO,TEMPORADA,PT ATAC,PT VAR)

// Colunas obrigatórias — FOTO (11), TEMPORADA (12), PT ATAC (13), PT VAR (14) são IGNORADAS na validação
// [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
const REQUIRED_COLS = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10]; // DESCRIÇÃO (4) opcional na nova planilha
const COL_NAMES: Record<number, string> = {
  0: "CODIGO", 1: "LINHA", 2: "MODELO", 3: "TIME", 4: "DESCRIÇÃO",
  5: "TAM", 6: "TIPO", 7: "QTD", 8: "ATC", 9: "VAR", 10: "ATIVO",
};

// Normaliza string: trim + uppercase
function norm(val: string): string {
  return (val || '').trim().toUpperCase();
}

interface SheetProduct {
  codigo: string;
  linha: string;
  modelo: string;
  time: string;
  descricao: string;
  tamanho: string;
  estoque: number;
  precoAtacado: number;
  precoVarejo: number;
  isActive: number;
}

// Buscar, validar e DEDUPLICAR dados da planilha
async function fetchSheetData(apiKey: string): Promise<{
  valid: SheetProduct[];
  invalid: any[];
  total: number;
  duplicatesCount: number;
}> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Sheets API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];
  const validRaw: SheetProduct[] = [];
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
    validRaw.push({
      codigo: row[0].trim(),
      linha: norm(row[1]),
      modelo: norm(row[2]),
      time: norm(row[3]),
      descricao: (row[4] || '').trim(),
      tamanho: norm(row[5]),
      estoque: qtd,
      precoAtacado: atc,
      precoVarejo: varejo,
      isActive: ativo === "SIM" || ativo === "1" || ativo === "TRUE" ? 1 : 0,
    });
  }

  // ===== DEDUPLICAÇÃO =====
  // A planilha pode ter códigos duplicados (mesma camisa com variações de descrição).
  // Estratégia: para cada código, SOMAR o estoque e manter os dados da ÚLTIMA ocorrência.
  // Isso garante que o banco terá exatamente o mesmo resultado que o ON DUPLICATE KEY UPDATE produz.
  const deduped = new Map<string, SheetProduct>();
  let duplicatesCount = 0;

  for (const p of validRaw) {
    const existing = deduped.get(p.codigo);
    if (existing) {
      duplicatesCount++;
      // Somar estoque e manter dados da última ocorrência
      deduped.set(p.codigo, {
        ...p,
        estoque: existing.estoque + p.estoque,
        // Manter o maior preço entre as duplicatas (mais seguro)
        precoAtacado: Math.max(existing.precoAtacado, p.precoAtacado),
        precoVarejo: Math.max(existing.precoVarejo, p.precoVarejo),
        // Se qualquer uma estiver ativa, manter ativo
        isActive: existing.isActive || p.isActive ? 1 : 0,
      });
    } else {
      deduped.set(p.codigo, { ...p });
    }
  }

  return {
    valid: Array.from(deduped.values()),
    invalid,
    total: rows.length,
    duplicatesCount,
  };
}

// Normalizar valores para comparação consistente
function normalizeForCompare(dbRow: any): SheetProduct {
  return {
    codigo: (dbRow.codigo || "").trim(),
    linha: (dbRow.linha || "").trim(),
    modelo: (dbRow.modelo || "").trim(),
    time: (dbRow.time || "").trim(),
    descricao: (dbRow.descricao || "").trim(),
    tamanho: (dbRow.tamanho || "").trim(),
    estoque: Number(dbRow.estoque) || 0,
    precoAtacado: Math.round(parseFloat(dbRow.precoAtacado) * 100) / 100,
    precoVarejo: Math.round(parseFloat(dbRow.precoVarejo) * 100) / 100,
    isActive: Number(dbRow.isActive) || 0,
  };
}

function normalizeSheetProduct(p: SheetProduct): SheetProduct {
  return {
    ...p,
    precoAtacado: Math.round(p.precoAtacado * 100) / 100,
    precoVarejo: Math.round(p.precoVarejo * 100) / 100,
  };
}

function hasChanges(sheet: SheetProduct, db: SheetProduct): string[] {
  const diffs: string[] = [];
  if (db.estoque !== sheet.estoque) diffs.push(`estoque: ${db.estoque}→${sheet.estoque}`);
  if (db.precoAtacado !== sheet.precoAtacado) diffs.push(`ATC: R$${db.precoAtacado}→R$${sheet.precoAtacado}`);
  if (db.precoVarejo !== sheet.precoVarejo) diffs.push(`VAR: R$${db.precoVarejo}→R$${sheet.precoVarejo}`);
  if (db.descricao !== sheet.descricao) diffs.push(`descrição alterada`);
  if (db.linha !== sheet.linha) diffs.push(`linha: ${db.linha}→${sheet.linha}`);
  if (db.modelo !== sheet.modelo) diffs.push(`modelo: ${db.modelo}→${sheet.modelo}`);
  if (db.time !== sheet.time) diffs.push(`time: ${db.time}→${sheet.time}`);
  if (db.tamanho !== sheet.tamanho) diffs.push(`tamanho: ${db.tamanho}→${sheet.tamanho}`);
  if (db.isActive !== sheet.isActive) diffs.push(`ativo: ${db.isActive}→${sheet.isActive}`);
  return diffs;
}

export const pdvSyncRouter = router({
  // Prévia: mostra o que seria sincronizado sem alterar o banco
  preview: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY não configurada");

    const { valid, invalid, total, duplicatesCount } = await fetchSheetData(apiKey);

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    const [existing] = await db.execute(
      "SELECT codigo, linha, modelo, `time`, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
    );
    await db.end();

    const existingMap = new Map<string, SheetProduct>();
    for (const row of existing as any[]) {
      existingMap.set(row.codigo, normalizeForCompare(row));
    }

    const novos: SheetProduct[] = [];
    const alterados: { product: SheetProduct; diffs: string[] }[] = [];
    let semAlteracao = 0;

    for (const p of valid) {
      const normalized = normalizeSheetProduct(p);
      const dbProduct = existingMap.get(p.codigo);

      if (!dbProduct) {
        novos.push(p);
      } else {
        const diffs = hasChanges(normalized, dbProduct);
        if (diffs.length > 0) {
          alterados.push({ product: p, diffs });
        } else {
          semAlteracao++;
        }
      }
    }

    return {
      totalPlanilha: total,
      totalValidos: valid.length,
      totalInvalidos: invalid.length,
      duplicatasAgrupadas: duplicatesCount,
      novos: novos.length,
      atualizacoes: alterados.length,
      semAlteracao,
      alterados: alterados.length,
      invalidos: invalid.slice(0, 20),
      amostraValidos: valid.slice(0, 5),
      novosProdutos: novos.slice(0, 10).map(p => `${p.codigo} — ${p.time} ${p.descricao} (${p.tamanho})`),
      alteradosProdutos: alterados.slice(0, 10).map(a =>
        `${a.product.codigo} — ${a.diffs.join(", ")}`
      ),
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
      const { valid, invalid, total, duplicatesCount } = await fetchSheetData(apiKey);

      if (valid.length === 0) throw new Error("Nenhum produto válido encontrado na planilha");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Buscar estado atual do banco para comparar alterações
      const [existingRows] = await db.execute(
        "SELECT codigo, linha, modelo, `time`, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''"
      );
      const existingMap = new Map<string, SheetProduct>();
      for (const row of existingRows as any[]) {
        existingMap.set(row.codigo, normalizeForCompare(row));
      }

      // Identificar novos e alterados ANTES do upsert
      const novosProdutos: SheetProduct[] = [];
      const alteradosProdutos: { product: SheetProduct; diffs: string[] }[] = [];

      for (const p of valid) {
        const normalized = normalizeSheetProduct(p);
        const dbProduct = existingMap.get(p.codigo);
        if (!dbProduct) {
          novosProdutos.push(p);
        } else {
          const diffs = hasChanges(normalized, dbProduct);
          if (diffs.length > 0) {
            alteradosProdutos.push({ product: p, diffs });
          }
        }
      }

      // UPSERT EM LOTE — processa em chunks de 100
      const CHUNK_SIZE = 100;
      let inseridos = 0;
      let atualizados = 0;
      let erros = 0;

      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        try {
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
              (codigo, linha, modelo, \`time\`, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive, createdAt, updatedAt)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
               linha=VALUES(linha), modelo=VALUES(modelo), \`time\`=VALUES(\`time\`),
               descricao=VALUES(descricao), tamanho=VALUES(tamanho),
               estoque=VALUES(estoque), precoAtacado=VALUES(precoAtacado),
               precoVarejo=VALUES(precoVarejo), isActive=VALUES(isActive),
               updatedAt=NOW()`,
            values
          );

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
      console.log(`[PDV Sync] ${timestamp} — ${elapsed}s — Inseridos: ${inseridos}, Atualizados: ${atualizados}, Ignorados: ${invalid.length}, Erros: ${erros}, Duplicatas agrupadas: ${duplicatesCount}`);

      // Notificações internas
      const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

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

        // Auto-sync: criar novos produtos no catálogo do site automaticamente
        const codigosBaseNovos = new Set<string>();
        for (const p of novosProdutos) {
          if (p.codigo) {
            const parts = p.codigo.split("-");
            const base = parts.length > 1 ? parts.slice(0, -1).join("-") : p.codigo;
            codigosBaseNovos.add(base);
          }
        }
        for (const base of Array.from(codigosBaseNovos)) {
          autoSyncProductToSite(base).catch(err =>
            console.error(`[PDV Sync] Erro ao auto-sync site para ${base}:`, err)
          );
        }
      }

      if (alteradosProdutos.length > 0) {
        try {
          const lista = alteradosProdutos.slice(0, 15)
            .map(a => `• ${a.product.codigo} — ${a.diffs.join(", ")}`)
            .join("\n");
          const sufixo = alteradosProdutos.length > 15 ? `\n... e mais ${alteradosProdutos.length - 15} alteração(ões).` : "";
          await savePdvNotification(
            "alteracao_produto",
            `${alteradosProdutos.length} produto(s) com alterações`,
            `Sincronização por: ${seller.name}\nData: ${dataHora}\n\nAlterações detectadas:\n${lista}${sufixo}`
          );
        } catch (e) { console.error("[PDV Sync] Erro notificação alterados:", e); }
      }

      // Resumo da sincronização
      try {
        await savePdvNotification(
          "sync_concluido",
          `Sincronização concluída em ${elapsed}s`,
          `Realizada por: ${seller.name}\nData: ${dataHora}\n\nResumo:\n• Inseridos: ${inseridos}\n• Atualizados: ${atualizados}\n• Ignorados (incompletos): ${invalid.length}\n• Erros: ${erros}\n• Duplicatas agrupadas: ${duplicatesCount}\n• Alterações detectadas: ${alteradosProdutos.length}`
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
        duplicatasAgrupadas: duplicatesCount,
        tempoSegundos: parseFloat(elapsed),
        timestamp,
        novosProdutos: novosProdutos.slice(0, 10).map(p => `${p.codigo} — ${p.time} ${p.descricao}`),
      };
    }),

  // Webhook: recebe novo produto adicionado na planilha via Apps Script
  // Chamado automaticamente quando a Vanessa adiciona uma linha na aba PRODUTOS
  webhookNewProduct: publicProcedure
    .input(z.object({
      secret: z.string(), // Chave secreta para autenticar o Apps Script
      product: z.object({
        codigo: z.string(),
        linha: z.string().default(''),
        modelo: z.string().default(''),
        time: z.string(),
        descricao: z.string().default(''),
        tamanho: z.string(),
        tipo: z.string().default('CAMISETA'),
        estoque: z.number().default(0),
        precoAtacado: z.number().default(0),
        precoVarejo: z.number().default(0),
        isActive: z.boolean().default(true),
      }),
    }))
    .mutation(async ({ input }) => {
      // Verificar chave secreta do Apps Script
      const expectedSecret = process.env.SHEETS_WEBHOOK_SECRET || 'jurema-pdv-2024';
      if (input.secret !== expectedSecret) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Chave inválida' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      
      try {
        // Verificar se o produto já existe
        const [existing] = await db.execute(
          'SELECT id FROM pdv_products WHERE codigo = ? LIMIT 1',
          [input.product.codigo]
        );
        
        if ((existing as any[]).length > 0) {
          // Produto já existe — atualizar
          await db.execute(
            `UPDATE pdv_products SET linha=?, modelo=?, \`time\`=?, descricao=?, tamanho=?,
             estoque=?, precoAtacado=?, precoVarejo=?, isActive=?, updatedAt=NOW()
             WHERE codigo=?`,
            [
              input.product.linha, input.product.modelo, input.product.time,
              input.product.descricao, input.product.tamanho, input.product.estoque,
              input.product.precoAtacado, input.product.precoVarejo,
              input.product.isActive ? 1 : 0, input.product.codigo
            ]
          );
          await db.end();
          return { action: 'updated', codigo: input.product.codigo };
        } else {
          // Produto novo — inserir
          await db.execute(
            `INSERT INTO pdv_products
             (codigo, linha, modelo, \`time\`, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo, isActive, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              input.product.codigo, input.product.linha, input.product.modelo,
              input.product.time, input.product.descricao, input.product.tamanho,
              input.product.tipo, input.product.estoque, input.product.precoAtacado,
              input.product.precoVarejo, input.product.isActive ? 1 : 0
            ]
          );
          await db.end();
          
          // Notificar sobre novo produto
          try {
            await savePdvNotification(
              'novo_produto',
              `Novo produto adicionado via planilha: ${input.product.codigo}`,
              `Produto: ${input.product.time} ${input.product.descricao} (${input.product.tamanho})\nEstoque: ${input.product.estoque} | ATC: R$${input.product.precoAtacado} / VAR: R$${input.product.precoVarejo}`
            );
          } catch (e) { /* não bloquear */ }
          
          return { action: 'inserted', codigo: input.product.codigo };
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error('[PDV Sync] Webhook error:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao processar produto' });
      }
    }),

  // Webhook: recebe atualização de produto existente (edição de linha na planilha)
  webhookUpdateProduct: publicProcedure
    .input(z.object({
      secret: z.string(),
      codigo: z.string(),
      field: z.string(), // campo alterado: estoque, precoAtacado, precoVarejo, etc.
      value: z.union([z.string(), z.number()]),
    }))
    .mutation(async ({ input }) => {
      const expectedSecret = process.env.SHEETS_WEBHOOK_SECRET || 'jurema-pdv-2024';
      if (input.secret !== expectedSecret) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Chave inválida' });
      }
      
      const allowedFields: Record<string, string> = {
        estoque: 'estoque', precoAtacado: 'precoAtacado', precoVarejo: 'precoVarejo',
        descricao: 'descricao', isActive: 'isActive', linha: 'linha',
        modelo: 'modelo', time: '`time`', tamanho: 'tamanho', tipo: 'tipo',
      };
      
      const dbField = allowedFields[input.field];
      if (!dbField) throw new TRPCError({ code: 'BAD_REQUEST', message: `Campo inválido: ${input.field}` });
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      
      try {
        await db.execute(
          `UPDATE pdv_products SET ${dbField}=?, updatedAt=NOW() WHERE codigo=?`,
          [input.value, input.codigo]
        );
        await db.end();
        return { success: true, codigo: input.codigo, field: input.field };
      } catch (err) {
        console.error('[PDV Sync] webhookUpdateProduct error:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),

  // Webhook: reconciliação — recebe lista de todos os códigos ativos na planilha
  // Produtos no banco que NÃO estão nessa lista são desativados (isActive=0)
  webhookReconcile: publicProcedure
    .input(z.object({
      secret: z.string(),
      codigos: z.array(z.string()), // Todos os códigos ativos na planilha
    }))
    .mutation(async ({ input }) => {
      const expectedSecret = process.env.SHEETS_WEBHOOK_SECRET || 'jurema-pdv-2024';
      if (input.secret !== expectedSecret) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Chave inválida' });
      }

      if (input.codigos.length === 0) {
        return { desativados: 0, message: 'Nenhum código recebido — nada alterado' };
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      try {
        // Buscar todos os produtos ativos no banco
        const [activeRows] = await db.execute(
          'SELECT codigo FROM pdv_products WHERE isActive = 1 AND codigo IS NOT NULL AND codigo != ""'
        );

        const sheetCodigos = new Set(input.codigos.map(c => c.trim().toUpperCase()));
        const toDeactivate: string[] = [];

        for (const row of activeRows as any[]) {
          if (!sheetCodigos.has(row.codigo.trim().toUpperCase())) {
            toDeactivate.push(row.codigo);
          }
        }

        if (toDeactivate.length === 0) {
          await db.end();
          return { desativados: 0, message: 'Todos os produtos do banco estão na planilha' };
        }

        // Desativar em lotes de 100
        const CHUNK = 100;
        for (let i = 0; i < toDeactivate.length; i += CHUNK) {
          const chunk = toDeactivate.slice(i, i + CHUNK);
          const placeholders = chunk.map(() => '?').join(',');
          await db.execute(
            `UPDATE pdv_products SET isActive = 0, updatedAt = NOW() WHERE codigo IN (${placeholders})`,
            chunk
          );
        }

        await db.end();

        // Notificar sobre desativação
        if (toDeactivate.length > 0) {
          try {
            const lista = toDeactivate.slice(0, 10).join(', ');
            const sufixo = toDeactivate.length > 10 ? ` e mais ${toDeactivate.length - 10}` : '';
            await savePdvNotification(
              'produto_removido',
              `${toDeactivate.length} produto(s) desativado(s) (removidos da planilha)`,
              `Códigos: ${lista}${sufixo}`
            );
          } catch (e) { /* não bloquear */ }
        }

        return {
          desativados: toDeactivate.length,
          codigos: toDeactivate.slice(0, 20),
          message: `${toDeactivate.length} produto(s) desativado(s) por não estarem mais na planilha`
        };
      } catch (err) {
        console.error('[PDV Sync] webhookReconcile error:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro na reconciliação' });
      }
    }),

  // Status atual do catálogo
  status: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAuth(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
    const [rows] = await db.execute(
      "SELECT COUNT(*) as total, SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as ativos, SUM(estoque) as estoqueTotal, MAX(updatedAt) as ultimaAtualizacao FROM pdv_products"
    );
    await db.end();
    const r = (rows as any[])[0];
    return {
      totalProdutos: Number(r.total) || 0,
      produtosAtivos: Number(r.ativos) || 0,
      estoqueTotal: Number(r.estoqueTotal) || 0,
      ultimaAtualizacao: r.ultimaAtualizacao,
    };
  }),
});
