# Integration Testing Guide - Frontend & Backend

## Overview

This guide provides comprehensive instructions for testing the integration between the Flutter frontend and Node.js backend, ensuring all systems work together correctly.

## Pre-Integration Testing Checklist

### Backend Prerequisites
- [ ] PostgreSQL 15+ running locally or accessible
- [ ] Redis 7+ running locally or accessible
- [ ] Backend server running (`npm run dev`)
- [ ] All database migrations applied (`npm run migrate`)
- [ ] Environment variables configured (.env file)

### Frontend Prerequisites
- [ ] Flutter 3.0+ installed
- [ ] Dart 3.0+ installed
- [ ] Dependencies installed (`flutter pub get`)
- [ ] Code generation complete (`flutter pub run build_runner build`)
- [ ] Android/iOS SDK configured

### Network Prerequisites
- [ ] Backend listening on `http://localhost:3000`
- [ ] WebSocket available on `ws://localhost:3000`
- [ ] CORS configured to allow frontend origin
- [ ] No firewall blocking local connections

## Integration Test Scenarios

### 1. Authentication Flow

#### Test 1.1: User Registration
```
1. Open LoginScreen
2. Toggle to registration mode
3. Enter email: test@example.com
4. Enter password: TestPassword123
5. Tap Sign Up
Expected:
  - Loading spinner appears
  - No errors displayed
  - Navigated to LobbyScreen
  - User balance displayed
Backend:
  - POST /api/auth/register succeeds
  - User created in database
  - Tokens returned and valid
```

#### Test 1.2: User Login
```
1. From LoginScreen
2. Tap Sign In (if registered)
3. Enter registered email
4. Enter correct password
5. Tap Sign In
Expected:
  - Loading spinner
  - Navigate to LobbyScreen
  - User email displayed in header
  - Balance shown correctly
Backend:
  - POST /api/auth/login succeeds
  - JWT token issued
  - Session created in database
```

#### Test 1.3: Token Refresh
```
1. Login successfully
2. Wait 5+ minutes (token expiration)
3. Attempt any API call (load profile, etc.)
Expected:
  - No user-visible interruption
  - Request succeeds after token refresh
  - New access token obtained
Backend:
  - Token expiration detected
  - Refresh token validated
  - New token issued
  - User session updated
```

#### Test 1.4: Logout
```
1. Login successfully
2. Tap logout button in lobby header
Expected:
  - Tokens cleared from device storage
  - Navigate back to LoginScreen
  - No cached user data displayed
Backend:
  - Session invalidated
  - Refresh token revoked
```

### 2. User Profile & Balance

#### Test 2.1: Profile Loading
```
1. Login successfully
2. Tap profile icon
Expected:
  - Profile screen loads
  - Email displayed
  - Balance shown
  - Statistics displayed
Backend:
  - GET /api/users/profile succeeds
  - GET /api/users/stats succeeds
  - Data matches database
```

#### Test 2.2: Deposit Funds
```
1. On ProfileScreen
2. Tap Deposit button
3. Enter amount: 100
4. Tap Submit
Expected:
  - Loading spinner appears
  - Balance updates immediately
  - Dialog closes
Backend:
  - POST /api/users/deposit succeeds
  - Balance updated in database
  - Transaction logged
```

#### Test 2.3: Withdraw Funds
```
1. On ProfileScreen
2. Tap Withdraw button
3. Enter amount: 50
4. Tap Submit
Expected:
  - Balance decreases
  - Dialog closes
  - No errors
Backend:
  - POST /api/users/withdraw succeeds
  - Balance updated
  - Transaction logged
```

### 3. Table Management

#### Test 3.1: Load Available Tables
```
1. Login successfully (on LobbyScreen)
2. Tables should load automatically
Expected:
  - List of tables displayed
  - Blind levels shown
  - Player counts displayed
  - Refresh works manually
Backend:
  - GET /api/tables succeeds
  - Returns all active tables
  - Data includes blinds, player count
```

#### Test 3.2: Create New Table
```
1. On LobbyScreen
2. Tap floating action button
3. Set Small Blind: 1
4. Set Big Blind: 2
5. Set Max Players: 6
6. Tap Create
Expected:
  - Table dialog closes
  - New table appears in list
  - User is automatically joined
Backend:
  - POST /api/tables/create succeeds
  - Table created in database
  - User assigned to seat
```

#### Test 3.3: Join Existing Table
```
1. On LobbyScreen
2. Tap any table in list
Expected:
  - Navigate to GameScreen
  - Table details displayed
  - WebSocket connects
  - Game state updates received
Backend:
  - POST /api/tables/{id}/join succeeds
  - User added to table_seats
  - WebSocket authenticated
```

