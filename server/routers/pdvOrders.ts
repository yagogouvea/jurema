import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import type { Request } from "express";
import { appendOrderToSheet, appendOrderItemsToSheet, appendSofiaItemsToSheet, updateProductStockInSheet, restoreProductStockInSheet, deleteOrderFromSheet, deleteOrderItemsFromSheet, deleteSofiaItemsFromSheet, appendSaleToCashFlowSheet } from './pdvSheetsWriter';
import { autoSyncProductToSite } from './pdvSiteSync';

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
  tipo: z.string().optional(),
  tamanho: z.string(),
  quantidade: z.number().min(1),
  precoUnitario: z.number().min(0),
  totalItem: z.number().min(0),
  isSofia: z.boolean().default(false),
  comissaoLojaSofia: z.number().optional(), // comissão personalizada da loja por item Sofia (R$)
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
  cep: z.string().optional(),
}).refine(
  (s) => !(s.tipo === 'CORREIO' && s.valor < 45),
  { message: 'O valor mínimo para Correio é R$ 45,00', path: ['valor'] }
).refine(
  (s) => !(s.tipo === 'CORREIO' && (!s.cep || s.cep.replace(/\D/g, '').length !== 8)),
  { message: 'CEP obrigatório para Correio', path: ['cep'] }
);

