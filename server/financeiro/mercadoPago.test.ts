import { describe, expect, it } from "vitest";
import { parseMercadoPagoText, looksLikeMercadoPago } from "./mercadoPagoParser";

const SAMPLE = `
1/2
EXTRATO DE CONTA
WZ DIGITAL SOLUTIONS DESENVOLVIMENTO DE SOFTWARE
LTDA
CPF/CNPJ: 60547578000194
Agência:
Conta:
46759574423
 De 01-05-2026 al 31-05-2026
Periodo:
Saldo inicial: R$ 0,11
Entradas: R$ 1.207,28
Saidas: R$ -1.206,80
DETALHE DOS MOVIMENTOS
Data
Descrição
ID da operação
Valor
Saldo
06-05-2026
Pagamento com Código QR 
Pix WCS SERVICOS DE 
RASTREIO DE VEICULOS 
LTDA
157971513588
R$ 118,81
R$ 118,92
06-05-2026
Pagamento com Código QR 
Pix MARCELO EMERSON 
PIRES
157976295418
R$ 118,81
R$ 237,73
06-05-2026
Pix enviado Yago Gouvea 
Manoel
157991557154
R$ -237,00
R$ 0,73
07-05-2026
Débito por dívida 
Empréstimos Mercado Pago
3075296085
R$ -0,73
R$ 0,00
07-05-2026
Liberação de dinheiro
158167379776
R$ 949,96
R$ 949,96
07-05-2026
Débito por dívida 
Empréstimos Mercado Pago
3075408071
R$ -30,07
R$ 919,89
19-05-2026
Pix Mauricio Lima Bitencourt
159201991537
R$ 19,70
R$ 21,59
19-05-2026
Pix enviado Yago Gouvea 
Manoel
159312459651
R$ -21,00
R$ 0,59
Mercado Pago Instituição de Pagamento Ltda.
`;

describe("mercadoPagoParser", () => {
  it("detecta origem", () => {
    expect(looksLikeMercadoPago(SAMPLE)).toBe(true);
  });

  it("extrai período, pix in, ignora out/dívida, marca liberação", () => {
    const p = parseMercadoPagoText(SAMPLE);
    expect(p.period).toEqual({ start: "2026-05-01", end: "2026-05-31" });
    expect(p.ignoredOutCount).toBeGreaterThanOrEqual(2);

    const pixIns = p.lines.filter((l) => l.kindLabel === "pix_in");
    expect(pixIns.length).toBe(3); // WCS, Marcelo, Mauricio
    expect(pixIns.some((l) => l.amountCents === 11881 && l.payerNameNorm.includes("MARCELO"))).toBe(
      true
    );
    expect(pixIns.some((l) => l.amountCents === 1970 && l.payerNameNorm.includes("MAURICIO"))).toBe(
      true
    );
    expect(pixIns.every((l) => !!l.operationId)).toBe(true);

    const lib = p.lines.filter((l) => l.kindLabel === "liberacao");
    expect(lib).toHaveLength(1);
    expect(lib[0].amountCents).toBe(94996);
  });
});
