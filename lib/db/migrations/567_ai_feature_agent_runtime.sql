-- Align ai_feature with the Browser Agent / Vendi runtime feature.
-- Safe to replay on databases that already have this enum value.
ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'agent_runtime';
