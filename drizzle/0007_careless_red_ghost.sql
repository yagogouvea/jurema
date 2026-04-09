CREATE TABLE `pdv_cash_flow` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` enum('SUPRIMENTO','SANGRIA') NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(10,2) NOT NULL,
	`usuario` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pdv_cash_flow_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(50) NOT NULL,
	`label` varchar(100) NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_goals_id` PRIMARY KEY(`id`),
	CONSTRAINT `pdv_goals_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `pdv_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` varchar(50) NOT NULL,
	`productId` int,
	`linha` varchar(50),
	`modelo` varchar(50),
	`time` varchar(100),
	`descricao` varchar(255),
	`tamanho` varchar(20) NOT NULL,
	`quantidade` int NOT NULL,
	`precoUnitario` decimal(10,2) NOT NULL,
	`totalItem` decimal(10,2) NOT NULL,
	CONSTRAINT `pdv_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_order_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` varchar(50) NOT NULL,
	`formaPagamento` enum('PIX','DINHEIRO','DEBITO','CREDITO','DESCONTO_FOLHA') NOT NULL,
	`valor` decimal(10,2) NOT NULL,
	`taxa` decimal(10,2) NOT NULL DEFAULT '0',
	`valorLiquido` decimal(10,2) NOT NULL,
	`nomePix` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pdv_order_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_order_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` varchar(50) NOT NULL,
	`tipo` varchar(100) NOT NULL,
	`descricao` varchar(255),
	`valor` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pdv_order_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` varchar(50) NOT NULL,
	`sellerId` int NOT NULL,
	`sellerName` varchar(255) NOT NULL,
	`canal` enum('BALCAO','WHATSAPP') NOT NULL,
	`clienteNome` varchar(255),
	`clienteTelefone` varchar(20),
	`regime` enum('ATACADO','VAREJO') NOT NULL,
	`totalVarejo` decimal(10,2) NOT NULL DEFAULT '0',
	`totalAtacado` decimal(10,2) NOT NULL DEFAULT '0',
	`totalAplicado` decimal(10,2) NOT NULL,
	`totalPago` decimal(10,2) NOT NULL DEFAULT '0',
	`totalPendente` decimal(10,2) NOT NULL DEFAULT '0',
	`justificativa` text,
	`status` enum('PAGO','PENDENTE','CANCELADO') NOT NULL DEFAULT 'PAGO',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `pdv_orders_pedidoId_unique` UNIQUE(`pedidoId`)
);
--> statement-breakpoint
CREATE TABLE `pdv_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(100),
	`linha` enum('TAILANDESA','NACIONAL','TORCEDOR','PECA') NOT NULL,
	`modelo` enum('TORCEDOR','JOGADOR','TAILANDESA','VENDEDOR') NOT NULL,
	`time` varchar(100) NOT NULL,
	`descricao` varchar(255),
	`tamanho` varchar(20) NOT NULL,
	`tipo` enum('CAMISETA','CONJUNTO','OUTRO') NOT NULL DEFAULT 'CAMISETA',
	`estoque` int NOT NULL DEFAULT 0,
	`precoAtacado` decimal(10,2) NOT NULL DEFAULT '0',
	`precoVarejo` decimal(10,2) NOT NULL DEFAULT '0',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdv_sellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`username` varchar(100) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('seller','admin') NOT NULL DEFAULT 'seller',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdv_sellers_id` PRIMARY KEY(`id`),
	CONSTRAINT `pdv_sellers_username_unique` UNIQUE(`username`)
);
