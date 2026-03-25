import { spawn } from 'node:child_process'
import process from 'node:process'

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const useExternalServer = Boolean(process.env.SMOKE_BASE_URL)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await sleep(2000)
  }

  throw new Error(`Server did not become ready: ${url}`)
}

async function runChecks() {
  const healthResponse = await fetch(`${baseURL}/api/health`)
  if (!healthResponse.ok) {
    throw new Error(`/api/health returned ${healthResponse.status}`)
  }

  const health = await healthResponse.json()
  if (!health.ok || health.data?.service !== 'web') {
    throw new Error('Health response payload is invalid')
  }

  const loginResponse = await fetch(`${baseURL}/login`)
  if (!loginResponse.ok) {
    throw new Error(`/login returned ${loginResponse.status}`)
  }

  const html = await loginResponse.text()
  if (!html.includes('CRM Telegram') || !html.includes('Ingresar')) {
    throw new Error('Login page does not contain expected content')
  }

  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    console.log('Authenticated smoke requires a real browser session and is still manual in this repo.')
  }
}

async function main() {
  let child = null

  try {
    if (!useExternalServer) {
      child = spawn('npm', ['run', 'dev'], {
        shell: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
          TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-token',
          NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001',
        },
      })

      await waitForServer(`${baseURL}/login`)
    }

    await runChecks()
    console.log('Smoke tests passed.')
  } finally {
    if (child) {
      child.kill()
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
