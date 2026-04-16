CREATE TABLE `pdv_desconto_folha` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`sellerName` varchar(255) NOT NULL,
	`pedidoId` varchar(50),
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(10,2) NOT NULL,
	`quitado` boolean NOT NULL DEFAULT false,
	`quitadoEm` timestamp,
	`quitadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_desconto_folha_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_sofia_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comissaoLoja` decimal(10,2) NOT NULL DEFAULT '10.00',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_sofia_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pdv_products` MODIFY COLUMN `linha` varchar(100) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `pdv_products` MODIFY COLUMN `modelo` varchar(100) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `pdv_products` MODIFY COLUMN `tipo` varchar(100) NOT NULL DEFAULT 'CAMISETA';--> statement-breakpoint
ALTER TABLE `pdv_order_items` ADD `tipo` varchar(100);--> statement-breakpoint
ALTER TABLE `pdv_order_items` ADD `isSofia` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pdv_order_items` ADD `comissaoUnitaria` decimal(10,2) DEFAULT '0.50' NOT NULL;--> statement-breakpoint
ALTER TABLE `pdv_order_items` ADD `comissaoLojaSofia` decimal(10,2);--> statement-breakpoint
ALTER TABLE `pdv_orders` ADD `isSofia` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pdv_products` ADD `isSofia` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pdv_products` ADD `fotoUrl` varchar(1000);--> statement-breakpoint
ALTER TABLE `pdv_products` ADD `temporada` varchar(100);--> statement-breakpoint
ALTER TABLE `pdv_products` ADD `ptAtacado` decimal(10,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `pdv_products` ADD `ptVarejo` decimal(10,2) DEFAULT '0' NOT NULL;