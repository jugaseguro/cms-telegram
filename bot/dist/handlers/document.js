"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDocument = handleDocument;
const supabase_1 = require("../lib/supabase");
const helpers_1 = require("../helpers");
async function handleDocument(ctx) {
    const from = ctx.from;
    const document = ctx.message?.document;
    if (!from || !document)
        return;
    const customer = await (0, helpers_1.findOrCreateCustomer)(from);
    if (!customer)
        return;
    const conversation = await (0, helpers_1.findOrCreateConversation)(customer.id);
    if (!conversation)
        return;
    // Resolve file_id to downloadable URL
    const file = await ctx.api.getFile(document.file_id);
    const mediaUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message?.caption || document.file_name || '';
    await supabase_1.supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: caption,
        message_type: 'document',
        media_url: mediaUrl,
        telegram_message_id: ctx.message?.message_id || null,
    });
    await ctx.reply('✅ Documento recibido. Un agente lo revisará en breve.');
}
//# sourceMappingURL=document.js.map