-- Add is_paused to bots table to allow pausing AI/auto-responses without shutting down process
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
