# NexusPay — Scalable Payment Processing Platform

A **production-ready full-stack payment processing system** built with reliability, security, and observability at its core. NexusPay integrates with Razorpay to handle real-world transactions while implementing resilience patterns typically found in high-scale fintech systems.

---

## 🚀 Overview

NexusPay is designed as a **fault-tolerant payment orchestration layer** that simulates real-world payment infrastructure challenges such as:

- External API failures  
- Duplicate payment handling  
- High concurrency scenarios  
- Webhook reliability  
- Token-based authentication lifecycle  

---

## 🧱 Architecture

```
Client (React + Vite)
        │
        ▼
Backend API (Node.js + Express)
        │
        ├── Authentication Layer (JWT + Refresh Tokens)
        ├── Payment Service (Razorpay Integration)
        ├── Resilience Layer
        │     ├── Retry + Exponential Backoff
        │     ├── Circuit Breaker
        │     ├── Idempotency Guard
        │     └── Concurrency Locks
        │
        ├── Webhook Processor (Signature Verified)
        │
        ▼
Database (MongoDB)
```

---

## 🌐 Live Deployment

- Backend API: https://payment-processing-system-backend.onrender.com  
- Frontend: https://payment-processing-system-frontend.pages.dev/

---

## 📦 Tech Stack

### Backend
- Node.js + Express (TypeScript)
- MongoDB + Mongoose
- JWT Authentication
- Razorpay SDK

### Frontend
- React + Vite
- TypeScript

### Infrastructure
- Render
- Cloudflare Pages

---

## ⚙️ Core Features

### 🔐 Authentication
- JWT-based authentication
- Access tokens (1 hour)
- Refresh tokens (7 days, rotating)

### 💳 Payments
- Razorpay order creation
- Payment verification
- Failure handling

### 🛡️ Resilience

| Pattern | Description |
|--------|------------|
| Retry | Exponential backoff |
| Circuit Breaker | Opens after 5 failures |
| Idempotency | Prevents duplicates |
| Concurrency | Lock-based control |
| Rate Limiting | 10 req/user/min |

---

### 🔔 Webhooks
- Signature verification
- Duplicate handling
- Audit logging

---

### 📊 Observability
- Payment event timeline
- System stats
- Webhook logs

---

## 📁 Project Structure

```
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   ├── .env
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   └── package.json
│
└── README.md
```

---

## 🧑‍💻 Getting Started

### Prerequisites
- Node.js >= 18
- MongoDB
- Razorpay account

---

### Environment Variables

Create `.env` in `/server`:

```
PORT=3001
MONGO_URI=your_mongodb_connection_string

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret

WEBHOOK_SECRET=your_webhook_secret
```

---

### Run Locally

```bash
# Backend
cd server
npm install
npm run dev

# Frontend
cd client
npm install
npm run dev
```

---

## 📡 API Endpoints

### Auth

| Method | Endpoint | Description |
|--------|----------|------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| POST | /api/auth/refresh | Refresh token |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Current user |

---

### Payments

| Method | Endpoint | Description |
|--------|----------|------------|
| POST | /api/payments | Create order |
| POST | /api/payments/verify | Verify payment |
| POST | /api/payments/:id/fail | Mark failed |
| GET | /api/payments | List payments |
| GET | /api/payments/:id | Payment detail |

---

### System

| Method | Endpoint | Description |
|--------|----------|------------|
| POST | /api/webhooks/razorpay | Webhook |
| GET | /api/webhooks | Logs |
| GET | /api/webhooks/stats | Metrics |

---

## 🔄 Payment Flow

1. Create order  
2. Complete payment  
3. Verify signature  
4. Receive webhook  
5. Store final state  

---

## 🧪 Testing Ideas

- Simulate API failures  
- Test duplicate webhooks  
- Validate rate limits  
- Check token expiry flow  

---

## 📄 License

MIT
