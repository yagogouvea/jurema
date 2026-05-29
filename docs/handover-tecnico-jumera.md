# Jumera Sport — Documentação Técnica de Handover

> **Versão:** Maio 2026 | **Baseado em:** código-fonte do repositório `yagogouvea/jurema`, branch `railway`  
> **Produção:** `https://juremasports2.com.br`  
> Esta cópia no workspace foi **revisada** para refletir `CONVERT_TZ` no dashboard, variável `PDV_DASHBOARD_PAYMENTS_EXCLUDE_SOFIA` e remoção de credenciais fixas do texto. Onde há inferência, está marcado como **(inferido)**.

---

## 1. Visão Geral

### Stack

| Camada | Tecnologia |
|---|---|
| **Runtime** | Node.js 20 (obrigatório — `.nvmrc` e `engines` no `package.json`) |
| **Framework servidor** | Express 4 + tRPC 11 (adaptador `@trpc/server/adapters/express`) |
| **Frontend** | React 19 + Vite 5 + Tailwind CSS 4 + shadcn/ui |
| **ORM** | Drizzle ORM com dialeto `mysqlTable` |
| **Banco** | MySQL (Railway) — migrado de TiDB/MySQL (Manus) |
| **Build frontend** | `vite build` |
| **Build backend** | `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` |
| **Gerenciador de pacotes** | pnpm |
| **Validação** | Zod (em todas as procedures tRPC) |
| **Auth PDV** | JWT próprio com `jose` (HS256, 8h de validade) |
| **IA WhatsApp** | OpenAI API (modelo padrão do helper `invokeLLM`) |
| **Transcrição de áudio** | Whisper via helper `transcribeAudio` |
| **Storage de mídia** | S3 (helper `storagePut`) |
| **Planilha** | Google Sheets API v4 (Service Account + API Key) |
| **WhatsApp** | wa-bridge externo (`https://wa-bridge-production-c9a2.up.railway.app`) |

### Como rodar localmente

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar variáveis de ambiente (ver Seção 3)
cp .env.example .env   # (inferido — não há .env.example; criar manualmente)

# 3. Iniciar em modo desenvolvimento
pnpm dev
# Servidor sobe em http://localhost:3000
# Frontend servido pelo Vite HMR na mesma porta via proxy
```

### Entrypoints

| Componente | Arquivo |
|---|---|
| **Servidor** | `server/_core/index.ts` |
| **Routers tRPC** | `server/routers.ts` |
| **Frontend** | `client/src/main.tsx` |
| **App React** | `client/src/App.tsx` |

---

## 2. Ambientes e Deploy

### URLs

| Ambiente | URL |
|---|---|
| **Produção (canônico)** | `https://juremasports2.com.br` / `https://www.juremasports2.com.br` |
| **Produção (Railway)** | `https://jurema-production.up.railway.app` (host direto; preferir domínio customizado em integrações) |
| **Domínio Manus** | `jumersport-9bcf3hwt.manus.space` |
| **Dev local** | `http://localhost:3000` |
| **Staging** | não encontrado |

### Railway — configuração (`railway.json`)

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && pnpm build"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

O `pnpm start` executa `NODE_ENV=production node dist/index.js`. A porta é lida de `process.env.PORT` (injetada pelo Railway); se ausente, o servidor tenta a porta 3000 e incrementa até encontrar uma livre.

### Domínios e HTTPS

HTTPS é gerenciado pelo Railway (TLS automático). O cookie `pdv_token` usa `secure: true` quando `NODE_ENV=production` (`server/_core/cookies.ts`).

---

## 3. Variáveis de Ambiente

Todas as variáveis são lidas via `process.env`. Nenhuma deve ser commitada em `.env`.

| Variável | Obrigatória | Segredo | Valor padrão (hardcoded) | Finalidade |
|---|---|---|---|---|
| `DATABASE_URL` | Sim | Sim | — | String de conexão MySQL com SSL |
| `JWT_SECRET` | Sim | Sim | `"pdv_jwt_secret_fallback"` | Assinar/verificar tokens JWT PDV |
| `NODE_ENV` | Sim | Não | `"development"` | Controla cookies, Vite vs estático |
| `PORT` | Não | Não | `3000` | Porta HTTP do servidor |
| `OPENAI_API_KEY` | Sim (IA WA) | Sim | — | API OpenAI para Sofia e transcrição |
| `OPENAI_BASE_URL` | Não | Não | URL padrão OpenAI | Substituir endpoint OpenAI (ex: Azure) |
| `GOOGLE_SHEETS_API_KEY` | Sim | Sim | — | Leitura de planilhas via API Key pública |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sim | Sim | — | Escrita na planilha via Service Account |
| `WA_BRIDGE_URL` | Sim | Não | — | URL base do wa-bridge |
| `WA_BRIDGE_API_KEY` | Sim | Sim | — | Chave de autenticação do wa-bridge |
| `SHEETS_WEBHOOK_SECRET` | Não | Sim | `"jurema-pdv-2024"` | Autenticar chamadas de webhook da planilha |
| `PDV_DASHBOARD_PAYMENTS_EXCLUDE_SOFIA` | Não | Não | *(ausente = não excluir)* | Se `"1"`, o gráfico de formas de pagamento no dashboard **exclui** pedidos `isSofia = 1` (comportamento antigo). Sem a variável, **inclui** todos os pagamentos (reflete caixa). |
| `STORAGE_TYPE` | Não | Não | `"manus"` | `"manus"` ou `"s3"` para storage de mídia |
| `OAUTH_SERVER_URL` | Não | Não | — | URL do servidor OAuth Manus (legado) |
| `VITE_APP_ID` | Não | Não | — | ID do app Manus OAuth (legado) |
| `OWNER_OPEN_ID` | Não | Não | — | ID do proprietário Manus (legado) |

