ALTER TABLE `product_stock` MODIFY COLUMN `size` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `pdvCodigoBase` varchar(100);--> statement-breakpoint
ALTER TABLE `products` ADD `pdvSynced` boolean DEFAULT false NOT NULL;