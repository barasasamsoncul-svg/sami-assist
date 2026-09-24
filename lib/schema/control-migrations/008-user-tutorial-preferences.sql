-- SaMi durable personal tutorial preference.
-- Additive Control DB migration: existing users remain enabled by default.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS tutorials_enabled BOOLEAN NOT NULL DEFAULT TRUE;