**Variáveis que NÃO devem ser logadas:** `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `WA_BRIDGE_API_KEY`, `GOOGLE_SHEETS_API_KEY`.

---

## 4. Banco de Dados (MySQL)

### Acesso ao MySQL (Railway)

Use apenas a **`DATABASE_URL`** do painel Railway (ou string equivalente). **Não commite** host, porta, usuário ou senha neste repositório. Conexão típica usa SSL com `rejectUnauthorized: false` fora de `localhost`.

**Nota:** detalhes de host interno/externo mudam se o serviço for recriado; a fonte de verdade é sempre o Railway.

A conexão é criada via `mysql2/promise` com SSL automático quando a URL não aponta para `localhost` ou `127.0.0.1` (`server/db-connect.ts`). Cada request cria e fecha sua própria conexão (sem pool persistente).

### Tabelas PDV (prefixo `pdv_`)

| Tabela | PK | Descrição |
|---|---|---|
| `pdv_sellers` | `id` (auto) | Vendedores/atendentes do PDV |
| `pdv_products` | `id` (auto) | Catálogo de produtos do PDV |
| `pdv_orders` | `id` (auto) | Pedidos do PDV |
| `pdv_order_items` | `id` (auto) | Itens de cada pedido |
| `pdv_order_payments` | `id` (auto) | Pagamentos de cada pedido |
| `pdv_order_services` | `id` (auto) | Serviços extras (correio, carreto, caixinha) |
| `pdv_cash_flow` | `id` (auto) | Suprimentos e sangrias do caixa |
| `pdv_config` | `key` (único) | Configurações chave-valor do PDV |
| `pdv_goals` | `id` (auto) | Metas de vendas (BRONZE, PRATA, OURO) |
| `pdv_desconto_folha` | `id` (auto) | Descontos em folha de funcionários |
| `pdv_sofia_config` | `id` (auto) | Configuração da comissão Sofia da loja |
| `pdv_notifications` | `id` (auto) | Notificações internas do PDV |

### Tabelas WhatsApp (prefixo `wa_`)

| Tabela | PK | Descrição |
|---|---|---|
| `wa_instances` | `id` (auto) | Instâncias WhatsApp (uma por número) |
| `wa_conversations` | `id` (auto) | Conversas por contato/instância |
| `wa_messages` | `id` (auto) | Mensagens de cada conversa |
| `wa_ai_config` | `id` (auto) | Configuração da IA por instância |
| `wa_quick_replies` | `id` (auto) | Respostas rápidas (templates) |
| `wa_ai_logs` | `id` (auto) | Log de ações da IA (auditoria) |

### Campos críticos — `pdv_orders`

| Campo | Tipo | Observação |
|---|---|---|
| `pedidoId` | `varchar(50)` UNIQUE | Formato `PED-{timestamp}` |
| `sellerId` | `int` | FK lógica → `pdv_sellers.id` |
| `canal` | ENUM `BALCAO\|WHATSAPP` | Canal de venda |
| `regime` | ENUM `ATACADO\|VAREJO` | Modalidade de preço |
| `isSofia` | `boolean` | `true` somente se **todos** os itens forem Sofia |
| `status` | ENUM `PAGO\|PENDENTE\|CANCELADO` | Status do pedido |
| `totalAplicado` | `decimal(10,2)` | Total cobrado (sem taxa de cartão) |
| `totalPago` | `decimal(10,2)` | Valor efetivamente pago |
| `totalPendente` | `decimal(10,2)` | Saldo em aberto |
| `createdAt` | `timestamp` | Gravado em **UTC** pelo MySQL |

### Campos críticos — `pdv_order_items`

| Campo | Tipo | Observação |
|---|---|---|
| `productId` | `int` nullable | FK lógica → `pdv_products.id`; `null` para itens digitados livres |
| `isSofia` | `boolean` | Controle por item (independente do pedido) |
| `comissaoUnitaria` | `decimal(10,2)` | Snapshot da taxa vigente no momento da venda |
| `comissaoLojaSofia` | `decimal(10,2)` nullable | Comissão personalizada da loja por item Sofia |
| `ptAtacado` | `decimal(10,2)` | Snapshot dos pontos atacado do produto |
| `ptVarejo` | `decimal(10,2)` | Snapshot dos pontos varejo do produto |

### Campos críticos — `pdv_products`

| Campo | Tipo | Observação |
|---|---|---|
| `codigo` | `varchar(100)` nullable | SKU; gerado automaticamente se vazio na planilha |
| `ptAtacado` | `decimal(10,2)` | Pontos de atacado do produto |
| `ptVarejo` | `decimal(10,2)` | Pontos de varejo do produto |
| `custo` | `decimal(10,2)` | Custo do produto (para cálculo de margem) |
| `isSofia` | `boolean` | Produto pertence ao catálogo Sofia |

### Chaves conhecidas de `pdv_config`

| Chave | Valor padrão | Descrição |
|---|---|---|
| `comissao_peca` | `0.50` | Bônus em R$ por peça vendida (não-Sofia) |
| `taxa_credito` | (configurável) | Taxa percentual para pagamento em crédito |
| `taxa_debito` | (configurável) | Taxa percentual para pagamento em débito |
| `min_atacado` | (configurável) | Quantidade mínima de peças para atacado |

### Timezone

`createdAt` é gravado em **UTC** pelo MySQL (na prática do deploy, timestamps devem representar o instante correto da venda).

No **dashboard PDV** e em vários relatórios, os filtros por dia e os agrupamentos “por dia” usam **horário de Brasília** via SQL:

`DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'))` e, onde necessário, `DATE_FORMAT(CONVERT_TZ(...), '%Y-%m-%d')` para o frontend receber datas estáveis (evita `Invalid Date`).

