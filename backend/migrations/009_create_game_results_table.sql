-- Migration: 009_create_game_results_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id),
  player_position INT,
  hole_cards VARCHAR(5),
  best_hand VARCHAR(100),
  final_stack DECIMAL(15,4),
  win_amount DECIMAL(15,4),
  finish_position INT,
  CHECK (final_stack IS NULL OR final_stack >= 0),
  CHECK (win_amount IS NULL OR win_amount >= 0)
);

CREATE INDEX idx_game_results_game_id ON game_results(game_id);
CREATE INDEX idx_game_results_player_id ON game_results(player_id);
CREATE INDEX idx_game_results_finish_position ON game_results(finish_position);
