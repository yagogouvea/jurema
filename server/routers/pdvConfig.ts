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

export const pdvConfigRouter = router({
  // Get all configs (admin only)
  getAll: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    const [rows] = await db.execute("SELECT * FROM pdv_config ORDER BY `key`");
    await db.end();
    return rows as any[];
  }),

  // Get a single config value (public for sellers to read WhatsApp number)
  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) return null;
      const [rows] = await db.execute(
        "SELECT * FROM pdv_config WHERE `key` = ?",
        [input.key]
      );
      await db.end();
      const configs = rows as any[];
      return configs[0] || null;
    }),

  // Update a config value (admin only)
  set: publicProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(
        "INSERT INTO pdv_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?",
        [input.key, input.value, input.value]
      );
      await db.end();
      return { success: true };
    }),

  // Update multiple configs at once (admin only)
  setMany: publicProcedure
    .input(z.array(z.object({
      key: z.string(),
      value: z.string(),
    })))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const item of input) {
        await db.execute(
          "INSERT INTO pdv_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?",
          [item.key, item.value, item.value]
        );
      }
      await db.end();
      return { success: true };
    }),
});
