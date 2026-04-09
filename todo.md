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

## Popup de Seleção Atacado (v6)
- [x] Criar QuickAddModal com grade de tamanhos e contadores independentes por tamanho
- [x] Integrar modal ao ProductCard (clique no card abre o popup)

## Reestruturação de Seções (v7)
- [ ] Atualizar schema: nova coluna `subcategory` (time/seleção específica) e `gender` separado de categoria
- [ ] Atualizar produtos no banco com nova estrutura (Times, Seleções, Retrô, Infantil + subcategorias)
- [ ] Atualizar Header com menu dropdown para as 4 seções e subseções
- [ ] Atualizar página de Produtos com filtros por seção e subseção
- [ ] Atualizar Home com cards das 4 seções principais

## Reestruturação com Nomes Reais do Catálogo (v8)
- [x] Atualizar enum category no schema com nomes reais das pastas do catálogo
- [x] Atualizar Header com menu dropdown usando nomes reais
- [x] Atualizar página de Produtos com filtros pelas novas seções
- [x] Atualizar home com cards das novas seções
- [x] Atualizar produtos fictícios no banco com as novas categorias

## Admin Independente + Mobile (v9)
- [ ] Login admin independente (sem Manus OAuth) com credenciais jurema@adm / jurema@adm
- [ ] Painel admin simplificado: gestão de fotos e valores (sem controle de estoque)
- [ ] Melhorar experiência mobile: header, home, catálogo, cards de produto

## Sistema PDV Jumera (v10)

### Banco de Dados PDV
- [x] Schema: tabela pdv_sellers (vendedores com login/senha/role)
- [x] Schema: tabela pdv_products (catálogo PDV com linha, modelo, time, tamanho, estoque, preços atacado/varejo)
- [x] Schema: tabela pdv_orders (pedidos com vendedor, canal, cliente, regime, total, status)
- [x] Schema: tabela pdv_order_items (itens de cada pedido)
- [x] Schema: tabela pdv_order_payments (formas de pagamento com taxas)
- [x] Schema: tabela pdv_order_services (serviços extras: Correio, Carreto, Caixinha)
- [x] Schema: tabela pdv_cash_flow (fluxo de caixa: suprimentos e sangrias)
- [x] Schema: tabela pdv_goals (metas por vendedor: Bronze, Prata, Ouro)
- [x] Migration e seed de vendedores iniciais (GIANLUCA, MURILO, VINICIUS, VANESSA, KAWANE)

### Backend PDV
- [x] Router pdv.auth: login, logout, me (JWT cookie próprio pdv_token)
- [x] Router pdv.sellers: CRUD de vendedores (admin only)
- [x] Router pdv.products: list com filtros (linha, time, busca), getById
- [x] Router pdv.orders: create, list, getById, updateStatus
- [x] Router pdv.dashboard: faturamento, metas, canais, regimes, vendedores, pagamentos, caixa
- [x] Router pdv.cashflow: suprimento, sangria, extrato

### Frontend PDV — Login
- [x] Página /pdv/login com formulário usuário/senha
- [x] Context PdvAuthContext com estado do vendedor logado
- [x] Redirect para /pdv após login

### Frontend PDV — PDV Principal
- [x] Layout PDV com sidebar: PDV, Histórico, Dashboard (admin), Vendedores (admin)
- [x] Tela 1: Identificação — canal (Balcão/WhatsApp) + nome do cliente
- [x] Tela 2: Produtos — busca por time/modelo, filtros por linha, cards com tamanhos e estoque
- [x] Regra automática ATACADO (≥6 peças) / VAREJO (<6 peças)
- [x] Carrinho lateral com resumo e totais
- [x] Tela 3: Pagamento — serviços extras + formas de pagamento com taxas automáticas
- [x] Recibo detalhado com envio via WhatsApp

