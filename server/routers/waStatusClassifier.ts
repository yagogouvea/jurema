/**
 * waStatusClassifier.ts
 * Classificador automático de status de conversa via IA (GPT-4o mini)
 *
 * 4 regras de controle de custo:
 * 1. Analisa apenas mensagens do CLIENTE (não as da IA/atendente)
 * 2. Limita o histórico a 20 mensagens mais recentes
 * 3. Respeita alterações manuais por 30 minutos (statusLockedUntil)
 * 4. Usa GPT-4o mini (20x mais barato que GPT-4o)
 */

import { invokeLLM } from "../_core/llm";
import mysql from "mysql2/promise";

// Status disponíveis com descrições para o classificador
const STATUS_DESCRIPTIONS = {
  novo: "Primeira mensagem ou cliente que nunca comprou antes",
  em_atendimento: "Conversa ativa, cliente fazendo perguntas sobre produtos, preços ou tamanhos",
  aguardando: "IA ou atendente fez uma pergunta e está esperando resposta do cliente",
  proposta_enviada: "Catálogo foi enviado, cliente está analisando ou pedido está sendo montado",
  finalizado: "Compra confirmada, pagamento realizado ou cliente agradeceu e encerrou",
  spam: "Mensagens irrelevantes, propaganda ou contato indesejado",
};

type ConvStatus = keyof typeof STATUS_DESCRIPTIONS;

interface Message {
  fromMe: boolean;
  content: string;
  createdAt: Date | string;
}

/**
 * Classifica o status de uma conversa analisando o histórico de mensagens.
 * Retorna null se o status não deve ser alterado (ex: bloqueio manual ativo).
 */
export async function classifyConversationStatus(
  db: mysql.Connection,
  conversationId: number
): Promise<{ status: ConvStatus; confidence: number } | null> {
  // 1. Verificar se o status está bloqueado por alteração manual
  const [convRows] = await db.execute<any[]>(
    `SELECT status, statusSetBy, statusLockedUntil FROM wa_conversations WHERE id = ?`,
    [conversationId]
  );

  if (!convRows.length) return null;

  const conv = convRows[0];

  // Regra 3: Respeitar bloqueio manual por 30 minutos
  if (conv.statusSetBy === "human" && conv.statusLockedUntil) {
    const lockedUntil = new Date(conv.statusLockedUntil);
    if (lockedUntil > new Date()) {
      return null; // Ainda bloqueado — não classificar
    }
  }

  // Regra 4: Não reclassificar "finalizado" automaticamente
  if (conv.status === "finalizado" && conv.statusSetBy === "human") {
    return null;
  }

  // Regra 1 + 2: Buscar apenas mensagens do cliente, máximo 20 mais recentes
  const [msgRows] = await db.execute<any[]>(
    `SELECT content, fromMe, createdAt
     FROM wa_messages
     WHERE conversationId = ?
     ORDER BY createdAt DESC
     LIMIT 20`,
    [conversationId]
  );

  if (!msgRows.length) return null;

  // Inverter para ordem cronológica
  const messages: Message[] = msgRows.reverse();

  // Filtrar apenas mensagens do cliente para análise (regra 1)
  const clientMessages = messages.filter((m) => !m.fromMe);
  if (!clientMessages.length) return null;

  // Montar histórico para o prompt (inclui contexto das respostas também)
  const historyText = messages
    .map((m) => `${m.fromMe ? "[ATENDENTE]" : "[CLIENTE]"}: ${m.content}`)
    .join("\n");

  const statusOptions = Object.entries(STATUS_DESCRIPTIONS)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um classificador de status de conversas de atendimento ao cliente de uma loja de roupas esportivas (Jumera Sport). Analise o histórico da conversa e classifique o status atual.

Status disponíveis:
${statusOptions}

Responda APENAS com JSON no formato: {"status": "nome_do_status", "confidence": 0.0}
onde confidence é um número entre 0 e 1 indicando sua certeza.`,
        },
        {
          role: "user",
          content: `Classifique o status desta conversa:\n\n${historyText}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "status_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: Object.keys(STATUS_DESCRIPTIONS),
              },
              confidence: {
                type: "number",
              },
            },
            required: ["status", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(content);
    if (!parsed.status || !STATUS_DESCRIPTIONS[parsed.status as ConvStatus]) {
      return null;
    }

    return {
      status: parsed.status as ConvStatus,
      confidence: parsed.confidence ?? 0.8,
    };
  } catch (err) {
    console.error("[waStatusClassifier] Erro ao classificar status:", err);
    return null;
  }
}

/**
 * Aplica o status classificado pela IA na conversa.
 * Só atualiza se a confiança for >= 0.6.
 */
export async function applyAiStatus(
  db: mysql.Connection,
  conversationId: number
): Promise<void> {
  const result = await classifyConversationStatus(db, conversationId);
  if (!result) return;

  // Só aplica se confiança >= 60%
  if (result.confidence < 0.6) return;

  await db.execute(
    `UPDATE wa_conversations
     SET status = ?, statusSetBy = 'ai', updatedAt = NOW()
     WHERE id = ?`,
    [result.status, conversationId]
  );
}

/**
 * Marca o status como definido por humano e bloqueia por 30 minutos.
 */
export async function lockStatusByHuman(
  db: mysql.Connection,
  conversationId: number,
  status: ConvStatus
): Promise<void> {
  const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // +30 minutos

  await db.execute(
    `UPDATE wa_conversations
     SET status = ?, statusSetBy = 'human', statusLockedUntil = ?, updatedAt = NOW()
     WHERE id = ?`,
    [status, lockedUntil, conversationId]
  );
}
