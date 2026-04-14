/**
 * v52 — Integração Google Sheets bidirecional + campos Pendente/Justificativa
 * Testa a lógica de escrita na planilha e os campos de pendente no pedido
 */
import { describe, it, expect, vi } from "vitest";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Formata uma linha de pedido para a planilha (mesma lógica do pdvSheetsWriter) */
function buildPedidoRow(order: {
  id: number;
  createdAt: number;
  sellerName: string;
  canal: string;
  clienteNome?: string;
  clienteTelefone?: string;
  totalVarejo: number;
  totalAtacado: number;
  regime: string;
  totalAplicado: number;
  formaPagamento: string;
  totalTaxa: number;
  totalComTaxa: number;
  totalPendente: number;
  justificativa?: string;
  status: string;
  qtdItens: number;
  comissaoTotal: number;
  totalServicos: number;
}): string[] {
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("pt-BR");
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const totalSemTaxa = order.totalAplicado + order.totalServicos;
  const totalComTaxa = order.totalComTaxa;

  return [
    String(order.id),                          // pedido_id
    `${dateStr} ${timeStr}`,                    // data
    order.sellerName,                           // vendedor
    order.canal === "BALCAO" ? "Balcão" : "WhatsApp", // canal
    order.clienteNome || "",                    // cliente
    order.clienteTelefone || "",                // telefone
    order.totalVarejo.toFixed(2),               // varejo
    order.totalAtacado.toFixed(2),              // atacado
    order.regime,                               // atacado/varejo
    order.totalServicos > 0 ? "SIM" : "",       // extra
    order.totalServicos > 0 ? order.totalServicos.toFixed(2) : "", // valor adicional
    totalSemTaxa.toFixed(2),                    // valor total sem taxa
    order.formaPagamento,                       // forma de pagamento
    order.totalTaxa.toFixed(2),                 // taxa
    totalComTaxa.toFixed(2),                    // total com taxa
    order.totalPendente > 0 ? order.totalPendente.toFixed(2) : "", // pendente
    order.justificativa || "",                  // justificativa
    order.status,                               // modalidade
    String(order.qtdItens),                     // qtd de itens
    order.comissaoTotal.toFixed(2),             // comissão
  ];
}

/** Calcula o total com taxa a partir dos pagamentos */
function calcTotalComTaxa(payments: Array<{ valor: number; taxa: number }>): number {
  return payments.reduce((sum, p) => sum + p.valor + p.taxa, 0);
}

