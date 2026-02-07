# Database Schema

Complete PostgreSQL schema for the poker application.

## Tables Overview

### Core Tables
- **users** - User accounts and profiles
- **sessions** - Active user sessions with JWT tokens
- **game_tables** - Poker table configurations
- **table_seats** - Seat assignments and player stacks
- **games** - Individual hands/games
- **hand_history** - Action log for each game
- **player_cards** - Encrypted hole cards
- **community_cards** - Community card log
- **game_results** - Final results and payouts

### Security Tables
- **rng_audit** - RNG seed and deck hashes for verification
- **cheat_detection** - Anti-cheat detection flags and analysis

## Indexes

- User lookups: `username`, `email`
- Session lookups: `user_id`, `token_hash`
- Game lookups: `table_id`, `winner_id`, `game_id`
- Hand history: `game_id`, `player_id`
- Anti-cheat: `user_id`

---

*Full schema definition with migrations pending Phase 2 implementation*
