import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { supabase } from '../lib/supabase'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ============================================================
// Rate limiter — persistent via Supabase ai_rate_limits table
// Max 10 AI calls per user per minute per bot
// ============================================================

const MAX_AI_CALLS_PER_MINUTE = 10

export async function checkRateLimit(telegramId: number, botId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_ai_rate_limit', {
    p_telegram_id: telegramId,
    p_bot_id: botId,
    p_max_calls: MAX_AI_CALLS_PER_MINUTE,
  })

  if (error) {
    // On DB error, fall through and allow the call (fail open)
    console.error('[rate-limit] DB error:', error.message)
    return true
  }

  return data === true
}

// ============================================================
// Tool definitions for function calling
// NOTE: login does NOT take a password — the bot intercepts the
// password locally and never sends it to OpenAI.
// ============================================================

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'request_login',
      description: 'El cliente quiere iniciar sesión. Solo pedí el nombre de usuario. La contraseña se recopila de forma segura fuera de esta conversación.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Nombre de usuario del casino' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: 'Consultar el saldo actual del cliente en el casino. Requiere que el cliente esté autenticado.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_deposit',
      description: 'El usuario quiere cargar saldo / hacer un depósito / cargar plata / meter plata. SIEMPRE llamá esta función. NUNCA generes texto preguntando datos del depósito. El sistema le envía las instrucciones automáticamente.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_deposit',
      description: 'Procesar un depósito cuando YA tenés todos los datos: nombre, apellido y monto. Extraé el monto como número (ignorá signos $, puntos de miles, y la palabra "pesos"). Los nombres van en mayúscula inicial. Solo llamá esta función cuando el usuario ya te pasó los tres datos.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Monto en ARS como número (ignorar $, puntos, "pesos"). Ej: "5.000 pesos" → 5000' },
          first_name: { type: 'string', description: 'Nombre del titular (mayúscula inicial)' },
          last_name: { type: 'string', description: 'Apellido del titular (mayúscula inicial)' },
        },
        required: ['amount', 'first_name', 'last_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_withdrawal',
      description: 'Procesar un retiro de dinero. Requiere monto, CBU, DNI/CUIT/CUIL y nombre del titular.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Monto en ARS a retirar (entre 100 y 500000)' },
          cbu: { type: 'string', description: 'CBU bancario de 22 dígitos. Si el usuario lo mandó con espacios o guiones, enviá solo los dígitos.' },
          cuit: { type: 'string', description: 'DNI, CUIT o CUIL del titular. Enviá solo los dígitos, sin guiones (ej: "20-12345678-9" → "20123456789").' },
          account_holder: { type: 'string', description: 'Nombre completo del titular de la cuenta' },
        },
        required: ['amount', 'cbu', 'cuit', 'account_holder'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Obtener el historial de movimientos (depósitos y retiros) del cliente.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_register',
      description: 'El cliente quiere crear una cuenta nueva en el casino. Solo pedí el usuario deseado (mínimo 4 caracteres, sin espacios). La contraseña se recopila de forma segura luego.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Usuario deseado para la cuenta (mínimo 4 caracteres, sin espacios)' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_agent',
      description: 'Derivar la conversación a un agente humano cuando el cliente lo solicita, la consulta es muy compleja, o la IA no puede resolverla.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo de la derivación (opcional)' },
        },
      },
    },
  },
]

// ============================================================
// Build OpenAI message history from DB
// Excludes sensitive messages (passwords, DNI, CBU, etc.)
// ============================================================

export async function buildHistory(
  conversationId: string,
  maxMessages: number
): Promise<ChatCompletionMessageParam[]> {
  const { data: messages } = await supabase
    .from('messages')
    .select('sender_type, content')
    .eq('conversation_id', conversationId)
    .eq('message_type', 'text')
    .eq('is_sensitive', false)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(maxMessages)

  if (!messages) return []

  // Reverse so oldest is first
  return messages
    .reverse()
    .map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: (m.content as string).slice(0, 300),
    } as ChatCompletionMessageParam))
}

// ============================================================
// AI response types
// ============================================================

export type AIUsage = {
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
}

export type AITextResponse = { type: 'text'; content: string; usage: AIUsage }
export type AIToolResponse = { type: 'tool_call'; name: string; args: Record<string, unknown>; usage: AIUsage }
export type AIResponse = AITextResponse | AIToolResponse

// Cost per 1M tokens (USD) — update if pricing changes
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o':      { input: 2.50, output: 10.00 },
  'gpt-4':       { input: 30.0, output: 60.00 },
}

function calcCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = COST_PER_1M[model] ?? COST_PER_1M['gpt-4o-mini']
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output
}

// ============================================================
// Main AI call — user message is wrapped to prevent injection
// ============================================================

export async function callAI(params: {
  systemPrompt: string
  history: ChatCompletionMessageParam[]
  userMessage: string
  model: string
}): Promise<AIResponse> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: params.systemPrompt },
    ...params.history,
    // Wrap user message to create semantic separation from system instructions
    { role: 'user', content: `[MENSAJE DEL USUARIO]: ${params.userMessage}` },
  ]

  const completion = await openai.chat.completions.create({
    model: params.model,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
    max_tokens: 350,
  })

  const choice = completion.choices[0]
  const u = completion.usage
  const usage: AIUsage = {
    model: params.model,
    prompt_tokens: u?.prompt_tokens ?? 0,
    completion_tokens: u?.completion_tokens ?? 0,
    total_tokens: u?.total_tokens ?? 0,
    cost_usd: calcCost(params.model, u?.prompt_tokens ?? 0, u?.completion_tokens ?? 0),
  }

  // Tool call
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0] as any
    const fnArgs = JSON.parse(toolCall.function?.arguments || '{}') as Record<string, unknown>
    return { type: 'tool_call', name: toolCall.function?.name as string, args: fnArgs, usage }
  }

  // Text response
  const content = choice.message.content || ''
  return { type: 'text', content, usage }
}
