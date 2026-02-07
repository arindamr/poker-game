# API Schema

REST API endpoints and WebSocket event definitions for the poker application.

## REST Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login (returns JWT)
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/verify` - Verify token validity

### Users
- `GET /api/v1/users/:userId` - Get user profile
- `PUT /api/v1/users/:userId` - Update user profile
- `GET /api/v1/users/:userId/balance` - Get account balance
- `POST /api/v1/users/:userId/deposit` - Add chips
- `POST /api/v1/users/:userId/withdraw` - Cash out chips

### Tables
- `GET /api/v1/tables` - List all active tables
- `POST /api/v1/tables` - Create new table
- `GET /api/v1/tables/:tableId` - Get table details
- `POST /api/v1/tables/:tableId/join` - Join table
- `DELETE /api/v1/tables/:tableId/leave` - Leave table
- `GET /api/v1/tables/:tableId/seats` - Get seat availability

### Games & History
- `GET /api/v1/games/:gameId` - Get game details
- `GET /api/v1/games/:gameId/history` - Get hand history
- `GET /api/v1/users/:userId/history` - Get user hand histories

### Statistics
- `GET /api/v1/users/:userId/stats` - Get player statistics
- `GET /api/v1/leaderboard` - Global leaderboard

## WebSocket Events

### Client → Server
- `PLAYER_ACTION` - Player action (fold, check, call, raise, all-in)
- `PLAYER_READY` - Player ready for next hand
- `CHAT_MESSAGE` - Table chat

### Server → Client
- `GAME_STATE` - Current game state broadcast
- `PLAYER_ACTION_BROADCAST` - Broadcast of player action
- `HAND_RESULT` - Result of completed hand
- `TABLE_UPDATED` - Table configuration changed
- `ERROR` - Error response

---

*Full endpoint details and payload schemas pending Phase 2 implementation*
