import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { detectSofiaImageMime, invalidSofiaPhotoMessage } from "./pdvSofiaPhotoValidate";

export const ELECTRONIC_PAYMENTS = new Set(["PIX", "DEBITO", "CREDITO"]);
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export const OrderPaymentSchema = z
  .object({
    formaPagamento: z.enum(["PIX", "DINHEIRO", "DEBITO", "CREDITO", "DESCONTO_FOLHA"]),
    valor: z.number().min(0),
    taxa: z.number().default(0),
    valorLiquido: z.number().min(0),
    /** Titular — opcional. O comprovante é o que fecha PIX/cartão. */
    nomePix: z.string().optional(),
    obsPagamento: z.string().optional(),
    comprovanteBase64: z.string().optional(),
    comprovanteMimeType: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    if (!ELECTRONIC_PAYMENTS.has(p.formaPagamento)) return;
    if (!p.comprovanteBase64?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Anexe o comprovante do PIX ou do cartão para fechar o pedido",
        path: ["comprovanteBase64"],
      });
    }
  });

export type OrderPaymentInput = z.infer<typeof OrderPaymentSchema>;

export function decodePaymentReceipt(base64: string): {
  mime: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
} {
  const raw = base64.replace(/^data:[^;]+;base64,/, "").trim();
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length === 0 || buffer.length > RECEIPT_MAX_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Comprovante inválido (tamanho ${buffer.length} bytes; máx ${RECEIPT_MAX_BYTES}).`,
    });
  }
  const mime = detectSofiaImageMime(buffer);
  if (!mime) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: invalidSofiaPhotoMessage(buffer.length),
    });
  }
  return { mime, buffer };
}
