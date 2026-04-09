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

function generatePedidoId(): string {
  const now = new Date();
  const ts = now.getTime().toString().slice(-8);
  return `PED-${ts}`;
}

const OrderItemSchema = z.object({
  productId: z.number().optional(),
  linha: z.string().optional(),
  modelo: z.string().optional(),
  time: z.string(),
  descricao: z.string().optional(),
  tamanho: z.string(),
  quantidade: z.number().min(1),
  precoUnitario: z.number().min(0),
  totalItem: z.number().min(0),
});

const OrderPaymentSchema = z.object({
  formaPagamento: z.enum(["PIX", "DINHEIRO", "DEBITO", "CREDITO", "DESCONTO_FOLHA"]),
  valor: z.number().min(0),
  taxa: z.number().default(0),
  valorLiquido: z.number().min(0),
  nomePix: z.string().optional(),
});

const OrderServiceSchema = z.object({
  tipo: z.string(),
  descricao: z.string().optional(),
  valor: z.number().min(0),
});

export const pdvOrdersRouter = router({
  create: publicProcedure
    .input(z.object({
      canal: z.enum(["BALCAO", "WHATSAPP"]),
      clienteNome: z.string().optional(),
      clienteTelefone: z.string().optional(),
      regime: z.enum(["ATACADO", "VAREJO"]),
      totalVarejo: z.number().default(0),
      totalAtacado: z.number().default(0),
      totalAplicado: z.number(),
      totalPago: z.number().default(0),
      totalPendente: z.number().default(0),
      justificativa: z.string().optional(),
      status: z.enum(["PAGO", "PENDENTE", "CANCELADO"]).default("PAGO"),
      items: z.array(OrderItemSchema),
      payments: z.array(OrderPaymentSchema),
      services: z.array(OrderServiceSchema).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      
      try {
        const pedidoId = generatePedidoId();
        
        // Insert order
        await db.execute(
          `INSERT INTO pdv_orders 
           (pedidoId, sellerId, sellerName, canal, clienteNome, clienteTelefone, regime, 
            totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente, justificativa, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pedidoId, seller.sellerId, seller.name, input.canal,
            input.clienteNome || null, input.clienteTelefone || null,
            input.regime, input.totalVarejo, input.totalAtacado, input.totalAplicado,
            input.totalPago, input.totalPendente, input.justificativa || null, input.status
          ]
        );
        
        // Insert items
        for (const item of input.items) {
          await db.execute(
            `INSERT INTO pdv_order_items 
             (pedidoId, productId, linha, modelo, time, descricao, tamanho, quantidade, precoUnitario, totalItem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pedidoId, item.productId || null, item.linha || null, item.modelo || null,
              item.time, item.descricao || null, item.tamanho, item.quantidade,
              item.precoUnitario, item.totalItem
            ]
          );
          
          // Update stock if productId is provided
          if (item.productId) {
            await db.execute(
              "UPDATE pdv_products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?",
              [item.quantidade, item.productId]
            );
          }
        }
        
        // Insert payments
        for (const payment of input.payments) {
          await db.execute(
            `INSERT INTO pdv_order_payments 
             (pedidoId, formaPagamento, valor, taxa, valorLiquido, nomePix)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              pedidoId, payment.formaPagamento, payment.valor, payment.taxa,
              payment.valorLiquido, payment.nomePix || null
            ]
          );
        }
        
        // Insert services
        for (const service of input.services) {
          await db.execute(
            `INSERT INTO pdv_order_services (pedidoId, tipo, descricao, valor)
             VALUES (?, ?, ?, ?)`,
            [pedidoId, service.tipo, service.descricao || null, service.valor]
          );
        }
        
        await db.end();
        return { success: true, pedidoId };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Orders] Error creating order:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar pedido" });
      }
    }),

  list: publicProcedure
    .input(z.object({
      sellerId: z.number().optional(),
      canal: z.enum(["BALCAO", "WHATSAPP"]).optional(),
      status: z.enum(["PAGO", "PENDENTE", "CANCELADO"]).optional(),
      regime: z.enum(["ATACADO", "VAREJO"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      try {
        let query = "SELECT * FROM pdv_orders WHERE 1=1";
        const params: any[] = [];
        
        // Non-admin sellers can only see their own orders
        if (seller.role !== "admin") {
          query += " AND sellerId = ?";
          params.push(seller.sellerId);
        } else if (input.sellerId) {
          query += " AND sellerId = ?";
          params.push(input.sellerId);
        }
        
        if (input.canal) { query += " AND canal = ?"; params.push(input.canal); }
        if (input.status) { query += " AND status = ?"; params.push(input.status); }
        if (input.regime) { query += " AND regime = ?"; params.push(input.regime); }
        if (input.startDate) { query += " AND DATE(createdAt) >= ?"; params.push(input.startDate); }
        if (input.endDate) { query += " AND DATE(createdAt) <= ?"; params.push(input.endDate); }
        if (input.search) {
          query += " AND (pedidoId LIKE ? OR clienteNome LIKE ? OR sellerName LIKE ?)";
          const s = `%${input.search}%`;
          params.push(s, s, s);
        }
        
        query += " ORDER BY createdAt DESC";
        
        // Count
        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countRows] = await db.execute(countQuery, params);
        const total = (countRows as any[])[0].total;
        
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${input.limit} OFFSET ${offset}`;
        
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

  getById: publicProcedure
    .input(z.object({ pedidoId: z.string() }))
    .query(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      try {
        const [orderRows] = await db.execute(
          "SELECT * FROM pdv_orders WHERE pedidoId = ?",
          [input.pedidoId]
        );
        const orders = orderRows as any[];
        if (orders.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        
        const order = orders[0];
        
        // Non-admin sellers can only see their own orders
        if (seller.role !== "admin" && order.sellerId !== seller.sellerId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        const [itemRows] = await db.execute(
          "SELECT * FROM pdv_order_items WHERE pedidoId = ?",
          [input.pedidoId]
        );
        const [paymentRows] = await db.execute(
          "SELECT * FROM pdv_order_payments WHERE pedidoId = ?",
          [input.pedidoId]
        );
        const [serviceRows] = await db.execute(
          "SELECT * FROM pdv_order_services WHERE pedidoId = ?",
          [input.pedidoId]
        );
        
        await db.end();
        
        return {
          ...order,
          items: itemRows as any[],
          payments: paymentRows as any[],
          services: serviceRows as any[],
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  updateStatus: publicProcedure
    .input(z.object({
      pedidoId: z.string(),
      status: z.enum(["PAGO", "PENDENTE", "CANCELADO"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // Buscar status atual do pedido
        const [orderRows] = await db.execute(
          "SELECT status FROM pdv_orders WHERE pedidoId = ?",
          [input.pedidoId]
        );
        const orders = orderRows as any[];
        if (orders.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
        const statusAtual = orders[0].status;

        // Buscar itens do pedido (apenas os que têm productId para controle de estoque)
        const [itemRows] = await db.execute(
          "SELECT productId, quantidade FROM pdv_order_items WHERE pedidoId = ? AND productId IS NOT NULL",
          [input.pedidoId]
        );
        const items = itemRows as any[];

        // Atualizar status
        await db.execute(
          "UPDATE pdv_orders SET status = ? WHERE pedidoId = ?",
          [input.status, input.pedidoId]
        );

        // Ajustar estoque conforme a transição de status
        if (statusAtual !== "CANCELADO" && input.status === "CANCELADO") {
          // Pedido sendo cancelado: DEVOLVER estoque
          for (const item of items) {
            await db.execute(
              "UPDATE pdv_products SET estoque = estoque + ? WHERE id = ?",
              [item.quantidade, item.productId]
            );
          }
          console.log(`[PDV Orders] Pedido ${input.pedidoId} cancelado — estoque devolvido para ${items.length} produto(s)`);
        } else if (statusAtual === "CANCELADO" && input.status !== "CANCELADO") {
          // Pedido sendo reativado (cancelado -> pago/pendente): DESCONTAR estoque novamente
          for (const item of items) {
            await db.execute(
              "UPDATE pdv_products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?",
              [item.quantidade, item.productId]
            );
          }
          console.log(`[PDV Orders] Pedido ${input.pedidoId} reativado (${statusAtual} -> ${input.status}) — estoque descontado para ${items.length} produto(s)`);
        }

        await db.end();
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Orders] Erro ao atualizar status:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar status do pedido" });
      }
    }),
});
