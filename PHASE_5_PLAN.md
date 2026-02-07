# Phase 5: Security Hardening & Deployment

## Overview
Final phase to secure the application, implement anti-cheat measures, and prepare for production deployment across iOS, Android, and Web platforms.

## Phase 5 Deliverables

### 1. Backend Security Hardening

#### 1.1 Rate Limiting Enhancement
**Status**: To Do

Implementation:
```javascript
// Enhanced rate limiting with progressive penalties
const rateLimiter = new Map(); // Store attempts per user

middleware: checkRateLimit(maxAttempts, windowMs, penalty)
- 1st violation: 10-minute cooldown
- 2nd violation: 1-hour cooldown
- 3rd violation: 24-hour ban
- Permanent: Manual review required

Protected endpoints:
- POST /register (5 attempts per hour)
- POST /login (10 attempts per hour)
- POST /action (100 per minute)
- POST /tables (50 per hour)
```

#### 1.2 CORS & Security Headers
**Status**: To Do

Implementation:
```javascript
// Helmet.js security headers
helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: true,
  hidePoweredBy: true,
  hsts: true,
  noSniff: true,
  xssFilter: true,
})

// CORS configuration
cors({
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
})
```

#### 1.3 Input Validation & Sanitization
**Status**: To Do

Implementation:
- String length limits (username: 3-20, email: 5-255)
- Email format validation (RFC 5322)
- Password requirements (8+ chars, uppercase, number, symbol)
- Amount validation (positive, <= max bet size)
- Card/action validation against game rules
- NoSQL injection prevention (parameterized queries)
- XSS prevention (output encoding)

#### 1.4 Two-Factor Authentication (2FA)
**Status**: To Do

Implementation:
```javascript
// TOTP-based 2FA using speakeasy
1. Enable 2FA endpoint (POST /2fa/enable)
   - Generate secret
   - Return QR code
2. Verify 2FA setup (POST /2fa/verify)
   - Scan QR with authenticator app
   - Submit code to verify
3. Login with 2FA (POST /login/2fa)
   - After password validation
   - Request TOTP code
   - Validate 6-digit code

Backup codes:
- Generate 10 backup codes
- Allow users to download/print
- Store hashed in database
- Single-use codes for account recovery
```

#### 1.5 Session Security
**Status**: To Do

Implementation:
```javascript
// Session management hardening
- SessionID rotation on each auth event
- CSRF token validation (for form submissions)
- Secure session cookies (HttpOnly, Secure, SameSite)
- Session timeout (30 minutes inactivity)
- Concurrent session limit per user (max 3)
- Session audit log (login/logout/IP/device)
```

### 2. Anti-Cheat Detection

#### 2.1 Real-Time Action (RTA) Detection
**Status**: To Do

Detection methods:
```javascript
// Real-Time Action (RTA) anomalies
1. Action timing analysis
   - Decision time < 500ms = suspicious
   - Reaction time pattern anomalies
   - Consistent unnatural timing

2. Action pattern analysis
   - Unusual bet sizing patterns
   - Position-based strategy violations
   - Fold/call/raise ratios anomalies

3. Statistical analysis
   - Win rate > 60% = investigate
   - VPIP (voluntarily put $ in pot) anomalies
   - PFR (pre-flop raise) anomalies

Flagging system:
- Suspicious (flag, monitor)
- High Risk (warning to player)
- Confirmed (suspend account, manual review)
```

#### 2.2 Multi-Account Detection
**Status**: To Do

Detection methods:
```javascript
// Multi-account pattern detection
1. Device fingerprinting
   - Hardware identifiers
   - OS version/device type
   - Browser user agent
   - Installed apps list

2. Network analysis
   - Same IP address
   - Same ISP
   - Geographic clustering
   - VPN/Proxy detection

3. Playing patterns
   - Similar action patterns
   - Collusion statistics
   - Time zone patterns
   - Balance transfer patterns

Action on detection:
- Flag accounts as linked
- Increased monitoring
- Potential suspension if collusion detected
- Manual review process
```

