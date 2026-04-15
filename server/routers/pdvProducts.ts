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

export const pdvProductsRouter = router({
  list: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      linha: z.string().optional(),
      time: z.string().optional(),
      apenasComEstoque: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      
      try {
        let query = "SELECT * FROM pdv_products WHERE isActive = 1";
        const params: any[] = [];
        
        if (input.search) {
          // Busca por múltiplos termos: cada palavra deve aparecer em algum campo
          // Ex: "Brasil azul" = time LIKE '%brasil%' AND (time LIKE '%azul%' OR descricao LIKE '%azul%')
          const terms = input.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
          for (const term of terms) {
            const s = `%${term}%`;
            query += " AND (LOWER(time) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(codigo) LIKE ? OR LOWER(modelo) LIKE ?)";
            params.push(s, s, s, s);
          }
        }
        if (input.linha) {
          query += " AND linha = ?";
          params.push(input.linha);
        }
        if (input.time) {
          query += " AND time LIKE ?";
          params.push(`%${input.time}%`);
        }
        if (input.apenasComEstoque) {
          query += " AND estoque > 0";
        }
        
        query += " ORDER BY time ASC, tamanho ASC";
        
        // Garantir inteiros válidos para evitar "Incorrect arguments to LIMIT"
        const safeLimit = Math.max(1, Math.floor(Number(input.limit) || 50));
        const safePage = Math.max(1, Math.floor(Number(input.page) || 1));
        const offset = (safePage - 1) * safeLimit;
        query += ` LIMIT ${safeLimit} OFFSET ${offset}`;
        
        const [rows] = await db.execute(query, params);
        
        // Count total
        let countQuery = "SELECT COUNT(*) as total FROM pdv_products WHERE isActive = 1";
        const countParams: any[] = [];
        if (input.search) {
          const terms = input.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
          for (const term of terms) {
            const s = `%${term}%`;
            countQuery += " AND (LOWER(time) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(codigo) LIKE ? OR LOWER(modelo) LIKE ?)";
            countParams.push(s, s, s, s);
          }
        }
        if (input.linha) {
          countQuery += " AND linha = ?";
          countParams.push(input.linha);
        }
        if (input.time) {
          countQuery += " AND time LIKE ?";
          countParams.push(`%${input.time}%`);
        }
        if (input.apenasComEstoque) {
          countQuery += " AND estoque > 0";
        }
        
        const [countRows] = await db.execute(countQuery, countParams);
        await db.end();
        
        const total = (countRows as any[])[0].total;
        return {
          products: rows as any[],
          total,
          page: safePage,
          totalPages: Math.ceil(total / safeLimit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar produtos" });
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const [rows] = await db.execute("SELECT * FROM pdv_products WHERE id = ?", [input.id]);
      await db.end();
      const products = rows as any[];
      if (products.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return products[0];
    }),

  create: publicProcedure
    .input(z.object({
      codigo: z.string().optional(),
      linha: z.enum(["TAILANDESA", "NACIONAL", "TORCEDOR", "PECA"]),
      modelo: z.enum(["TORCEDOR", "JOGADOR", "TAILANDESA", "VENDEDOR"]),
      time: z.string().min(1),
      descricao: z.string().optional(),
      tamanho: z.string().min(1),
      tipo: z.enum(["CAMISETA", "CONJUNTO", "OUTRO"]).default("CAMISETA"),
      estoque: z.number().default(0),
      precoAtacado: z.number().default(0),
      precoVarejo: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const [result] = await db.execute(
        `INSERT INTO pdv_products (codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.codigo || null, input.linha, input.modelo, input.time, input.descricao || null, 
         input.tamanho, input.tipo, input.estoque, input.precoAtacado, input.precoVarejo]
      );
      await db.end();
      return { success: true, id: (result as any).insertId };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      codigo: z.string().optional(),
      linha: z.enum(["TAILANDESA", "NACIONAL", "TORCEDOR", "PECA"]).optional(),
      modelo: z.enum(["TORCEDOR", "JOGADOR", "TAILANDESA", "VENDEDOR"]).optional(),
      time: z.string().optional(),
      descricao: z.string().optional(),
      tamanho: z.string().optional(),
      tipo: z.enum(["CAMISETA", "CONJUNTO", "OUTRO"]).optional(),
      estoque: z.number().optional(),
      precoAtacado: z.number().optional(),
      precoVarejo: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { id, ...fields } = input;
      const sets: string[] = [];
      const params: any[] = [];
      
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
      });
      
      if (sets.length === 0) return { success: true };
      params.push(id);
      
      await db.execute(`UPDATE pdv_products SET ${sets.join(", ")} WHERE id = ?`, params);
      await db.end();
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      await db.execute("UPDATE pdv_products SET isActive = 0 WHERE id = ?", [input.id]);
      await db.end();
      return { success: true };
    }),

  listGrouped: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      linha: z.string().optional(),
      apenasComEstoque: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(500).default(60),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        // Build WHERE clause for individual products
        let where = "WHERE isActive = 1";
        const params: any[] = [];

        if (input.search) {
          const terms = input.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
          for (const term of terms) {
            const s = `%${term}%`;
            where += " AND (LOWER(time) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(codigo) LIKE ? OR LOWER(modelo) LIKE ?)";
            params.push(s, s, s, s);
          }
        }
        if (input.linha) {
          where += " AND linha = ?";
          params.push(input.linha);
        }
        if (input.apenasComEstoque) {
          where += " AND estoque > 0";
        }

        // Fetch ALL matching products (no pagination here — we group in JS)
        const [rows] = await db.execute(
          `SELECT id, codigo, linha, modelo, time, descricao, tipo, tamanho, estoque, precoAtacado, precoVarejo
           FROM pdv_products ${where}
           ORDER BY time ASC, codigo ASC`,
          params
        );
        await db.end();

        const products = rows as any[];

        // Group by base code (remove last hyphen-separated segment = tamanho)
        const groupMap = new Map<string, any>();

        for (const p of products) {
          const parts = (p.codigo || "").split("-");
          // Base code = all parts except the last one
          const baseCode = parts.length > 1 ? parts.slice(0, -1).join("-") : (p.codigo || `${p.time}-${p.modelo}`);

          if (!groupMap.has(baseCode)) {
            groupMap.set(baseCode, {
              baseCode,
              linha: p.linha,
              modelo: p.modelo,
              time: p.time,
              descricao: p.descricao,
              tipo: p.tipo,
              precoAtacado: parseFloat(p.precoAtacado) || 0,
              precoVarejo: parseFloat(p.precoVarejo) || 0,
              estoqueTotal: 0,
              variantes: [],
            });
          }

          const group = groupMap.get(baseCode)!;
          group.estoqueTotal += parseInt(p.estoque) || 0;
          // Update prices: use min for atacado (cheapest), max for varejo (most expensive)
          // Actually keep the first product's price (they should be the same per model)
          // But track if prices differ
          group.variantes.push({
            id: p.id,
            tamanho: p.tamanho,
            estoque: parseInt(p.estoque) || 0,
            codigo: p.codigo,
            precoAtacado: parseFloat(p.precoAtacado) || 0,
            precoVarejo: parseFloat(p.precoVarejo) || 0,
          });
        }

        const allGroups = Array.from(groupMap.values());
        const total = allGroups.length;

        // Paginate groups
        const safeLimit = Math.max(1, Math.floor(Number(input.limit) || 60));
        const safePage = Math.max(1, Math.floor(Number(input.page) || 1));
        const offset = (safePage - 1) * safeLimit;
        const pagedGroups = allGroups.slice(offset, offset + safeLimit);

        return {
          groups: pagedGroups,
          total,
          page: safePage,
          totalPages: Math.ceil(total / safeLimit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar produtos agrupados" });
      }
    }),

  getLinhas: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAuth(ctx);
    const db = await getDb();
    if (!db) return [];
    
    const [rows] = await db.execute(
      "SELECT DISTINCT linha FROM pdv_products WHERE isActive = 1 ORDER BY linha"
    );
    await db.end();
    return (rows as any[]).map(r => r.linha);
  }),

  getTimes: publicProcedure
    .input(z.object({ linha: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) return [];
      
      let query = "SELECT DISTINCT time FROM pdv_products WHERE isActive = 1";
      const params: any[] = [];
      if (input.linha) {
        query += " AND linha = ?";
        params.push(input.linha);
      }
      query += " ORDER BY time";
      
      const [rows] = await db.execute(query, params);
      await db.end();
      return (rows as any[]).map(r => r.time);
    }),
});
