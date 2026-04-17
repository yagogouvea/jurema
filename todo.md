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

## Melhorias Sync Google Sheets (v21)
- [x] Ignorar colunas FOTOS e TEMPORADA na validação de campos obrigatórios
- [x] Notificação automática ao dono quando novos produtos forem detectados na planilha (via notifyOwner com lista dos novos)

## Melhorias Sync + Paginação (v22)
- [x] Sync: upsert em lote (INSERT ON DUPLICATE KEY UPDATE) — 0.5s para 804 produtos (antes ~10s)
- [x] Sync: validação de estoque obrigatório (QTD deve ser numérico >= 0)
- [x] Sync: notificação de itens alterados (preço ou estoque mudou) via notifyOwner
- [x] PDV: paginação do catálogo — 60 por página, 38 páginas, filtros preservados na troca

## Bugs (v23)
- [x] Configurações PDV: painel de sync não aparecia (corrigido: PdvAuthProvider global causava cache null do pdvAuth.me, movido para dentro de cada rota PDV)

## Notificações Internas PDV (v24)
- [x] Tabela pdv_notifications no banco para armazenar notificações internas
- [x] Router pdvNotifications: list, markRead, markAllRead, deleteAll, unreadCount
- [x] pdvSync: salvar notificações no banco (removido notifyOwner do Manus)
- [x] PdvMain: botão Sync + ícone de sino no header (admin only), popup com prévia e confirmação
- [x] Página /pdv/notificacoes com lista, filtros por tipo, paginação, marcar como lida/apagar
- [x] Sidebar PDV: link para Notificações com badge contador de não lidas (atualiza a cada 30s)

## Bugs (v25)
- [x] Login PDV: primeiro login não redireciona — corrigido: await refetch() antes do navigate() no PdvLogin
- [x] React error #310: hooks condicionais no PdvLayout — corrigido: trpc.pdvNotifications.unreadCount movido para antes dos returns condicionais

## Bugs (v26)
- [x] PDV catálogo: erro "Incorrect arguments to LIMIT" — corrigido: Math.floor + fallback no backend (pdvProducts.ts) e proteção Number.isFinite no frontend (PdvMain.tsx)

## Bugs (v27)
- [x] PDV /notificacoes: erro "Incorrect arguments to LIMIT" — corrigido: LIMIT/OFFSET interpolados como inteiros seguros em pdvNotifications.ts (mysql2 não aceita LIMIT ? com parâmetros)

## Melhorias (v28)
- [x] PDV catálogo: campos de nome do cliente e telefone removidos do cabeçalho

## Melhorias (v29)
- [x] PDV: seletor de canal (Balcão/WhatsApp) movido do header do catálogo para a tela de checkout (seção "Canal de Venda" antes dos Serviços Extras)

## Bugs (v30)
- [x] PDV mobile: paginação movida para fora do container de scroll (elemento fixo abaixo do grid), eliminando sobreposicão com o botão flutuante do carrinho

## Bugs (v31)
- [x] Busca multi-termo corrigida: PDV já incluía `descricao` (cor está nesse campo); catálogo público corrigido para incluir `description`, `subcategory` e `reference` com suporte a múltiplos termos

## Bugs (v32)
- [x] Sync PDV: corrigido — causa raiz era ausência de índice UNIQUE no campo `codigo`. Cada sync inseria duplicatas em vez de atualizar. Solução: removidas 2394 duplicatas, adicionado UNIQUE INDEX idx_codigo, preview corrigida para comparar todos os campos e exibir "Já atualizados" quando não há mudanças

## Melhorias (v33)
- [x] PDV cancelamento: ao cancelar pedido, estoque devolvido automaticamente; ao reativar pedido cancelado, estoque descontado novamente

## Melhorias (v34)
- [x] PDV checkout: campos de nome e telefone do cliente adicionados na seção "Dados do Cliente" (após Canal de Venda), opcionais
- [x] PDV banco: clienteNome e clienteTelefone já existiam na tabela pdv_orders e são salvos corretamente

## Bugs (v35)
- [x] PDV histórico: corrigido — cancelMutation agora usa pdvOrders.updateStatus com status "CANCELADO" (procedure cancel não existe)

## Correções (v36)
- [x] Nome da loja corrigido de "Jumera" para "Jurema" em todo o sistema: site, admin, PDV, mensagens WhatsApp, title, meta tags (17 arquivos atualizados)

## Melhorias (v37)
- [x] PDV: senha da Vanessa alterada para vanessa@adm (hash SHA-256 + salt correto)
- [x] PDV: login case-insensitive — username normalizado com trim().toLowerCase() + LOWER() na query SQL; novos usuários já salvos em lowercase

