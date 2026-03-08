import type { Customer, Conversation } from './lib/types';
/**
 * Check if a message with this telegram_message_id already exists in the conversation.
 */
export declare function isMessageAlreadySaved(conversationId: string, telegramMessageId: number | undefined): Promise<boolean>;
/**
 * Insert a message, silently ignoring unique constraint violations (duplicate telegram_message_id).
 */
export declare function insertMessageSafe(messageData: {
    conversation_id: string;
    sender_type: string;
    sender_id?: string;
    content?: string;
    message_type: string;
    media_url?: string;
    telegram_message_id?: number | null;
}): Promise<boolean>;
/**
 * Find existing customer by telegram_id or create a new one.
 */
export declare function findOrCreateCustomer(from: {
    id: number;
    username?: string;
    first_name: string;
    last_name?: string;
}, uuidLanding?: string): Promise<Customer | null>;
/**
 * Find an open/pending conversation for a customer, or create a new one.
 */
export declare function findOrCreateConversation(customerId: string): Promise<Conversation | null>;
//# sourceMappingURL=helpers.d.ts.map