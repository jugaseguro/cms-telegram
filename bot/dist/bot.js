"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = createBot;
const grammy_1 = require("grammy");
const start_1 = require("./handlers/start");
const message_1 = require("./handlers/message");
const photo_1 = require("./handlers/photo");
const document_1 = require("./handlers/document");
function createBot(token) {
    const bot = new grammy_1.Bot(token);
    // Error handler
    bot.catch((err) => {
        console.error('Bot error:', err);
    });
    // Commands
    bot.command('start', start_1.handleStart);
    // Separate handlers for each message type
    bot.on('message:photo', photo_1.handlePhoto);
    bot.on('message:document', document_1.handleDocument);
    bot.on('message:text', message_1.handleTextMessage);
    return bot;
}
//# sourceMappingURL=bot.js.map