-- Migration: 005_create_games_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES game_tables(id),
  hand_number INT,
  game_start_time TIMESTAMP NOT NULL,
  game_end_time TIMESTAMP,
  button_position INT,
  small_blind_position INT,
  big_blind_position INT,
  final_pot DECIMAL(15,4),
  winner_id UUID REFERENCES users(id),
  status VARCHAR(50),
  CHECK (final_pot IS NULL OR final_pot >= 0)
);

CREATE INDEX idx_games_table_id ON games(table_id);
CREATE INDEX idx_games_winner_id ON games(winner_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_game_start_time ON games(game_start_time);
