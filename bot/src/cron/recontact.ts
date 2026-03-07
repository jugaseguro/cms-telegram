import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import type { Bot } from 'grammy'

interface RecontactRule {
  id: string
  name: string
  condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive'
  condition_days: number
  message_template: string
  is_active: boolean
}

interface Customer {
  id: string
  telegram_id: number
  first_name: string | null
  last_name: string | null
  last_activity: string | null
  has_paid: boolean
}

function renderTemplate(template: string, customer: Customer): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'cliente'
  return template.replace(/\{\{nombre\}\}/g, name)
}

async function getMatchingCustomers(rule: RecontactRule): Promise<Customer[]> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - rule.condition_days)
  const cutoff = cutoffDate.toISOString()

  let query = supabase
    .from('customers')
    .select('id, telegram_id, first_name, last_name, last_activity, has_paid')

  switch (rule.condition_type) {
    case 'inactive_days':
      query = query.lt('last_activity', cutoff)
      break
    case 'no_payment':
      query = query.eq('has_paid', false).lt('last_activity', cutoff)
      break
    case 'vip_inactive':
      query = query.eq('has_paid', true).lt('last_activity', cutoff)
      break
  }

  const { data, error } = await query
  if (error) {
    console.error(`[recontact] Error fetching customers for rule ${rule.name}:`, error.message)
    return []
  }
  return (data ?? []) as Customer[]
}

async function hasRecentLog(ruleId: string, customerId: string, days: number): Promise<boolean> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { count, error } = await supabase
    .from('recontact_logs')
    .select('id', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('customer_id', customerId)
    .gte('sent_at', cutoff.toISOString())

  if (error) return true // err on the side of not sending
  return (count ?? 0) > 0
}

async function processRules(bot: Bot) {
  console.log('[recontact] Running recontact job...')

  const { data: rules, error } = await supabase
    .from('recontact_rules')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('[recontact] Error fetching rules:', error.message)
    return
  }

  if (!rules || rules.length === 0) {
    console.log('[recontact] No active rules found')
    return
  }

  for (const rule of rules as RecontactRule[]) {
    const customers = await getMatchingCustomers(rule)
    console.log(`[recontact] Rule "${rule.name}": ${customers.length} matching customers`)

    for (const customer of customers) {
      const alreadySent = await hasRecentLog(rule.id, customer.id, rule.condition_days)
      if (alreadySent) continue

      const message = renderTemplate(rule.message_template, customer)

      try {
        await bot.api.sendMessage(customer.telegram_id, message)

        await supabase.from('recontact_logs').insert({
          rule_id: rule.id,
          customer_id: customer.id,
        })

        console.log(`[recontact] Sent to ${customer.telegram_id} (rule: ${rule.name})`)
      } catch (err) {
        console.error(`[recontact] Failed to send to ${customer.telegram_id}:`, err)
      }
    }
  }

  console.log('[recontact] Job finished')
}

export function startRecontactCron(bot: Bot) {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    processRules(bot).catch(console.error)
  })

  console.log('[recontact] Cron job scheduled (every hour)')
}
