-- Chave estável no storage Forge/Manus para reemitir presign e exibir mídia no painel
ALTER TABLE `wa_messages` ADD COLUMN `mediaStorageKey` varchar(512) NULL COMMENT 'Chave no storage (ex.: wa-media/1/abc.jpg)' AFTER `mediaUrl`;
