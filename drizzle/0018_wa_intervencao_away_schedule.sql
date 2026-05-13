-- Status "intervencao": fila para atendimento humano (classificado pela IA)
ALTER TABLE `wa_conversations`
MODIFY COLUMN `status` ENUM(
  'novo',
  'em_atendimento',
  'aguardando',
  'proposta_enviada',
  'finalizado',
  'spam',
  'intervencao'
) NOT NULL DEFAULT 'novo';

-- Grade de horários por dia da semana (JSON); null = usar apenas awayStart/awayEnd legado
ALTER TABLE `wa_ai_config`
ADD COLUMN `awaySchedule` JSON NULL AFTER `awayEnd`;