#### Test 3.4: Leave Table
```
1. On GameScreen
2. Tap back/leave button
Expected:
  - WebSocket disconnects
  - Navigate back to LobbyScreen
  - Return to lobby with updated balance
Backend:
  - POST /api/tables/{id}/leave succeeds
  - User removed from seats
  - Session cleaned up
```

### 4. WebSocket Real-Time Synchronization

#### Test 4.1: Join Table WebSocket
```
1. From LobbyScreen, join table
2. Check browser console/backend logs
Expected:
  - WebSocket connection established
  - Socket ID assigned
  - GAME_STATE event received
  - UI updates with initial game state
Backend:
  - Socket connected event fired
  - User authenticated via JWT
  - Game state broadcast to client
```

#### Test 4.2: Player Action Broadcasting
```
1. Two users on same table
2. User 1 takes action (fold)
3. User 2 should see action
Expected:
  - User 2 receives PLAYER_ACTION_BROADCAST
  - UI updates to show folded status
  - Action appears in real-time
Backend:
  - POST /api/games/action received
  - Game state updated
  - Event broadcast to all players at table
```

#### Test 4.3: Hand Result Broadcasting
```
1. Game progresses to showdown
2. Winner determined
3. Both players receive result
Expected:
  - HAND_RESULT event received
  - Winner announced
  - Pot distributed
  - Chips updated
Backend:
  - Hand evaluated
  - Winner determined
  - HAND_RESULT event broadcast
  - Game marked as complete
```

#### Test 4.4: WebSocket Reconnection
```
1. User connected to table
2. Disconnect network (disable WiFi/airplane mode)
3. Wait 10 seconds
4. Reconnect network
Expected:
  - Automatic reconnection attempted
  - Connection restored
  - Game state synchronized
  - No data loss
Backend:
  - Connection lost detected
  - Client attempts reconnect
  - Automatic re-authentication
  - State synchronized on reconnect
```

### 5. Game Flow Integration

#### Test 5.1: Complete Game Scenario
```
1. Create table with 2 players (SB $1, BB $2)
2. Both players buy in $100
3. Game starts
4. Deal cards
5. Pre-flop: Player 1 raises
6. Pre-flop: Player 2 calls
7. Flop dealt
8. Turn dealt
9. River dealt
10. Showdown evaluation
11. Winner announcement
Expected:
  - All screens update correctly
  - Cards display properly
  - Pot calculated accurately
  - Winner determined correctly
  - Balance updated
Backend:
  - All game state transitions correct
  - Cards dealt from shuffled deck
  - Actions processed in correct order
  - Pot calculations accurate
  - Results stored in hand_history
```

#### Test 5.2: All-In Scenario
```
1. Player has $50 remaining
2. Player goes all-in with $50
3. Other players continue
4. Hand resolves
Expected:
  - Side pot calculated
  - All-in player highlighted
  - Correct pot distributed
  - Side pot handled correctly
Backend:
  - PotCalculator handles side pots
  - All-in status tracked
  - Results calculated correctly
```

### 6. Error Handling & Edge Cases

#### Test 6.1: Network Error Handling
```
1. Login
2. Pull network connection
3. Attempt action on table
Expected:
  - Error message displayed
  - Retry mechanism offered
  - App doesn't crash
  - State preserved
Backend:
  - Timeout detected
  - Error response sent
```

#### Test 6.2: Invalid Input
```
1. On table, attempt invalid action
2. E.g., fold when already folded
Expected:
  - Error message displayed
  - Action not executed
  - Game state unchanged
Backend:
  - Validation catches error
  - 400 Bad Request returned
  - Action not recorded
```

#### Test 6.3: Insufficient Funds
```
1. Attempt to join table with buy-in > balance
Expected:
  - Button disabled or shows error
  - Cannot join table
Backend:
  - POST /tables/{id}/join fails
  - 400 or 402 error returned
```

#### Test 6.4: Concurrent Action Conflict
```
1. Two players attempt to submit actions simultaneously
Expected:
  - Both actions processed
  - Game proceeds correctly
  - No data corruption
Backend:
  - Transaction isolation prevents conflicts
  - One action processed first
  - Correct game state maintained
```

### 7. Performance & Scalability

#### Test 7.1: API Response Time
```
Measure response times:
- POST /api/auth/login: <100ms
- GET /api/tables: <100ms
- POST /api/games/action: <50ms
Expected:
  - All endpoints responsive
  - No noticeable lag
Backend:
  - Database queries optimized
  - Indexes used effectively
```

#### Test 7.2: WebSocket Latency
```
Send 10 player actions:
- Measure time from emit to UI update
Expected:
  - <100ms for local network
  - <200ms for production network
Backend:
  - Event processing efficient
  - Broadcast quick
```

#### Test 7.3: Memory Usage
```
1. Login
2. Join table
3. Play multiple hands
4. Monitor memory usage
Expected:
  - Memory stable
  - No memory leaks
  - <150MB on mobile
Frontend:
  - Providers disposed correctly
  - Listeners removed
  - No orphaned streams
```

