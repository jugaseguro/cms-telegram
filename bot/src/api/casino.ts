import axios from 'axios'

const TIMEOUT = 15000
const HEADERS = { 'Content-Type': 'application/json' }

const LOGIN_URL = process.env.LOGIN_URL!
const REGISTER_URL = process.env.VERIFICACION_URL!
const BALANCE_URL = process.env.BALANCE_URL!
const DEPOSIT_URL = process.env.PAYMENT_DEPOSIT_URL!
const WITHDRAW_URL = process.env.PAYMENT_WITHDRAW_URL!
const PAYMENTS_URL = process.env.PAYMENTS_URL!
const PROVIDERS_URL = process.env.PROVIDERS_URL!

// Thrown when the casino API returns 401 (JWT expired or invalid)
export class CasinoAuthError extends Error {
  constructor() {
    super('casino_auth_expired')
    this.name = 'CasinoAuthError'
  }
}

export interface CasinoProfile {
  name?: string
  mail?: string
  email?: string
  [key: string]: unknown
}

export interface LoginResult {
  jwt: string
  session: string
  profile: CasinoProfile
}

export interface Transaction {
  t?: string   // tipo
  st?: string  // estado
  a?: number   // amount
  cat?: string // created_at
  uat?: string // updated_at
  i?: { doc?: string } // imagen adjunta
}

export async function loginCasino(
  username: string,
  password: string,
  telegramId: number,
  telegramUsername: string | undefined,
  operator: string
): Promise<LoginResult | null> {
  try {
    const response = await axios.post(
      LOGIN_URL,
      { username, password, operator, telegramId, telegramUsername },
      { headers: HEADERS, timeout: TIMEOUT }
    )

    const data = response.data?.data
    if (!data?.token || !data?.profile) {
      return null
    }

    return { jwt: data.token, session: data.profile?.session ?? '', profile: data.profile }
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    return null
  }
}

export interface RegisterParams {
  username: string
  password: string
  operator: string
}

export async function registerCasino(params: RegisterParams): Promise<boolean> {
  try {
    const response = await axios.post(
      REGISTER_URL,
      {
        operator: params.operator,
        user: {
          username: params.username,
          password: params.password,
        },
      },
      { headers: HEADERS, timeout: TIMEOUT }
    )

    return response.status >= 200 && response.status < 300
  } catch (err: any) {
    const data = err.response?.data
    const msg = data?.message
    if (
      data?.code === 'users.register.user_already_exists' ||
      msg?.code === -7 ||
      msg?.description === 'Duplicated alias'
    ) {
      throw new Error('casino_user_exists')
    }
    if (data?.code === 'users.register.must_be_min_least_characters') {
      throw new Error('casino_password_invalid')
    }
    return false
  }
}

// Quick JWT validation — checks if the JWT is still accepted by the casino API
export async function validateJwtQuick(jwt: string): Promise<boolean> {
  try {
    const providerId = await getProviderId(jwt)
    return providerId !== null
  } catch {
    return false
  }
}

export async function getBalance(session: string): Promise<number | null> {
  try {
    const response = await axios.post(
      BALANCE_URL,
      `company=PCSC&session=${encodeURIComponent(session)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: TIMEOUT }
    )
    if (response.data?.result !== 'OK') return null
    const accounts = response.data?.accounts as any[] | undefined
    const cash = accounts?.find((a: any) => a.account === 'CASH')
    if (cash?.amount == null) return null
    // API returns amount in cents — convert to pesos
    return cash.amount / 100
  } catch {
    return null
  }
}

export interface DepositParams {
  amount: number
  firstName: string
  lastName: string
  paymentId: string
}

export async function getProviderId(jwt: string, channel = 'BT'): Promise<string | null> {
  try {
    const res = await axios.get(PROVIDERS_URL, {
      headers: { Authorization: `Bearer ${jwt}` },
      timeout: TIMEOUT,
    })
    const providers = res.data?.providers || []

    // Find provider that has the requested channel enabled
    for (const provider of providers) {
      const channels = provider.pp?.ch as any[] | undefined
      if (channels) {
        const match = channels.find((ch: any) => ch.v === channel && ch.e === true)
        if (match && provider.p) {
          console.log(`[getProviderId] Found provider ${provider.pp?.n} (${provider.p}) with channel ${channel}`)
          return provider.p
        }
      }
    }

    // Fallback: if no channel match, return first provider with deposit support
    for (const provider of providers) {
      if (provider.p) {
        console.log(`[getProviderId] No provider with channel "${channel}", falling back to first: ${provider.pp?.n} (${provider.p})`)
        return provider.p
      }
    }

    console.error('[getProviderId] No provider found')
    return null
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    console.error('[getProviderId] Error:', err.response?.status, JSON.stringify(err.response?.data))
    return null
  }
}

export async function createDeposit(
  jwt: string,
  params: DepositParams
): Promise<{ url: string } | null> {
  try {
    const payload = {
      amount: params.amount,
      paymentId: params.paymentId,
      currency: 'ARS',
      channel: 'BT',
      name: params.firstName,
      surname: params.lastName,
    }

    const res = await axios.post(DEPOSIT_URL, payload, {
      headers: { ...HEADERS, Authorization: `Bearer ${jwt}` },
      timeout: 20000,
    })

    const url = res.data?.url
    if (url) return { url }
    console.error('[createDeposit] No URL in response:', JSON.stringify(res.data))
    return null
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    console.error('[createDeposit] Error:', err.response?.status, JSON.stringify(err.response?.data))
    return null
  }
}

export interface WithdrawParams {
  amount: number
  cbu: string
  cuitl: string
  accountHolder: string
  paymentId: string
  channel: string
}

export async function createWithdrawal(
  jwt: string,
  params: WithdrawParams
): Promise<boolean> {
  try {
    const payload = {
      amount: params.amount,
      cbu: params.cbu,
      cuitl: params.cuitl,
      accountHolder: params.accountHolder,
      currency: 'ARS',
      paymentId: params.paymentId,
      channel: params.channel,
    }

    console.log(`[createWithdrawal] URL: ${WITHDRAW_URL}`)
    console.log(`[createWithdrawal] Payload:`, JSON.stringify(payload))

    const res = await axios.post(WITHDRAW_URL, payload, {
      headers: { ...HEADERS, Authorization: `Bearer ${jwt}` },
      timeout: TIMEOUT,
    })

    console.log(`[createWithdrawal] Response status: ${res.status}`, JSON.stringify(res.data))
    // Success: API returns 200/201 with txid, or error: false
    return !!(res.data?.txid) || res.data?.error === false
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    console.error(`[createWithdrawal] Error: ${err.response?.status}`, JSON.stringify(err.response?.data))
    return false
  }
}

export async function getTransactions(jwt: string): Promise<Transaction[]> {
  try {
    const response = await axios.get(PAYMENTS_URL, {
      headers: { Authorization: `Bearer ${jwt}` },
      timeout: TIMEOUT,
    })
    return response.data?.data || []
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    return []
  }
}
