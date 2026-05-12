ALTER TABLE `pdv_sellers`
  ADD `pontosOffset` decimal(12,2) NOT NULL DEFAULT '0.00' AFTER `isActive`,
  ADD `pontosOffsetMes` varchar(7) NULL AFTER `pontosOffset`;
