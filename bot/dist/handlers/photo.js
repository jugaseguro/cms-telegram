"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePhoto = handlePhoto;
const supabase_1 = require("../lib/supabase");
const helpers_1 = require("../helpers");
async function handlePhoto(ctx) {
    const from = ctx.from;
    const photo = ctx.message?.photo;
    if (!from || !photo)
        return;
    const customer = await (0, helpers_1.findOrCreateCustomer)(from);
    if (!customer)
        return;
    const conversation = await (0, helpers_1.findOrCreateConversation)(customer.id);
    if (!conversation)
        return;
    // Get highest resolution photo and resolve to downloadable URL
    const fileId = photo[photo.length - 1].file_id;
    const file = await ctx.api.getFile(fileId);
    const mediaUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message?.caption || '';
    await supabase_1.supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: caption,
        message_type: 'image',
        media_url: mediaUrl,
        telegram_message_id: ctx.message?.message_id || null,
    });
    await ctx.reply('✅ Comprobante recibido. Un agente lo revisará en breve.');
}
//# sourceMappingURL=photo.js.map