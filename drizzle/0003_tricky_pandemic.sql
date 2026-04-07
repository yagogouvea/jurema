ALTER TABLE `products` MODIFY COLUMN `category` enum('times','selecoes','retro','infantil') NOT NULL DEFAULT 'times';--> statement-breakpoint
ALTER TABLE `products` ADD `subcategory` varchar(100);