## Automated Integration Test Script

### Setup
```bash
# Terminal 1: Start backend
cd backend
npm install
npm run migrate
npm run dev

# Terminal 2: Start frontend
cd frontend
flutter pub get
flutter pub run build_runner build
flutter run
```

### Manual Test Execution Order

1. **Authentication Tests** (Test 1.1 - 1.4)
   - Register new user
   - Login
   - Check token refresh
   - Logout

2. **User Management Tests** (Test 2.1 - 2.3)
   - Load profile
   - Deposit funds
   - Withdraw funds

3. **Table Management Tests** (Test 3.1 - 3.4)
   - Load tables
   - Create table
   - Join table
   - Leave table

4. **WebSocket Tests** (Test 4.1 - 4.4)
   - Connect to WebSocket
   - Player action broadcast
   - Hand result broadcast
   - Reconnection handling

5. **Game Flow Tests** (Test 5.1 - 5.2)
   - Complete game scenario
   - All-in scenario

6. **Error Handling Tests** (Test 6.1 - 6.4)
   - Network errors
   - Invalid input
   - Insufficient funds
   - Concurrent actions

7. **Performance Tests** (Test 7.1 - 7.3)
   - API response times
   - WebSocket latency
   - Memory usage

## Test Report Template

```markdown
# Integration Test Report

## Date: [Date]
## Tester: [Name]
## Backend Version: [commit hash]
## Frontend Version: [commit hash]

### Authentication Tests
- [ ] Test 1.1 Registration - PASS/FAIL
- [ ] Test 1.2 Login - PASS/FAIL
- [ ] Test 1.3 Token Refresh - PASS/FAIL
- [ ] Test 1.4 Logout - PASS/FAIL

### User Management Tests
- [ ] Test 2.1 Profile Loading - PASS/FAIL
- [ ] Test 2.2 Deposit - PASS/FAIL
- [ ] Test 2.3 Withdraw - PASS/FAIL

### Table Management Tests
- [ ] Test 3.1 Load Tables - PASS/FAIL
- [ ] Test 3.2 Create Table - PASS/FAIL
- [ ] Test 3.3 Join Table - PASS/FAIL
- [ ] Test 3.4 Leave Table - PASS/FAIL

### WebSocket Tests
- [ ] Test 4.1 Join WebSocket - PASS/FAIL
- [ ] Test 4.2 Player Action - PASS/FAIL
- [ ] Test 4.3 Hand Result - PASS/FAIL
- [ ] Test 4.4 Reconnection - PASS/FAIL

### Game Flow Tests
- [ ] Test 5.1 Complete Game - PASS/FAIL
- [ ] Test 5.2 All-In - PASS/FAIL

### Error Handling Tests
- [ ] Test 6.1 Network Error - PASS/FAIL
- [ ] Test 6.2 Invalid Input - PASS/FAIL
- [ ] Test 6.3 Insufficient Funds - PASS/FAIL
- [ ] Test 6.4 Concurrent Actions - PASS/FAIL

### Performance Tests
- [ ] Test 7.1 API Response Time - PASS/FAIL
- [ ] Test 7.2 WebSocket Latency - PASS/FAIL
- [ ] Test 7.3 Memory Usage - PASS/FAIL

### Summary
- Total Tests: 28
- Passed: [X]
- Failed: [Y]
- Success Rate: [Z]%

### Issues Found
1. [Issue description]
2. [Issue description]

### Notes
[Any additional observations]
```

## Debugging Tips

### Frontend Debugging
```dart
// Enable debug logging
import 'package:logger/logger.dart';

final logger = Logger();
logger.d('Debug message'); // Debug
logger.i('Info message');  // Info
logger.w('Warning');       // Warning
logger.e('Error');         // Error

// Check WebSocket connection
print('Connected: ${WebSocketService.isConnected}');

// Inspect provider state
print('User: ${UserProvider.user}');
print('Game: ${GameProvider.gameState}');
```

### Backend Debugging
```javascript
// Check database connection
await db.query('SELECT NOW()'); // Verify connection

// Check Redis connection
redis.ping((err, reply) => {
  console.log('Redis:', err ? err : reply);
});

// Monitor WebSocket events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  console.log('Auth:', socket.handshake.auth);
});

// Log API requests
console.log('Request:', req.method, req.path, req.user?.id);
```

## Post-Integration Checklist

- [ ] All 28 tests passing
- [ ] No console errors
- [ ] No unhandled exceptions
- [ ] Network latency acceptable
- [ ] Data consistency verified
- [ ] Performance benchmarks met
- [ ] Security checks passed
- [ ] Documentation updated
- [ ] Ready for Phase 5 deployment

---

**Integration Testing Status**: Ready
**Test Coverage**: 28 scenarios
**Estimated Duration**: 4-6 hours for complete manual testing