## Melhorias (v38)
- [x] PDV redesign: identidade visual trocada de vermelho para verde gramado (#16a34a / green-700) em todos os 10 componentes PDV (PdvLayout, PdvLogin, PdvMain, PdvCheckout, PdvDashboard, PdvHistorico, PdvConfig, PdvComissoes, PdvNotificacoes, PdvVendedores, PdvConfiguracoes)

## Bugs (v39)
- [x] Admin login: senha redefinida para jurema@adm (hash bcrypt correto atualizado no banco)
- [x] AdminPanel: setState durante render corrigido — navigate() substituído por <Redirect to="/admin/login" /> (wouter)

## Bugs (v40)
- [x] Admin login: redirecionamento corrigido — utils.adminAuth.me.fetch() aguardado antes do navigate("/admin") para garantir que o estado de auth esteja atualizado

## Bugs (v41)
- [x] Admin login: corrigido definitivamente — token JWT salvo no localStorage após login e enviado como header Authorization em todas as requisições tRPC (resolve problema de cookies não persistidos em produção)

## Melhorias (v42)
- [x] PDV: senha da Vanessa alterada para jurema@123 (hash SHA-256 + salt atualizado no banco)

## Bugs (v43)
- [x] Sync PDV: loop infinito de "itens desatualizados" corrigido — causa raiz: 151 códigos duplicados na planilha (806 linhas → 655 únicos). A deduplicação já estava implementada no código (soma estoques, mantém maior preço, isActive=1 se qualquer duplicata ativa), mas o banco ainda tinha dados da sync anterior (sem deduplicação). Após executar nova sync, a preview mostra 0 novos e 0 alterados. Testes vitest adicionados (14/14 passando).

## Melhorias PDV (v44) — Demandas da Vanessa

### 1. Comissão por Peça + Privacidade
- [x] Relatório de comissões: contar por quantidade de PEÇAS vendidas (não por pedido)
- [x] Vendedor comum só vê suas próprias vendas/comissões (tela "Minhas Comissões")

### 2. Produto "Sofia" (Terceirizado)
- [x] Toggle "Venda Sofia" no checkout PDV (marca pedido como isSofia=1)
- [x] Produto Sofia NÃO entra na comissão dos vendedores (excluído nas queries)
- [x] Dashboard separado /pdv/sofia: vendas diárias, por vendedor, com cálculo de reembolso
- [x] Reembolso: valor da venda menos comissão da loja (configurável, padrão R$10/peça)
- [x] Configuração da comissão da loja por peça Sofia (tabela pdv_sofia_config)

### 3. Desconto em Folha
- [x] Tabela pdv_desconto_folha: registrar mercadorias retiradas por funcionários
- [x] Página /pdv/desconto-folha: saldo pendente por funcionário, lista detalhada
- [x] Botão "Quitar Tudo" por funcionário (para o sábado)
- [x] Forma de pagamento DESCONTO_FOLHA no checkout cria registro automático
- [x] Admin pode registrar descontos manualmente + quitar individualmente

### Testes v44
- [x] 12 testes vitest para schema, CRUD e lógica de comissão por peça (94/94 total)

## Melhorias PDV (v45)

### 1. Relatório PDF Exportável
- [x] Endpoint backend pdvRelatorio.getData com dados de comissões, Sofia e descontos em folha
- [x] Período configurável (data início/fim)
- [x] Seções configuráveis: incluir/excluir Comissões, Sofia, Descontos
- [x] Página /pdv/relatorio na sidebar (admin only) com botão "Imprimir / PDF"
- [x] Layout do PDF profissional com tabelas, totais e cores por seção
- [x] Taxa de comissão configurável (R$/peça) no formulário

### 2. Histórico de Quitações
- [x] Registrar data (quitadoEm), valor e quem quitou (quitadoPor) cada desconto em folha
- [x] Aba "Histórico de Quitações" na página de Desconto em Folha com paginação
- [x] Histórico também incluído no relatório PDF (seção Descontos)
- [x] 8 testes vitest para relatório e histórico (102/102 total)

## Bugs (v46)
- [x] Cards de vendedores excluídos/inativos removidos do dashboard da área vendedores (filtro isActive no frontend)

## Melhorias PDV (v47)

### 1. Sofia por Item (não por pedido)
- [x] Coluna isSofia adicionada na tabela pdv_order_items
- [x] Botão "Sofia" individual por item no resumo do checkout (tag roxa)
- [x] Toggle geral de Sofia removido do pedido
- [x] Queries de comissões refatoradas para excluir itens Sofia (não pedidos inteiros)
- [x] Dashboard Sofia refatorado para contar por itens Sofia
- [x] Relatório PDF atualizado para nova lógica por item

### 2. Desconto em Folha Automático
- [x] Quando forma de pagamento = DESCONTO_FOLHA, registro automático criado na tabela pdv_desconto_folha
- [x] Lógica funciona automaticamente no pdvOrders.create

### 3. Configurações Centralizadas
- [x] Aba "Comissões" em /pdv/configuracoes para editar R$/peça
- [x] Aba "Metas" para editar Bronze, Prata, Ouro, Meta Loja
- [x] Aba "Sofia" para editar comissão da loja por peça
- [x] Aba "Geral" com nome da loja, WhatsApp, taxas, mínimo atacado
- [x] Aba "Sincronização" para sync Google Sheets
- [x] 9 testes vitest v47 + 111/111 total passando

## Identidade Visual (v48)
- [x] Paleta de cores alterada de vermelho/preto para verde/preto (futebol)
- [x] CSS global (index.css) atualizado com nova paleta verde oklch(0.55 0.18 145)
- [x] 19 arquivos de componentes e páginas atualizados (#C8102E -> #1B8C3D)
- [x] Consistência visual mantida em todo o site (loja + PDV)
- [x] Scrollbar, animações e hover effects atualizados para verde
- [x] 111/111 testes passando

## Comissão por Peça (v49)
- [x] Valor padrão R$0,50/peça configurado no banco (pdv_config.comissao_peca = 0.50)
- [x] Coluna comissaoUnitaria adicionada em pdv_order_items (registra valor vigente no momento da venda)
- [x] Vendas já feitas NÃO são retroativas (cada item guarda o valor da época)
- [x] Itens Sofia registram comissaoUnitaria = 0 (não geram comissão)
- [x] Alteração de comissão exclusiva do admin via Configurações > Comissões
- [x] Campo de taxa removido do painel do vendedor (PdvComissoes - SellerComissoes)
- [x] Admin vê banner informativo com taxa atual + link para Configurações
- [x] 111/111 testes passando

## Bugs (v50)
- [x] Checkout PDV: redirecionamento para WhatsApp removido — canal WHATSAPP é apenas indicativo, pedido finaliza dentro do sistema com botão único "Finalizar Venda"

## Reimportação de Produtos (v51)
- [x] Apagados 1.462 produtos do banco (pdv_products)
- [x] Colunas linha/modelo/tipo alteradas de ENUM para VARCHAR (aceita qualquer valor da planilha)
- [x] Reimportados 657 produtos únicos da planilha original (808 linhas, 151 duplicatas somadas)
- [x] Nova planilha (ID: 1SGUr5Sh...) configurada no pdvSync.ts (aba PRODUTOS!A2:O2000)
- [x] Banco agora tem 657 produtos | 641 com estoque | 657 ativos

## Integração Google Sheets Bidirecional (v52)

### 1. Planilha PRODUTOS ↔ Sistema (bidirecional)
- [x] Toda vez que a Vanessa adiciona um produto na aba PRODUTOS, o sistema detecta e adiciona no banco (via webhook Apps Script)
- [x] Toda vez que uma venda é realizada, o sistema deduz o estoque na aba PRODUTOS da planilha (pdvSheetsWriter.updateProductStockInSheet)

### 2. Planilha PEDIDOS ← Sistema (escrita automática)
- [x] Ao finalizar pedido, gravar linha completa na aba PEDIDOS da planilha (pdvSheetsWriter.appendOrderToSheet)
- [x] 20 colunas: pedido_id, data, vendedor, canal, cliente, telefone, varejo, atacado, regime, extra, valor_adicional, total_sem_taxa, forma_pagamento, taxa, total_com_taxa, pendente, justificativa, modalidade, qtd_itens, comissao

### 3. Novos campos no sistema de pedidos
- [x] Toggle "Valor Pendente" no checkout PDV com visual amarelo e valor manual
- [x] Campo "Justificativa" obrigatório quando Pendente ativo
- [x] Status PAGO/PENDENTE calculado e gravado no banco e na planilha
- [x] Banco já tinha colunas totalPendente, justificativa, status em pdv_orders

### 4. Apps Script (Planilha → Sistema em tempo real)
- [x] Código Apps Script gerado para instalar na planilha da Vanessa
- [x] Script detecta nova linha em PRODUTOS e faz POST para o webhook do sistema
- [x] Endpoint POST /api/sheets-webhook no servidor recebe e processa o novo produto
- [x] 12 testes vitest v52 + 123/123 total passando
## Aba PEDIDOS_ITENS + Validação (v53)
- [ ] Analisar estrutura das 3 abas na planilha (PRODUTOS, PEDIDOS, PEDIDOS_ITENS)
- [ ] Validar campos do produto no sistema (linha, modelo, time, descrição, tamanho, tipo)
- [ ] Gravar PEDIDOS_ITENS automaticamente ao finalizar pedido (cod, produto desc completa, qtd, preços, modalidade, serviço extra, total)
- [ ] Criar descrição completa do produto: "Linha Modelo Time Descrição Tamanho Tipo"
- [ ] Validar as 3 abas com dados reais após implementação

## Integração Google Sheets — Aba pedidos_itens (v53)
- [x] appendOrderItemsToSheet: 13 colunas na ordem correta (pedido_id, cod, produto, quantidade, preco_atacado, preco_varejo, subtotal_atacado, subtotal_varejo, modalidade usada, preco_utilizado, serviço extra, valor serviço extra, TOTAL)
- [x] preco_atacado e preco_varejo são unitários (por peça), subtotais calculados separadamente
- [x] modalidade usada: "Atacado" ou "Varejo" conforme regime do pedido
- [x] serviço extra: tipo(s) do serviço; valor serviço extra: R$ proporcional por item
- [x] TOTAL: preco_utilizado + valor serviço extra proporcional
- [x] Integrado no pdvOrders.ts: busca codigo/precoAtacado/precoVarejo do banco e chama appendOrderItemsToSheet após gravar na aba PEDIDOS

## Revisão Integração Google Sheets (v54)
- [x] BUG 1: pdv_order_items não tem coluna `tipo` — campo não é salvo no banco nem enviado à planilha
- [x] BUG 2: CartItem no PdvCheckout não tem campo `tipo` — não é passado ao criar pedido
- [x] BUG 3: updateStatus ao cancelar não chama restoreProductStockInSheet (planilha fica desatualizada)
- [x] BUG 4: updateStatus ao reativar não chama updateProductStockInSheet (planilha fica desatualizada)
- [x] BUG 5: appendOrderToSheet — coluna R é "status" (Pendente/Pago/Cancelado) corretamente
- [x] BUG 6: appendProductToSheet — coluna J (precoVarejo) corrigida com .toFixed(2)
- [x] BUG 7: getNewProductsFromSheet e updateProductStockInSheet agora usam A2:O2000 (sem cabeçalho)
- [x] MELHORIA: pdvOrders.ts — busca campo `tipo` do produto ao montar itemsWithCodigo para a planilha

## Produtos Sofia — Comissão Personalizada + Aba SOFIA_ITENS (v55)
- [x] Alterar lógica: comissão da loja por produto Sofia é personalizada no momento da venda (campo no checkout)
- [x] Adicionar campo comissaoLojaSofia no pdv_order_items (banco + schema)
- [x] Ajustar frontend PdvCheckout para permitir inserir comissão por item Sofia
- [x] Calcular reembolso Sofia = valor total item - comissão da loja
- [x] Implementar appendSofiaItemsToSheet() no pdvSheetsWriter.ts para gravar na aba SOFIA_ITENS
- [x] Integrar gravação SOFIA_ITENS no fluxo de criação de pedido (pdvOrders.ts)
- [x] Validar que a contabilidade (dashboard Sofia) contabiliza corretamente com comissão personalizada
- [x] Atualizar relatório PDF (pdvRelatorio.ts) para usar comissão personalizada por item

## Separação Sofia do Fluxo Geral (v56)
- [x] Itens Sofia NÃO devem entrar na aba PEDIDOS geral da planilha
- [x] Itens Sofia NÃO devem entrar na aba pedidos_itens geral da planilha
- [x] Itens Sofia NÃO devem entrar no dashboard geral do PDV
- [x] Itens Sofia devem entrar APENAS na aba SOFIA_ITENS e no dashboard Sofia
- [x] Validar que comissões de vendedores excluem itens Sofia corretamente
- [x] Listagem geral de pedidos exclui pedidos 100% Sofia (isSofia=0)

## Exclusão de Produtos via Planilha (v57)
- [x] Implementar detecção de exclusão de linhas na planilha e desativação no sistema
- [x] Criar webhook webhookReconcile no backend (pdvSync) — compara códigos e desativa ausentes
- [x] Atualizar Apps Script v3.0 com função reconcileProducts (acionador a cada 5 min)

## Unificação de Produtos por Modelo (v58)
- [x] Criar endpoint pdvProducts.listGrouped no backend (agrupa por código base sem sufixo de tamanho)
- [x] Criar componente SizePickerModal (popup de seleção de tamanho/quantidade)
- [x] Refatorar catálogo PdvMain para usar cards agrupados e o SizePickerModal
- [x] Validar fluxo completo: catálogo → popup → carrinho → checkout → planilha

## Bug: Valores extras não somados ao total (v59)
- [x] Bug 1 — Sistema: totalAplicado enviado ao backend nao incluia totalServicos (extras ficavam de fora do total salvo no banco)
- [x] Bug 2 — Planilha PEDIDOS: coluna L (valor_sem_taxa) usava totalAplicado sem extras; coluna O (total_com_taxa) calculava certo mas L ficava errado
- [x] Bug 3 — Sistema: totalPendente calculado no frontend sem considerar os extras, causando pendente errado
- [x] Bug 4 — Planilha pedidos_itens: extra distribuido igualmente por item em vez de proporcionalmente ao valor de cada item
- [x] Corrigir: frontend envia totalGeral (totalAplicado + totalServicos) como totalAplicado ao backend
- [x] Corrigir: planilha PEDIDOS coluna L usa totalAplicado diretamente (ja inclui extras)
- [x] Corrigir: planilha pedidos_itens distribui extra proporcional ao valor do item
- [x] 14 novos testes vitest (154/154 total passando)

## Cancelamento: deletar linha da planilha (v60)
- [ ] Adicionar funcao deleteRowFromSheet (usa batchUpdate deleteRows — remove linha fisicamente sem deixar branco)
- [ ] Adicionar funcao deleteOrderFromSheet: localiza pedidoId na aba PEDIDOS e deleta a linha
- [ ] Adicionar funcao deleteOrderItemsFromSheet: localiza todas as linhas com pedidoId na aba pedidos_itens e deleta
- [ ] Adicionar funcao deleteSofiaItemsFromSheet: mesma logica para aba SOFIA_ITENS
- [ ] Integrar as funcoes no updateStatus ao cancelar pedido (pdvOrders.ts)
- [ ] Escrever testes para as novas funcoes

## Cancelamento: deletar linha da planilha (v60) — CONCLUIDO
- [x] Funcao deleteRowsFromSheet (batchUpdate deleteRows — remove linha fisicamente sem deixar branco)
- [x] Funcao deleteOrderFromSheet: localiza pedidoId na aba PEDIDOS e deleta a linha
- [x] Funcao deleteOrderItemsFromSheet: localiza todas as linhas com pedidoId na aba pedidos_itens e deleta
- [x] Funcao deleteSofiaItemsFromSheet: mesma logica para aba SOFIA_ITENS
- [x] Integrado no updateStatus ao cancelar pedido (pdvOrders.ts)
- [x] 13 novos testes vitest (167/167 total passando)

## Correções de cálculo e planilha (v61)
- [ ] Bug taxa frontend: label do campo de valor deve ser "Valor que o cliente paga (com taxa)" para debito/credito — o vendedor digita o valor da maquininha e o sistema calcula o liquido
- [ ] Bug comissao planilha: comissaoTotal calculado com comissaoUnitaria mas sem considerar itens Sofia (que tem comissao 0) — ja esta correto, verificar se o valor chega na coluna T
- [ ] Bug formatacao planilha: data como string (toLocaleString) em vez de formato que o Sheets reconhece como data
- [ ] Bug formatacao planilha: quantidade como numero (nao string) para o Sheets reconhecer como numero
- [ ] Bug formatacao planilha: status como texto formatado (Pago/Pendente/Cancelado) — ja esta correto
- [ ] Bug valor_sem_taxa (col L): totalAplicadoNormal nao inclui servicos extras — deve ser totalAplicadoNormal + extraValor
- [ ] Bug SOFIA_ITENS col M (valor total sem taxa): valorItemSemTaxa nao inclui extra proporcional — deve ser valorItemSemTaxa + extraProporcional
- [ ] Revisar logica de taxa: vendedor digita valor real (loja recebe) e sistema calcula maquininha — ou vendedor digita maquininha e sistema calcula liquido? Definir padrao unico

## Correções de cálculo e planilha (v61) — CONCLUIDO
- [x] Col L (valor_sem_taxa) = subtotalItens + extraValor (nao apenas subtotal)
- [x] Col O (total_com_taxa) = valorSemTaxa + taxaCartao
- [x] Col T (comissao) como numero (nao string), calculado corretamente excluindo Sofia
- [x] Data formatada como DD/MM/YYYY HH:MM (UTC-3 Brasilia) — Sheets reconhece como data
- [x] Quantidades e valores como numeros (nao strings) em todas as colunas
- [x] SOFIA_ITENS col M = valorItem + extraProporcional (nao apenas valorItem)
- [x] extraPorItem obsoleto removido do appendSofiaItemsToSheet
- [x] UI de pagamento: label claro, total a pagar visivel, preview de taxa sempre visivel para debito/credito
- [x] 23 novos testes vitest (190/190 total passando)

## Bug: Modal de resumo do pedido no histórico (v62)
- [ ] Subtotal mostra totalAplicado (que inclui extras) mas deveria mostrar só os itens separado dos extras
- [ ] Não mostra taxa de cartão no bloco de totais
- [ ] Não mostra total geral (itens + extras + taxa)
- [ ] Valor do pagamento mostra p.valor (valor real loja) mas deveria mostrar valorMaquininha para débito/crédito
- [ ] Linha "Total Pago" some quando totalPago == totalAplicado (mas com taxa eles diferem)

## Bug: Modal de resumo do pedido no histórico (v62) — CONCLUIDO
- [x] Subtotal mostra apenas os itens; extras aparecem em linha separada
- [x] Taxa de cartão aparece em linha separada com destaque laranja
- [x] Total Geral = itens + extras + taxa (linha em negrito)
- [x] Valor maquininha exibido em amarelo quando há taxa
- [x] Pagamentos: mostrar valor maquininha como principal, "loja recebe" como detalhe
- [x] Status CANCELADO com cor vermelha (antes estava verde por erro de CSS)

## Limpeza de pedidos e sincronização de estoque (v64)
- [x] Deletar todos os pedidos, itens e pagamentos do banco sem afetar estoque (16 pedidos, 63 itens, 16 pagamentos, 12 serviços)
- [x] Sincronizar estoque do banco com valores reais da planilha PRODUTOS (807 linhas → 660 produtos atualizados)

## Cadastro de produtos com sincronização (v65) — CONCLUÍDO
- [x] Analisar colunas reais da planilha PRODUTOS (15 colunas A-O)
- [x] Adicionar campos isSofia, fotoUrl, temporada, ptAtacado, ptVarejo ao schema pdv_products
- [x] Migration SQL aplicada com sucesso
- [x] Endpoint tRPC createBatch (admin): gera código por tamanho, suporte a preço customizado por tamanho
- [x] Endpoint tRPC uploadProductPhoto (S3): atualiza fotoUrl em cascata para todas as variantes do modelo
- [x] appendProductToSheet atualizado para incluir todos os 15 campos (foto, temporada, ptAtacado, ptVarejo)
- [x] Página PdvCadastroProdutos: seleção rápida de tamanhos, estoque por tamanho, preço customizado por tamanho, flag Sofia, campos avançados (código, foto, temporada, pontos)
- [x] Rota /pdv/cadastro-produtos adicionada ao App.tsx
- [x] Link "Cadastrar Produtos" adicionado ao menu admin do PdvLayout
- [x] 8 novos testes (198/198 total)

## v66 — Produtos Cadastrados + validação de código duplicado
- [x] Endpoint checkCodeExists: verificar se código base já existe no banco
- [x] Endpoint updateProduct: atualizar estoque/preço/ativo e sincronizar planilha
- [x] Aba "Produtos Cadastrados" com tabela paginada, busca e edição inline
- [x] Validação em tempo real de código duplicado no formulário de cadastro

## v68 — Deduplicação da planilha + Deletar produto
- [x] Script de deduplicação da aba PRODUTOS (mantém última ocorrência por código, deleta duplicatas)
- [x] Endpoint tRPC deleteProduct (admin): remove do banco e da planilha
- [x] Botão deletar com modal de confirmação na tela Produtos Cadastrados

## v69 — Integração PDV ↔ Site (catálogo unificado)
- [x] Adicionar campo pdvCodigoBase e pdvSynced na tabela products do site
- [x] Adicionar campo size como varchar livre na tabela product_stock do site (remover enum rígido)
- [x] Migration SQL aplicada
- [x] Endpoint importSiteProducts: limpar produtos do site e importar do PDV agrupado por modelo
- [x] Endpoint syncStockFromPdv: sincronizar estoque do PDV para o site
- [x] Endpoint uploadProductPhoto: upload S3 + sync fotoUrl no banco PDV + products do site
- [x] Endpoint updateSiteProduct: ativar/desativar, seção destaque, categoria
- [x] Endpoint listSiteProducts: listagem com filtros (busca, ativo, destaque, seção)
- [x] Endpoint getSiteStats: estatísticas do catálogo do site
- [x] Painel admin PDV /pdv/gestao-site: ativar/desativar, foto, destaque (3 seções), categoria
- [x] Link "Gestão Site" adicionado ao menu admin do PdvLayout
- [x] CartDrawer: mensagem WhatsApp atualizada com time, referência, tamanho e preço corretos
- [x] 198/198 testes passando, zero erros TypeScript

## v70 — Remoção de produtos antigos fictícios do site
- [x] Remover os 33 produtos antigos (pdvSynced=0, fictícios) do banco de dados e seus estoques
- [x] Corrigir importSiteProducts: clearExisting agora deleta TODOS os produtos (não apenas pdvSynced=1)
- [x] Corrigir botão "Importar" no PdvGestaoSite para usar clearExisting: true
- [x] Catálogo público agora está vazio até a próxima importação do PDV

## v71 — Sincronização automática PDV → Site (auto-sync)
- [ ] Adicionar campo isNewProduct (boolean, default true) na tabela products do site
- [ ] Migration SQL aplicada
- [ ] Auto-sync no createBatch (PDV): ao cadastrar produto, criar/atualizar entrada na tabela products com isNewProduct=true, isActive=false
- [ ] Auto-sync no syncFromSheet (planilha): ao importar novos produtos da planilha, criar entrada na tabela products com isNewProduct=true, isActive=false
- [ ] Badge "NOVO" na tabela da PdvGestaoSite para produtos com isNewProduct=true
- [ ] Ordenação: produtos novos aparecem primeiro na lista
- [ ] Badge some ao usuário editar (ativar/desativar, mudar seção, fazer upload de foto) — isNewProduct=false
- [ ] Testes e checkpoint

## v71 — Integração completa PDV ↔ Site (auto-sync bidirecional)
- [x] Badge NOVO na PdvGestaoSite (isNewProduct=true), produtos novos aparecem primeiro
- [x] Filtro "Novos" na Gestão do Site para ver apenas produtos novos
- [x] autoSyncProductToSite: implementado para createBatch e sync planilha
- [x] updateProduct (PDV): ao editar produto, atualizar nome/preço/estoque no site automaticamente
- [x] deleteProduct (PDV): ao excluir produto, desativar no catálogo do site automaticamente
- [x] Venda PDV: ao fechar pedido, deduzir estoque do catálogo do site automaticamente
- [x] listSiteProducts: campo isNewProduct no SELECT e filtro por isNewProduct
- [x] 198/198 testes passando

## v72 — Pedidos Sofia no histórico
- [x] Aba "Pedidos" adicionada na página PdvSofia com listagem completa
- [x] Pedidos 100% Sofia e pedidos mistos aparecem na aba Pedidos Sofia
- [x] Cancelamento de pedidos Sofia funciona com confirmação e devolução de estoque
- [x] Pedidos mistos (isSofia=0 com itens Sofia) já aparecem no histórico geral (isSofia=0)
- [x] 198/198 testes passando

## v73 — Unificação do fluxo de foto de produto
- [x] Remover campo de foto do Cadastro de Produtos (PDV) — substituir por aviso com link para Gestão do Site
- [x] Avatar minúsculo (24px) com fotoUrl na listagem de produtos do PDV (desktop)
- [x] Lightbox ao clicar no avatar: abre foto em tamanho grande, fecha com ESC, botão X ou clique fora
- [x] Componente reutilizável ProductPhotoLightbox + ProductPhotoAvatar criado
- [x] Upload de foto unificado apenas na Gestão do Site (sincroniza PDV + site automaticamente)
- [x] 198/198 testes passando, zero erros TypeScript

## v74 — Correções Gestão do Site
- [x] Adicionar PdvLayout (menu lateral/barra) na página PdvGestaoSite
- [x] Corrigir bug crítico: pdvSiteSync usava adminProcedure (Manus OAuth) em vez de requirePdvAdmin (cookie PDV) — causava lista vazia em produção
- [x] Migrar todos os 6 endpoints do pdvSiteSync para publicProcedure + requirePdvAdmin(ctx)
- [x] 198/198 testes passando, zero erros TypeScript

## v75 — Correção do campo de pesquisa na Gestão do Site
- [x] Adicionar debounce 500ms no campo de busca (igual ao PDV)
- [x] Separar searchInput (visual) de search (query) — Enter ou espera 500ms para confirmar
- [x] Botão × para limpar o campo rapidamente
- [x] Backend: buscar também por pdvCodigoBase (código PDV)
- [x] 198/198 testes passando, zero erros TypeScript

## v78 — Mini foto (avatar) no PDV completo
- [x] fotoUrl adicionado ao listGrouped do backend (SELECT + propagado no groupMap)
- [x] fotoUrl adicionado à interface GroupedProduct (SizePickerModal)
- [x] Avatar 28px nos cards de produto do PdvMain (tela de venda) com lightbox ao clicar
- [x] Foto 56px exibida no header do SizePickerModal (modal de seleção de tamanho)
- [x] Avatar 28px no layout mobile do PdvCadastroProdutos (aba Produtos Cadastrados)
- [x] 198/198 testes passando, zero erros TypeScript

## v80 — Fluxo de Caixa na Planilha Google Sheets
- [x] Criar aba FLUXO_CAIXA na planilha (ID | DATA | TIPO | DESCRIÇÃO | VALOR | RESPONSÁVEL | SALDO ACUMULADO)
- [x] Criar aba VENDAS_CAIXA na planilha (ID PEDIDO | DATA | VENDEDOR | CANAL | CLIENTE | REGIME | TOTAL | FORMA PAGAMENTO | STATUS | QTD ITENS)
- [x] Sync automático: registrar suprimento/sangria no sistema → grava na planilha (fire-and-forget)
- [x] Sync automático: fechar pedido no sistema → grava na aba VENDAS_CAIXA
- [x] Endpoint syncCashFlowToSheet: exportar todo o histórico de suprimentos/sangrias para FLUXO_CAIXA
- [x] Endpoint syncSalesToSheet: exportar todos os pedidos para VENDAS_CAIXA
- [x] Endpoint syncCashFlowFromSheet: importar movimentações novas da planilha para o banco
- [x] Botões "Exportar Planilha", "Exportar Vendas" e "Importar Planilha" no painel de Caixa do PDV
- [x] Cor da Sangria corrigida para vermelho no painel de Caixa
- [x] 198/198 testes passando, zero erros TypeScript

## v81 — Limpeza do histórico e testes de integração planilha
- [x] Limpar tabelas pdv_order_items, pdv_order_payments, pdv_order_services, pdv_orders do banco
- [x] Limpar tabela pdv_cash_flow do banco
- [x] Limpar abas FLUXO_CAIXA e VENDAS_CAIXA na planilha Google Sheets (mantém cabeçalho)
- [x] 7 testes de integração criados em server/v81cashflow-sheets.test.ts
- [x] Testa: gravar suprimento, gravar sangria, ler da planilha, exportar em lote, sobrescrever, exportar vendas, limpar
- [x] 205/205 testes passando, zero erros TypeScript

## v82 — Metas por Pontuação (PT_ATAC / PT_VAR)
- [x] Adicionar campos ptAtacado e ptVarejo na tabela pdv_order_items (schema + migration 0012)
- [x] Gravar ptAtacado/ptVarejo do produto no momento de fechar o pedido (fecharPedido)
- [x] Backend: calcular pontuacao por vendedor = SUM(CASE WHEN regime='ATACADO' THEN ptAtacado*qty ELSE ptVarejo*qty END)
- [x] Frontend: pontuacaoLoja = soma de pontuação de todos os vendedores
- [x] Frontend: helper formatPontos exibe "1.500 PT" em vez de "R$ 1.500"
- [x] Frontend: progress bars de metas usam pontos (PT) em vez de R$
- [x] Metas Bronze/Prata/Ouro/Meta Loja exibem valores em PT
- [x] 205/205 testes passando, zero erros TypeScript

## v83 — Ajustes de Regras de Negócio
- [x] Atacado <6 peças: exibir aviso laranja (não bloquear), campo Observações obrigatório com borda laranja
- [x] Atacado <6 peças: justificativa gravada no campo observacoes do pedido (já existia no banco)
- [x] Atacado <6 peças: nova coluna "JUSTIFICATIVA <6" na planilha VENDAS_CAIXA (coluna K)
- [x] Nome do cliente obrigatório no pedido (validação frontend + backend com z.string().min(1))
- [x] Correio: valor mínimo de R$ 45 (validação no addService do frontend)
- [x] 206/206 testes passando, zero erros TypeScript

## v84 — Correio mínimo backend + Justificativa <6 na aba PEDIDOS
- [x] Backend: validar Correio mínimo R$ 45 no schema Zod (OrderServiceSchema.refine)
- [x] Aba PEDIDOS: coluna V "JUSTIFICATIVA <6" adicionada (cabeçalho V1 atualizado na planilha)
- [x] appendOrderToSheet: passa justificativaAtacado na coluna V quando regime=ATACADO e peças<6
- [x] 206/206 testes passando, zero erros TypeScript

## v85 — Serviços extras como linha dedicada em pedidos_itens + Correio no update
- [x] Endpoint updateStatus não recebe services (apenas status); validação Correio já coberta no create
- [x] appendOrderItemsToSheet: removido rateio proporcional de extras entre itens
- [x] appendOrderItemsToSheet: cada serviço extra gera linha dedicada (SKU=tipo, qtd=1, precoAtacado=precoVarejo=valor, modalidade=tipo, total=valor)
- [x] Coluna J "preco_utilizado" removida; nova estrutura 12 colunas (A-L)
- [x] Cabeçalhos da aba pedidos_itens atualizados na planilha Google Sheets
- [x] 206/206 testes passando, zero erros TypeScript

## v86 — Comissão por item, sangria vermelha, metas dos funcionários
- [x] appendOrderItemsToSheet: coluna M (comissao = comissaoUnitaria x quantidade) adicionada
- [x] Cabeçalho M1 "comissao" atualizado na planilha pedidos_itens (13 células)
- [x] Dashboard financeiro: linhas de sangria com fundo vermelho escuro + texto vermelho
- [x] Planilha FLUXO_CAIXA: sangria com formatação vermelha via batchUpdate repeatCell
- [x] Endpoint getMyProgress no pdvDashboard: pontuacao do mes + metas para o vendedor logado
- [x] Barra de progresso de metas no header do PdvMain (apenas para vendedores nao-admin)
- [x] Exibe: pontuacao atual em PT, barra colorida, texto "X PT para Bronze/Prata/Ouro", marcadores de meta
- [x] 206/206 testes passando, zero erros TypeScript

## v87 — Banner promoções, sem boleto, comissão → bônus
- [x] Site: banner de frete grátis removido; banner de promoções R$35 já presente (link para tailandesa-promocao)
- [x] Site: Boleto removido do Footer.tsx (dois locais)
- [x] PDV: comissão → bônus em PdvComissoes, PdvConfiguracoes, PdvLayout, PdvRelatorio, PdvSofia, PdvCheckout
- [x] Planilha: coluna M mantida como "comissao" (campo técnico interno, não visível ao usuário)
- [x] 206/206 testes passando, zero erros TypeScript

## v88 — CEP obrigatório para Correio
- [x] PdvCheckout: campo CEP com máscara 99999-999 e borda laranja ao selecionar CORREIO
- [x] Validação CEP no frontend (8 dígitos) e no backend (Zod refine)
- [x] Coluna cep na tabela pdv_order_services (migration 0013 aplicada)
- [x] CEP exibido na lista de serviços (laranja) e na mensagem WhatsApp
- [x] appendOrderToSheet: coluna G "cep" na aba PEDIDOS (ao lado do telefone F)
- [x] Cabeçalhos da aba PEDIDOS atualizados (A:W = 23 colunas) via API Google Sheets
- [x] 206/206 testes passando, zero erros TypeScript
