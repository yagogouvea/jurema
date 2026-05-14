import mysql from "mysql2/promise";

/**
 * Migration: status livre da IA + presets configuráveis.
 *
 * - Adiciona wa_conversations.aiStatus (1-3 palavras geradas pela IA, free-form).
 * - Adiciona wa_conversations.aiStatusUpdatedAt.
 * - Adiciona wa_conversations.statusSetBy / statusLockedUntil se faltarem.
 * - Converte status de ENUM para VARCHAR(50) para aceitar presets custom.
 * - Cria wa_status_presets com os 7 presets-sistema.
 */

const REQUIRED_COL_DEFS: Array<{ name: string; ddl: string }> = [
  {
    name: "aiStatus",
    ddl: "ALTER TABLE `wa_conversations` ADD COLUMN `aiStatus` VARCHAR(120) NULL AFTER `status`",
  },
  {
    name: "aiStatusUpdatedAt",
    ddl: "ALTER TABLE `wa_conversations` ADD COLUMN `aiStatusUpdatedAt` TIMESTAMP NULL AFTER `aiStatus`",
  },
  {
    name: "statusSetBy",
    ddl: "ALTER TABLE `wa_conversations` ADD COLUMN `statusSetBy` ENUM('ai','human') NOT NULL DEFAULT 'ai' AFTER `aiStatusUpdatedAt`",
  },
  {
    name: "statusLockedUntil",
    ddl: "ALTER TABLE `wa_conversations` ADD COLUMN `statusLockedUntil` TIMESTAMP NULL AFTER `statusSetBy`",
  },
];

const PRESETS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS \`wa_status_presets\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`key\` VARCHAR(50) NOT NULL,
  \`label\` VARCHAR(100) NOT NULL,
  \`color\` VARCHAR(20) NOT NULL DEFAULT '#60a5fa',
  \`emoji\` VARCHAR(8) NULL,
  \`description\` VARCHAR(255) NULL,
  \`blocksAi\` BOOLEAN NOT NULL DEFAULT 0,
  \`sortOrder\` INT NOT NULL DEFAULT 0,
  \`isSystem\` BOOLEAN NOT NULL DEFAULT 0,
  \`isActive\` BOOLEAN NOT NULL DEFAULT 1,
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`wa_status_presets_key_unique\` (\`key\`)
)`;

type SystemPreset = {
  key: string;
  label: string;
  color: string;
  emoji?: string;
  description?: string;
  blocksAi: boolean;
  sortOrder: number;
};

export const SYSTEM_PRESETS: SystemPreset[] = [
  { key: "novo", label: "Novo", color: "#60a5fa", emoji: "🆕", description: "Cliente novo / primeiro contato", blocksAi: false, sortOrder: 10 },
  { key: "em_atendimento", label: "Em atendimento", color: "#34d399", emoji: "💬", description: "Conversa ativa, IA respondendo", blocksAi: false, sortOrder: 20 },
  { key: "aguardando", label: "Aguardando", color: "#fbbf24", emoji: "⏳", description: "Aguardando resposta do cliente", blocksAi: false, sortOrder: 30 },
  { key: "proposta_enviada", label: "Proposta enviada", color: "#a78bfa", emoji: "📦", description: "Catálogo enviado, cliente analisando", blocksAi: false, sortOrder: 40 },
  { key: "finalizado", label: "Finalizado", color: "#6b7280", emoji: "✅", description: "Compra concluída ou conversa encerrada", blocksAi: true, sortOrder: 50 },
  { key: "spam", label: "Spam", color: "#f87171", emoji: "🚫", description: "Mensagem irrelevante / propaganda", blocksAi: true, sortOrder: 60 },
  { key: "intervencao", label: "Intervenção", color: "#fb923c", emoji: "⚠️", description: "Precisa de atendente humano", blocksAi: true, sortOrder: 70 },
];

export async function runWaStatusPresetsMigration(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[wa-status-presets migration] DATABASE_URL ausente, pulando.");
    return;
  }
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(url);

    const [tableRows] = await conn.execute("SHOW TABLES LIKE 'wa_conversations'");
    if (!(tableRows as any[]).length) {
      console.warn("[wa-status-presets migration] wa_conversations ainda não existe; pulando.");
      return;
    }

    // 1. Adicionar colunas faltantes em wa_conversations.
    const [colsRaw] = await conn.execute("SHOW COLUMNS FROM `wa_conversations`");
    const existing = new Map<string, any>();
    for (const row of colsRaw as any[]) {
      existing.set(String(row.Field ?? row.field ?? "").toLowerCase(), row);
    }

    for (const col of REQUIRED_COL_DEFS) {
      if (existing.has(col.name.toLowerCase())) continue;
      try {
        await conn.execute(col.ddl);
        console.log(`[wa-status-presets migration] Coluna ${col.name} criada.`);
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        if (/duplicate|already exists/i.test(msg)) continue;
        console.error(`[wa-status-presets migration] Falha ao adicionar ${col.name}:`, e);
      }
    }

    // 2. Converter status de ENUM para VARCHAR(50) — só se ainda for ENUM.
    const statusCol = existing.get("status");
    const statusType = String(statusCol?.Type ?? statusCol?.type ?? "").toLowerCase();
    if (statusType.startsWith("enum")) {
      try {
        await conn.execute(
          "ALTER TABLE `wa_conversations` MODIFY `status` VARCHAR(50) NOT NULL DEFAULT 'novo'"
        );
        console.log("[wa-status-presets migration] status convertido de ENUM para VARCHAR(50).");
      } catch (e) {
        console.error("[wa-status-presets migration] Falha ao converter status:", e);
      }
    }

    // 3. Criar tabela de presets.
    try {
      await conn.execute(PRESETS_TABLE_DDL);
    } catch (e) {
      console.error("[wa-status-presets migration] Falha ao criar wa_status_presets:", e);
    }

    // 4. Seed system presets (ignora duplicatas).
    for (const p of SYSTEM_PRESETS) {
      try {
        await conn.execute(
          `INSERT INTO \`wa_status_presets\`
             (\`key\`, \`label\`, \`color\`, \`emoji\`, \`description\`, \`blocksAi\`, \`sortOrder\`, \`isSystem\`, \`isActive\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
           ON DUPLICATE KEY UPDATE
             \`isSystem\` = 1`,
          [p.key, p.label, p.color, p.emoji ?? null, p.description ?? null, p.blocksAi ? 1 : 0, p.sortOrder]
        );
      } catch (e) {
        console.warn(`[wa-status-presets migration] seed ${p.key}:`, e);
      }
    }
    console.log("[wa-status-presets migration] OK.");
  } catch (err) {
    console.error("[wa-status-presets migration] Erro inesperado:", err);
  } finally {
    if (conn) {
      try { await conn.end(); } catch { /* ignore */ }
    }
  }
}
