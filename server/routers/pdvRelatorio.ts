import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import type { Connection } from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import type { Request } from "express";
import { createPdvMysqlConnection, orderDayDateExpr } from "../pdvMysql";

async function getDb() {
  return createPdvMysqlConnection();
}

async function requirePdvAdmin(ctx: any) {
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

type ServicoTipo = "CORREIO" | "CAIXINHA" | "CARRETO";

interface SectionsInput {
  comissoes: boolean;
  sofia: boolean;
  descontos: boolean;
  servicos?: { correios: boolean; caixinhas: boolean; carretos: boolean };
}

// Gera dados consolidados para o relatório — agora usa isSofia por ITEM
async function fetchRelatorioData(db: Connection, startDate: string, endDate: string, sections: SectionsInput) {  // taxaComissao é sempre buscada das configurações
  // Buscar taxa de comissão das configurações do sistema
  const [cfgRows] = await db.execute("SELECT value FROM pdv_config WHERE `key` = 'comissao_peca' LIMIT 1");
  const taxaComissao = parseFloat((cfgRows as any[])[0]?.value || '0.50');
  const result: any = { periodo: { startDate, endDate }, geradoEm: new Date().toISOString() };

  // ===================== COMISSÕES =====================
  if (sections.comissoes) {
    const [sellerRows] = await db.execute(
      `SELECT 
        s.name as sellerName,
        COUNT(DISTINCT o.id) as totalPedidos,
        COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
        COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
        COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.regime = 'ATACADO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
        COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.regime = 'VAREJO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo
      FROM pdv_sellers s
      LEFT JOIN pdv_orders o ON o.sellerId = s.id AND ${orderDayDateExpr("o")} >= ? AND ${orderDayDateExpr("o")} <= ?
      LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND o.status != 'CANCELADO'
      WHERE s.isActive = 1
      GROUP BY s.id, s.name
      ORDER BY totalPecas DESC`,
      [startDate, endDate]
    );

    const sellers = (sellerRows as any[]).map(s => {
      const totalPecas = parseInt(s.totalPecas) || 0;
      return {
        sellerName: s.sellerName,
        totalPedidos: parseInt(s.totalPedidos) || 0,
        totalPecas,
        faturamento: parseFloat(s.faturamento) || 0,
        faturamentoAtacado: parseFloat(s.faturamentoAtacado) || 0,
        faturamentoVarejo: parseFloat(s.faturamentoVarejo) || 0,
        comissao: totalPecas * taxaComissao,
      };
    });

    result.comissoes = {
      taxaComissao,
      sellers,
      totalPecas: sellers.reduce((a, s) => a + s.totalPecas, 0),
      totalFaturamento: sellers.reduce((a, s) => a + s.faturamento, 0),
      totalComissoes: sellers.reduce((a, s) => a + s.comissao, 0),
      totalPedidos: sellers.reduce((a, s) => a + s.totalPedidos, 0),
    };
  }

  // ===================== SOFIA =====================
  if (sections.sofia) {
    const [configRows] = await db.execute("SELECT comissaoLoja FROM pdv_sofia_config LIMIT 1");
    const comissaoLojaPadrao = (configRows as any[])[0]?.comissaoLoja ? parseFloat((configRows as any[])[0].comissaoLoja) : 10;

    // Comissão personalizada por item (comissaoLojaSofia * quantidade)
    const [summaryRows] = await db.execute(
      `SELECT 
        COUNT(DISTINCT o.id) as totalPedidos,
        COALESCE(SUM(oi.totalItem), 0) as faturamento,
        COALESCE(SUM(oi.quantidade), 0) as totalPecas,
        COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissaoTotal
      FROM pdv_order_items oi
      JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
      WHERE oi.isSofia = 1 AND o.status != 'CANCELADO' AND ${orderDayDateExpr("o")} >= ? AND ${orderDayDateExpr("o")} <= ?`,
      [startDate, endDate]
    );

    const [sellerRows] = await db.execute(
      `SELECT 
        o.sellerName,
        COUNT(DISTINCT o.id) as pedidos,
        COALESCE(SUM(oi.totalItem), 0) as faturamento,
        COALESCE(SUM(oi.quantidade), 0) as pecas,
        COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissao
      FROM pdv_order_items oi
      JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
      WHERE oi.isSofia = 1 AND o.status != 'CANCELADO' AND ${orderDayDateExpr("o")} >= ? AND ${orderDayDateExpr("o")} <= ?
      GROUP BY o.sellerId, o.sellerName
      ORDER BY faturamento DESC`,
      [startDate, endDate]
    );

    // Lista detalhada de pedidos Sofia — fotoUrl ou blob em pdv_order_photos.
    const [pedidoRows] = await db.execute(
      `SELECT
         o.pedidoId,
         o.sellerName,
         o.status,
         o.clienteNome,
         CASE
           WHEN p.pedidoId IS NOT NULL AND COALESCE(p.sizeBytes, 0) >= 256
             AND o.fotoUrl IS NOT NULL AND TRIM(o.fotoUrl) <> '' THEN o.fotoUrl
           WHEN p.pedidoId IS NOT NULL AND COALESCE(p.sizeBytes, 0) >= 256
             THEN CONCAT('/api/pdv/sofia/foto/', o.pedidoId)
           ELSE NULL
         END AS fotoUrl,
         COALESCE(p.sizeBytes, 0) AS photoSizeBytes,
         ${orderDayDateExpr("o")} AS dia,
         COALESCE(SUM(oi.quantidade), 0) AS pecasSofia,
         COALESCE(SUM(oi.totalItem), 0) AS valorSofia
       FROM pdv_orders o
       JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 1
       LEFT JOIN pdv_order_photos p ON p.pedidoId = o.pedidoId
       WHERE o.status != 'CANCELADO'
         AND ${orderDayDateExpr("o")} >= ? AND ${orderDayDateExpr("o")} <= ?
       GROUP BY o.id, o.pedidoId, o.sellerName, o.status, o.clienteNome, o.fotoUrl, p.pedidoId, p.sizeBytes
       ORDER BY o.createdAt ASC`,
      [startDate, endDate]
    );

    const summary = (summaryRows as any[])[0];
    const totalPecas = parseInt(summary.totalPecas) || 0;
    const faturamento = parseFloat(summary.faturamento) || 0;
    const comissaoTotal = parseFloat(summary.comissaoTotal) || 0;

    const pedidos = (pedidoRows as any[]).map((r) => ({
      pedidoId: String(r.pedidoId),
      sellerName: String(r.sellerName ?? ""),
      status: String(r.status ?? ""),
      clienteNome: r.clienteNome ? String(r.clienteNome) : null,
      // `dia` vem como Date (driver) ou string YMD (alguns hosts) — normaliza pra YYYY-MM-DD
      dia: r.dia instanceof Date
        ? r.dia.toISOString().slice(0, 10)
        : String(r.dia ?? "").slice(0, 10),
      pecasSofia: parseInt(r.pecasSofia) || 0,
      valorSofia: parseFloat(r.valorSofia) || 0,
      fotoUrl: r.fotoUrl ? String(r.fotoUrl) : null,
      photoSizeBytes: parseInt(r.photoSizeBytes) || 0,
      fotoInvalida:
        (parseInt(r.photoSizeBytes) || 0) > 0 && (parseInt(r.photoSizeBytes) || 0) < 256,
    }));
    const totalComFoto = pedidos.filter((p) => !!p.fotoUrl).length;
    const totalFotoInvalida = pedidos.filter((p) => p.fotoInvalida).length;

    result.sofia = {
      comissaoLoja: comissaoLojaPadrao,
      totalPedidos: parseInt(summary.totalPedidos) || 0,
      totalPecas,
      faturamento,
      comissaoTotal,
      reembolsoTotal: Math.max(0, faturamento - comissaoTotal),
      porVendedor: (sellerRows as any[]).map(r => {
        const pecas = parseInt(r.pecas) || 0;
        const fat = parseFloat(r.faturamento) || 0;
        const comissao = parseFloat(r.comissao) || 0;
        return {
          sellerName: r.sellerName,
          pedidos: parseInt(r.pedidos) || 0,
          pecas,
          faturamento: fat,
          comissao,
          reembolso: Math.max(0, fat - comissao),
        };
      }),
      pedidos,
      totalComFoto,
      totalSemFoto: pedidos.length - totalComFoto - totalFotoInvalida,
      totalFotoInvalida,
    };
  }

  // ===================== DESCONTOS EM FOLHA =====================
  if (sections.descontos) {
    const [rows] = await db.execute(
      `SELECT 
        sellerId,
        sellerName,
        COUNT(*) as totalItens,
        COALESCE(SUM(CASE WHEN quitado = 0 THEN valor ELSE 0 END), 0) as pendente,
        COALESCE(SUM(CASE WHEN quitado = 1 THEN valor ELSE 0 END), 0) as quitado,
        COALESCE(SUM(valor), 0) as totalGeral
      FROM pdv_desconto_folha
      WHERE DATE(createdAt) >= ? AND DATE(createdAt) <= ?
      GROUP BY sellerId, sellerName
      ORDER BY pendente DESC`,
      [startDate, endDate]
    );

    const [totalRows] = await db.execute(
      `SELECT 
        COALESCE(SUM(CASE WHEN quitado = 0 THEN valor ELSE 0 END), 0) as totalPendente,
        COALESCE(SUM(CASE WHEN quitado = 1 THEN valor ELSE 0 END), 0) as totalQuitado
      FROM pdv_desconto_folha
      WHERE DATE(createdAt) >= ? AND DATE(createdAt) <= ?`,
      [startDate, endDate]
    );

    // Histórico de quitações no período
    const [quitacoes] = await db.execute(
      `SELECT sellerName, descricao, valor, quitadoEm, quitadoPor
       FROM pdv_desconto_folha
       WHERE quitado = 1 AND DATE(quitadoEm) >= ? AND DATE(quitadoEm) <= ?
       ORDER BY quitadoEm DESC`,
      [startDate, endDate]
    );

    const totals = (totalRows as any[])[0];

    result.descontos = {
      porVendedor: (rows as any[]).map(r => ({
        sellerName: r.sellerName,
        totalItens: parseInt(r.totalItens) || 0,
        pendente: parseFloat(r.pendente) || 0,
        quitado: parseFloat(r.quitado) || 0,
        totalGeral: parseFloat(r.totalGeral) || 0,
      })),
      totalPendente: parseFloat(totals.totalPendente) || 0,
      totalQuitado: parseFloat(totals.totalQuitado) || 0,
      historicoQuitacoes: (quitacoes as any[]).map(q => ({
        sellerName: q.sellerName,
        descricao: q.descricao,
        valor: parseFloat(q.valor) || 0,
        quitadoEm: q.quitadoEm,
        quitadoPor: q.quitadoPor,
      })),
    };
  }

  // ===================== SERVIÇOS (CORREIOS / CAIXINHAS / CARRETOS) =====================
  // Cada tipo gera seu próprio bloco e pode ser emitido isoladamente.
  const servicosFlags = sections.servicos;
  const tiposSelecionados: ServicoTipo[] = [];
  if (servicosFlags?.correios) tiposSelecionados.push("CORREIO");
  if (servicosFlags?.caixinhas) tiposSelecionados.push("CAIXINHA");
  if (servicosFlags?.carretos) tiposSelecionados.push("CARRETO");

  if (tiposSelecionados.length > 0) {
    // Busca todos os tipos selecionados em UMA query e agrupa em código.
    // Pedidos CANCELADOS são excluídos do relatório (mantém coerência com Faturamento/Comissões).
    const placeholders = tiposSelecionados.map(() => "?").join(",");
    const [serviceRows] = await db.execute(
      `SELECT
         s.id            AS servicoId,
         s.tipo          AS tipo,
         s.descricao     AS descricao,
         s.valor         AS valor,
         s.cep           AS cep,
         s.createdAt     AS servicoCreatedAt,
         o.pedidoId      AS pedidoId,
         o.sellerName    AS sellerName,
         o.clienteNome   AS clienteNome,
         o.clienteTelefone AS clienteTelefone,
         o.canal         AS canal,
         o.status        AS status,
         o.regime        AS regime,
         o.createdAt     AS orderCreatedAt,
         ${orderDayDateExpr("o")} AS dia,
         (SELECT COUNT(*) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId) AS qtdItensPedido
       FROM pdv_order_services s
       JOIN pdv_orders o ON o.pedidoId = s.pedidoId
       WHERE o.status != 'CANCELADO'
         AND ${orderDayDateExpr("o")} >= ?
         AND ${orderDayDateExpr("o")} <= ?
         AND s.tipo IN (${placeholders})
       ORDER BY o.createdAt ASC, s.id ASC`,
      [startDate, endDate, ...tiposSelecionados]
    );

    const buckets: Record<ServicoTipo, any[]> = {
      CORREIO: [],
      CAIXINHA: [],
      CARRETO: [],
    };

    for (const r of serviceRows as any[]) {
      const tipo = String(r.tipo) as ServicoTipo;
      if (!buckets[tipo]) continue;
      buckets[tipo].push({
        servicoId: Number(r.servicoId),
        pedidoId: String(r.pedidoId),
        tipo,
        descricao: r.descricao ? String(r.descricao) : null,
        valor: parseFloat(r.valor) || 0,
        cep: r.cep ? String(r.cep) : null,
        sellerName: r.sellerName ? String(r.sellerName) : "—",
        clienteNome: r.clienteNome ? String(r.clienteNome) : null,
        clienteTelefone: r.clienteTelefone ? String(r.clienteTelefone) : null,
        canal: r.canal ? String(r.canal) : null,
        status: r.status ? String(r.status) : null,
        regime: r.regime ? String(r.regime) : null,
        orderCreatedAt: r.orderCreatedAt instanceof Date
          ? r.orderCreatedAt.toISOString()
          : (r.orderCreatedAt ? String(r.orderCreatedAt) : null),
        dia: r.dia instanceof Date
          ? r.dia.toISOString().slice(0, 10)
          : String(r.dia ?? "").slice(0, 10),
        somenteServico: (parseInt(r.qtdItensPedido) || 0) === 0,
      });
    }

    const summarize = (items: any[]) => {
      const totalValor = items.reduce((acc, it) => acc + (it.valor || 0), 0);
      const pedidosUnicos = new Set(items.map((it) => it.pedidoId)).size;
      const somenteServico = items.filter((it) => it.somenteServico).length;
      return {
        totalLancamentos: items.length,
        totalValor,
        totalPedidos: pedidosUnicos,
        totalSomenteServico: somenteServico,
      };
    };

    const servicos: any = {};
    if (servicosFlags?.correios) servicos.correios = { items: buckets.CORREIO, ...summarize(buckets.CORREIO) };
    if (servicosFlags?.caixinhas) servicos.caixinhas = { items: buckets.CAIXINHA, ...summarize(buckets.CAIXINHA) };
    if (servicosFlags?.carretos) servicos.carretos = { items: buckets.CARRETO, ...summarize(buckets.CARRETO) };
    result.servicos = servicos;
  }

  return result;
}

function rowNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Relatório por produto (SKU ou família time+modelo). Inclui Sofia com flag. */
async function fetchProductReport(
  db: Connection,
  input: {
    startDate: string;
    endDate: string;
    modo: "sku" | "familia";
    codigo?: string;
    time?: string;
    modelo?: string;
    linha?: string;
  }
) {
  const dayCmp = orderDayDateExpr("o");
  let productFilter = "";
  const productParams: any[] = [];
  let produtoMeta: any = null;
  let codigosEscopo: string[] = [];

  if (input.modo === "sku") {
    const codigo = String(input.codigo || "").trim();
    if (!codigo) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o código do produto" });
    const [prodRows] = await db.execute(
      `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo, estoque,
              precoAtacado, precoVarejo, custo, ptAtacado, ptVarejo, isActive
       FROM pdv_products WHERE codigo = ? LIMIT 1`,
      [codigo]
    );
    const p = (prodRows as any[])[0];
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: `Produto "${codigo}" não encontrado` });
    produtoMeta = {
      modo: "sku" as const,
      codigo: String(p.codigo),
      linha: p.linha ? String(p.linha) : null,
      modelo: p.modelo ? String(p.modelo) : null,
      time: p.time ? String(p.time) : null,
      descricao: p.descricao ? String(p.descricao) : null,
      tamanho: p.tamanho ? String(p.tamanho) : null,
      tipo: p.tipo ? String(p.tipo) : null,
      estoque: rowNum(p.estoque),
      precoAtacado: rowNum(p.precoAtacado),
      precoVarejo: rowNum(p.precoVarejo),
      custo: rowNum(p.custo),
      ptAtacado: rowNum(p.ptAtacado),
      ptVarejo: rowNum(p.ptVarejo),
      isActive: !!p.isActive,
    };
    productFilter = " AND oi.codigo = ?";
    productParams.push(codigo);
    codigosEscopo = [codigo];
  } else {
    const time = String(input.time || "").trim();
    const modelo = String(input.modelo || "").trim();
    if (!time || !modelo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe time e modelo da família" });
    }
    let q =
      `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo, estoque,
              precoAtacado, precoVarejo, custo, ptAtacado, ptVarejo, isActive
       FROM pdv_products
       WHERE UPPER(TRIM(time)) = UPPER(?) AND UPPER(TRIM(modelo)) = UPPER(?)`;
    const qp: any[] = [time, modelo];
    if (input.linha?.trim()) {
      q += " AND UPPER(TRIM(linha)) = UPPER(?)";
      qp.push(input.linha.trim());
    }
    q += " ORDER BY tamanho ASC, codigo ASC";
    const [famRows] = await db.execute(q, qp);
    const produtos = famRows as any[];
    if (!produtos.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum produto nessa família" });
    }
    codigosEscopo = produtos.map((p) => String(p.codigo));
    produtoMeta = {
      modo: "familia" as const,
      codigo: null,
      linha: input.linha?.trim() || (produtos[0].linha ? String(produtos[0].linha) : null),
      modelo,
      time,
      descricao: produtos[0].descricao ? String(produtos[0].descricao) : null,
      tamanho: null,
      tipo: produtos[0].tipo ? String(produtos[0].tipo) : null,
      estoque: produtos.reduce((s, p) => s + rowNum(p.estoque), 0),
      precoAtacado: rowNum(produtos[0].precoAtacado),
      precoVarejo: rowNum(produtos[0].precoVarejo),
      custo: rowNum(produtos[0].custo),
      ptAtacado: rowNum(produtos[0].ptAtacado),
      ptVarejo: rowNum(produtos[0].ptVarejo),
      isActive: produtos.some((p) => !!p.isActive),
      variantes: produtos.map((p) => ({
        codigo: String(p.codigo),
        tamanho: p.tamanho ? String(p.tamanho) : null,
        estoque: rowNum(p.estoque),
        isActive: !!p.isActive,
      })),
    };
    const placeholders = codigosEscopo.map(() => "?").join(",");
    productFilter = ` AND oi.codigo IN (${placeholders})`;
    productParams.push(...codigosEscopo);
  }

  const baseWhere = `o.status <> 'CANCELADO' AND ${dayCmp} >= ? AND ${dayCmp} <= ?${productFilter}`;
  const baseParams = [input.startDate, input.endDate, ...productParams];

  const [summaryRows] = await db.execute(
    `SELECT
       COUNT(DISTINCT o.pedidoId) AS pedidos,
       COALESCE(SUM(oi.quantidade), 0) AS pecas,
       COALESCE(SUM(oi.totalItem), 0) AS faturamento,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 1 THEN oi.quantidade ELSE 0 END), 0) AS pecasSofia,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 1 THEN oi.totalItem ELSE 0 END), 0) AS faturamentoSofia,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 0 THEN oi.quantidade ELSE 0 END), 0) AS pecasNormais,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 0 THEN oi.totalItem ELSE 0 END), 0) AS faturamentoNormal
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}`,
    baseParams
  );
  const sum = (summaryRows as any[])[0] || {};

  const [sellerRows] = await db.execute(
    `SELECT
       o.sellerName,
       COUNT(DISTINCT o.pedidoId) AS pedidos,
       COALESCE(SUM(oi.quantidade), 0) AS pecas,
       COALESCE(SUM(oi.totalItem), 0) AS faturamento,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 1 THEN oi.quantidade ELSE 0 END), 0) AS pecasSofia
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}
     GROUP BY o.sellerId, o.sellerName
     ORDER BY faturamento DESC`,
    baseParams
  );

  const [canalRows] = await db.execute(
    `SELECT
       o.canal,
       COUNT(DISTINCT o.pedidoId) AS pedidos,
       COALESCE(SUM(oi.quantidade), 0) AS pecas,
       COALESCE(SUM(oi.totalItem), 0) AS faturamento
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}
     GROUP BY o.canal
     ORDER BY faturamento DESC`,
    baseParams
  );

  const [regimeRows] = await db.execute(
    `SELECT
       o.regime,
       COUNT(DISTINCT o.pedidoId) AS pedidos,
       COALESCE(SUM(oi.quantidade), 0) AS pecas,
       COALESCE(SUM(oi.totalItem), 0) AS faturamento
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}
     GROUP BY o.regime
     ORDER BY faturamento DESC`,
    baseParams
  );

  const [dayRows] = await db.execute(
    `SELECT
       ${dayCmp} AS dia,
       COALESCE(SUM(oi.quantidade), 0) AS pecas,
       COALESCE(SUM(oi.totalItem), 0) AS faturamento,
       COALESCE(SUM(CASE WHEN COALESCE(oi.isSofia, 0) = 1 THEN oi.quantidade ELSE 0 END), 0) AS pecasSofia
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}
     GROUP BY ${dayCmp}
     ORDER BY dia ASC`,
    baseParams
  );

  const [saleRows] = await db.execute(
    `SELECT
       o.pedidoId,
       o.createdAt,
       ${dayCmp} AS dia,
       o.clienteNome,
       o.sellerName,
       o.canal,
       o.regime,
       o.status,
       oi.codigo,
       oi.tamanho,
       oi.quantidade,
       oi.precoUnitario,
       oi.totalItem,
       oi.descricao,
       oi.time,
       oi.modelo,
       COALESCE(oi.isSofia, 0) AS isSofia
     FROM pdv_order_items oi
     INNER JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
     WHERE ${baseWhere}
     ORDER BY o.createdAt ASC, oi.id ASC
     LIMIT 500`,
    baseParams
  );

  const pecas = rowNum(sum.pecas);
  const faturamento = rowNum(sum.faturamento);

  return {
    periodo: { startDate: input.startDate, endDate: input.endDate },
    geradoEm: new Date().toISOString(),
    produto: produtoMeta,
    codigosEscopo,
    resumo: {
      pedidos: rowNum(sum.pedidos),
      pecas,
      faturamento,
      ticketPeca: pecas > 0 ? faturamento / pecas : 0,
      pecasNormais: rowNum(sum.pecasNormais),
      faturamentoNormal: rowNum(sum.faturamentoNormal),
      pecasSofia: rowNum(sum.pecasSofia),
      faturamentoSofia: rowNum(sum.faturamentoSofia),
    },
    porVendedor: (sellerRows as any[]).map((r) => ({
      sellerName: String(r.sellerName || "—"),
      pedidos: rowNum(r.pedidos),
      pecas: rowNum(r.pecas),
      faturamento: rowNum(r.faturamento),
      pecasSofia: rowNum(r.pecasSofia),
    })),
    porCanal: (canalRows as any[]).map((r) => ({
      canal: String(r.canal || "—"),
      pedidos: rowNum(r.pedidos),
      pecas: rowNum(r.pecas),
      faturamento: rowNum(r.faturamento),
    })),
    porRegime: (regimeRows as any[]).map((r) => ({
      regime: String(r.regime || "—"),
      pedidos: rowNum(r.pedidos),
      pecas: rowNum(r.pecas),
      faturamento: rowNum(r.faturamento),
    })),
    porDia: (dayRows as any[]).map((r) => ({
      dia:
        r.dia instanceof Date
          ? r.dia.toISOString().slice(0, 10)
          : String(r.dia ?? "").slice(0, 10),
      pecas: rowNum(r.pecas),
      faturamento: rowNum(r.faturamento),
      pecasSofia: rowNum(r.pecasSofia),
    })),
    vendas: (saleRows as any[]).map((r) => ({
      pedidoId: String(r.pedidoId),
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
      dia:
        r.dia instanceof Date
          ? r.dia.toISOString().slice(0, 10)
          : String(r.dia ?? "").slice(0, 10),
      clienteNome: r.clienteNome ? String(r.clienteNome) : null,
      sellerName: String(r.sellerName || "—"),
      canal: String(r.canal || "—"),
      regime: String(r.regime || "—"),
      status: String(r.status || ""),
      codigo: r.codigo ? String(r.codigo) : null,
      tamanho: r.tamanho ? String(r.tamanho) : null,
      quantidade: rowNum(r.quantidade),
      precoUnitario: rowNum(r.precoUnitario),
      totalItem: rowNum(r.totalItem),
      descricao: r.descricao ? String(r.descricao) : null,
      time: r.time ? String(r.time) : null,
      modelo: r.modelo ? String(r.modelo) : null,
      isSofia: Number(r.isSofia) === 1,
    })),
    vendasTruncadas: (saleRows as any[]).length >= 500,
  };
}

