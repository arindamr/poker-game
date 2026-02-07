-- Migration: 006_create_hand_history_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  action_order INT NOT NULL,
  player_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  amount DECIMAL(15,4),
  street VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (amount IS NULL OR amount >= 0)
);

CREATE INDEX idx_hand_history_game_id ON hand_history(game_id);
CREATE INDEX idx_hand_history_player_id ON hand_history(player_id);
CREATE INDEX idx_hand_history_action ON hand_history(action);
CREATE INDEX idx_hand_history_street ON hand_history(street);
