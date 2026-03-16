import axios from 'axios'

const TIMEOUT = 15000
const HEADERS = { 'Content-Type': 'application/json' }

const LOGIN_URL = process.env.LOGIN_URL!
const REGISTER_URL = process.env.VERIFICACION_URL!
const BALANCE_URL = process.env.BALANCE_URL!
const DEPOSIT_URL = process.env.PAYMENT_DEPOSIT_URL!
const WITHDRAW_URL = process.env.PAYMENT_WITHDRAW_URL!
const PAYMENTS_URL = process.env.PAYMENTS_URL!

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
    return cash?.amount ?? null
  } catch {
    return null
  }
}

export interface DepositParams {
  amount: number
  firstName: string
  lastName: string
  taxId: string
  email: string
  paymentId: string
  proofBase64: string // data:image/jpeg;base64,...
}

export async function createDeposit(
  jwt: string,
  params: DepositParams
): Promise<{ paymentId: string } | null> {
  try {
    const payload = {
      currency: 'ARS',
      name: `${params.firstName} ${params.lastName}`,
      taxId: params.taxId,
      email: params.email,
      amount: params.amount,
      reference: '0000',
      paymentId: params.paymentId,
      proofDocument: params.proofBase64,
    }

    const res = await axios.post(DEPOSIT_URL, payload, {
      headers: { ...HEADERS, Authorization: `Bearer ${jwt}` },
      timeout: 20000,
    })

    if (res.data?.error === false) {
      return { paymentId: params.paymentId }
    }

    return null
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
    return null
  }
}

export interface WithdrawParams {
  amount: number
  cbu: string
  cuitl: string
  accountHolder: string
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
    }

    const res = await axios.post(WITHDRAW_URL, payload, {
      headers: { ...HEADERS, Authorization: `Bearer ${jwt}` },
      timeout: TIMEOUT,
    })

    return res.data?.error === false
  } catch (err: any) {
    if (err.response?.status === 401) throw new CasinoAuthError()
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