#### 2.3 Collusion Detection
**Status**: To Do

Detection methods:
```javascript
// Collusion detection between players
1. Hand analysis
   - Folding patterns against common opponents
   - Betting patterns synchronized
   - All-in patterns coordinated

2. Equity analysis
   - Frequent favorable runouts
   - Unlikely card sequences
   - Rake abuse patterns

3. Timing correlation
   - Action timing between accounts
   - Simultaneous logins
   - Quick account creation patterns

Risk scoring:
- Low (0-30%): Monitor
- Medium (30-70%): Restrict play, review
- High (70%+): Suspend pending review
```

#### 2.4 Shuffle Integrity Verification
**Status**: To Do

Implementation:
```javascript
// Verify deck shuffle integrity
1. RNG audit log
   - Store every shuffle seed and result
   - Timestamp each shuffle
   - Cryptographic hash of deck
   - Signature by server

2. Statistical testing
   - Chi-square test for randomness
   - Entropy analysis
   - Distribution tests

3. Third-party verification
   - Allow player to request verification
   - Generate verification certificate
   - Include seed + shuffle parameters
   - Publish to public ledger (optional)

Audit table schema:
CREATE TABLE rng_audit (
  id UUID PRIMARY KEY,
  game_id UUID REFERENCES games,
  seed BYTEA NOT NULL,
  shuffled_deck BYTEA NOT NULL,
  deck_hash VARCHAR(64) NOT NULL,
  server_signature VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Frontend Security Hardening

#### 3.1 Code Obfuscation
**Status**: To Do

Implementation:
```bash
# Build with obfuscation
flutter build apk --obfuscate --split-debug-info=build/app/outputs/symbols

# Web obfuscation
flutter build web --dart-define=FLUTTER_WEB_USE_SKIA=true
```

#### 3.2 Certificate Pinning
**Status**: To Do

Implementation:
```dart
// SSL Certificate Pinning
import 'package:http/io_client.dart';

final client = IOClient(HttpClient()
  ..badCertificateCallback = (cert, host, port) {
    // Verify certificate matches pinned certificate
    return _verifyCertificate(cert, host);
  }
);

// OR use flutter_secure_storage for pinned certs
Future<bool> _verifyCertificate(X509Certificate cert, String host) {
  // Compare cert SHA256 hash with pinned value
  final certHash = sha256.convert(cert.der).toString();
  return certHash == PINNED_CERT_HASH;
}
```

#### 3.3 Secure Local Storage
**Status**: To Do

Implementation:
```dart
// Store sensitive data securely
const storage = FlutterSecureStorage();

// Encryption at rest
await storage.write(
  key: 'access_token',
  value: token,
  aOptions: _getAndroidOptions(),
  iOptions: _getIOSOptions(),
);

// Never log sensitive data
logger.i('User logged in'); // ✓ OK
logger.i('Token: $token'); // ✗ NEVER DO THIS
```

#### 3.4 Tamper Detection
**Status**: To Do

Implementation:
```dart
// Detect application tampering
1. Binary signature verification
   - Verify app signing certificate
   - Check modification date
   - Validate package hash

2. Runtime integrity checks
   - Monitor critical code sections
   - Detect debuggers
   - Verify app not running in emulator

3. Response validation
   - Verify API response signatures
   - Check timestamp freshness
   - Validate response HMAC
```

### 4. Deployment & Infrastructure

#### 4.1 Backend Deployment
**Status**: To Do

AWS Deployment:
```bash
# Container setup
docker build -t poker-game-backend .
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/poker-game:latest

# ECS deployment
aws ecs create-service \
  --cluster poker-game-prod \
  --service-name backend \
  --task-definition poker-backend:1 \
  --desired-count 3

# Auto-scaling
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name poker-backend-asg \
  --min-size 2 --max-size 10 --desired-capacity 3

# Load balancing
aws elbv2 create-target-group \
  --name poker-backend-tg \
  --protocol HTTP --port 3000

# RDS database
aws rds create-db-instance \
  --db-instance-identifier poker-db-prod \
  --db-instance-class db.t3.medium \
  --engine postgres

