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
  // ===================== CONFIGURAÇÕES GERAIS =====================
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

  // ===================== METAS =====================
  // Get all goals
  getGoals: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    const [rows] = await db.execute("SELECT * FROM pdv_goals ORDER BY id");
    await db.end();
    return (rows as any[]).map(r => ({
      ...r,
      value: parseFloat(r.value) || 0,
    }));
  }),

  // Update goals
  updateGoals: publicProcedure
    .input(z.array(z.object({
      key: z.string(),
      value: z.number().min(0),
    })))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const goal of input) {
        await db.execute(
          "UPDATE pdv_goals SET value = ? WHERE `key` = ?",
          [goal.value.toFixed(2), goal.key]
        );
      }
      await db.end();
      return { success: true };
    }),

  // ===================== SOFIA CONFIG =====================
  // Get Sofia config
  getSofiaConfig: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) return { comissaoLoja: 10 };
    const [rows] = await db.execute("SELECT * FROM pdv_sofia_config LIMIT 1");
    await db.end();
    const config = (rows as any[])[0];
    return {
      comissaoLoja: config ? parseFloat(config.comissaoLoja) : 10,
    };
  }),

  // Update Sofia config
  updateSofiaConfig: publicProcedure
    .input(z.object({
      comissaoLoja: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(
        "UPDATE pdv_sofia_config SET comissaoLoja = ? WHERE id = 1",
        [input.comissaoLoja]
      );
      await db.end();
      return { success: true };
    }),

  // ===================== RESUMO COMPLETO PARA TELA DE CONFIGURAÇÕES =====================
  // Retorna tudo de uma vez para a tela de configurações
  getAllSettings: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [configRows] = await db.execute("SELECT * FROM pdv_config ORDER BY `key`");
    const [goalRows] = await db.execute("SELECT * FROM pdv_goals ORDER BY id");
    const [sofiaRows] = await db.execute("SELECT * FROM pdv_sofia_config LIMIT 1");
    await db.end();

    const configs: Record<string, string> = {};
    (configRows as any[]).forEach(r => { configs[r.key] = r.value || ""; });

    const goals: Record<string, number> = {};
    (goalRows as any[]).forEach(r => { goals[r.key] = parseFloat(r.value) || 0; });

    const sofiaConfig = (sofiaRows as any[])[0];

    return {
      configs,
      goals,
      sofia: {
        comissaoLoja: sofiaConfig ? parseFloat(sofiaConfig.comissaoLoja) : 10,
      },
    };
  }),
});
