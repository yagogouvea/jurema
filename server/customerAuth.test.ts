import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (pwd: string) => `hashed_${pwd}`),
    compare: vi.fn(async (pwd: string, hash: string) => hash === `hashed_${pwd}`),
  },
}));

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("CPF validation logic", () => {
  function validateCPF(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let check = (sum * 10) % 11;
    if (check === 10 || check === 11) check = 0;
    if (check !== parseInt(digits[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    check = (sum * 10) % 11;
    if (check === 10 || check === 11) check = 0;
    return check === parseInt(digits[10]);
  }

  it("should validate a correct CPF", () => {
    expect(validateCPF("529.982.247-25")).toBe(true);
  });

  it("should reject a CPF with all same digits", () => {
    expect(validateCPF("111.111.111-11")).toBe(false);
  });

  it("should reject an invalid CPF", () => {
    expect(validateCPF("123.456.789-00")).toBe(false);
  });

  it("should reject a CPF with wrong length", () => {
    expect(validateCPF("123.456")).toBe(false);
  });
});

describe("Phone mask logic", () => {
  function maskPhone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return value;
  }

  it("should format a full mobile number correctly", () => {
    expect(maskPhone("11981693476")).toBe("(11) 98169-3476");
  });

  it("should format partial input", () => {
    expect(maskPhone("11")).toBe("(11");
    expect(maskPhone("1198")).toBe("(11) 98");
  });

  it("should strip non-digit characters", () => {
    expect(maskPhone("(11) 98169-3476")).toBe("(11) 98169-3476");
  });
});

describe("CEP mask logic", () => {
  function maskCEP(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  it("should format a full CEP", () => {
    expect(maskCEP("01310100")).toBe("01310-100");
  });

  it("should format a partial CEP", () => {
    expect(maskCEP("01310")).toBe("01310");
    expect(maskCEP("013101")).toBe("01310-1");
  });
});

describe("WhatsApp message builder", () => {
  function buildWhatsAppMessage(
    customer: { name: string; cpf: string; phone: string },
    items: Array<{ productName: string; size: string; quantity: number; unitPrice: number }>,
    subtotal: number
  ): string {
    const lines: string[] = [];
    lines.push("🛒 *NOVO PEDIDO — JUMERA SPORT*");
    lines.push(`👤 *Nome:* ${customer.name}`);
    lines.push(`🪪 *CPF:* ${customer.cpf}`);
    lines.push(`📱 *Telefone:* ${customer.phone}`);
    items.forEach((item) => {
      lines.push(`${item.productName} | ${item.size} | Qtd: ${item.quantity}`);
    });
    lines.push(`💰 *TOTAL: R$ ${subtotal.toFixed(2).replace(".", ",")}*`);
    return lines.join("\n");
  }

  it("should include customer info in the message", () => {
    const msg = buildWhatsAppMessage(
      { name: "João Silva", cpf: "529.982.247-25", phone: "(11) 98169-3476" },
      [{ productName: "Camisa Brasil 2026", size: "G", quantity: 2, unitPrice: 149.9 }],
      299.8
    );
    expect(msg).toContain("João Silva");
    expect(msg).toContain("529.982.247-25");
    expect(msg).toContain("(11) 98169-3476");
    expect(msg).toContain("Camisa Brasil 2026");
    expect(msg).toContain("R$ 299,80");
  });

  it("should list all items", () => {
    const msg = buildWhatsAppMessage(
      { name: "Maria", cpf: "000.000.000-00", phone: "(21) 99999-9999" },
      [
        { productName: "Camisa Flamengo", size: "M", quantity: 1, unitPrice: 129.9 },
        { productName: "Camisa Argentina", size: "P", quantity: 2, unitPrice: 159.9 },
      ],
      449.7
    );
    expect(msg).toContain("Camisa Flamengo");
    expect(msg).toContain("Camisa Argentina");
    expect(msg).toContain("R$ 449,70");
  });
});
