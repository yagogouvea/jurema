# Jumera Sport - TODO

## Banco de Dados e Backend
- [x] Schema: produtos, variantes de estoque, pedidos, itens de pedido, banners, categorias
- [x] Migrations e aplicação no banco
- [x] tRPC routers: produtos, pedidos, banners, admin, checkout, upload
- [x] Integração Mercado Pago (estrutura preparada)
- [x] Upload de imagens S3 para produtos
- [x] Notificação automática ao proprietário em novos pedidos
- [x] Geração de banners com IA (LLM + imageGeneration)

## Identidade Visual e Layout
- [x] Paleta de cores: preto #0D0D0D, vermelho #C8102E, tipografia esportiva
- [x] index.css com variáveis de tema dark
- [x] Fonte Bebas Neue + Inter via Google Fonts
- [x] Header fixo com logo, navegação, carrinho e busca
- [x] Footer com links, redes sociais e selos de segurança
- [x] Botão WhatsApp flutuante fixo
- [x] Links redes sociais (Instagram, Facebook, TikTok)

## Página Inicial (Home)
- [x] Hero banner carrossel automático com banners do admin
- [x] Seção de produtos em destaque (carrossel)
- [x] Seção de categorias visuais (times, seleções, retrô)
- [x] Seção por gênero (masculino, feminino, infantil)
- [x] Barra de estatísticas (500+ produtos, 10K+ clientes, 24H entrega)

## Catálogo de Produtos
- [x] Página /produtos com grid responsivo
- [x] Filtros por time/seleção, gênero, categoria, busca
- [x] Ordenação (mais vendidos, preço, novidades, destaques)
- [x] Paginação

## Página de Detalhe do Produto
- [x] Galeria de imagens com navegação
- [x] Seletor de tamanho com indicador de estoque
- [x] Seletor de quantidade
- [x] Botão adicionar ao carrinho
- [x] Produtos relacionados

## Carrinho e Checkout
- [x] Carrinho persistente (localStorage)
- [x] CartDrawer lateral com resumo
- [x] Formulário de dados do cliente e endereço
- [x] Seleção de método de pagamento (PIX, Cartão, Boleto)
- [x] Integração Mercado Pago (estrutura pronta para configuração)
- [x] Página de confirmação de pedido

## Painel Administrativo
- [x] Login seguro (role admin)
- [x] Dashboard com resumo (pedidos, estoque crítico, faturamento)
- [x] Gestão de produtos (CRUD, destaque, ativar/desativar)
- [x] Upload de múltiplas imagens por produto (S3)
- [x] Controle de estoque por tamanho (PP, P, M, G, GG, XGG)
- [x] Gestão de pedidos (listar, atualizar status)
- [x] Gestão de banners (upload, ordenação)
- [x] Gerador de banners com IA
- [x] Configurações (WhatsApp, redes sociais, chaves API Mercado Pago)

## Testes
- [x] 17 testes vitest passando (auth, products, orders, banners, dashboard, settings, payment)
- [x] Verificação responsividade mobile/desktop

## Correções e Melhorias (v2)
- [x] Corrigir banner hero cortado no mobile
- [x] Estilizar cards de categoria sem emojis (ícones SVG/lucide com estilo esportivo)
- [x] Redesenhar botão WhatsApp com identidade visual da marca (preto/vermelho)

## Correções v3
- [x] Corrigir banner hero cortado no mobile (altura dinâmica, sem overflow hidden fixo)

## Melhorias v4
- [x] Inserir produtos fictícios no banco de dados para visualização
- [x] Adicionar seção "Nova Coleção" na página inicial
- [x] Adicionar seção "Mais Vendidos" na página inicial

## Sistema de Cadastro/Login e WhatsApp (v5)
- [x] Atualizar schema: adicionar campos cpf, telefone, endereço na tabela customers
- [x] Criar routers de cadastro e login próprio (sem OAuth)
- [x] Página de Cadastro com campos: Nome, CPF, Endereço (CEP + API), Email, Telefone (máscara), Senha, Confirmação
- [x] Página de Login com email e senha
- [x] Busca automática de CEP via ViaCEP (API gratuita)
- [x] Máscara de telefone no formato (00) 94729-3221
- [x] Proteger checkout: redirecionar para login se não autenticado
- [x] Envio do pedido via WhatsApp para 11 98169-3476 com: Nome, CPF, Telefone, itens, quantidades, valores e total