A escrita na **planilha** ainda pode aplicar ajustes de exibição em `pdvSheetsWriter.ts` (formato BR para humanos). **Não** assuma que todo o sistema usa só `DATE(createdAt)` em UTC — consulte `server/routers/pdvDashboard.ts`, `pdvComissoes.ts`, `pdvOrders.ts`, `pdvSofia.ts`, `pdvRelatorio.ts`.

## 5. Autenticação PDV

### Fluxo de login

1. Frontend chama `trpc.pdvAuth.login.useMutation({ username, password })`.
2. Servidor busca o vendedor no banco, compara `SHA-256(password + "pdv_salt_jumera")` com `passwordHash`.
3. Se válido, gera JWT HS256 com payload `{ sellerId, name, username, role }` e validade de 8h.
4. JWT é retornado no body **e** gravado como cookie `pdv_token` (HttpOnly, Secure em produção, SameSite=Lax).
5. Frontend salva o token no `localStorage` como `pdv_token`.
6. Todas as chamadas tRPC enviam o token via header `Authorization: Bearer <token>` (`client/src/main.tsx`).

### `verifyPdvToken` — `server/routers/pdvAuth.ts`

Lê o cookie `pdv_token` da requisição e verifica a assinatura JWT. Retorna `{ sellerId, name, username, role }` ou `null`.

Para o módulo WhatsApp, `requireWaAccess` aceita token via **cookie** OU via **header Authorization** (necessário em produção por restrições SameSite).

### Roles

| Role | Acesso |
|---|---|
| `seller` | Criar pedidos, ver próprio histórico, ver próprias comissões |
| `admin` | Tudo do seller + dashboard, fluxo de caixa, configurações, relatórios, sincronização, vendedores |

### Rotas públicas (sem autenticação)

| Endpoint | Motivo |
|---|---|
| `GET /api/health` | Healthcheck Railway |
| `POST /api/scheduled/sync-products` | Cron externo (cron-job.org) |
| `POST /api/trpc/wa.receiveWebhook` | wa-bridge não tem auth PDV |
| `POST /api/trpc/pdvSync.webhookNewProduct` | Apps Script usa `secret` próprio |
| `POST /api/trpc/pdvSync.webhookUpdateProduct` | Apps Script usa `secret` próprio |
| `POST /api/trpc/pdvSync.webhookReconcile` | Apps Script usa `secret` próprio |
| `POST /api/trpc/pdvAuth.login` | Login público por definição |
| `GET /api/trpc/pdvAuth.me` | Verifica sessão sem bloquear |

---

## 6. tRPC / API HTTP

### Routers registrados (`server/routers.ts`)

| Router | Prefixo tRPC | Arquivo |
|---|---|---|
| Auth PDV | `pdvAuth.*` | `server/routers/pdvAuth.ts` |
| Produtos PDV | `pdvProducts.*` | `server/routers/pdvProducts.ts` |
| Pedidos PDV | `pdvOrders.*` | `server/routers/pdvOrders.ts` |
| Dashboard PDV | `pdvDashboard.*` | `server/routers/pdvDashboard.ts` |
| Vendedores PDV | `pdvSellers.*` | `server/routers/pdvSellers.ts` |
| Configurações PDV | `pdvConfig.*` | `server/routers/pdvConfig.ts` |
| Comissões/Bônus | `pdvComissoes.*` | `server/routers/pdvComissoes.ts` |
| Sincronização planilha | `pdvSync.*` | `server/routers/pdvSync.ts` |
| Notificações | `pdvNotifications.*` | `server/routers/pdvNotifications.ts` |
| Sofia | `pdvSofia.*` | `server/routers/pdvSofia.ts` |
| Desconto em folha | `pdvDescontoFolha.*` | `server/routers/pdvDescontoFolha.ts` |
| Relatório PDF | `pdvRelatorio.*` | `server/routers/pdvRelatorio.ts` |
| Sync site (e-commerce) | `pdvSiteSync.*` | `server/routers/pdvSiteSync.ts` |
| WhatsApp IA | `wa.*` | `server/routers/waRouter.ts` |
| Auth cliente (e-commerce) | `customerAuth.*` | `server/routers/customerAuth.ts` |
| Auth admin (e-commerce) | `adminAuth.*` | `server/routers/adminAuth.ts` |

