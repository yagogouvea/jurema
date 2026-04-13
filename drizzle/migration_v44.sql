-- v44: Comissão por peça, Produto Sofia, Desconto em Folha

-- 1. Campo isSofia nos pedidos PDV (marca se a venda é de produto terceirizado Sofia)
ALTER TABLE pdv_orders ADD COLUMN isSofia TINYINT(1) NOT NULL DEFAULT 0 AFTER justificativa;

-- 2. Tabela de desconto em folha (funcionários pegam mercadoria e pagam depois)
CREATE TABLE IF NOT EXISTS pdv_desconto_folha (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sellerId INT NOT NULL,
  sellerName VARCHAR(255) NOT NULL,
  pedidoId VARCHAR(50),
  descricao VARCHAR(500) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  quitado TINYINT(1) NOT NULL DEFAULT 0,
  quitadoEm TIMESTAMP NULL,
  quitadoPor VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Configuração Sofia (comissão da loja por peça)
CREATE TABLE IF NOT EXISTS pdv_sofia_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comissaoLoja DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Inserir config padrão
INSERT INTO pdv_sofia_config (comissaoLoja) VALUES (10.00);
