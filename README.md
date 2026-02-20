# 🎰 Multiplayer Poker Game - Complete Application

A cross-platform multiplayer poker application with enterprise-grade security, built with Flutter (iOS/Android/Web) and Node.js backend, featuring real-time WebSocket synchronization, advanced anti-cheat detection, and comprehensive compliance management.

## 🚀 Quick Start (3 Steps)

### Step 1: Initialize Docker Environment
```bash
./setup-docker.sh
```

### Step 2: Run Automated Tests
```bash
./test-local.sh
```

### Step 3: Manual Testing
- Use **[Postman Collection](Poker_Game_API.postman_collection.json)** for interactive testing
- Follow **[QUICK_START.md](QUICK_START.md)** for detailed setup

## 📚 Documentation Index

| Resource | Purpose |
|----------|---------|
| **[QUICK_START.md](QUICK_START.md)** | 3-step setup & testing guide |
| **[TESTING_GUIDE.md](TESTING_GUIDE.md)** | Detailed manual testing with curl examples |
| **[INTEGRATION_TESTING_GUIDE.md](INTEGRATION_TESTING_GUIDE.md)** | End-to-end frontend/backend test scenarios |
| **[PHASE_5_GUIDE.md](PHASE_5_GUIDE.md)** | Security features & implementation |
| **[docs/API_SCHEMA.md](docs/API_SCHEMA.md)** | REST and WebSocket API reference |
| **[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** | PostgreSQL schema reference |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | System architecture overview |
| **[docs/GAMEPLAY_FLOW.md](docs/GAMEPLAY_FLOW.md)** | Poker state model and game flow |
| **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** | Contribution guidelines |
| **[Poker_Game_API.postman_collection.json](Poker_Game_API.postman_collection.json)** | Postman API collection |

## 🏗️ Project Structure

```
poker-game/
├── backend/                      # Node.js Express backend
│   ├── src/
│   │   ├── api/                 # Route handlers
│   │   │   ├── authRoutes.js
│   │   │   ├── gameRoutes.js    [Phase 5: Anti-cheat]
│   │   │   ├── securityRoutes.js [Phase 5: 2FA, KYC, compliance]
│   │   │   └── ...
│   │   ├── middleware/          # Express middleware
│   │   ├── utils/               # Utility services
│   │   ├── game/                # Poker engine
│   │   ├── monitoring/          # Metrics & alerting
│   │   └── server.js            # Main Express server
│   └── test/                    # Test suite
│
├── frontend/                     # Flutter app
│   ├── lib/
│   │   ├── security/            [Phase 5: Certificate pinning]
│   │   ├── screens/
│   │   ├── widgets/
│   │   └── services/
│   └── test/
│
├── deployment/                   # Infrastructure
│   └── aws/
│       ├── docker-compose.yml
│       ├── nginx.conf
│       ├── cloudformation-template.json
│       └── Dockerfile
│
└── docs/                        # Documentation
    ├── API_SCHEMA.md
    ├── ARCHITECTURE.md
    ├── CONTRIBUTING.md
    ├── DATABASE_SCHEMA.md
    └── GAMEPLAY_FLOW.md
```

## ✨ Features (Phase 5 Complete)

### Security & Authentication
- ✅ JWT-based authentication
- ✅ TOTP 2FA with backup codes
- ✅ Session management
- ✅ Certificate pinning (mobile)

### Game Engine
- ✅ Texas Hold'em poker
- ✅ Real-time multiplayer
- ✅ Hand evaluation & ranking
- ✅ Pot calculation
- ✅ WebSocket synchronization

### Anti-Cheat Detection
- ✅ Real-Time Actions (RTA) detection
- ✅ Multi-account detection
- ✅ Collusion pattern analysis
- ✅ Shuffle verification

### Compliance & Responsible Gaming
- ✅ KYC verification
- ✅ AML monitoring
- ✅ OFAC sanctions checking
- ✅ SAR generation
- ✅ Deposit limits
- ✅ Self-exclusion

### Infrastructure
- ✅ Docker containerization
- ✅ Redis caching
- ✅ PostgreSQL database
- ✅ Nginx reverse proxy
- ✅ AWS CloudFormation
- ✅ TLS/SSL encryption

### Monitoring & Observability
- ✅ 40+ tracked metrics
- ✅ 8 alert rules
- ✅ 4 dashboards
- ✅ Prometheus export
- ✅ Real-time logging

## 📊 Testing Infrastructure

### Automated Testing
```bash
# Run complete test suite
./test-local.sh

# Tests 25+ endpoints across:
# - Health & Monitoring
# - Authentication
# - 2FA functionality
# - Game management
# - Compliance features
# - Security headers
# - Rate limiting
# - Database connectivity
```

### Manual Testing
```bash
# Setup: Use Postman collection
# 25+ pre-configured API requests
# Environment variable management
# Response visualization
```

### Integration Testing
```bash
npm test -- test/phase5.integration.test.js
```

## 🔒 Security Features (Phase 5)

### Rate Limiting
- Progressive penalty system
- Redis-backed distributed limiting
- Per-endpoint configuration
- IP-based tracking

### Anti-Cheat
- RTA detection (action timing analysis)
- Multi-account detection (device fingerprinting)
- Collusion detection (pattern analysis)
- Automatic banning (risk score > 0.85)

### Compliance
- **KYC**: Document verification
- **AML**: Transaction monitoring
- **OFAC**: Sanctions list checking
- **SAR**: Automatic report generation
- **Limits**: Deposit & withdrawal limits

### API Security
- Security headers (CSP, HSTS, X-Frame-Options)
- CORS configuration
- Body size limits
- Input validation
- Rate limiting per endpoint

## 🎯 API Endpoints (25+)

### Health & Monitoring (3)
- `GET /health` - System health
- `GET /metrics` - Prometheus metrics
- `GET /admin/metrics` - Admin dashboard

### Authentication (3)
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token

### 2FA Security (5)
- `POST /api/security/2fa/enable` - Enable 2FA
- `POST /api/security/2fa/verify-setup` - Verify setup
- `GET /api/security/2fa/status` - Check status
- `POST /api/security/2fa/backup-code` - Use backup code
- `POST /api/security/2fa/disable` - Disable 2FA

### Compliance (2)
- `POST /api/security/kyc/initiate` - Start KYC
- `GET /api/security/kyc/status` - Check KYC status

### Game Management (7)
- `POST /api/game/tables` - Create game
- `POST /api/game/tables/{id}/join` - Join game
- `GET /api/game/tables/{id}/state` - Get game state
- `POST /api/game/tables/{id}/action` - Player action
- `POST /api/game/tables/{id}/verify-shuffle` - Verify shuffle
- `POST /api/game/tables/{id}/cash-out` - Cash out
- `GET /api/game/tables/{id}/history` - Hand history

### Financial (2)
- `POST /api/security/financial/deposit` - Make deposit
- `POST /api/security/responsible-gaming/self-exclude` - Self-exclude

### Admin (1)
- `GET /api/security/compliance/dashboard` - Compliance dashboard

## 📈 Project Status

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Architecture | ✅ Complete | 100% |
| Phase 2: Backend | ✅ Complete | 100% |
| Phase 3: Poker Engine | ✅ Complete | 100% |
| Phase 4: Flutter UI | ✅ Complete | 100% |
| Phase 5: Security | ✅ Complete | 100% |
| **Overall** | **✅ Ready** | **98%** |

**Remaining 2%**: Load testing, penetration testing, production deployment

## 💻 Prerequisites

- **Docker** & **Docker Compose** (latest)
- **Node.js** 18.0.0+ with npm 9.0.0+
- **curl** or **Postman** (for API testing)
- **psql** & **redis-cli** (optional, for database inspection)

## 🚀 Deployment Options

### Local Development
```bash
./setup-docker.sh
./test-local.sh
```

### Staging (AWS)
```bash
aws cloudformation create-stack \
  --stack-name poker-game-staging \
  --template-body file://deployment/aws/cloudformation-template.json
```

### Production
See [deployment/aws/cloudformation-template.json](deployment/aws/cloudformation-template.json)

## 📞 Support

- **Getting Started**: [QUICK_START.md](QUICK_START.md)
- **Testing Help**: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Feature Details**: [PHASE_5_GUIDE.md](PHASE_5_GUIDE.md)
- **API Collection**: [Poker_Game_API.postman_collection.json](Poker_Game_API.postman_collection.json)

## ✅ Project Metrics

- **Total Lines of Code**: 11,600+
- **Backend Code**: 5,200+ lines
- **Frontend Code**: 3,500+ lines
- **Test Coverage**: 900+ lines
- **Documentation**: 2,500+ lines
- **Security Features**: 2,100+ lines
- **API Endpoints**: 25+
- **Test Scenarios**: 27+

## 📅 Status

**Status**: ✅ Ready for Local Testing & Validation  
**Last Updated**: 2024-01-15  
**Version**: 1.0.0 (Phase 5 Complete)

### 4. Frontend Setup (Flutter)

```bash
cd frontend
flutter pub get
flutter run -d chrome  # For web
# or
flutter run -d ios     # For iOS
flutter run -d android # For Android
```

## Development

### Backend

- **Start dev server**: `npm run dev`
- **Run tests**: `npm test`
- **Run linter**: `npm run lint:fix`
- **Database migrations**: `npm run migrate`

### Frontend

- **Run on web**: `flutter run -d chrome`
- **Run on iOS**: `flutter run -d ios`
- **Run on Android**: `flutter run -d android`
- **Build web**: `flutter build web`

## API Documentation

See [docs/API_SCHEMA.md](docs/API_SCHEMA.md) for REST and WebSocket endpoints.

## Database Schema

See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) for complete schema.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design details.

## Security

See [PHASE_5_GUIDE.md](PHASE_5_GUIDE.md) for security implementation.

## Contributing

Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before submitting PRs.

## License

MIT
