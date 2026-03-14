CREATE TABLE `banners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`subtitle` text,
	`imageUrl` text NOT NULL,
	`linkUrl` varchar(500),
	`buttonText` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`productImage` text,
	`size` varchar(10) NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`total` decimal(10,2) NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(20) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerEmail` varchar(320) NOT NULL,
	`customerPhone` varchar(20),
	`addressStreet` varchar(255),
	`addressNumber` varchar(20),
	`addressComplement` varchar(100),
	`addressNeighborhood` varchar(100),
	`addressCity` varchar(100),
	`addressState` varchar(2),
	`addressZip` varchar(10),
	`paymentMethod` enum('pix','credit_card','boleto') NOT NULL,
	`paymentStatus` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`mercadoPagoId` varchar(100),
	`subtotal` decimal(10,2) NOT NULL,
	`shippingCost` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL,
	`status` enum('pending','confirmed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `product_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`size` enum('PP','P','M','G','GG','XGG') NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`originalPrice` decimal(10,2),
	`images` json DEFAULT ('[]'),
	`team` varchar(100),
	`category` enum('times','selecoes','retro') NOT NULL DEFAULT 'times',
	`gender` enum('masculino','feminino','infantil') NOT NULL DEFAULT 'masculino',
	`isActive` boolean NOT NULL DEFAULT true,
	`isFeatured` boolean NOT NULL DEFAULT false,
	`salesCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_settings_key_unique` UNIQUE(`key`)
);