### Endpoints REST além do tRPC

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/health` | Nenhuma | Healthcheck: retorna `{ ok: true }` |
| `POST` | `/api/scheduled/sync-products` | Nenhuma | Dispara AutoSync da planilha → banco |
| `POST` | `/api/trpc/wa.receiveWebhook` | Nenhuma | Recebe mensagens do wa-bridge |
| `POST` | `/api/trpc/pdvSync.webhookNewProduct` | `secret` no body | Upsert de produto via Apps Script |
| `POST` | `/api/trpc/pdvSync.webhookUpdateProduct` | `secret` no body | Atualiza campo de produto via Apps Script |
| `POST` | `/api/trpc/pdvSync.webhookReconcile` | `secret` no body | Desativa produtos ausentes na planilha |

### Rate limiting / proteção contra abuso

**Não encontrado.** Não há middleware de rate limiting, helmet ou CORS configurado no servidor. Os webhooks de produto usam apenas um `secret` estático como proteção.

---

## 7. Google Sheets

### Identificação

- **ID da planilha:** `1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU`
- **Autenticação de leitura:** `GOOGLE_SHEETS_API_KEY` (API Key pública)
- **Autenticação de escrita:** `GOOGLE_SERVICE_ACCOUNT_JSON` (Service Account JSON completo)

### Abas e responsabilidades

| Aba | Quem escreve | Quem lê | Quando |
|---|---|---|---|
| `PRODUTOS` | Sistema (ao criar/editar produto) | Sistema (AutoSync, Sync manual) | Bidirecional |
| `PEDIDOS` | Sistema (ao criar pedido) | Sistema (backfill de colunas) | Sistema → Planilha |
| `pedidos_itens` | Sistema (ao criar pedido) | — | Sistema → Planilha |
| `SOFIA_ITENS` | Sistema (ao criar pedido com item Sofia) | — | Sistema → Planilha |
| `FLUXO_CAIXA` | Sistema (suprimento/sangria manual + suprimento auto dinheiro) | Sistema (importação de movimentações) | Bidirecional |
| `VENDAS_CAIXA` | Sistema (ao criar pedido não-Sofia) | — | Sistema → Planilha |
| `Lucro_produtos` | Sistema (ao criar pedido com itens não-Sofia) | — | Sistema → Planilha |

### Colunas por aba

**Aba `PRODUTOS` (A:P — 16 colunas)**

| Col | Nome | Tipo |
|---|---|---|
| A | CODIGO | texto (gerado automaticamente se vazio) |
| B | LINHA | texto (ex: TAILANDESA, NACIONAL) |
| C | MODELO | texto (ex: JOGADOR, TORCEDOR) |
| D | TIME | texto |
| E | DESCRIÇÃO | texto (opcional) |
| F | TAM | texto (tamanho) |
| G | TIPO | texto (ex: CAMISETA) |
| H | QTD | número (estoque) |
| I | ATC | número (preço atacado) |
| J | VAR | número (preço varejo) |
| K | CUSTO | número (opcional) |
| L | ATIVO | `SIM` ou `NAO` |
| M | FOTO | URL (opcional) |
| N | TEMPORADA | texto (opcional) |
| O | PT ATAC | número (pontos atacado) |
| P | PT VAR | número (pontos varejo) |

**Aba `PEDIDOS` (A:W — 23 colunas)**

| Col | Nome |
|---|---|
| A | pedido_id |
| B | data (DD/MM/YYYY HH:MM, Brasília) |
| C | vendedor |
| D | canal (WhatsApp / Balão) |
| E | cliente |
| F | telefone |
| G | cep (Correio) |
| H | varejo (número) |
| I | atacado (número) |
| J | atacado_varejo |
| K | extra (tipo do serviço) |
| L | valor_adicional (número) |
| M | valor_sem_taxa (subtotal + extras) |
| N | forma_pagamento |
| O | taxa (número) |
| P | total_com_taxa (número) |
| Q | pendente (número) |
| R | justificativa |
| S | modalidade |
| T | status |
| U | qtd_itens (número) |
| V | comissao (número) |
| W | justificativa_atac_menos6 |

**Aba `pedidos_itens` (A:Q — 17 colunas)**

| Col | Nome |
|---|---|
| A | pedido_id |
| B | cod (SKU) |
| C | produto (descrição completa) |
| D | quantidade |
| E | preco_atacado |
| F | preco_varejo |
| G | subtotal_atacado |
| H | subtotal_varejo |
| I | modalidade |
| J | serviço extra (tipo) |
| K | valor serviço extra |
| L | TOTAL |
| M | comissao |
| N | VENDEDOR |
| O | data |
| P | cliente |
| Q | cep |

**Aba `SOFIA_ITENS` (A:W — 23 colunas)**

| Col | Nome |
|---|---|
| A | pedido_id |
| B | data |
| C | cod (SKU) |
| D | vendedor |
| E | canal |
| F | cliente |
| G | fone |
| H | varejo |
| I | atacado |
| J | atacado/varejo |
| K | serviço extra |
| L | valor serviço extra (proporcional) |
| M | valor total sem taxa (item + extra proporcional) |
| N | forma de pagamento |
| O | taxa (proporcional) |
| P | total com taxa |
| Q | pendente (proporcional) |
| R | justificativa |
| S | modalidade |
| T | status |
| U | qtd itens |
| V | comissao loja sofia |
| W | reembolso |

**Aba `FLUXO_CAIXA` (A:G — 7 colunas)**

`ID | DATA | TIPO | DESCRIÇÃO | VALOR (R$) | RESPONSÁVEL | SALDO ACUMULADO (fórmula =G{n-1}+E{n})`

Sangrias recebem formatação de fundo vermelho escuro via `batchUpdate`.

**Aba `VENDAS_CAIXA` (A:K — 11 colunas)**

`ID PEDIDO | DATA | VENDEDOR | CANAL | CLIENTE | REGIME | TOTAL (R$) | FORMA PAGAMENTO | STATUS | QTD ITENS | JUSTIFICATIVA <6`

**Aba `Lucro_produtos` (A:M — 13 colunas)**

`CODIGO | LINHA | MODELO | TIME | DESCRIÇÃO | TAMANHO | TIPO | TIPO_VENDA | VALOR | CUSTO | LUCRO | MARGEM% | DATA`

Uma linha por unidade vendida (não por item do pedido).

### Apps Script / webhooks da planilha

**Não encontrado** nenhum Apps Script no repositório. Os webhooks de produto (`webhookNewProduct`, `webhookUpdateProduct`, `webhookReconcile`) são chamados pela planilha via Apps Script, mas o código do Apps Script não está no repositório. O formato esperado pelo servidor é descrito na Seção 8.

---

## 8. Webhooks e Sincronização de Produtos

### `POST /api/trpc/pdvSync.webhookNewProduct`

**Body (JSON tRPC mutation):**
```json
{
  "0": {
    "json": {
      "secret": "jurema-pdv-2024",
      "product": {
        "codigo": "TA-JG-FLA-VERM-P",
        "linha": "TAILANDESA",
        "modelo": "JOGADOR",
        "time": "FLAMENGO",
        "descricao": "VERMELHA",
        "tamanho": "P",
        "tipo": "CAMISETA",
        "estoque": 10,
        "precoAtacado": 55.00,
        "precoVarejo": 75.00,
        "isActive": true,
        "ptAtacado": 1.0,
        "ptVarejo": 1.5
      }
    }
  }
}
```

**Comportamento:**
- SKU já existe → `UPDATE` (linha, modelo, time, descricao, tamanho, estoque, precoAtacado, precoVarejo, isActive)
- SKU não existe → `INSERT` (todos os campos incluindo ptAtacado, ptVarejo)
- Produto desativado (`isActive: false`) → atualizado normalmente, permanece no banco com `isActive=0`
- Retorna `{ action: "inserted"|"updated", codigo: "..." }`

### `POST /api/trpc/pdvSync.webhookUpdateProduct`

**Body:**
```json
{
  "0": {
    "json": {
      "secret": "jurema-pdv-2024",
      "codigo": "TA-JG-FLA-VERM-P",
      "field": "estoque",
      "value": 8
    }
  }
}
```

Campos permitidos: `estoque`, `precoAtacado`, `precoVarejo`, `descricao`, `isActive`, `linha`, `modelo`, `time`, `tamanho`, `tipo`, `ptAtacado`, `ptVarejo`.

### `POST /api/trpc/pdvSync.webhookReconcile`

**Body:**
```json
{
  "0": {
    "json": {
      "secret": "jurema-pdv-2024",
      "codigos": ["TA-JG-FLA-VERM-P", "NA-TO-BRA-AZUL-M"]
    }
  }
}
```

Produtos no banco que **não** estão na lista recebem `isActive=0`. Se `codigos` vier vazio, nada é alterado (proteção contra limpeza acidental).

### AutoSync (cron externo)

| Parâmetro | Valor |
|---|---|
| **URL** | Preferir o domínio em produção: `https://juremasports2.com.br/api/scheduled/sync-products` (ou o host `*.up.railway.app` do serviço) |
| **Método** | `POST` |
| **Body** | vazio |
| **Auth** | nenhuma |
| **Frequência recomendada** | a cada 30 minutos |
| **Serviço sugerido** | [cron-job.org](https://cron-job.org) (gratuito) |

O AutoSync lê a aba `PRODUTOS!A2:P2000`, gera códigos automáticos para produtos sem SKU, e faz `INSERT ... ON DUPLICATE KEY UPDATE` em lotes de 100 produtos.

---

## 9. Fluxo de Pedido (PDV)

### Passo a passo — `server/routers/pdvOrders.ts`, função `create`

**1. Autenticação:** `requirePdvAuth(ctx)` — verifica JWT, retorna `{ sellerId, name, role }`.

**2. Geração do ID:** `generatePedidoId()` → formato `PED-{timestamp}`.

**3. Leitura da taxa de bônus vigente:**
```sql
SELECT value FROM pdv_config WHERE key = 'comissao_peca' LIMIT 1
```
Padrão: `0.50` R$/peça.

**4. Determinação do `isSofia` do pedido:**
- `isSofia = true` no `pdv_orders` **somente se todos os itens forem Sofia** (`input.items.every(i => i.isSofia)`)
- Pedidos com mistura de itens Sofia e normais têm `isSofia = false` no pedido
- Pedidos sem itens (só serviços) têm `isSofia = false`

**5. Insert em `pdv_orders`** com todos os totais.

**6. Para cada item:**
- `comissaoItem = isSofia ? 0 : comissaoUnitaria` (snapshot da taxa vigente)
- Se `productId` existe: busca `ptAtacado` e `ptVarejo` do produto e grava snapshot
- Se `productId` é null (item livre/digitado): `ptAtacado = 0`, `ptVarejo = 0`
- Baixa estoque: `UPDATE pdv_products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?`

**7. Insert em `pdv_order_payments`** (uma linha por forma de pagamento).

**8. Insert em `pdv_order_services`** (se houver serviços extras).

**9. Suprimento automático para pagamentos em DINHEIRO:**
- Cria entrada em `pdv_cash_flow` com `tipo = 'SUPRIMENTO'`
- Sincroniza com aba `FLUXO_CAIXA` da planilha (assíncrono)

**10. Integração Google Sheets (assíncrona, não bloqueia resposta):**

| Ação | Aba | Condição |
|---|---|---|
| `appendOrderToSheet` | `PEDIDOS` | Sempre |
| `appendOrderItemsToSheet` | `pedidos_itens` | Sempre |
| `appendSofiaItemsToSheet` | `SOFIA_ITENS` | Se houver itens Sofia |
| `updateProductStockInSheet` | `PRODUTOS` | Para cada item com `codigo` |
| `appendSaleToCashFlowSheet` | `VENDAS_CAIXA` | Pedidos não-Sofia ou só-serviços |
| `appendToLucroProdutos` | `Lucro_produtos` | Itens não-Sofia |

**11. Retorno:** `{ success: true, pedidoId: "PED-..." }`

### Campos calculados automaticamente

| Campo | Cálculo |
|---|---|
| `totalVarejo` | Soma de `precoVarejo × quantidade` de todos os itens |
| `totalAtacado` | Soma de `precoAtacado × quantidade` de todos os itens |
| `totalAplicado` | Valor cobrado conforme regime (atacado ou varejo) |
| `totalPago` | Soma dos pagamentos recebidos |
| `totalPendente` | `totalAplicado - totalPago` |
| `comissaoTotal` | Soma de `quantidade × comissaoUnitaria` para itens não-Sofia |

---

## 10. Regras de Negócio no Dashboard

### Filtro Sofia (`server/routers/pdvDashboard.ts`)

Em `pdvDashboard.summary`, pedidos com **`o.isSofia = 1`** ficam **fora** do bloco principal: faturamento, contagem de pedidos do resumo, **por vendedor** (barras + pontos), canal, regime e **faturamento por dia**. Essas queries usam `WHERE o.isSofia = 0` e, nos joins com itens, `oi.isSofia = 0` onde couber.

**Formas de pagamento** (`byPayment`): por padrão os totais **incluem** pagamentos de **todos** os pedidos não cancelados (também pedidos 100% Sofia), para refletir o caixa. Com `PDV_DASHBOARD_PAYMENTS_EXCLUDE_SOFIA=1`, volta a aplicar `AND o.isSofia = 0` só nesse agregado.

**Pedidos mistos** (`o.isSofia = 0` com alguns itens Sofia) **entram** no dashboard; só entram nas métricas de peças/faturamento os itens com `oi.isSofia = 0`.

### Fórmula de pontos por vendedor (`pdvDashboard.summary` / `pdvComissoes`)

```sql
CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
     ELSE oi.ptVarejo * oi.quantidade END
```

Os campos `ptAtacado` e `ptVarejo` são **snapshots** gravados no item no momento da venda. Se o item não tinha `productId` (digitado livre), esses campos são `0` — não há como calcular pontos retroativamente.

### Diferença entre pontos e bônus

| Conceito | Campo | Descrição |
|---|---|---|
| **Bônus** | `comissaoUnitaria` | Valor em R$ por peça (ex: R$ 0,50). Aplica-se a todos os itens não-Sofia, com ou sem SKU. Calculado como `quantidade × comissaoUnitaria`. |
| **Pontos** | `ptAtacado` / `ptVarejo` | Pontuação do produto (ex: 1.5 pontos). Só existe se o item tinha `productId` no momento da venda. Calculado conforme regime. |

---

## 11. Sofia

### Como um item é marcado Sofia

O campo `isSofia` é enviado pelo frontend no payload de criação do pedido (`input.items[n].isSofia = true`). O produto pode ter `isSofia = true` no cadastro (`pdv_products.isSofia`), mas a marcação definitiva é feita pelo atendente no checkout.

### Impacto em comissão

- Item Sofia → `comissaoUnitaria = 0` (gravado no item)
- Item Sofia → não entra no cálculo de bônus do vendedor
- Item Sofia → `comissaoLojaSofia` (valor personalizado por item, configurável em `pdv_sofia_config.comissaoLoja`)

### Impacto na planilha

- Itens Sofia → gravados em `SOFIA_ITENS` (não em `pedidos_itens`)
- Pedidos 100% Sofia → **não** gravados em `VENDAS_CAIXA`
- Itens Sofia → **não** gravados em `Lucro_produtos`
- Estoque → **deduzido** na aba `PRODUTOS` para todos os itens (Sofia ou não)

### Pedido 100% Sofia vs misto no banco

| Tipo | `pdv_orders.isSofia` | Dashboard | VENDAS_CAIXA | SOFIA_ITENS |
|---|---|---|---|---|
| 100% Sofia | `1` | Excluído | Não gravado | Gravado |
| Misto (Sofia + normal) | `0` | Incluído | Gravado | Itens Sofia gravados |
| 100% normal | `0` | Incluído | Gravado | Não gravado |

---

## 12. WhatsApp

### Integração wa-bridge

- **URL do wa-bridge:** `https://wa-bridge-production-c9a2.up.railway.app`
- **Autenticação:** `WA_BRIDGE_API_KEY` no header das chamadas do servidor para o wa-bridge
- **Webhook (wa-bridge → sistema):** `POST https://juremasports2.com.br/api/trpc/wa.receiveWebhook` (ou o host Railway direto, se o bridge ainda apontar para ele)

### Payload do webhook (`wa.receiveWebhook`)

```json
{
  "instanceId": 1,
  "remoteJid": "5511999999999@s.whatsapp.net",
  "messageId": "ABCDEF123456",
  "fromMe": false,
  "type": "text",
  "content": "Olá, quero ver camisas",
  "mediaUrl": null,
  "mediaBase64": null,
  "mediaMimeType": null,
  "timestamp": 1716000000,
  "contactName": "João Silva",
  "contactPhone": "5511999999999"
}
```

Tipos suportados: `text`, `image`, `audio`, `video`, `document`, `sticker`, `location`, `contact`, `reaction`. O servidor normaliza o `remoteJid` removendo sufixos de dispositivo multi-device (`:1@` → `@`).

### Fluxo de processamento

1. Mensagem chega via webhook → salva em `wa_messages`
2. Conversa criada/atualizada em `wa_conversations`
3. Se `fromMe = true` → retorna imediatamente (sem IA)
4. Se `fromMe = false` → processa assincronamente via `setImmediate`:
   - Verifica mensagem de ausência (`checkAwayMessage`)
   - Classifica status via IA (`applyAiStatus`)
5. Áudio → transcrição assíncrona via Whisper, atualiza `wa_messages.content`
6. Mídia → upload para S3 via `storagePut`, URL salva em `wa_messages.mediaUrl`

### Configuração da IA (por instância — `wa_ai_config`)

| Campo | Descrição |
|---|---|
| `enabled` | IA habilitada para esta instância |
| `aiName` | Nome da IA (padrão: "Ju") |
| `personality` | Descrição do tom de voz |
| `businessContext` | Contexto da loja (produtos, preços, horários) |
| `greetingMessage` | Mensagem de boas-vindas |
| `awayMessage` | Mensagem fora do horário |
| `escalateKeywords` | Palavras que transferem para humano |
| `maxContextMessages` | Quantas mensagens anteriores enviar para a IA (padrão: 10) |
| `responseDelayMin/Max` | Delay de resposta em ms (humanização) |

---

## 13. Caixa / Fluxo de Caixa

### Como lançamentos entram em `pdv_cash_flow`

| Origem | Tipo | Automático? |
|---|---|---|
| Venda com pagamento em DINHEIRO | `SUPRIMENTO` | Sim (ao criar pedido) |
| Lançamento manual pelo admin | `SUPRIMENTO` ou `SANGRIA` | Não (via `pdvDashboard.addCashFlow`) |

### Saldo

O saldo exibido no dashboard é calculado diretamente do banco:
```sql
SELECT COALESCE(SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE -valor END), 0) as saldo
FROM pdv_cash_flow
```

Não há filtro de data no saldo — representa o saldo acumulado total.

### Sincronização com planilha

Todo lançamento manual ou automático em `pdv_cash_flow` é sincronizado para a aba `FLUXO_CAIXA` via `appendCashFlowToSheet` (fire-and-forget). O saldo acumulado na planilha usa fórmula `=G{n-1}+E{n}`.

O admin pode re-exportar todo o histórico para a planilha via botão "Exportar Planilha" no dashboard (`pdvDashboard.syncCashFlowToSheet`).

---

## 14. Segurança

### Endpoints sem autenticação e justificativas

| Endpoint | Justificativa |
|---|---|
| `GET /api/health` | Necessário para healthcheck do Railway |
| `POST /api/scheduled/sync-products` | Chamado por cron externo sem sessão |
| `POST /api/trpc/wa.receiveWebhook` | wa-bridge não tem sessão PDV |
| Webhooks de produto (`webhookNew/Update/Reconcile`) | Apps Script não tem sessão PDV; protegidos por `secret` estático |

### Pontos de atenção

- **Sem rate limiting:** qualquer IP pode chamar os endpoints públicos sem limite.
- **Secret estático:** `SHEETS_WEBHOOK_SECRET` padrão é `"jurema-pdv-2024"` — deve ser alterado em produção via variável de ambiente.
- **JWT fallback:** se `JWT_SECRET` não estiver configurado, usa `"pdv_jwt_secret_fallback"` — crítico configurar em produção.
- **SSL MySQL:** conexões sem SSL são aceitas para `localhost`/`127.0.0.1`; para qualquer outro host, SSL é obrigatório com `rejectUnauthorized: false`.
- **Sem CORS configurado:** Express não tem middleware CORS explícito (inferido — pode ser problema em integrações externas).

---

## 15. Erros e Limitações Conhecidas

### Bugs documentados no código

- **Pedidos só-serviços com `isSofia` legado:** pedidos sem itens de produto mas com serviços podem ter `isSofia=1` no banco por bug legado. O histórico de pedidos inclui esses casos explicitamente (`server/routers/pdvOrders.ts`, linha 447).
- **`[].every()` retorna `true` em JS:** comentário explícito no código alerta que pedidos sem itens não devem ser marcados Sofia (`server/routers/pdvOrders.ts`, linha 101).
- **Aba `pedidos_itens` tem limite de linhas:** em maio 2026, a aba atingiu o limite de 1190 linhas, causando perda de 298 linhas de 127 pedidos. A aba foi expandida para 5000 linhas e o sistema implementou expansão automática.

### Limitações de design

- **Sem export CSV/Excel nativo** para pedidos ou catálogo (ver Seção 17).
- **Fuso no painel:** filtros e agrupamentos por dia no dashboard/relatórios usam `CONVERT_TZ(..., '+00:00', '-03:00')` em vários routers; ainda assim, dados importados com timestamp incorreto podem cair no dia errado até serem corrigidos no banco.
- **Itens sem SKU:** `ptAtacado` e `ptVarejo` ficam `0` — pontos não calculados.
- **Paginação do histórico:** padrão de 20 itens por página; sem limite máximo configurado no Zod (cliente pode solicitar qualquer `limit`).
- **Payload máximo:** 50MB configurado no Express (`express.json({ limit: "50mb" })`).
- **Sem pool de conexões:** cada request abre e fecha uma conexão MySQL. Em alta carga, pode causar lentidão ou esgotamento de conexões.
- **Storage de mídia:** ainda usa Manus Forge como padrão (`STORAGE_TYPE="manus"`). Ao desligar o Manus, migrar para S3 (`STORAGE_TYPE="s3"`).

---

## 16. Testes e Scripts

### Testes automatizados (Vitest)

```bash
pnpm test   # executa todos os testes
```

| Arquivo de teste | O que cobre |
|---|---|
| `server/auth.logout.test.ts` | Logout de sessão |
| `server/customerAuth.test.ts` | Auth do cliente e-commerce |
| `server/jumera.test.ts` | Testes gerais do projeto |
| `server/pdv.test.ts` | Tabelas PDV, `pdv_config`, fluxo de pedido |
| `server/pdvSync.test.ts` | Sincronização planilha → banco |
| `server/serviceAccount.test.ts` | Autenticação Google Service Account |
| `server/v44features.test.ts` a `server/v81cashflow-sheets.test.ts` | Testes incrementais de features (versionados) |

### Scripts de manutenção (`scripts/`)

| Script | Finalidade |
|---|---|
| `create-admin-user.mjs` | Cria usuário admin no PDV |
| `seed-pdv-products.mjs` | Popula produtos de teste |
| `seed-wa-instances.mjs` | Cria instâncias WhatsApp iniciais |
| `seed-wa-ai-config.mjs` | Configura IA WhatsApp |
| `migrate-wa-tables.mjs` | Migração de tabelas WhatsApp |
| `fix-pedidos-sheet.mjs` | Corrige linhas na aba `pedidos_itens` |
| `diagnose-pedidos-full.mjs` | Diagnóstico de pedidos com problemas |
| `sync_produtos_sheet.mjs` | Sincronização manual de produtos |
| `export_produtos_sheet.mjs` | Exporta produtos para planilha |
### Sincronização a partir do export (CSV)

Ordem sugerida (sempre **dry-run** antes de `--apply`):

1. `export-sanity-report.mjs` na pasta do ZIP extraído  
2. `sync-from-export-items.mjs` → `itens_completo.csv`  
3. `sync-from-export-orders.mjs` → `pedidos_completo.csv` (opcional: `--keep-seller`, `--touch-dates`)  
4. `sync-from-export-payments.mjs` → `pdv_order_payments.csv` (se existir no pacote)

| Script | Finalidade |
|--------|------------|
| `sync-from-export-items.mjs` | Alinha `pdv_order_items` com `itens_completo.csv` (dry-run; `--apply` grava; `--full` inclui textos/preços) |
| `sync-from-export-orders.mjs` | Alinha `pdv_orders` com `pedidos_completo.csv` |
| `sync-from-export-payments.mjs` | Alinha `pdv_order_payments` com `pdv_order_payments.csv` |
| `export-sanity-report.mjs` | Conta linhas de CSV do pacote e cruza `pedidoId` |

## 17. O Que Não Tem no Sistema

Os itens abaixo foram verificados e **não existem** no código-fonte:

- **Export CSV/Excel nativo de pedidos** — não há botão, endpoint ou função de download de pedidos. Alternativa: planilha Google Sheets (aba `PEDIDOS`) ou acesso direto ao MySQL.
- **Export CSV/Excel nativo de catálogo** — não há função de download de produtos. Alternativa: planilha Google Sheets (aba `PRODUTOS`) ou acesso direto ao MySQL.
- **API pública de pedidos** — não há endpoint REST ou tRPC público para consultar pedidos sem autenticação PDV.
- **API pública de catálogo** — não há endpoint público para listar produtos do PDV.
- **Admin multi-tenant** — sistema é single-tenant (uma loja).
- **Documentação de API gerada automaticamente** (Swagger/OpenAPI) — não encontrado.
- **Tela de Configurações > Integrações** — não existe no frontend PDV. As integrações são configuradas via variáveis de ambiente.
- **Rate limiting** — não há middleware de rate limiting.
- **CORS configurado** — não há middleware CORS explícito.
- **Staging environment** — não há ambiente de homologação configurado.
- **CI/CD automatizado** — não encontrado arquivo de workflow GitHub Actions ou similar.
- **Webhook de saída para sistemas externos** (ex: notificar ERP ao criar pedido) — não encontrado.
- **Cálculo de pontos para itens sem SKU** — itens digitados livres têm `ptAtacado = ptVarejo = 0`.

---

## 18. Checklist para Novo Desenvolvedor

Os 10 passos para subir o projeto, conectar ao banco, conectar à planilha e validar uma venda de ponta a ponta:

**1. Clonar o repositório e instalar dependências**
```bash
git clone https://github.com/yagogouvea/jurema.git
cd jurema
git checkout railway
pnpm install
```

**2. Configurar variáveis de ambiente**
Criar arquivo `.env` na raiz com as variáveis da Seção 3. Obrigatórias para o PDV funcionar: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=development`.

**3. Verificar conexão com o banco**
```bash
node -e "const m=require('mysql2/promise');m.createConnection({uri:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}).then(c=>{console.log('OK');c.end()}).catch(console.error)"
```

**4. Subir o servidor em desenvolvimento**
```bash
pnpm dev
# Acesse http://localhost:3000/pdv
```

**5. Fazer login no PDV**
Usar credenciais de um vendedor existente na tabela `pdv_sellers` (não documentar senhas neste arquivo; rotacionar senhas padrão em produção).

**6. Configurar Google Sheets**
Adicionar `GOOGLE_SHEETS_API_KEY` e `GOOGLE_SERVICE_ACCOUNT_JSON` no `.env`. Verificar acesso em `PDV > Configurações > Sincronização`.

**7. Testar sincronização de produtos**
Em `PDV > Configurações`, clicar em "Prévia" para ver o que seria sincronizado, depois "Sincronizar" para importar produtos da planilha.

**8. Criar um pedido de teste**
Em `PDV > Venda`, adicionar produto, selecionar vendedor, forma de pagamento e finalizar. Verificar se a linha apareceu nas abas `PEDIDOS` e `pedidos_itens` da planilha.

**9. Configurar WhatsApp (opcional)**
Adicionar `WA_BRIDGE_URL` e `WA_BRIDGE_API_KEY`. Em `PDV > WhatsApp > Configurações`, conectar instância e configurar a IA Sofia.

**10. Rodar os testes automatizados**
```bash
pnpm test
```
Todos os testes devem passar com `DATABASE_URL` configurado.

---

*Documento gerado com base no código-fonte do repositório `yagogouvea/jurema`, branch `railway`, em maio de 2026. Cópia em `docs/handover-tecnico-jumera.md` atualizada com o estado do workspace após cutover do domínio.*
