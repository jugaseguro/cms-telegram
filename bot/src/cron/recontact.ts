import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import type { BotManager } from '../bot-manager'

interface RecontactRule {
  id: string
  name: string
  condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive' | 'by_label'
  condition_days: number
  condition_unit: 'hours' | 'days'
  message_template: string
  is_active: boolean
  bot_id: string | null
  target_label_id: string | null
}

interface Customer {
  id: string
  telegram_id: number
  first_name: string | null
  last_name: string | null
  last_activity: string | null
  has_paid: boolean
  bot_id: string
}

function renderTemplate(template: string, customer: Customer): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'cliente'
  return template.replace(/\{\{nombre\}\}/g, name)
}

async function getMatchingCustomers(rule: RecontactRule, botId: string): Promise<Customer[]> {
  const cutoffDate = new Date()
  const unit = rule.condition_unit ?? 'days'
  if (unit === 'hours') {
    cutoffDate.setHours(cutoffDate.getHours() - rule.condition_days)
  } else {
    cutoffDate.setDate(cutoffDate.getDate() - rule.condition_days)
  }
  const cutoff = cutoffDate.toISOString()

  let query = supabase
    .from('customers')
    .select('id, telegram_id, first_name, last_name, last_activity, has_paid, bot_id')
    .eq('bot_id', botId)

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
    case 'by_label': {
      if (!rule.target_label_id) return []
      // Get customers with the target label who are inactive
      const { data: labeledCustomers, error: labelError } = await supabase
        .from('customer_labels')
        .select('customer_id')
        .eq('label_id', rule.target_label_id)
      if (labelError || !labeledCustomers?.length) return []
      const customerIds = labeledCustomers.map((c) => c.customer_id)
      query = query.in('id', customerIds).lt('last_activity', cutoff)
      break
    }
  }

  const { data, error } = await query
  if (error) {
    console.error(`[recontact] Error fetching customers for rule ${rule.name}:`, error.message)
    return []
  }
  return (data ?? []) as Customer[]
}

async function hasRecentLog(ruleId: string, customerId: string, amount: number, unit: 'hours' | 'days'): Promise<boolean> {
  const cutoff = new Date()
  if (unit === 'hours') {
    cutoff.setHours(cutoff.getHours() - amount)
  } else {
    cutoff.setDate(cutoff.getDate() - amount)
  }

  const { count, error } = await supabase
    .from('recontact_logs')
    .select('id', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('customer_id', customerId)
    .gte('sent_at', cutoff.toISOString())

  if (error) return true // err on the side of not sending
  return (count ?? 0) > 0
}

async function processRules(manager: BotManager) {
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

  // Process each bot
  for (const [botId, { bot, config }] of manager.getAllBots()) {
    // Get rules for this bot (bot-specific + global)
    const botRules = (rules as RecontactRule[]).filter(
      (r) => r.bot_id === null || r.bot_id === botId
    )

    for (const rule of botRules) {
      const customers = await getMatchingCustomers(rule, botId)
      console.log(`[recontact] Bot "${config.name}", Rule "${rule.name}": ${customers.length} matching customers`)

      for (const customer of customers) {
        const alreadySent = await hasRecentLog(rule.id, customer.id, rule.condition_days, rule.condition_unit ?? 'days')
        if (alreadySent) continue

        const message = renderTemplate(rule.message_template, customer)

        try {
          await bot.api.sendMessage(customer.telegram_id, message)

          await supabase.from('recontact_logs').insert({
            rule_id: rule.id,
            customer_id: customer.id,
            bot_id: botId,
          })

          console.log(`[recontact] Sent to ${customer.telegram_id} (bot: ${config.name}, rule: ${rule.name})`)
        } catch (err) {
          console.error(`[recontact] Failed to send to ${customer.telegram_id}:`, err)
        }
      }
    }
  }

  console.log('[recontact] Job finished')
}

export function startRecontactCron(manager: BotManager) {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    processRules(manager).catch(console.error)
  })

  console.log('[recontact] Cron job scheduled (every hour)')
}
