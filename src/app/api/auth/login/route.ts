import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { apiError, apiSuccess, createApiMeta } from '@/lib/api-response'
import type { Database } from '@/lib/supabase/types'

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

export async function POST(request: Request) {
  const meta = createApiMeta()
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid login payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  let response = NextResponse.json(null)

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get('cookie')
            ?.split(';')
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .map((cookie) => {
              const [name, ...rest] = cookie.split('=')
              return { name, value: rest.join('=') }
            }) ?? []
        },
        setAll(cookiesToSet) {
          response = NextResponse.json(null)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return apiError('UNAUTHORIZED', error.message, { status: 401, meta })
  }

  const payload = {
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email ?? null,
        }
      : null,
    session: data.session
      ? {
          expires_at: data.session.expires_at ?? null,
        }
      : null,
  }

  const successResponse = apiSuccess(payload, { meta })
  response.cookies.getAll().forEach((cookie) => {
    successResponse.cookies.set(cookie)
  })

  return successResponse
}
