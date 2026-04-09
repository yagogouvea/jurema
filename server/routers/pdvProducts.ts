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
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      
      try {
        let query = "SELECT * FROM pdv_products WHERE isActive = 1";
        const params: any[] = [];
        
        if (input.search) {
          query += " AND (time LIKE ? OR descricao LIKE ? OR codigo LIKE ?)";
          const s = `%${input.search}%`;
          params.push(s, s, s);
        }
        if (input.linha) {
          query += " AND linha = ?";
          params.push(input.linha);
        }
        if (input.time) {
          query += " AND time LIKE ?";
          params.push(`%${input.time}%`);
        }
        
        query += " ORDER BY time ASC, tamanho ASC";
        
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${input.limit} OFFSET ${offset}`;
        
        const [rows] = await db.execute(query, params);
        
        // Count total
        let countQuery = "SELECT COUNT(*) as total FROM pdv_products WHERE isActive = 1";
        const countParams: any[] = [];
        if (input.search) {
          countQuery += " AND (time LIKE ? OR descricao LIKE ? OR codigo LIKE ?)";
          const s = `%${input.search}%`;
          countParams.push(s, s, s);
        }
        if (input.linha) {
          countQuery += " AND linha = ?";
          countParams.push(input.linha);
        }
        if (input.time) {
          countQuery += " AND time LIKE ?";
          countParams.push(`%${input.time}%`);
        }
        
        const [countRows] = await db.execute(countQuery, countParams);
        await db.end();
        
        const total = (countRows as any[])[0].total;
        return {
          products: rows as any[],
          total,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
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
