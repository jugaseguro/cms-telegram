import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'

const BASE_TITLE = 'CRM Telegram'
let originalFavicon: HTMLImageElement | null = null

function getOrCreateFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  return link
}

function loadOriginalFavicon(): Promise<HTMLImageElement> {
  if (originalFavicon) return Promise.resolve(originalFavicon)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      originalFavicon = img
      resolve(img)
    }
    img.onerror = () => resolve(img)
    img.src = '/favicon.ico'
  })
}

function updateFavicon(count: number): void {
  const link = getOrCreateFaviconLink()

  if (count === 0) {
    link.href = '/favicon.ico'
    return
  }

  loadOriginalFavicon().then((img) => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw original favicon
    ctx.drawImage(img, 0, 0, 32, 32)

    // Draw red badge circle
    const text = count > 99 ? '99+' : String(count)
    const fontSize = text.length > 2 ? 10 : 12
    ctx.font = `bold ${fontSize}px Arial`
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const badgeRadius = Math.max(8, (textWidth / 2) + 3)
    const badgeX = 32 - badgeRadius
    const badgeY = badgeRadius

    ctx.beginPath()
    ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI)
    ctx.fillStyle = '#ef4444'
    ctx.fill()

    // Draw white text
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, badgeX, badgeY + 1)

    link.href = canvas.toDataURL('image/png')
  })
}

export function useTabTitle() {
  const unreadCount = useChatStore((s) => s.unreadConversationIds.size)

  // Effect 1: Update title + favicon on unread change
  useEffect(() => {
    document.title = unreadCount > 0
      ? `(${unreadCount}) ${BASE_TITLE}`
      : BASE_TITLE
    updateFavicon(unreadCount)
  }, [unreadCount])

  // Effect 2: Title blink when tab hidden + unread > 0
  useEffect(() => {
    if (unreadCount === 0) return

    let intervalId: ReturnType<typeof setInterval> | null = null
    let isAlternate = false

    function startBlink() {
      if (intervalId) return
      isAlternate = false
      intervalId = setInterval(() => {
        isAlternate = !isAlternate
        document.title = isAlternate
          ? '\u{1F4AC} Mensaje nuevo'
          : `(${unreadCount}) ${BASE_TITLE}`
      }, 1000)
    }

    function stopBlink() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      document.title = unreadCount > 0
        ? `(${unreadCount}) ${BASE_TITLE}`
        : BASE_TITLE
    }

    function handleVisibility() {
      if (document.hidden) {
        startBlink()
      } else {
        stopBlink()
      }
    }

    // Start immediately if already hidden
    if (document.hidden) startBlink()

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      stopBlink()
    }
  }, [unreadCount])

  // Cleanup favicon on unmount
  useEffect(() => () => updateFavicon(0), [])
}