/** Calcula a comissão total de um pedido (R$0,50/peça, excluindo Sofia) */
function calcComissao(items: Array<{ quantidade: number; isSofia: boolean; comissaoUnitaria: number }>): number {
  return items
    .filter(i => !i.isSofia)
    .reduce((sum, i) => sum + i.quantidade * i.comissaoUnitaria, 0);
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe("pdvSheetsWriter — buildPedidoRow", () => {
  it("deve gerar linha com 20 colunas", () => {
    const row = buildPedidoRow({
      id: 1001,
      createdAt: new Date("2026-04-14T10:30:00").getTime(),
      sellerName: "Maria",
      canal: "BALCAO",
      clienteNome: "João Silva",
      clienteTelefone: "11999999999",
      totalVarejo: 150,
      totalAtacado: 120,
      regime: "VAREJO",
      totalAplicado: 150,
      formaPagamento: "PIX",
      totalTaxa: 0,
      totalComTaxa: 150,
      totalPendente: 0,
      status: "PAGO",
      qtdItens: 3,
      comissaoTotal: 1.5,
      totalServicos: 0,
    });
    expect(row).toHaveLength(20);
    expect(row[0]).toBe("1001");
    expect(row[2]).toBe("Maria");
    expect(row[3]).toBe("Balcão");
    expect(row[4]).toBe("João Silva");
    expect(row[17]).toBe("PAGO");
    expect(row[18]).toBe("3");
    expect(row[19]).toBe("1.50");
  });

  it("deve preencher pendente e justificativa quando status=PENDENTE", () => {
    const row = buildPedidoRow({
      id: 1002,
      createdAt: Date.now(),
      sellerName: "Pedro",
      canal: "WHATSAPP",
      totalVarejo: 200,
      totalAtacado: 160,
      regime: "ATACADO",
      totalAplicado: 160,
      formaPagamento: "DINHEIRO",
      totalTaxa: 0,
      totalComTaxa: 160,
      totalPendente: 50,
      justificativa: "Cliente paga amanhã",
      status: "PENDENTE",
      qtdItens: 4,
      comissaoTotal: 2.0,
      totalServicos: 0,
    });
    expect(row[15]).toBe("50.00");         // pendente
    expect(row[16]).toBe("Cliente paga amanhã"); // justificativa
    expect(row[17]).toBe("PENDENTE");      // modalidade
  });

  it("deve incluir serviços extras no valor total sem taxa", () => {
    const row = buildPedidoRow({
      id: 1003,
      createdAt: Date.now(),
      sellerName: "Ana",
      canal: "BALCAO",
      totalVarejo: 100,
      totalAtacado: 80,
      regime: "VAREJO",
      totalAplicado: 100,
      formaPagamento: "PIX",
      totalTaxa: 0,
      totalComTaxa: 115,
      totalPendente: 0,
      status: "PAGO",
      qtdItens: 2,
      comissaoTotal: 1.0,
      totalServicos: 15, // correio
    });
    expect(row[9]).toBe("SIM");    // extra
    expect(row[10]).toBe("15.00"); // valor adicional
    expect(row[11]).toBe("115.00"); // total sem taxa (100 + 15)
  });

  it("deve usar canal WhatsApp corretamente", () => {
    const row = buildPedidoRow({
      id: 1004,
      createdAt: Date.now(),
      sellerName: "Carlos",
      canal: "WHATSAPP",
      totalVarejo: 80,
      totalAtacado: 64,
      regime: "VAREJO",
      totalAplicado: 80,
      formaPagamento: "PIX",
      totalTaxa: 0,
      totalComTaxa: 80,
      totalPendente: 0,
      status: "PAGO",
      qtdItens: 2,
      comissaoTotal: 1.0,
      totalServicos: 0,
    });
    expect(row[3]).toBe("WhatsApp");
  });
});

describe("calcTotalComTaxa", () => {
  it("deve somar valor + taxa de cada pagamento", () => {
    const payments = [
      { valor: 100, taxa: 5 },  // crédito 5%
      { valor: 50, taxa: 0 },   // PIX
    ];
    expect(calcTotalComTaxa(payments)).toBe(155);
  });

  it("deve retornar o valor puro quando não há taxa", () => {
    const payments = [{ valor: 200, taxa: 0 }];
    expect(calcTotalComTaxa(payments)).toBe(200);
  });
});

describe("calcComissao", () => {
  it("deve calcular comissão apenas para itens não-Sofia", () => {
    const items = [
      { quantidade: 3, isSofia: false, comissaoUnitaria: 0.5 },
      { quantidade: 2, isSofia: true,  comissaoUnitaria: 0 },   // Sofia: sem comissão
      { quantidade: 1, isSofia: false, comissaoUnitaria: 0.5 },
    ];
    expect(calcComissao(items)).toBe(2.0); // (3+1) * 0.50
  });

  it("deve retornar 0 quando todos os itens são Sofia", () => {
    const items = [
      { quantidade: 5, isSofia: true, comissaoUnitaria: 0 },
    ];
    expect(calcComissao(items)).toBe(0);
  });

  it("deve usar o comissaoUnitaria registrado no item (sem retroatividade)", () => {
    // Mesmo que a taxa atual seja 0.50, itens antigos podem ter 0.30
    const items = [
      { quantidade: 2, isSofia: false, comissaoUnitaria: 0.30 },
      { quantidade: 3, isSofia: false, comissaoUnitaria: 0.50 },
    ];
    expect(calcComissao(items)).toBeCloseTo(2.10); // 2*0.30 + 3*0.50
  });
});

describe("statusPedido logic", () => {
  it("deve ser PAGO quando totalPendente = 0", () => {
    const totalGeral = 100;
    const totalPago = 100;
    const isPendente = false;
    const totalPendente = isPendente ? 0 : Math.max(0, totalGeral - totalPago);
    const status = isPendente || totalPendente > 0 ? "PENDENTE" : "PAGO";
    expect(status).toBe("PAGO");
  });

  it("deve ser PENDENTE quando checkbox isPendente está ativo", () => {
    const totalGeral = 100;
    const totalPago = 100; // pago tudo, mas marcou pendente manualmente
    const isPendente = true;
    const valorPendenteManual = 20;
    const totalPendente = isPendente
      ? (valorPendenteManual || Math.max(0, totalGeral - totalPago))
      : Math.max(0, totalGeral - totalPago);
    const status = isPendente || totalPendente > 0 ? "PENDENTE" : "PAGO";
    expect(status).toBe("PENDENTE");
    expect(totalPendente).toBe(20);
  });

  it("deve ser PENDENTE automaticamente quando valor pago < total", () => {
    const totalGeral = 100;
    const totalPago = 70;
    const isPendente = false;
    const totalPendente = Math.max(0, totalGeral - totalPago);
    const status = isPendente || totalPendente > 0 ? "PENDENTE" : "PAGO";
    expect(status).toBe("PENDENTE");
    expect(totalPendente).toBe(30);
  });
});
