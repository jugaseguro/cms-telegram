"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (!BOT_TOKEN) {
    console.error('Error: BOT_TOKEN no está definido en las variables de entorno.');
    process.exit(1);
}
if (!WEBHOOK_URL) {
    console.error('Error: WEBHOOK_URL no está definido en las variables de entorno.');
    process.exit(1);
}
const webhookUrl = `${WEBHOOK_URL}/webhook`;
async function setWebhook() {
    console.log(`Registrando webhook en: ${webhookUrl}`);
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await response.json();
    if (data.ok) {
        console.log('Webhook registrado correctamente:', data.description);
    }
    else {
        console.error('Error al registrar webhook:', data.description);
        process.exit(1);
    }
}
setWebhook().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=setWebhook.js.map