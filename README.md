# NexusPay — Payment Processing System

A full-stack payment processor with **Razorpay** integration, **JWT authentication**, **MongoDB** persistence, and resilience patterns (retry, circuit breaker, rate limiting).

## Project Structure

```
├── server/           # Express API (port 3001)
│   ├── src/
│   │   ├── index.ts          # Entry — DB connect, route mount
│   │   ├── middleware/
│   │   │   └── auth.ts       # JWT verification middleware
│   │   ├── models/
│   │   │   ├── User.ts       # User model (bcrypt hashed passwords)
│   │   │   ├── Payment.ts    # Payment model (Razorpay fields)
│   │   │   └── WebhookLog.ts # Webhook audit log
│   │   └── routes/
│   │       ├── auth.ts       # Register, Login, Refresh, Logout
│   │       ├── payments.ts   # CRUD + Razorpay order/verify
│   │       └── webhooks.ts   # Webhook handler + system stats
│   ├── .env
│   └── package.json
│
├── client/           # React + Vite (port 5173)
│   ├── src/
│   │   ├── App.tsx           # Auth flow + Dashboard UI
│   │   ├── api.ts            # Fetch wrapper with JWT auto-refresh
│   │   ├── types.ts
│   │   └── index.css
│   └── package.json
│
└── README.md
```

## Quick Start

```bash
# Terminal 1 — Backend
cd server
npm install
npm run dev

# Terminal 2 — Frontend
cd client
npm install
npm run dev
```

## Features

| Feature | Details |
|---|---|
| **JWT Auth** | Access token (1hr) + refresh token (7d) with rotation |
| **Razorpay** | Real order creation, checkout, signature verification |
| **MongoDB** | Persistent storage — survives restarts |
| **Retry + Backoff** | Exponential backoff on Razorpay API failures |
| **Circuit Breaker** | Opens after 5 failures, auto-recovers in 15s |
| **Idempotency** | Unique key prevents duplicate payments |
| **Concurrency** | Lock-based parallel processing prevention |
| **Rate Limiting** | 10 requests/user/minute |
| **Webhooks** | Razorpay webhook with signature verification, duplicate/conflict detection |
| **Observability** | Per-payment event timeline, system stats, webhook audit log |

## API Endpoints

### Auth (Public)
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT tokens |
| POST | `/api/auth/refresh` | Rotate access + refresh tokens |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user (protected) |

### Payments (Protected — requires Bearer token)
| Method | Path | Description |
|---|---|---|
| POST | `/api/payments` | Create Razorpay order |
| POST | `/api/payments/verify` | Verify payment signature |
| POST | `/api/payments/:id/fail` | Mark payment as failed |
| GET | `/api/payments` | List user's payments |
| GET | `/api/payments/:id` | Payment detail with logs |

### System (Public)
| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/razorpay` | Razorpay webhook endpoint |
| GET | `/api/webhooks` | Webhook audit logs |
| GET | `/api/webhooks/stats` | System statistics |