# ElastiCache Redis
aws elasticache create-cache-cluster \
  --cache-cluster-id poker-cache \
  --engine redis \
  --cache-node-type cache.t3.micro
```

#### 4.2 Frontend Deployment

iOS Deployment:
```bash
# TestFlight (closed beta)
flutter build ios --release
xcode -scheme Runner -configuration Release archive
xcodebuild -exportArchive -archivePath build/Runner.xcarchive -exportOptionsPlist ios/ExportOptions.plist

# App Store (production)
# Follow apple review process
```

Android Deployment:
```bash
# Firebase Distribution (closed beta)
flutter build apk --release
firebase appdistribution:distribute build/app/outputs/apk/release/app-release.apk

# Play Store (production)
flutter build appbundle --release
# Upload via Google Play Console
```

Web Deployment:
```bash
flutter build web --release

# Firebase Hosting
firebase deploy --only hosting

# OR AWS S3 + CloudFront
aws s3 sync build/web s3://poker-game-web/
aws cloudfront create-invalidation --distribution-id E123456 --paths "/*"
```

#### 4.3 Monitoring & Analytics
**Status**: To Do

Implementation:
```javascript
// Backend monitoring
1. APM (Application Performance Monitoring)
   - New Relic / DataDog integration
   - Track request latency, error rates
   - Database query performance
   - Redis cache hit rates

2. Logging
   - CloudWatch / ELK stack
   - Structured JSON logging
   - Log levels (ERROR, WARN, INFO, DEBUG)
   - Log retention (90 days)

3. Alerting
   - CPU > 80%
   - Memory > 85%
   - Error rate > 1%
   - API latency p95 > 500ms
   - Database connections > 80%
```

Frontend analytics:
```dart
// Firebase Analytics
FirebaseAnalytics.instance.logEvent(
  name: 'player_action',
  parameters: {
    'action_type': 'fold',
    'table_id': '12345',
    'game_state': 'pre_flop',
  },
);

// Crash reporting
FirebaseCrashlytics.instance.recordError(
  error,
  stackTrace,
  reason: 'Unhandled exception',
);
```

#### 4.4 Backup & Disaster Recovery
**Status**: To Do

Implementation:
```bash
# Database backup
aws rds create-db-snapshot \
  --db-instance-identifier poker-db-prod \
  --db-snapshot-identifier poker-db-backup-$(date +%Y%m%d)

# Automated daily backups
aws rds modify-db-instance \
  --db-instance-identifier poker-db-prod \
  --backup-retention-period 30

# Cross-region replication
aws rds create-db-instance-read-replica \
  --db-instance-identifier poker-db-prod-replica \
  --source-db-instance-identifier poker-db-prod \
  --source-region us-east-1 \
  --region us-west-2

