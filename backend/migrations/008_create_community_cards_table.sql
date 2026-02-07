-- Migration: 008_create_community_cards_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS community_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  card_position INT NOT NULL,
  card VARCHAR(2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (card_position >= 0 AND card_position <= 4)
);

CREATE INDEX idx_community_cards_game_id ON community_cards(game_id);
CREATE UNIQUE INDEX idx_community_cards_unique_position ON community_cards(game_id, card_position);
