-- ============================================================
-- SQL DE CORREÇÃO — BANCO RAILWAY (juremasports2.com.br)
-- Gerado em: 11/05/2026
-- Origem: Manus (fonte da verdade auditada).
-- Cópia de trabalho no repo em: scripts/sql_correcao_railway_manus.sql
-- ============================================================
-- ATENÇÃO: Execute SEMPRE em transação. Faça backup antes.
-- O COMMIT deste arquivo está comentado no fim — só descomente após
-- revisar o resultado do SELECT de verificação dentro da transação.
-- ============================================================

-- ── PASSO 2: Migrar produtos PDV do Manus para o Railway ──────────────────
-- Execute este bloco PRIMEIRO, antes do Passo 3.
-- Os 945 produtos do Manus precisam estar no Railway para que os
-- itens sem productId possam ser vinculados corretamente.
--
-- INSTRUÇÃO: Exporte pdv_products do Manus com:
--   mysqldump -h <host_manus> -u root -p railway pdv_products > pdv_products_manus.sql
-- Depois importe no Railway:
--   mysql -h <host_railway> -P <porta> -u root -p railway < pdv_products_manus.sql
--
-- OU use o arquivo pdv_products.csv do export anterior e importe via:
--   LOAD DATA INFILE 'pdv_products.csv' INTO TABLE pdv_products ...
-- ============================================================


-- ── PASSO 3: Corrigir totalAplicado nos 45 pedidos divergentes ────────────
-- Fonte da verdade: banco Manus (valores verificados e auditados).
-- Cada UPDATE usa o valor correto extraído diretamente do Manus.
-- ============================================================

START TRANSACTION;

-- Salvar estado atual para auditoria (opcional, recomendado)
-- CREATE TABLE IF NOT EXISTS pdv_orders_backup_20260511 AS SELECT * FROM pdv_orders;

