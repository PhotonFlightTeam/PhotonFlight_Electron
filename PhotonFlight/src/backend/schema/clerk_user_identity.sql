BEGIN;

ALTER TABLE public.app_user
    DROP COLUMN password_hash,
    ADD COLUMN clerk_user_id text NOT NULL,
    ADD CONSTRAINT app_user_clerk_user_id_key UNIQUE (clerk_user_id);

COMMIT;
