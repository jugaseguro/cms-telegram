import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { chatId, text, mediaUrl, messageType } = await request.json()

  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 })
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
  }

  let response: Response
  let data: Record<string, unknown>

  if (messageType === 'image' && mediaUrl) {
    response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: mediaUrl,
          ...(text ? { caption: text } : {}),
        }),
      }
    )
    data = await response.json() as Record<string, unknown>
  } else if (messageType === 'document' && mediaUrl) {
    response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          document: mediaUrl,
          ...(text ? { caption: text } : {}),
        }),
      }
    )
    data = await response.json() as Record<string, unknown>
  } else {
    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }
    response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      }
    )
    data = await response.json() as Record<string, unknown>
  }

  if (!data.ok) {
    return NextResponse.json({ error: (data as { description?: string }).description }, { status: 500 })
  }

  return NextResponse.json({ success: true, message_id: (data.result as { message_id: number }).message_id })
}
