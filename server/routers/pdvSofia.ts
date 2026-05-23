import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { verifyPdvToken } from "./pdvAuth";
import type { Request } from "express";
import { createPdvMysqlConnection, orderDayDateExpr, orderDayYmdExpr } from "../pdvMysql";
import { detectSofiaImageMime, invalidSofiaPhotoMessage } from "../pdvSofiaPhotoValidate";

async function getDb() {
  return createPdvMysqlConnection();
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

export const pdvSofiaRouter = router({
  // Dashboard Sofia: vendas de itens Sofia com comissão personalizada por item
  dashboard: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let dateFilter = "";
        const params: any[] = [];
        if (input.startDate) { dateFilter += ` AND ${orderDayDateExpr("o")} >= ?`; params.push(input.startDate); }
        if (input.endDate) { dateFilter += ` AND ${orderDayDateExpr("o")} <= ?`; params.push(input.endDate); }

        // Resumo geral de itens Sofia — comissão personalizada por item
        // comissaoLojaSofia é o valor por peça definido no momento da venda
        // comissão total do item = comissaoLojaSofia * quantidade
        const [summaryRows] = await db.execute(
          `SELECT 
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            COALESCE(SUM(oi.quantidade), 0) as totalPecas,
            COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissaoTotal
          FROM pdv_order_items oi
          JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
          WHERE oi.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}`,
          params
        );

        // Por vendedor — com comissão personalizada
        const [sellerRows] = await db.execute(
          `SELECT 
            o.sellerId,
            o.sellerName,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            COALESCE(SUM(oi.quantidade), 0) as pecas,
            COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissao
          FROM pdv_order_items oi
          JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
          WHERE oi.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}
          GROUP BY o.sellerId, o.sellerName
          ORDER BY faturamento DESC`,
          params
        );

        // Por dia
        const [dailyRows] = await db.execute(
          `SELECT 
            ${orderDayYmdExpr("o")} as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            COALESCE(SUM(oi.quantidade), 0) as pecas,
            COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissao
          FROM pdv_order_items oi
          JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
          WHERE oi.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}
          GROUP BY ${orderDayYmdExpr("o")}
          ORDER BY dia DESC`,
          params
        );

        // Comissão padrão da loja (para referência, mas agora cada item tem seu próprio valor)
        const [configRows] = await db.execute("SELECT comissaoLoja FROM pdv_sofia_config LIMIT 1");
        const comissaoLojaPadrao = (configRows as any[])[0]?.comissaoLoja ? parseFloat((configRows as any[])[0].comissaoLoja) : 10;

        const summary = (summaryRows as any[])[0];
        const totalPecas = parseInt(summary.totalPecas) || 0;
        const faturamento = parseFloat(summary.faturamento) || 0;
        const comissaoTotal = parseFloat(summary.comissaoTotal) || 0;
        const reembolsoTotal = faturamento - comissaoTotal;

        await db.end();

        return {
          summary: {
            totalPedidos: parseInt(summary.totalPedidos) || 0,
            totalPecas,
            faturamento,
            comissaoLoja: comissaoLojaPadrao, // valor padrão de referência
            comissaoTotal,
            reembolsoTotal: Math.max(0, reembolsoTotal),
          },
          porVendedor: (sellerRows as any[]).map(r => {
            const pecas = parseInt(r.pecas) || 0;
            const fat = parseFloat(r.faturamento) || 0;
            const comissao = parseFloat(r.comissao) || 0;
            return {
              ...r,
              pecas,
              faturamento: fat,
              comissao,
              reembolso: Math.max(0, fat - comissao),
            };
          }),
          porDia: (dailyRows as any[]).map(r => ({
            ...r,
            faturamento: parseFloat(r.faturamento) || 0,
            pecas: parseInt(r.pecas) || 0,
            comissao: parseFloat(r.comissao) || 0,
            reembolso: Math.max(0, parseFloat(r.faturamento) - parseFloat(r.comissao)),
          })),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Sofia] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Listar pedidos que contêm itens Sofia
  pedidos: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sellerId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // Pedidos que contêm pelo menos um item Sofia
        let query = `SELECT DISTINCT o.* FROM pdv_orders o
          JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 1
          WHERE 1=1`;
        const params: any[] = [];

        if (input.sellerId) { query += " AND o.sellerId = ?"; params.push(input.sellerId); }
        if (input.startDate) { query += ` AND ${orderDayDateExpr("o")} >= ?`; params.push(input.startDate); }
        if (input.endDate) { query += ` AND ${orderDayDateExpr("o")} <= ?`; params.push(input.endDate); }

        const countQuery = query.replace("SELECT DISTINCT o.*", "SELECT COUNT(DISTINCT o.id) as total");
        const [countRows] = await db.execute(countQuery, params);
        const total = (countRows as any[])[0].total;

        query += " ORDER BY o.createdAt DESC";
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${Math.floor(input.limit)} OFFSET ${Math.floor(offset)}`;

        const [rows] = await db.execute(query, params);
        await db.end();

        return {
          orders: rows as any[],
          total,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Configuração: obter comissão padrão da loja (valor de referência para novos itens)
  getConfig: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [rows] = await db.execute("SELECT * FROM pdv_sofia_config LIMIT 1");
    await db.end();
    const config = (rows as any[])[0];
    return {
      comissaoLoja: config ? parseFloat(config.comissaoLoja) : 10,
    };
  }),

   // Configuração: atualizar comissão padrão da loja (afeta apenas novos pedidos)
  updateConfig: publicProcedure
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

  /**
   * Upload de foto Sofia (base64 → MySQL LONGBLOB).
   *
   * Antes esse endpoint dependia do "forge storage proxy" externo (envs
   * BUILT_IN_FORGE_API_*) que não existem no Railway, então NENHUMA foto era
   * persistida. Agora gravamos o blob direto no MySQL em `pdv_order_photos`
   * e expomos via `GET /api/pdv/sofia/foto/:pedidoId`.
   *
   * - aceita `image/jpeg|png|webp`, máx. 5 MiB
   * - usa INSERT … ON DUPLICATE KEY UPDATE para suportar troca de foto
   * - grava em `pdv_orders.fotoUrl` o caminho relativo + cache-buster `?v=ts`
   */
  uploadFoto: publicProcedure
    .input(z.object({
      pedidoId: z.string(),
      base64: z.string(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Vendedores registram pedidos Sofia no checkout — precisam poder anexar foto.
      await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        const base64Data = input.base64.replace(/^data:[^;]+;base64,/, "").trim();
        const buffer = Buffer.from(base64Data, "base64");
        const MAX = 5 * 1024 * 1024;
        if (buffer.length === 0 || buffer.length > MAX) {
          await db.end();
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Imagem inválida (tamanho ${buffer.length} bytes; máx ${MAX}).`,
          });
        }
        const detectedMime = detectSofiaImageMime(buffer);
        if (!detectedMime) {
          await db.end();
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: invalidSofiaPhotoMessage(buffer.length),
          });
        }
        const mimeType = detectedMime;
        // Garante que o pedido existe para evitar fotos órfãs
        const [orderRows] = await db.execute(
          "SELECT pedidoId FROM pdv_orders WHERE pedidoId = ? LIMIT 1",
          [input.pedidoId]
        );
        if ((orderRows as any[]).length === 0) {
          await db.end();
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
        }
        await db.execute(
          `INSERT INTO pdv_order_photos (pedidoId, mimeType, data, sizeBytes)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             mimeType = VALUES(mimeType),
             data = VALUES(data),
             sizeBytes = VALUES(sizeBytes),
             updatedAt = CURRENT_TIMESTAMP`,
          [input.pedidoId, mimeType, buffer, buffer.length]
        );
        // Cache-buster para que o browser/PDF sempre puxem a versão atual.
        const url = `/api/pdv/sofia/foto/${encodeURIComponent(input.pedidoId)}?v=${Date.now()}`;
        await db.execute(
          "UPDATE pdv_orders SET fotoUrl = ? WHERE pedidoId = ?",
          [url, input.pedidoId]
        );
        await db.end();
        return { success: true, url, sizeBytes: buffer.length };
      } catch (err) {
        try { await db.end(); } catch { /* já fechado */ }
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Sofia] Erro ao salvar foto no MySQL:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao salvar foto" });
      }
    }),

  // Remove a foto do pedido (apaga o blob e zera fotoUrl).
  removeFoto: publicProcedure
    .input(z.object({ pedidoId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        await db.execute("DELETE FROM pdv_order_photos WHERE pedidoId = ?", [input.pedidoId]);
        await db.execute(
          "UPDATE pdv_orders SET fotoUrl = NULL WHERE pedidoId = ?",
          [input.pedidoId]
        );
        await db.end();
        return { success: true };
      } catch (err) {
        try { await db.end(); } catch { /* já fechado */ }
        console.error("[PDV Sofia] Erro ao remover foto:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao remover foto" });
      }
    }),

  // Alternar status de pagamento (PAGO ↔ PENDENTE) com reflexo na planilha Sofia
  updateStatus: publicProcedure
    .input(z.object({
      pedidoId: z.string(),
      status: z.enum(["PAGO", "PENDENTE"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        await db.execute(
          "UPDATE pdv_orders SET status = ? WHERE pedidoId = ?",
          [input.status, input.pedidoId]
        );
        await db.end();
        // Atualizar planilha Sofia de forma assíncrona
        setImmediate(async () => {
          const { updateSofiaStatusInSheet } = await import("./pdvSheetsWriter");
          await updateSofiaStatusInSheet(input.pedidoId, input.status);
        });
        return { success: true, status: input.status };
      } catch (err) {
        await db.end();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar status" });
      }
    }),
});