export const pdvRelatorioRouter = router({
  // Buscar dados do relatório (para preview no frontend e geração de PDF)
  getData: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      sections: z.object({
        comissoes: z.boolean().default(true),
        sofia: z.boolean().default(true),
        descontos: z.boolean().default(true),
        servicos: z.object({
          correios: z.boolean().default(false),
          caixinhas: z.boolean().default(false),
          carretos: z.boolean().default(false),
        }).optional(),
      }),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const data = await fetchRelatorioData(db, input.startDate, input.endDate, input.sections);
        await db.end();
        return data;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Relatório] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar relatório" });
      }
    }),

  /** Autocomplete: SKU, nome (time/descrição/modelo) e famílias (time+modelo). */
  searchProducts: publicProcedure
    .input(z.object({ q: z.string().min(1).max(120) }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        const terms = input.q.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 6);
        if (!terms.length) {
          await db.end();
          return { skus: [], familias: [] };
        }

        let where = "WHERE isActive = 1";
        const params: any[] = [];
        for (const term of terms) {
          const s = `%${term}%`;
          where +=
            " AND (LOWER(codigo) LIKE ? OR LOWER(time) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(modelo) LIKE ? OR LOWER(linha) LIKE ?)";
          params.push(s, s, s, s, s);
        }

        const [skuRows] = await db.execute(
          `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo
           FROM pdv_products ${where}
           ORDER BY time ASC, modelo ASC, tamanho ASC
           LIMIT 40`,
          params
        );

        const [famRows] = await db.execute(
          `SELECT
             time, modelo, MAX(linha) AS linha, MAX(descricao) AS descricao,
             COUNT(*) AS variantes, SUM(estoque) AS estoqueTotal,
             MIN(precoAtacado) AS precoAtacado, MIN(precoVarejo) AS precoVarejo
           FROM pdv_products ${where}
           GROUP BY time, modelo
           HAVING COUNT(*) >= 1
           ORDER BY time ASC, modelo ASC
           LIMIT 25`,
          params
        );

        await db.end();
        return {
          skus: (skuRows as any[]).map((r) => ({
            tipo: "sku" as const,
            codigo: String(r.codigo),
            linha: r.linha ? String(r.linha) : null,
            modelo: r.modelo ? String(r.modelo) : null,
            time: r.time ? String(r.time) : null,
            descricao: r.descricao ? String(r.descricao) : null,
            tamanho: r.tamanho ? String(r.tamanho) : null,
            tipoProduto: r.tipo ? String(r.tipo) : null,
            estoque: rowNum(r.estoque),
            precoAtacado: rowNum(r.precoAtacado),
            precoVarejo: rowNum(r.precoVarejo),
            label: [
              r.codigo,
              [r.time, r.descricao || r.modelo].filter(Boolean).join(" "),
              r.tamanho ? `(${r.tamanho})` : null,
            ]
              .filter(Boolean)
              .join(" — "),
          })),
          familias: (famRows as any[]).map((r) => ({
            tipo: "familia" as const,
            time: String(r.time || ""),
            modelo: String(r.modelo || ""),
            linha: r.linha ? String(r.linha) : null,
            descricao: r.descricao ? String(r.descricao) : null,
            variantes: rowNum(r.variantes),
            estoque: rowNum(r.estoqueTotal),
            precoAtacado: rowNum(r.precoAtacado),
            precoVarejo: rowNum(r.precoVarejo),
            label: `Família: ${[r.time, r.modelo].filter(Boolean).join(" / ")} (${rowNum(r.variantes)} tamanhos)`,
          })),
        };
      } catch (err) {
        await db.end().catch(() => {});
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Relatório] searchProducts:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na busca de produtos" });
      }
    }),

  /** Relatório por produto (SKU ou família). Sofia entra sinalizada. */
  byProduct: publicProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        modo: z.enum(["sku", "familia"]),
        codigo: z.string().min(1).max(120).optional(),
        time: z.string().min(1).max(120).optional(),
        modelo: z.string().min(1).max(120).optional(),
        linha: z.string().max(80).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        const data = await fetchProductReport(db, input);
        await db.end();
        return data;
      } catch (err) {
        await db.end().catch(() => {});
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Relatório] byProduct:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar relatório do produto" });
      }
    }),

  // Histórico de quitações (para a página de desconto em folha)
  historicoQuitacoes: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sellerId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let query = "SELECT * FROM pdv_desconto_folha WHERE quitado = 1";
        const params: any[] = [];

        if (input.sellerId) { query += " AND sellerId = ?"; params.push(input.sellerId); }
        if (input.startDate) { query += " AND DATE(quitadoEm) >= ?"; params.push(input.startDate); }
        if (input.endDate) { query += " AND DATE(quitadoEm) <= ?"; params.push(input.endDate); }

        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countRows] = await db.execute(countQuery, params);
        const total = (countRows as any[])[0].total;

        query += " ORDER BY quitadoEm DESC";
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${Math.floor(input.limit)} OFFSET ${Math.floor(offset)}`;

        const [rows] = await db.execute(query, params);

        // Totais
        let totalQuery = "SELECT COALESCE(SUM(valor), 0) as totalValor FROM pdv_desconto_folha WHERE quitado = 1";
        const totalParams: any[] = [];
        if (input.sellerId) { totalQuery += " AND sellerId = ?"; totalParams.push(input.sellerId); }
        if (input.startDate) { totalQuery += " AND DATE(quitadoEm) >= ?"; totalParams.push(input.startDate); }
        if (input.endDate) { totalQuery += " AND DATE(quitadoEm) <= ?"; totalParams.push(input.endDate); }

        const [totalRows] = await db.execute(totalQuery, totalParams);

        await db.end();

        return {
          items: (rows as any[]).map(r => ({
            ...r,
            valor: parseFloat(r.valor),
          })),
          total,
          totalValor: parseFloat((totalRows as any[])[0].totalValor) || 0,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),
});
