import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY env var is required')
const KEY = createHash('sha256').update(process.env.ENCRYPTION_KEY).digest()

export function encryptToken(token: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptToken(value: string): string {
  // If it doesn't look like an encrypted value (no colon), return as-is (legacy plaintext)
  if (!value.includes(':')) return value
  const [ivHex, encHex] = value.split(':')
  const decipher = createDecipheriv('aes-256-cbc', KEY, Buffer.from(ivHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}
