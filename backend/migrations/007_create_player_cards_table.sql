-- Migration: 007_create_player_cards_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS player_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  card_1 VARCHAR(2) NOT NULL,
  card_2 VARCHAR(2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_player_cards_game_id ON player_cards(game_id);
CREATE INDEX idx_player_cards_player_id ON player_cards(player_id);
CREATE UNIQUE INDEX idx_player_cards_unique_game_player ON player_cards(game_id, player_id);
