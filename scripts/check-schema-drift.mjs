import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src', 'lib', 'supabase', 'types.ts'), 'utf8')

const schemaTables = new Set(
  [...schema.matchAll(/create table public\.([a-z_]+)/g)].map((match) => match[1])
)

const typeTables = new Set(
  [...types.matchAll(/^ {6}([a-z_]+): \{$/gm)].map((match) => match[1])
)

const criticalTables = [
  'bots',
  'customers',
  'conversations',
  'messages',
  'transactions',
  'ai_usage_logs',
]

const criticalColumns = {
  bots: ['welcome_message', 'ai_enabled', 'ai_model', 'ai_max_history', 'casino_operator'],
  customers: ['uuid_landing', 'casino_token', 'casino_user_id', 'casino_username', 'casino_profile'],
  conversations: ['ai_paused', 'pending_action'],
  ai_usage_logs: ['model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'cost_usd'],
}

const errors = []

for (const table of criticalTables) {
  if (!schemaTables.has(table)) {
    errors.push(`Missing table in schema.sql: ${table}`)
  }
  if (!typeTables.has(table)) {
    errors.push(`Missing table in types.ts: ${table}`)
  }
}

for (const [table, columns] of Object.entries(criticalColumns)) {
  const schemaBlock = schema.match(new RegExp(`create table public\\.${table} \\(([^;]+?)\\);`, 's'))?.[1] ?? ''
  const typeBlock = types.match(new RegExp(`${table}: \\{([\\s\\S]+?)Relationships:`))?.[1] ?? ''

  for (const column of columns) {
    if (!schemaBlock.includes(column)) {
      errors.push(`Missing column in schema.sql for ${table}: ${column}`)
    }
    if (!typeBlock.includes(column)) {
      errors.push(`Missing column in types.ts for ${table}: ${column}`)
    }
  }
}

if (errors.length > 0) {
  console.error('Schema drift detected:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Schema drift check passed for critical tables and columns.')
