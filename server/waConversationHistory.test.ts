import { describe, expect, it } from "vitest";
import {
  buildHistoryPdfFilename,
  extractAudioTranscription,
  formatMessageExportText,
  formatYmdBr,
  isValidYmd,
  messageSenderLabel,
  sanitizeFilenamePart,
  ymdRangeToUtcBounds,
} from "@shared/waConversationHistory";

describe("waConversationHistory", () => {
  it("valida YYYY-MM-DD real no calendário de SP", () => {
    expect(isValidYmd("2026-09-08")).toBe(true);
    expect(isValidYmd("2026-02-31")).toBe(false);
    expect(isValidYmd("08/09/2026")).toBe(false);
  });

  it("converte período inclusivo para bounds UTC e inverte datas invertidas", () => {
    const bounds = ymdRangeToUtcBounds("2026-09-08", "2026-09-06");
    expect(bounds.from.toISOString()).toBe("2026-09-06T03:00:00.000Z");
    expect(bounds.toExclusive.toISOString()).toBe("2026-09-09T03:00:00.000Z");
  });

  it("formata texto de mídia e remetente para o PDF", () => {
    expect(formatMessageExportText({ type: "image", mediaCaption: "tênis" })).toBe("[Imagem] tênis");
    expect(formatMessageExportText({ type: "text", content: "oi" })).toBe("oi");
    expect(extractAudioTranscription("[Áudio] quero o P")).toBe("quero o P");
    expect(extractAudioTranscription("[áudio sem transcrição]")).toBeNull();
    expect(formatMessageExportText({ type: "audio", content: "[Áudio] quero o P" })).toBe("Áudio: quero o P");
    expect(formatMessageExportText({ type: "audio", content: "[áudio sem transcrição]" })).toBe("Áudio (sem transcrição)");
    expect(messageSenderLabel({ fromMe: false })).toBe("Cliente");
    expect(messageSenderLabel({ fromMe: true, senderType: "ai" })).toBe("Ju (IA)");
    expect(messageSenderLabel({ fromMe: true, senderType: "human" })).toBe("Atendente");
  });

  it("monta nome de arquivo sem acento", () => {
    expect(sanitizeFilenamePart("Maria José")).toBe("maria-jose");
    expect(buildHistoryPdfFilename({
      contactName: "Maria José",
      fromYmd: "2026-09-06",
      toYmd: "2026-09-08",
    })).toBe("conversa-maria-jose-2026-09-06-a-2026-09-08.pdf");
    expect(formatYmdBr("2026-09-08")).toBe("08/09/2026");
  });
});