### Frontend PDV — Dashboard (Admin Only)
- [x] KPIs: faturamento, pedidos, ticket médio, variação percentual
- [x] Gráfico de linha: faturamento por dia
- [x] Gráfico de barras: faturamento por vendedor
- [x] Gráfico de pizza: canais (Balcão/WhatsApp)
- [x] Gráfico de pizza: formas de pagamento
- [x] Gráfico de pizza: regimes (Atacado/Varejo)
- [x] Progress bars de metas por vendedor (Bronze/Prata/Ouro)
- [x] Caixa: saldo acumulado + extrato de movimentações
- [x] Botões Suprimento e Sangria com modal

### Frontend PDV — Gestão de Vendedores (Admin Only)
- [x] Tabela de vendedores com CRUD
- [x] Modal criar/editar vendedor (nome, usuário, senha, role)
- [x] Configuração de metas (Bronze, Prata, Ouro, Meta Loja)

### Frontend PDV — Histórico de Pedidos
- [x] Tabela de pedidos com filtros (período, vendedor, canal, status)
- [x] Modal de detalhes do pedido (itens, pagamentos, serviços)
- [x] Busca por ID do pedido ou nome do cliente

## Melhorias PDV (v11)
- [x] Importar catálogo de produtos PDV (linhas: Tailandesa, Nacional, Torcedor, Peça; times, tamanhos, preços atacado/varejo)
- [x] Configuração de WhatsApp para recibos (campo editável pela Vanessa no PDV)
- [x] Relatório de comissões por vendedor com filtro de período
- [x] Testes completos de todas as funcionalidades PDV (40/40 passando)

## Bugs
- [x] Login PDV: senha correta aceita mas não redireciona para /pdv (corrigido: cookie usava sameSite=lax, agora usa sameSite=none+secure igual ao cookie de sessão)

## Melhorias PDV (v12)
- [x] Checkout: ao selecionar crédito/débito, exibir "Valor real" e "Valor maquininha (com taxa)" separadamente, com campo editável

## Bugs (v13)
- [x] PDV: filtros de pesquisa corrigidos — busca case-insensitive, debounce 350ms, filtros de linha como botões, contador de resultados, busca por modelo incluída

## Importação de Catálogo Real
- [x] Analisar planilha CópiadePDVJUREMA5.0.xlsx e mapear colunas
- [x] Limpar produtos de demonstração e importar 2.218 produtos reais (aba ESTOQUE ESTATICO)

## Melhorias PDV (v14)
- [x] PDV: toggle manual Atacado/Varejo adicionado — modo auto (≥6 peças) ou forçado manualmente com indicador visual

## Bugs (v15)
- [x] Dashboard PDV não reflete pedidos realizados (corrigido: hooks chamados após guard isAdmin violava regra do React, movido guard para após todos os hooks com enabled:isAdmin)

## Bugs (v16)
- [x] Dashboard PDV mostra R$ 0,00 (corrigido: query de pagamentos com JOIN tinha coluna createdAt ambígua entre pdv_order_payments e pdv_orders, qualificado como o.createdAt)

## Reimportação Catálogo (v17)
- [x] Analisar planilha PDVJUREMA5.0.xlsx e mapear colunas
- [x] Limpar produtos existentes e importar catálogo real completo (1.455 produtos, 99 times, R$19-R$230)

## Melhorias PDV (v18)
- [x] Filtro PDV: busca por múltiplos termos — "Brasil azul" retorna 23 resultados (time=BRASIL AND descricao LIKE '%azul%')

## Melhorias PDV (v19)
- [x] PDV: validação de estoque no carrinho — bloqueia ao atingir o limite do estoque com toast de aviso
- [x] PDV: botão "Com estoque" nos filtros do catálogo — exibe apenas os 890 produtos com estoque > 0

## Integração Google Sheets (v20)
- [x] Analisar estrutura da planilha via API e mapear colunas (806 linhas, 804 válidas, 2 ignoradas)
- [x] Backend: router pdvSync com validação de campos completos (somente leitura, nunca modifica a planilha)
- [x] Frontend: painel de sincronização nas Configurações PDV com prévia e confirmação
- [x] Testar sincronização completa (inseridos=5, atualizados=799, ignorados=2, erros=0)
