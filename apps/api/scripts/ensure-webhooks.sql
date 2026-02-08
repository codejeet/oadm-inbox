-- Idempotent safety net for webhooks tables/constraints/indexes.
-- Use when prod is missing webhooks tables or migrations were skipped.

CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_delivered_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  webhook_id uuid NOT NULL,
  message_id uuid NOT NULL,
  status text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  next_attempt_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  response_status integer,
  response_body text,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhooks_user_id_users_id_fk'
  ) THEN
    ALTER TABLE public.webhooks
      ADD CONSTRAINT webhooks_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id)
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_webhook_id_webhooks_id_fk'
  ) THEN
    ALTER TABLE public.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_webhook_id_webhooks_id_fk
      FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id)
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_message_id_messages_id_fk'
  ) THEN
    ALTER TABLE public.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_message_id_messages_id_fk
      FOREIGN KEY (message_id) REFERENCES public.messages(id)
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS webhooks_user_id_idx ON public.webhooks USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS webhooks_user_url_uq ON public.webhooks USING btree (user_id, url);
CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON public.webhook_deliveries USING btree (webhook_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_message_idx ON public.webhook_deliveries USING btree (message_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx ON public.webhook_deliveries USING btree (status, next_attempt_at);
