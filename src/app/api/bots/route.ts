import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return public fields only (no token)
  const { data, error } = await supabase
    .from('bots')
    .select('id, name, telegram_username, is_active, color, welcome_message, created_at')
    .order('created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, token, telegram_username, color, welcome_message } = body

  if (!name || !token) {
    return NextResponse.json({ error: 'Missing name or token' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bots')
    .insert({
      name,
      token_encrypted: token,
      telegram_username: telegram_username || null,
      color: color || '#3b82f6',
      welcome_message: welcome_message || null,
    })
    .select('id, name, telegram_username, is_active, color, welcome_message, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, token, telegram_username, color, is_active, welcome_message } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing bot id' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (token !== undefined) updates.token_encrypted = token
  if (telegram_username !== undefined) updates.telegram_username = telegram_username
  if (color !== undefined) updates.color = color
  if (is_active !== undefined) updates.is_active = is_active
  if (welcome_message !== undefined) updates.welcome_message = welcome_message || null

  const { data, error } = await supabase
    .from('bots')
    .update(updates)
    .eq('id', id)
    .select('id, name, telegram_username, is_active, color, welcome_message, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'Missing bot id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('bots')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
