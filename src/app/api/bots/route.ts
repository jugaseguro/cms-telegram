import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { apiError, apiSuccess, createApiMeta, type ApiResponseMeta } from '@/lib/api-response'

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const createBotSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  token: z.string().trim().min(1, 'Token is required'),
  telegram_username: z.string().trim().min(1).nullable().optional(),
  color: colorSchema.optional(),
  welcome_message: z.string().trim().nullable().optional(),
})

const updateBotSchema = z.object({
  id: z.string().uuid('Invalid bot id'),
  name: z.string().trim().min(1).optional(),
  token: z.string().trim().min(1).optional(),
  telegram_username: z.string().trim().min(1).nullable().optional(),
  color: colorSchema.optional(),
  is_active: z.boolean().optional(),
  is_paused: z.boolean().optional(),
  welcome_message: z.string().trim().nullable().optional(),
})

const deleteBotSchema = z.object({
  id: z.string().uuid('Invalid bot id'),
})

async function requireAdmin(meta: ApiResponseMeta) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      supabase,
      error: apiError('UNAUTHORIZED', 'Unauthorized', { status: 401, meta }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return {
      supabase,
      error: apiError('FORBIDDEN', 'Forbidden', { status: 403, meta }),
    }
  }

  return { supabase, error: null }
}

export async function GET() {
  const meta = createApiMeta()
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return apiError('UNAUTHORIZED', 'Unauthorized', { status: 401, meta })
  }

  const { data, error } = await supabase
    .from('bots')
    .select('id, name, telegram_username, is_active, is_paused, color, welcome_message, created_at')
    .order('created_at')

  if (error) {
    return apiError('INTERNAL_ERROR', error.message, { status: 500, meta })
  }

  return apiSuccess(data, { meta })
}

export async function POST(request: Request) {
  const meta = createApiMeta()
  const admin = await requireAdmin(meta)
  if (admin.error) return admin.error

  const body = await request.json().catch(() => null)
  const parsed = createBotSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid bot payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  const { name, token, telegram_username, color, welcome_message } = parsed.data
  const { data, error } = await admin.supabase
    .from('bots')
    .insert({
      name,
      token_encrypted: token,
      telegram_username: telegram_username || null,
      color: color || '#3b82f6',
      welcome_message: welcome_message || null,
    })
    .select('id, name, telegram_username, is_active, is_paused, color, welcome_message, created_at')
    .single()

  if (error) {
    return apiError('INTERNAL_ERROR', error.message, { status: 500, meta })
  }

  return apiSuccess(data, { status: 201, meta })
}

export async function PATCH(request: Request) {
  const meta = createApiMeta()
  const admin = await requireAdmin(meta)
  if (admin.error) return admin.error

  const body = await request.json().catch(() => null)
  const parsed = updateBotSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid bot payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  const { id, name, token, telegram_username, color, is_active, is_paused, welcome_message } = parsed.data
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (token !== undefined) updates.token_encrypted = token
  if (telegram_username !== undefined) updates.telegram_username = telegram_username
  if (color !== undefined) updates.color = color
  if (is_active !== undefined) updates.is_active = is_active
  if (is_paused !== undefined) updates.is_paused = is_paused
  if (welcome_message !== undefined) updates.welcome_message = welcome_message || null

  const { data, error } = await admin.supabase
    .from('bots')
    .update(updates)
    .eq('id', id)
    .select('id, name, telegram_username, is_active, is_paused, color, welcome_message, created_at')
    .single()

  if (error) {
    return apiError('INTERNAL_ERROR', error.message, { status: 500, meta })
  }

  return apiSuccess(data, { meta })
}

export async function DELETE(request: Request) {
  const meta = createApiMeta()
  const admin = await requireAdmin(meta)
  if (admin.error) return admin.error

  const body = await request.json().catch(() => null)
  const parsed = deleteBotSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid bot payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  const { error } = await admin.supabase
    .from('bots')
    .delete()
    .eq('id', parsed.data.id)

  if (error) {
    return apiError('INTERNAL_ERROR', error.message, { status: 500, meta })
  }

  return apiSuccess({ success: true }, { meta })
}
