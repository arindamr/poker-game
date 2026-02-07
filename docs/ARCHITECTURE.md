# Architecture

Detailed system architecture, component interactions, and deployment strategy.

## System Diagram

[See plan-multiplayerPokerApp.prompt.md for Mermaid diagram]

### Client Layer
- Flutter Web (browser)
- Flutter iOS (App Store)
- Flutter Android (Google Play)

### Transport Layer
- Nginx/Load Balancer with TLS 1.3
- WebSocket + REST endpoints

### Backend Layer
- Node.js cluster with:
  - WebSocket server (Socket.IO)
  - REST API (Express.js)
  - Poker game engine
  - Authentication service (JWT)
  - Session manager

### Data Layer
- PostgreSQL (users, games, histories)
- Redis (sessions, caching)

## Design Patterns

- **MVC** for API layer
- **Event-Driven** for WebSocket communications
- **State Machine** for game logic
- **Provider pattern** for Flutter state management

## Scalability Considerations

- Horizontal scaling with load balancer
- Database connection pooling via Redis
- Stateless API servers for easy scaling
- WebSocket server affinity requirements

---

*Full details pending Phase 1 completion*
