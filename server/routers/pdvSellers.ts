import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import crypto from "crypto";
import { verifyPdvToken } from "./pdvAuth";
import type { Request } from "express";

const PDV_SALT = "pdv_salt_jumera";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + PDV_SALT).digest("hex");
}

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createConnection(url);
}

async function requirePdvAdmin(ctx: any) {
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

export const pdvSellersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    const [rows] = await db.execute(
      "SELECT id, name, username, role, isActive, createdAt FROM pdv_sellers ORDER BY name ASC"
    );
    await db.end();
    return rows as any[];
  }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      username: z.string().min(3).max(50),
      password: z.string().min(6),
      role: z.enum(["seller", "admin"]).default("seller"),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      try {
        const passwordHash = hashPassword(input.password);
        const [result] = await db.execute(
          "INSERT INTO pdv_sellers (name, username, passwordHash, role) VALUES (?, ?, ?, ?)",
          [input.name.toUpperCase(), input.username.toLowerCase(), passwordHash, input.role]
        );
        await db.end();
        return { success: true, id: (result as any).insertId };
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "Nome de usuário já existe" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar vendedor" });
      }
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      username: z.string().optional(),
      password: z.string().min(6).optional(),
      role: z.enum(["seller", "admin"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { id, password, name, ...rest } = input;
      const sets: string[] = [];
      const params: any[] = [];
      
      if (name) { sets.push("name = ?"); params.push(name.toUpperCase()); }
      if (rest.username) { sets.push("username = ?"); params.push(rest.username.toLowerCase()); }
      if (rest.role !== undefined) { sets.push("role = ?"); params.push(rest.role); }
      if (rest.isActive !== undefined) { sets.push("isActive = ?"); params.push(rest.isActive); }
      if (password) { sets.push("passwordHash = ?"); params.push(hashPassword(password)); }
      
      if (sets.length === 0) return { success: true };
      params.push(id);
      
      try {
        await db.execute(`UPDATE pdv_sellers SET ${sets.join(", ")} WHERE id = ?`, params);
        await db.end();
        return { success: true };
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "Nome de usuário já existe" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      await db.execute("UPDATE pdv_sellers SET isActive = 0 WHERE id = ?", [input.id]);
      await db.end();
      return { success: true };
    }),

  getStats: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) return [];
      
      let dateFilter = "";
      const params: any[] = [];
      if (input.startDate) { dateFilter += " AND DATE(o.createdAt) >= ?"; params.push(input.startDate); }
      if (input.endDate) { dateFilter += " AND DATE(o.createdAt) <= ?"; params.push(input.endDate); }
      
      const [rows] = await db.execute(
        `SELECT 
          s.id, s.name, s.username, s.role,
          COUNT(o.id) as totalPedidos,
          COALESCE(SUM(o.totalAplicado), 0) as faturamento,
          COALESCE(AVG(o.totalAplicado), 0) as ticketMedio
         FROM pdv_sellers s
         LEFT JOIN pdv_orders o ON s.id = o.sellerId AND o.status != 'CANCELADO'${dateFilter}
         WHERE s.isActive = 1
         GROUP BY s.id, s.name, s.username, s.role
         ORDER BY faturamento DESC`,
        params
      );
      await db.end();
      return rows as any[];
    }),
});
