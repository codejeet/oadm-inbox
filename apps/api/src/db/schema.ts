import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    passHash: text('pass_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex('users_name_uq').on(t.name),
  })
);

export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('tokens_token_hash_uq').on(t.tokenHash),
    userIdIdx: index('tokens_user_id_idx').on(t.userId),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'set null' }),
    fromName: text('from_name').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    ackedAt: timestamp('acked_at', { withTimezone: true }),
  },
  (t) => ({
    inboxIdx: index('messages_inbox_idx').on(t.toUserId, t.ackedAt, t.createdAt),
  })
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index('webhooks_user_id_idx').on(t.userId),
    userUrlIdx: uniqueIndex('webhooks_user_url_uq').on(t.userId, t.url),
  })
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    webhookIdx: index('webhook_deliveries_webhook_idx').on(t.webhookId),
    messageIdx: index('webhook_deliveries_message_idx').on(t.messageId),
    pendingIdx: index('webhook_deliveries_pending_idx').on(t.status, t.nextAttemptAt),
  })
);
