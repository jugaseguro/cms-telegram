import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import type { BotManager } from '../bot-manager'

interface SegmentationRule {
  id: string
  name: string
  label_id: string
  conditions: { field: string; operator: string; value: string | number | boolean }[]
  is_active: boolean
  auto_remove: boolean
  bot_id: string | null
}

async function processSegmentation(manager: BotManager) {
  console.log('[segmentation] Running segmentation job...')

  const { data: rules, error } = await supabase
    .from('segmentation_rules')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('[segmentation] Error fetching rules:', error.message)
    return
  }

  if (!rules || rules.length === 0) {
    console.log('[segmentation] No active rules found')
    return
  }

  for (const rule of rules as SegmentationRule[]) {
    try {
      // Use RPC to evaluate the rule in Postgres
      const { data: matchingCustomers, error: rpcError } = await supabase
        .rpc('evaluate_segmentation_rule', { p_rule_id: rule.id })

      if (rpcError) {
        console.error(`[segmentation] RPC error for rule "${rule.name}":`, rpcError.message)
        continue
      }

      const matchingIds = new Set((matchingCustomers ?? []).map((c: { customer_id: string }) => c.customer_id))
      console.log(`[segmentation] Rule "${rule.name}": ${matchingIds.size} matching customers`)

      // Assign label to matching customers (ON CONFLICT DO NOTHING)
      for (const customerId of matchingIds) {
        const { error: insertError } = await supabase
          .from('customer_labels')
          .upsert(
            {
              customer_id: customerId,
              label_id: rule.label_id,
              assigned_by: 'auto',
              rule_id: rule.id,
            },
            { onConflict: 'customer_id,label_id', ignoreDuplicates: true }
          )

        if (insertError) {
          // Might already exist with manual assignment, that's fine
          continue
        }

        // Log assignment
        await supabase.from('segmentation_logs').insert({
          rule_id: rule.id,
          customer_id: customerId,
          label_id: rule.label_id,
          action: 'assigned',
        })
      }

      // Auto-remove: remove label from customers who no longer match
      if (rule.auto_remove) {
        const { data: currentLabels, error: labelsError } = await supabase
          .from('customer_labels')
          .select('customer_id')
          .eq('label_id', rule.label_id)
          .eq('assigned_by', 'auto')
          .eq('rule_id', rule.id)

        if (labelsError) {
          console.error(`[segmentation] Error fetching current labels for rule "${rule.name}":`, labelsError.message)
          continue
        }

        for (const cl of currentLabels ?? []) {
          if (!matchingIds.has(cl.customer_id)) {
            await supabase
              .from('customer_labels')
              .delete()
              .eq('customer_id', cl.customer_id)
              .eq('label_id', rule.label_id)
              .eq('assigned_by', 'auto')
              .eq('rule_id', rule.id)

            await supabase.from('segmentation_logs').insert({
              rule_id: rule.id,
              customer_id: cl.customer_id,
              label_id: rule.label_id,
              action: 'removed',
            })

            console.log(`[segmentation] Removed label from customer ${cl.customer_id} (rule: ${rule.name})`)
          }
        }
      }
    } catch (err) {
      console.error(`[segmentation] Error processing rule "${rule.name}":`, err)
    }
  }

  console.log('[segmentation] Job finished')
}

export function startSegmentationCron(manager: BotManager) {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    processSegmentation(manager).catch(console.error)
  })

  console.log('[segmentation] Cron job scheduled (every 30 minutes)')
}