UPDATE pdv_orders SET totalAplicado = 4045.00, totalVarejo = 4420.00, totalAtacado = 3840.00 WHERE pedidoId = 'PED-05669222';
UPDATE pdv_orders SET totalAplicado = 565.00,  totalVarejo = 690.00,  totalAtacado = 570.00  WHERE pedidoId = 'PED-07131385';
UPDATE pdv_orders SET totalAplicado = 3180.00, totalVarejo = 4080.00, totalAtacado = 3180.00 WHERE pedidoId = 'PED-14654958';
UPDATE pdv_orders SET totalAplicado = 410.00,  totalVarejo = 490.00,  totalAtacado = 410.00  WHERE pedidoId = 'PED-15514961';
UPDATE pdv_orders SET totalAplicado = 985.00,  totalVarejo = 1100.00, totalAtacado = 975.00  WHERE pedidoId = 'PED-15523188';
UPDATE pdv_orders SET totalAplicado = 475.00,  totalVarejo = 560.00,  totalAtacado = 475.00  WHERE pedidoId = 'PED-17481258';
UPDATE pdv_orders SET totalAplicado = 470.00,  totalVarejo = 560.00,  totalAtacado = 470.00  WHERE pedidoId = 'PED-29936195';
UPDATE pdv_orders SET totalAplicado = 1090.00, totalVarejo = 1200.00, totalAtacado = 1080.00 WHERE pedidoId = 'PED-32206009';
UPDATE pdv_orders SET totalAplicado = 1195.00, totalVarejo = 1400.00, totalAtacado = 1175.00 WHERE pedidoId = 'PED-33425588';
UPDATE pdv_orders SET totalAplicado = 560.00,  totalVarejo = 660.00,  totalAtacado = 550.00  WHERE pedidoId = 'PED-34657973';
UPDATE pdv_orders SET totalAplicado = 510.00,  totalVarejo = 600.00,  totalAtacado = 510.00  WHERE pedidoId = 'PED-35517775';
UPDATE pdv_orders SET totalAplicado = 715.00,  totalVarejo = 840.00,  totalAtacado = 715.00  WHERE pedidoId = 'PED-35614977';
UPDATE pdv_orders SET totalAplicado = 655.00,  totalVarejo = 760.00,  totalAtacado = 645.00  WHERE pedidoId = 'PED-35773657';
UPDATE pdv_orders SET totalAplicado = 410.00,  totalVarejo = 500.00,  totalAtacado = 400.00  WHERE pedidoId = 'PED-35822217';
UPDATE pdv_orders SET totalAplicado = 470.00,  totalVarejo = 560.00,  totalAtacado = 460.00  WHERE pedidoId = 'PED-36763387';
UPDATE pdv_orders SET totalAplicado = 1760.00, totalVarejo = 2000.00, totalAtacado = 1760.00 WHERE pedidoId = 'PED-37214754';
UPDATE pdv_orders SET totalAplicado = 480.00,  totalVarejo = 560.00,  totalAtacado = 480.00  WHERE pedidoId = 'PED-37790685';
UPDATE pdv_orders SET totalAplicado = 340.00,  totalVarejo = 400.00,  totalAtacado = 340.00  WHERE pedidoId = 'PED-38813128';
UPDATE pdv_orders SET totalAplicado = 515.00,  totalVarejo = 600.00,  totalAtacado = 515.00  WHERE pedidoId = 'PED-40448058';
UPDATE pdv_orders SET totalAplicado = 695.00,  totalVarejo = 800.00,  totalAtacado = 695.00  WHERE pedidoId = 'PED-42009759';
UPDATE pdv_orders SET totalAplicado = 2760.00, totalVarejo = 3300.00, totalAtacado = 2760.00 WHERE pedidoId = 'PED-46436685';
UPDATE pdv_orders SET totalAplicado = 255.00,  totalVarejo = 300.00,  totalAtacado = 255.00  WHERE pedidoId = 'PED-49648042';
UPDATE pdv_orders SET totalAplicado = 345.00,  totalVarejo = 410.00,  totalAtacado = 335.00  WHERE pedidoId = 'PED-50795008';
UPDATE pdv_orders SET totalAplicado = 790.00,  totalVarejo = 920.00,  totalAtacado = 780.00  WHERE pedidoId = 'PED-55789772';
UPDATE pdv_orders SET totalAplicado = 350.00,  totalVarejo = 420.00,  totalAtacado = 340.00  WHERE pedidoId = 'PED-59013764';
UPDATE pdv_orders SET totalAplicado = 535.00,  totalVarejo = 640.00,  totalAtacado = 515.00  WHERE pedidoId = 'PED-60107129';
UPDATE pdv_orders SET totalAplicado = 520.00,  totalVarejo = 620.00,  totalAtacado = 510.00  WHERE pedidoId = 'PED-60362405';
UPDATE pdv_orders SET totalAplicado = 1025.00, totalVarejo = 1200.00, totalAtacado = 1005.00 WHERE pedidoId = 'PED-63933882';
UPDATE pdv_orders SET totalAplicado = 670.00,  totalVarejo = 780.00,  totalAtacado = 670.00  WHERE pedidoId = 'PED-67513726';
UPDATE pdv_orders SET totalAplicado = 450.00,  totalVarejo = 540.00,  totalAtacado = 450.00  WHERE pedidoId = 'PED-70419512';
UPDATE pdv_orders SET totalAplicado = 535.00,  totalVarejo = 620.00,  totalAtacado = 535.00  WHERE pedidoId = 'PED-70937534';
UPDATE pdv_orders SET totalAplicado = 250.00,  totalVarejo = 300.00,  totalAtacado = 250.00  WHERE pedidoId = 'PED-72083348';
UPDATE pdv_orders SET totalAplicado = 680.00,  totalVarejo = 800.00,  totalAtacado = 680.00  WHERE pedidoId = 'PED-74696664';
UPDATE pdv_orders SET totalAplicado = 740.00,  totalVarejo = 860.00,  totalAtacado = 740.00  WHERE pedidoId = 'PED-74806496';
UPDATE pdv_orders SET totalAplicado = 680.00,  totalVarejo = 800.00,  totalAtacado = 680.00  WHERE pedidoId = 'PED-76811929';
UPDATE pdv_orders SET totalAplicado = 800.00,  totalVarejo = 940.00,  totalAtacado = 780.00  WHERE pedidoId = 'PED-77921417';
UPDATE pdv_orders SET totalAplicado = 570.00,  totalVarejo = 660.00,  totalAtacado = 570.00  WHERE pedidoId = 'PED-80412454';
UPDATE pdv_orders SET totalAplicado = 605.00,  totalVarejo = 720.00,  totalAtacado = 595.00  WHERE pedidoId = 'PED-83304048';
UPDATE pdv_orders SET totalAplicado = 730.00,  totalVarejo = 860.00,  totalAtacado = 720.00  WHERE pedidoId = 'PED-87145615';
UPDATE pdv_orders SET totalAplicado = 1200.00, totalVarejo = 1400.00, totalAtacado = 1200.00 WHERE pedidoId = 'PED-90393525';
UPDATE pdv_orders SET totalAplicado = 635.00,  totalVarejo = 760.00,  totalAtacado = 615.00  WHERE pedidoId = 'PED-91402236';
UPDATE pdv_orders SET totalAplicado = 860.00,  totalVarejo = 1000.00, totalAtacado = 860.00  WHERE pedidoId = 'PED-97032763';
UPDATE pdv_orders SET totalAplicado = 5200.00, totalVarejo = 5640.00, totalAtacado = 5200.00 WHERE pedidoId = 'PED-99354646';
UPDATE pdv_orders SET totalAplicado = 745.00,  totalVarejo = 880.00,  totalAtacado = 735.00  WHERE pedidoId = 'PED-99428040';
UPDATE pdv_orders SET totalAplicado = 490.00,  totalVarejo = 590.00,  totalAtacado = 470.00  WHERE pedidoId = 'PED-99747948';

