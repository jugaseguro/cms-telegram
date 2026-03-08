"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTextMessage = handleTextMessage;
const supabase_1 = require("../lib/supabase");
const helpers_1 = require("../helpers");
async function handleTextMessage(ctx) {
    const from = ctx.from;
    const text = ctx.message?.text;
    if (!from || !text)
        return;
    // Find or create customer
    const customer = await (0, helpers_1.findOrCreateCustomer)(from);
    if (!customer)
        return;
    // Find or create conversation
    const conversation = await (0, helpers_1.findOrCreateConversation)(customer.id);
    if (!conversation)
        return;
    // Dedup: skip if this telegram message was already saved
    if (await (0, helpers_1.isMessageAlreadySaved)(conversation.id, ctx.message?.message_id))
        return;
    // Save customer message
    await (0, helpers_1.insertMessageSafe)({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        telegram_message_id: ctx.message?.message_id || null,
    });
    // Check for auto-response matches
    const { data: autoResponses } = await supabase_1.supabase
        .from('auto_responses')
        .select('*')
        .eq('is_active', true);
    if (autoResponses && autoResponses.length > 0) {
        const lowerText = text.toLowerCase();
        const match = autoResponses.find((ar) => lowerText.includes(ar.trigger_text.toLowerCase()));
        if (match) {
            // Send auto-response
            await ctx.reply(match.response_text);
            // Save bot response in messages
            await supabase_1.supabase.from('messages').insert({
                conversation_id: conversation.id,
                sender_type: 'bot',
                content: match.response_text,
                message_type: 'text',
            });
        }
    }
}
//# sourceMappingURL=message.js.map