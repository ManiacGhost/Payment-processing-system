# NexusPay — Payment Processing System

A full-stack payment processing simulator demonstrating real-world backend patterns including retry logic, idempotency, concurrency control, circuit breakers, rate limiting, and webhook handling.

## Features

| Feature | Implementation |
|---|---|
| **Payment Lifecycle** | PENDING → PROCESSING → SUCCESS / FAILED with full event logging |
| **Retry with Exponential Backoff** | Configurable max retries (default: 3) with `2^n × 1000ms` backoff |
| **Idempotency** | Duplicate requests with the same key return the existing payment |
| **Concurrency Control** | Lock-based prevention of parallel processing on the same payment |
| **Gateway Simulation** | Random outcomes: success (50%), async/pending (25%), transient error (10%), hard failure (8%), timeout (7%) |
| **Webhook Handling** | Async callbacks with duplicate/conflict detection and terminal-state guards |
| **Circuit Breaker** | Opens after 5 consecutive gateway failures, auto-recovers after 15s |
| **Rate Limiting** | 10 requests per user per minute |
| **Observability** | Per-payment event timeline, system stats, webhook audit log |

## Quick Start

```bash
npm install
npm run dev          # Starts the API server (port 3001)
npx vite --host      # Starts the frontend dev server (port 5173)
```

Open **http://localhost:5173** in your browser.

## Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React UI   │───▶│  Express API     │───▶│  Gateway Sim    │
│  (Vite 5173) │    │  (Port 3001)     │    │  (Random Output)│
│              │◀───│                  │◀───│                 │
└──────────────┘    │  • Idempotency   │    └────────┬────────┘
                    │  • Rate Limiter  │             │
                    │  • Circuit Break │    ┌────────▼────────┐
                    │  • Retry Engine  │◀───│  Webhook Sim    │
                    │  • Conc. Locks   │    │  (Async Callback│
                    └──────────────────┘    └─────────────────┘
```

## Tech Stack

- **Frontend**: React 19, Vite, Motion (Framer Motion), Lucide Icons, Vanilla CSS
- **Backend**: Express.js, TypeScript, In-Memory Store
- **Dev Tools**: tsx, Vite proxy

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments` | Create a new payment |
| `GET` | `/api/payments?userId=X` | List payments for a user |
| `GET` | `/api/payments/:id` | Get payment detail with logs |
| `POST` | `/api/webhooks/gateway` | Webhook callback endpoint |
| `GET` | `/api/webhooks` | List webhook audit logs |
| `GET` | `/api/system/stats` | System-wide statistics |