export const pdvOrdersRouter = router({
  create: publicProcedure
    .input(z.object({
      canal: z.enum(["BALCAO", "WHATSAPP"]),
      clienteNome: z.string().min(1, "Nome do cliente é obrigatório"),
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
        
        // Buscar comissão vigente no momento da venda (para registrar por item — sem retroatividade)
        const [cfgRows] = await db.execute(
          "SELECT value FROM pdv_config WHERE `key` = 'comissao_peca' LIMIT 1"
        );
        const comissaoUnitaria = parseFloat((cfgRows as any[])[0]?.value || '0.50');
        
        // Determinar isSofia do pedido: se QUALQUER item for Sofia, o pedido tem Sofia
        // Mas agora o controle é por item, então isSofia no pedido = true se TODOS os itens forem Sofia
        const hasSofiaItems = input.items.some(item => item.isSofia);
        const allSofia = input.items.every(item => item.isSofia);
        
        // Insert order — isSofia no pedido = true apenas se TODOS os itens forem Sofia
        await db.execute(
          `INSERT INTO pdv_orders 
           (pedidoId, sellerId, sellerName, canal, clienteNome, clienteTelefone, regime, 
            totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente, justificativa, isSofia, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pedidoId, seller.sellerId, seller.name, input.canal,
            input.clienteNome || null, input.clienteTelefone || null,
            input.regime, input.totalVarejo, input.totalAtacado, input.totalAplicado,
            input.totalPago, input.totalPendente, input.justificativa || null,
            allSofia ? 1 : 0, input.status
          ]
        );
        
        // Insert items (com isSofia por item e comissaoUnitaria vigente no momento da venda)
        for (const item of input.items) {
          // Itens Sofia não geram comissão de vendedor — registrar 0 para eles
          const comissaoItem = item.isSofia ? 0 : comissaoUnitaria;
          // Comissão da loja por item Sofia (personalizada no momento da venda)
          const comissaoLojaSofia = item.isSofia ? (item.comissaoLojaSofia ?? null) : null;
          // Buscar pontuação do produto no momento da venda (snapshot)
          let ptAtacado = 0;
          let ptVarejo = 0;
          if (item.productId) {
            const [ptRows] = await db.execute(
              "SELECT ptAtacado, ptVarejo FROM pdv_products WHERE id = ? LIMIT 1",
              [item.productId]
            );
            const ptRow = (ptRows as any[])[0];
            if (ptRow) {
              ptAtacado = parseFloat(ptRow.ptAtacado || '0');
              ptVarejo = parseFloat(ptRow.ptVarejo || '0');
            }
          }
          await db.execute(
            `INSERT INTO pdv_order_items 
             (pedidoId, productId, linha, modelo, time, descricao, tipo, tamanho, quantidade, precoUnitario, totalItem, isSofia, comissaoUnitaria, comissaoLojaSofia, ptAtacado, ptVarejo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pedidoId, item.productId || null, item.linha || null, item.modelo || null,
              item.time, item.descricao || null, item.tipo || null, item.tamanho, item.quantidade,
              item.precoUnitario, item.totalItem, item.isSofia ? 1 : 0, comissaoItem, comissaoLojaSofia,
              ptAtacado, ptVarejo
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
            `INSERT INTO pdv_order_services (pedidoId, tipo, descricao, valor, cep)
             VALUES (?, ?, ?, ?, ?)`,
            [pedidoId, service.tipo, service.descricao || null, service.valor, service.cep || null]
          );
        }
        
        // Se algum pagamento for DESCONTO_FOLHA, registrar automaticamente na tabela de desconto em folha
        const descontoFolhaPayments = input.payments.filter(p => p.formaPagamento === 'DESCONTO_FOLHA');
        for (const df of descontoFolhaPayments) {
          const descricao = `Pedido ${pedidoId} - Desconto em folha`;
          await db.execute(
            `INSERT INTO pdv_desconto_folha (sellerId, sellerName, pedidoId, descricao, valor)
             VALUES (?, ?, ?, ?, ?)`,
            [seller.sellerId, seller.name, pedidoId, descricao, df.valor]
          );
        }

        await db.end();

        // ── Auto-sync site: atualizar estoque no catálogo após venda (assíncrono) ──
        const codigosBaseVendidos = new Set<string>();
        for (const item of input.items) {
          if (item.productId) {
            // Buscar código base do produto vendido
            setImmediate(async () => {
              try {
                const dbSite = await getDb();
                if (!dbSite) return;
                const [pRows] = await dbSite.execute(
                  "SELECT codigo FROM pdv_products WHERE id = ? LIMIT 1",
                  [item.productId]
                );
                const prod = (pRows as any[])[0];
                if (prod?.codigo) {
                  const parts = prod.codigo.split("-");
                  const base = parts.length > 1 ? parts.slice(0, -1).join("-") : prod.codigo;
                  if (!codigosBaseVendidos.has(base)) {
                    codigosBaseVendidos.add(base);
                    await autoSyncProductToSite(base);
                  }
                }
                await dbSite.end();
              } catch (e) {
                console.error('[PDV Orders] Erro ao auto-sync site após venda:', e);
              }
            });
          }
        }
        
        // ── Integração Google Sheets (assíncrona, não bloqueia a resposta) ──
        // Buscar dados completos do pedido para gravar na planilha
        setImmediate(async () => {
          try {
            // Buscar códigos e preços dos produtos para a descrição completa
            const db3 = await getDb();
            const itemsWithCodigo = await Promise.all(input.items.map(async (item) => {
              if (!item.productId || !db3) return { ...item, codigo: null, precoAtacado: null, precoVarejo: null };
              const [pRows] = await db3.execute(
                'SELECT codigo, tipo, precoAtacado, precoVarejo FROM pdv_products WHERE id = ? LIMIT 1',
                [item.productId]
              );
              const prod = (pRows as any[])[0];
              return {
                ...item,
                codigo: prod?.codigo || null,
                tipo: item.tipo || prod?.tipo || null,
                precoAtacado: prod ? parseFloat(prod.precoAtacado) : null,
                precoVarejo: prod ? parseFloat(prod.precoVarejo) : null,
              };
            }));
            if (db3) await db3.end();

            // Separar itens normais e Sofia
            const normalItems = itemsWithCodigo.filter(item => !item.isSofia);
            const sofiaItems = itemsWithCodigo.filter(item => item.isSofia);

            // ── ABA PEDIDOS (geral) — somente se houver itens NÃO-Sofia ──
            if (normalItems.length > 0) {
              const qtdItensNormais = normalItems.reduce((sum, item) => sum + item.quantidade, 0);
              const comissaoTotal = normalItems.reduce((sum, item) => {
                return sum + (item.quantidade * comissaoUnitaria);
              }, 0);
              // Recalcular totais apenas dos itens não-Sofia (sem extras — extras são passados separadamente)
              const totalAplicadoNormal = normalItems.reduce((sum, item) => sum + item.totalItem, 0);
              const totalVarejoNormal = normalItems.reduce((sum, item) => {
                const pv = item.precoVarejo ?? item.precoUnitario;
                return sum + (pv * item.quantidade);
              }, 0);
              const totalAtacadoNormal = normalItems.reduce((sum, item) => {
                const pa = item.precoAtacado ?? item.precoUnitario;
                return sum + (pa * item.quantidade);
              }, 0);

              // Verificar se é atacado com menos de 6 peças (para coluna V da aba PEDIDOS)
              const totalPecasOrder = normalItems.reduce((sum, item) => sum + item.quantidade, 0);
              const isAtacadoMenos6Order = input.regime === 'ATACADO' && totalPecasOrder < 6;
              // Extrair CEP do serviço Correio (se houver)
              const correioService = input.services.find(s => s.tipo === 'CORREIO');
              await appendOrderToSheet({
                pedidoId,
                createdAt: new Date(),
                sellerName: seller.name,
                canal: input.canal,
                clienteNome: input.clienteNome,
                clienteTelefone: input.clienteTelefone,
                cepCorreio: correioService?.cep || null,
                totalVarejo: totalVarejoNormal,
                totalAtacado: totalAtacadoNormal,
                regime: input.regime,
                services: input.services,
                totalAplicado: totalAplicadoNormal,
                payments: input.payments,
                totalPendente: input.totalPendente,
                justificativa: input.justificativa,
                status: input.status,
                qtdItens: qtdItensNormais,
                comissaoTotal,
                justificativaAtacado: isAtacadoMenos6Order ? (input.justificativa || '') : null,
              });

              // ── ABA pedidos_itens (geral) — somente itens NÃO-Sofia ──
              await appendOrderItemsToSheet({
                pedidoId,
                regime: input.regime,
                services: input.services,
                comissaoUnitaria,
                items: normalItems,
              });
            }

            // ── ABA SOFIA_ITENS — somente itens Sofia ──
            if (sofiaItems.length > 0) {
              await appendSofiaItemsToSheet({
                pedidoId,
                createdAt: new Date(),
                sellerName: seller.name,
                canal: input.canal,
                clienteNome: input.clienteNome,
                clienteTelefone: input.clienteTelefone,
                regime: input.regime,
                services: input.services,
                payments: input.payments,
                totalPendente: input.totalPendente,
                justificativa: input.justificativa,
                status: input.status,
                items: sofiaItems,
              });
            }

            // Deduzir estoque na aba PRODUTOS para TODOS os itens (Sofia ou não)
            for (const item of itemsWithCodigo) {
              if (item.codigo) {
                await updateProductStockInSheet(item.codigo, item.quantidade);
              }
            }

            // ── Gravar na aba VENDAS_CAIXA (apenas pedidos não-Sofia) ──
            if (normalItems.length > 0) {
              const qtdItensNormaisVendas = normalItems.reduce((sum, item) => sum + item.quantidade, 0);
              const totalComTaxaFinal = input.payments.reduce((s: number, p: any) => s + (parseFloat(p.valor) || 0), 0);
              // Verificar se é atacado com menos de 6 peças (para coluna Justificativa <6)
              const totalPecasNormais = normalItems.reduce((sum, item) => sum + item.quantidade, 0);
              const isAtacadoMenos6 = input.regime === 'ATACADO' && totalPecasNormais < 6;
              await appendSaleToCashFlowSheet({
                id: parseInt(pedidoId.replace(/\D/g, '')) || 0,
                createdAt: new Date(),
                sellerName: seller.name,
                canal: input.canal,
                clienteNome: input.clienteNome,
                regime: input.regime,
                totalComTaxa: totalComTaxaFinal,
                formaPagamento: input.payments.map((p: any) => p.formaPagamento || p.forma || '').join(', '),
                status: input.status,
                qtdItens: qtdItensNormaisVendas,
                justificativaAtacado: isAtacadoMenos6 ? (input.justificativa || '') : undefined,
              });
            }
          } catch (sheetErr) {
            console.error('[PDV Orders] Sheet sync error (non-blocking):', sheetErr);
          }
        });
        
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
        // Incluir pedidos mistos (que têm itens Sofia E não-Sofia) no histórico geral
        // Excluir apenas pedidos 100% Sofia (isSofia = 1 = todos os itens são Sofia)
        let query = "SELECT * FROM pdv_orders WHERE isSofia = 0";
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

        // Buscar itens do pedido com código para atualizar planilha
        const [itemRows] = await db.execute(
          `SELECT oi.productId, oi.quantidade, p.codigo
           FROM pdv_order_items oi
           LEFT JOIN pdv_products p ON p.id = oi.productId
           WHERE oi.pedidoId = ? AND oi.productId IS NOT NULL`,
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
          // Pedido sendo cancelado: DEVOLVER estoque no banco
          for (const item of items) {
            await db.execute(
              "UPDATE pdv_products SET estoque = estoque + ? WHERE id = ?",
              [item.quantidade, item.productId]
            );
          }
          await db.end();
          console.log(`[PDV Orders] Pedido ${input.pedidoId} cancelado — estoque devolvido para ${items.length} produto(s)`);
          // Devolver estoque e deletar linhas da planilha (assíncrono, não bloqueia resposta)
          setImmediate(async () => {
            // 1. Devolver estoque na aba PRODUTOS
            for (const item of items) {
              if (item.codigo) {
                await restoreProductStockInSheet(item.codigo, item.quantidade);
              }
            }
            // 2. Deletar linha do pedido da aba PEDIDOS (sem deixar linha em branco)
            await deleteOrderFromSheet(input.pedidoId);
            // 3. Deletar itens da aba pedidos_itens
            await deleteOrderItemsFromSheet(input.pedidoId);
            // 4. Deletar itens Sofia da aba SOFIA_ITENS (se houver)
            await deleteSofiaItemsFromSheet(input.pedidoId);
          });
        } else if (statusAtual === "CANCELADO" && input.status !== "CANCELADO") {
          // Pedido sendo reativado (cancelado -> pago/pendente): DESCONTAR estoque novamente
          for (const item of items) {
            await db.execute(
              "UPDATE pdv_products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?",
              [item.quantidade, item.productId]
            );
          }
          await db.end();
          console.log(`[PDV Orders] Pedido ${input.pedidoId} reativado (${statusAtual} -> ${input.status}) — estoque descontado para ${items.length} produto(s)`);
          // Descontar estoque também na planilha (assíncrono)
          setImmediate(async () => {
            for (const item of items) {
              if (item.codigo) {
                await updateProductStockInSheet(item.codigo, item.quantidade);
              }
            }
          });
        } else {
          await db.end();
        }

        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Orders] Erro ao atualizar status:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar status do pedido" });
      }
    }),
});
