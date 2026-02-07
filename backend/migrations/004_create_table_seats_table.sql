-- Migration: 004_create_table_seats_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS table_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id),
  position INT NOT NULL,
  stack DECIMAL(15,4),
  is_seated BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP,
  CHECK (position >= 0),
  CHECK (stack IS NULL OR stack >= 0)
);

CREATE INDEX idx_table_seats_table_id ON table_seats(table_id);
CREATE INDEX idx_table_seats_player_id ON table_seats(player_id);
CREATE UNIQUE INDEX idx_table_seats_unique_position ON table_seats(table_id, position);
