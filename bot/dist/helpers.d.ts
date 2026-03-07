import type { Customer, Conversation } from './lib/types';
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