# RTO/RPO targets
# RTO: 1 hour (recovery time objective)
# RPO: 5 minutes (recovery point objective)
```

### 5. Compliance & Legal

#### 5.1 KYC (Know Your Customer)
**Status**: To Do

Implementation:
```javascript
// KYC verification process
1. Document upload
   - Photo ID (passport, driver's license)
   - Proof of address
   - Selfie verification

2. Verification service
   - Use third-party KYC provider (Trulioo, IDology)
   - Automated verification
   - Manual review if needed

3. Tier system
   - Tier 1: Email verification (low limits)
   - Tier 2: ID verification (medium limits)
   - Tier 3: Full KYC (no limits)
```

#### 5.2 AML (Anti-Money Laundering)
**Status**: To Do

Implementation:
```javascript
// AML monitoring
1. Transaction monitoring
   - Large transactions (> $10,000)
   - Unusual patterns
   - Rapid fund movements
   - Structuring detection

2. Sanctions screening
   - Check against OFAC SDN list
   - Regular updates
   - Block sanctioned users

3. Reporting
   - SAR (Suspicious Activity Report)
   - STR (Suspicious Transaction Report)
   - Regulatory filing requirements
```

#### 5.3 Responsible Gaming
**Status**: To Do

Implementation:
```javascript
// Responsible gaming features
1. Deposit limits
   - Daily/weekly/monthly limits
   - User-configurable
   - Hard limits enforced

2. Self-exclusion
   - Temporary (7-90 days)
   - Permanent (no reversal)
   - Mandatory break period

3. Problem gambling resources
   - Display gambling helpline numbers
   - Links to counseling services
   - Self-assessment questionnaire

4. Warnings & alerts
   - Loss warnings
   - Session time warnings
   - Bet size warnings
```

### 6. Testing & QA

#### 6.1 Security Testing
- OWASP Top 10 vulnerability scan
- SQL injection testing
- XSS vulnerability testing
- CSRF token validation
- Authentication bypass attempts
- Authorization bypass attempts
- Rate limiting effectiveness

#### 6.2 Performance Testing
- Load testing (1000+ concurrent users)
- Stress testing (spike to 10x normal load)
- Soak testing (24-hour sustained load)
- Latency testing (p50, p95, p99 percentiles)

#### 6.3 Integration Testing
- Full auth flow (register → login → refresh → logout)
- Game flow (join → deal → play → results)
- WebSocket connection and recovery
- Database consistency
- Cache invalidation

## Implementation Timeline

| Phase | Week | Deliverable | Priority |
|-------|------|-------------|----------|
| Security Setup | 1 | Rate limiting, CORS, headers | P0 |
| Anti-Cheat | 1-2 | RTA, multi-account detection | P0 |
| 2FA | 2 | TOTP setup, backup codes | P1 |
| Backend Deploy | 2 | AWS ECS, RDS, ElastiCache | P0 |
| Frontend Security | 3 | Obfuscation, cert pinning | P1 |
| Frontend Deploy | 3 | iOS TestFlight, Play Store beta | P0 |
| Monitoring | 3 | APM, logging, alerting | P1 |
| KYC/AML | 4 | Compliance implementation | P2 |
| Testing | 4 | Security + performance testing | P0 |
| Launch | 5 | Production release | P0 |

## Success Metrics

### Security
- Zero critical vulnerabilities in scanning
- 100% rate limiting effectiveness
- <1% false positives on cheat detection

### Performance
- API latency p99 < 500ms
- WebSocket message latency < 100ms
- Zero data loss events

### Reliability
- 99.9% uptime SLA
- <1% error rate
- <5min incident resolution time

### User Experience
- <2 seconds app launch time
- <500ms page navigation
- <1% crash rate

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Security breach | Low | Critical | Regular security audits, bug bounty |
| False cheat detection | Medium | High | Manual review, appeal process |
| Database failure | Low | Critical | Automated backups, read replicas |
| Service outage | Low | High | Auto-scaling, multi-region |
| Regulatory non-compliance | Low | Critical | Legal review, compliance audit |

## Checklist

- [ ] Rate limiting implementation complete
- [ ] CORS and security headers configured
- [ ] Input validation on all endpoints
- [ ] 2FA implementation and testing
- [ ] RTA detection system operational
- [ ] Multi-account detection active
- [ ] Shuffle integrity auditing
- [ ] Backend deployed to production
- [ ] iOS beta release via TestFlight
- [ ] Android beta release via Play Store
- [ ] Web deployment to production
- [ ] Monitoring and alerting active
- [ ] Backup and DR tested
- [ ] Security penetration testing complete
- [ ] Compliance requirements met
- [ ] Legal review completed
- [ ] Launch marketing campaign
- [ ] Support team trained

## Post-Launch

### Week 1
- Monitor all metrics closely
- Respond to user feedback
- Fix any critical bugs
- Watch for unusual activity

### Week 2-4
- Gradual user base increase
- Collect player feedback
- Optimize based on usage patterns
- Plan additional features

### Month 2+
- Monitor retention and engagement
- Plan feature roadmap
- Consider additional security layers
- Expand to additional platforms

---

**Phase 5 Status**: Ready to implement
**Estimated Duration**: 5 weeks
**Required Resources**: Backend engineer (1), DevOps engineer (1), QA engineer (1), Security specialist (0.5)
