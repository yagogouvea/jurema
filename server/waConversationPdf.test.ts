import { describe, expect, it } from "vitest";
import { buildConversationHistoryPdf } from "../client/src/lib/waConversationPdf";

describe("waConversationPdf", () => {
  it("gera PDF com cabeçalho e mensagens de uma conversa", () => {
    const doc = buildConversationHistoryPdf({
      contactName: "Maria José",
      contactPhone: "5511999999999",
      instanceName: "Instância 1",
      fromYmd: "2026-09-06",
      toYmd: "2026-09-08",
      messages: [
        { fromMe: false, type: "text", content: "Oi, tem o conjunto P?", timestamp: "2026-09-06T15:10:00.000Z" },
        { fromMe: true, senderType: "ai", type: "text", content: "Temos sim!", timestamp: "2026-09-06T15:11:00.000Z" },
        { fromMe: false, type: "audio", content: "[Áudio] quero o conjunto P de preto", timestamp: "2026-09-06T15:12:00.000Z" },
        { fromMe: true, senderType: "human", type: "image", mediaCaption: "foto do conjunto", timestamp: "2026-09-07T12:00:00.000Z" },
      ],
    });
    const bytes = doc.output("arraybuffer");
    const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(800);
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("Hist");
    expect(text).toContain("quero o conjunto P de preto");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