-- Verificar resultado antes de confirmar
SELECT 
  pedidoId,
  totalAplicado,
  (SELECT SUM(totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId) as soma_itens,
  ROUND(totalAplicado - (SELECT SUM(totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId), 2) as diff_servicos
FROM pdv_orders o
WHERE pedidoId IN (
  'PED-05669222','PED-07131385','PED-14654958','PED-15514961','PED-15523188',
  'PED-17481258','PED-29936195','PED-32206009','PED-33425588','PED-34657973',
  'PED-35517775','PED-35614977','PED-35773657','PED-35822217','PED-36763387',
  'PED-37214754','PED-37790685','PED-38813128','PED-40448058','PED-42009759',
  'PED-46436685','PED-49648042','PED-50795008','PED-55789772','PED-59013764',
  'PED-60107129','PED-60362405','PED-63933882','PED-67513726','PED-70419512',
  'PED-70937534','PED-72083348','PED-74696664','PED-74806496','PED-76811929',
  'PED-77921417','PED-80412454','PED-83304048','PED-87145615','PED-90393525',
  'PED-91402236','PED-97032763','PED-99354646','PED-99428040','PED-99747948'
)
ORDER BY pedidoId;

-- Se os valores estiverem corretos, execute na mesma sessão:
-- COMMIT;

-- Se algo estiver errado:
-- ROLLBACK;

-- ── VERIFICAÇÃO FINAL (após COMMIT, fora da transação) ────────────────────
-- SELECT 
--   COUNT(*) as pedidos_corrigidos,
--   ROUND(SUM(totalAplicado), 2) as novo_total_geral
-- FROM pdv_orders 
-- WHERE pedidoId IN (
--   'PED-05669222','PED-07131385','PED-14654958','PED-15514961','PED-15523188',
--   'PED-17481258','PED-29936195','PED-32206009','PED-33425588','PED-34657973',
--   'PED-35517775','PED-35614977','PED-35773657','PED-35822217','PED-36763387',
--   'PED-37214754','PED-37790685','PED-38813128','PED-40448058','PED-42009759',
--   'PED-46436685','PED-49648042','PED-50795008','PED-55789772','PED-59013764',
--   'PED-60107129','PED-60362405','PED-63933882','PED-67513726','PED-70419512',
--   'PED-70937534','PED-72083348','PED-74696664','PED-74806496','PED-76811929',
--   'PED-77921417','PED-80412454','PED-83304048','PED-87145615','PED-90393525',
--   'PED-91402236','PED-97032763','PED-99354646','PED-99428040','PED-99747948'
-- );
-- Esperado: 45 pedidos corrigidos
