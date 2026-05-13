-- Links automáticos adicionais (rótulo + URL) para treinamento da IA — JSON array [{ "label": "...", "url": "..." }, ...]
ALTER TABLE `wa_ai_config` ADD COLUMN `extraLinks` JSON NULL AFTER `instagramLink`;
