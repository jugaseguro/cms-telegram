"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessageAlreadySaved = isMessageAlreadySaved;
exports.insertMessageSafe = insertMessageSafe;
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.findOrCreateConversation = findOrCreateConversation;
const supabase_1 = require("./lib/supabase");
/**
 * Check if a message with this telegram_message_id already exists in the conversation.
 */
async function isMessageAlreadySaved(conversationId, telegramMessageId) {
    if (!telegramMessageId)
        return false;
    const { data } = await supabase_1.supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('telegram_message_id', telegramMessageId)
        .limit(1)
        .maybeSingle();
    return !!data;
}
/**
 * Insert a message, silently ignoring unique constraint violations (duplicate telegram_message_id).
 */
async function insertMessageSafe(messageData) {
    const { error } = await supabase_1.supabase.from('messages').insert(messageData);
    if (error) {
        // 23505 = unique_violation — expected for duplicate telegram messages
        if (error.code === '23505')
            return false;
        console.error('Error inserting message:', error);
        return false;
    }
    return true;
}
/**
 * Find existing customer by telegram_id or create a new one.
 */
async function findOrCreateCustomer(from, uuidLanding) {
    // Try to find existing customer
    const { data: existing } = await supabase_1.supabase
        .from('customers')
        .select('*')
        .eq('telegram_id', from.id)
        .single();
    if (existing) {
        // Update info if changed
        const updates = {
            last_activity: new Date().toISOString(),
        };
        if (from.username !== existing.telegram_username) {
            updates.telegram_username = from.username || null;
        }
        if (from.first_name !== existing.first_name) {
            updates.first_name = from.first_name || null;
        }
        if (from.last_name !== existing.last_name) {
            updates.last_name = from.last_name || null;
        }
        await supabase_1.supabase
            .from('customers')
            .update(updates)
            .eq('id', existing.id);
        return existing;
    }
    // Create new customer
    const { data: newCustomer } = await supabase_1.supabase
        .from('customers')
        .insert({
        telegram_id: from.id,
        telegram_username: from.username || null,
        first_name: from.first_name || null,
        last_name: from.last_name || null,
        status: 'new',
        uuid_landing: uuidLanding || null,
        last_activity: new Date().toISOString(),
    })
        .select()
        .single();
    return newCustomer || null;
}
/**
 * Find an open/pending conversation for a customer, or create a new one.
 */
async function findOrCreateConversation(customerId) {
    const { data: existing } = await supabase_1.supabase
        .from('conversations')
        .select('*')
        .eq('customer_id', customerId)
        .neq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    if (existing) {
        return existing;
    }
    const { data: newConversation } = await supabase_1.supabase
        .from('conversations')
        .insert({
        customer_id: customerId,
        status: 'open',
    })
        .select()
        .single();
    return newConversation || null;
}
//# sourceMappingURL=helpers.js.map