import { describe, expect, it } from "vitest";
import { buildConversationHistoryHtml, escHtml } from "../client/src/lib/waConversationHtml";

describe("waConversationHtml", () => {
  it("escapa HTML e monta painel com instância, áudio e vídeo", () => {
    expect(escHtml("<script>")).toBe("&lt;script&gt;");
    const html = buildConversationHistoryHtml(
      {
        contactName: "Railson",
        contactPhone: "5511999999999",
        instanceName: "Instância 3",
        fromYmd: "2026-09-03",
        toYmd: "2026-09-08",
        messages: [
          { id: 1, fromMe: false, type: "audio", content: "[Áudio] bom dia", timestamp: "2026-09-08T12:00:00.000Z" },
          { id: 2, fromMe: true, senderType: "human", type: "video", content: "[video]", timestamp: "2026-09-08T12:01:00.000Z" },
        ],
      },
      (msg) => (Number(msg.id) === 1 ? "https://x/a.ogg" : "https://x/v.mp4")
    );
    expect(html).toContain("Instância 3");
    expect(html).toContain("Railson");
    expect(html).toContain("<audio");
    expect(html).toContain("<video");
    expect(html).toContain("bom dia");
    expect(html).toContain("https://x/a.ogg");
  });
});
