-- Centralize tutorial activation in Settings -> Workspace.
-- Tutorials are now opt-in instead of appearing automatically by default.
-- Existing TRUE values are reset once so no legacy default can keep covering pages.

ALTER TABLE user_preferences
  ALTER COLUMN tutorials_enabled SET DEFAULT FALSE;

UPDATE user_preferences
SET tutorials_enabled = FALSE
WHERE tutorials_enabled IS DISTINCT FROM FALSE;
