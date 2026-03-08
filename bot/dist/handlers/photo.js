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
    // Dedup: skip before downloading file to save bandwidth
    if (await (0, helpers_1.isMessageAlreadySaved)(conversation.id, ctx.message?.message_id))
        return;
    // Get highest resolution photo and resolve to downloadable URL
    const fileId = photo[photo.length - 1].file_id;
    const file = await ctx.api.getFile(fileId);
    const telegramUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message?.caption || '';
    // Download from Telegram and upload to Supabase Storage
    let mediaUrl = telegramUrl;
    try {
        const response = await fetch(telegramUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = file.file_path?.split('.').pop() || 'jpg';
        const storagePath = `customer-uploads/${conversation.id}/${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase_1.supabase.storage
            .from('chat-attachments')
            .upload(storagePath, buffer, {
            contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });
        if (!uploadError && uploadData) {
            const { data: urlData } = supabase_1.supabase.storage
                .from('chat-attachments')
                .getPublicUrl(uploadData.path);
            mediaUrl = urlData.publicUrl;
        }
    }
    catch {
        // Fallback to Telegram CDN URL if upload fails
    }
    await (0, helpers_1.insertMessageSafe)({
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