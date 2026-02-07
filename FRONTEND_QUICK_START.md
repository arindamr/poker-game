# 🎮 Frontend Quick Start - Poker Game

## ✅ Frontend Now Live!

Your Next.js frontend is running on: **http://localhost:3002**

---

## 🎯 Jump Right In

### Fastest Path (2 minutes)
1. Open http://localhost:3002 in your browser
2. Click "Sign In"
3. Use demo credentials:
   - Email: `test@example.com`
   - Password: `Demo@123456`
4. You're in the lobby! 🎰

---

## 📍 Key Pages

| Page | URL | What to Do |
|------|-----|-----------|
| **Home** | http://localhost:3002 | See app overview |
| **Sign Up** | http://localhost:3002/register | Create new account |
| **Login** | http://localhost:3002/login | Sign in (use demo above) |
| **Lobby** | http://localhost:3002/lobby | Browse & create tables |
| **Metrics** | http://localhost:3002/dashboard | View real-time stats |
| **Profile** | http://localhost:3002/profile | Manage your account |

---

## 🎲 Main Features

**Lobby Page**
- ✅ View all active game tables
- ✅ See player counts, buy-ins, blinds
- ✅ Create new table
- ✅ Join existing tables
- ✅ Real-time updates every 5 seconds

**Metrics Dashboard**
- ✅ 27 real-time metrics
- ✅ System health status
- ✅ API performance
- ✅ Security monitoring
- ✅ Database stats
- ✅ Financial summary

**User Profile**
- ✅ Account information
- ✅ Balance display
- ✅ Game statistics
- ✅ Edit profile
- ✅ Member information

---

## 🔐 Demo Account

```
Email:    test@example.com
Password: Demo@123456
```

**Note**: Wait 60 seconds between login attempts

---

## 🏗️ Technology Stack

```
Frontend:     Next.js 16.1.6 + TypeScript + Tailwind CSS
Backend API:  Node.js + Express (http://localhost:3000)
WebSocket:    Socket.io (http://localhost:3001)
Database:     PostgreSQL 15 (11 tables)
Cache:        Redis 7
```

---

## 📊 What's Working

✅ Full authentication flow (register/login)
✅ Real-time metrics (27 categories)
✅ Table management (create/join)
✅ User profiles & account management
✅ Responsive design (mobile/desktop)
✅ Dark theme UI with Tailwind CSS
✅ Token persistence (localStorage)
✅ Error handling & validation
✅ API integration with backend

---

## 🔧 Environment Info

**Frontend Environment** (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

**Services Running**
- Frontend: http://localhost:3002
- Backend: http://localhost:3000
- WebSocket: ws://localhost:3001
- Database: PostgreSQL on 5432
- Cache: Redis on 6379

---

## 📱 Browser Requirements

✅ Chrome (latest)
✅ Firefox (latest)
✅ Safari (latest)
✅ Mobile browsers
❌ Internet Explorer

---

## 🎮 Test Drive Scenarios

### Scenario 1: Explore Lobby
1. Login with demo account
2. View available tables
3. Note table info (buy-in, blinds, players)
4. See updates happen every 5 seconds

### Scenario 2: Create Table
1. Go to Lobby
2. Enter "High Rollers" as table name
3. Set buy-in to $100
4. Click "Create Table"
5. New table appears in list

### Scenario 3: Monitor Metrics
1. Go to Dashboard
2. See 27 metrics categories
3. Watch metrics update every 5 seconds
4. Note API response times & system health

### Scenario 4: Manage Profile
1. Click your username in header
2. View your stats & balance
3. Click "Edit Profile"
4. Change username or email
5. Save changes

---

## 🚀 Dev Tips

**Hot Reload**: Changes to `.tsx` files auto-reload
**Dev Tools**: Use browser DevTools (F12)
**Console Logs**: Check browser console for API activity
**Network Tab**: Monitor API calls to backend

---

## 🐛 Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot reach backend" | Ensure Docker is running: `docker ps` |
| "Port already in use" | Kill process on 3002 or change port |
| "Login fails" | Check rate limiting (wait 60s) |
| "Tables not loading" | Refresh page or check network tab |
| "Metrics not updating" | Ensure you're on /dashboard |

---

## 🎯 Full Test Checklist

- [ ] Home page loads
- [ ] Register page works
- [ ] Login with demo account succeeds
- [ ] Redirects to lobby
- [ ] Can see tables list
- [ ] Can create new table
- [ ] Can view dashboard metrics
- [ ] Can access profile page
- [ ] Can edit profile
- [ ] Metrics auto-refresh
- [ ] Logout works
- [ ] Mobile responsive

---

## 📖 Project Files

**Key Frontend Files**
```
/frontend
├── app/
│   ├── page.tsx              # 🏠 Home
│   ├── login/page.tsx        # 🔑 Login
│   ├── register/page.tsx     # ✍️ Register
│   ├── lobby/page.tsx        # 🎲 Game lobby
│   ├── dashboard/page.tsx    # 📊 Metrics
│   └── profile/page.tsx      # 👤 Profile
├── lib/
│   └── api.ts                # 🔗 API client
└── .env.local                # ⚙️ Config
```

**Backend Files** (already running)
```
/backend
├── src/
│   ├── server.js             # Express server
│   ├── index.js              # Entry point
│   ├── api/routes/           # API endpoints
│   ├── middleware/           # Auth & security
│   ├── game/                 # Game logic
│   └── monitoring/           # Metrics
└── migrations/               # Database schema
```

---

## 🔗 API Endpoints

All working and integrated:

| Feature | Endpoint | Status |
|---------|----------|--------|
| Register | `POST /api/v1/auth/register` | ✅ Working |
| Login | `POST /api/v1/auth/login` | ✅ Working |
| Profile | `GET /api/v1/users/profile` | ✅ Working |
| Tables | `GET /api/v1/tables` | ✅ Working |
| Metrics | `GET /api/v1/admin/metrics` | ✅ Working |
| Health | `GET /api/v1/health` | ✅ Working |

---

## 💾 Data Flow

```
Browser (Frontend)
    ↓
API Client Library (api.ts)
    ↓
Backend API (localhost:3000)
    ↓
PostgreSQL Database
    ↓
Redis Cache
```

---

## 🎉 You're Ready!

**Next step**: Visit http://localhost:3002 and start playing!

---

**Questions?** Check:
- FRONTEND_DEPLOYMENT.md (detailed docs)
- QUICK_REFERENCE.md (for command reference)
- Backend logs: `docker logs poker_backend`
- Frontend console: Press F12 in browser
