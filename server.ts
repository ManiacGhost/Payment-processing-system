import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Payment, IPayment } from './models/Payment.js';
import { WebhookLog } from './models/WebhookLog.js';

// ===================================================================
// NexusPay — Payment Processing System
// MongoDB + Razorpay integration with retry, idempotency,
// concurrency control, circuit breaker, and webhook handling.
// ===================================================================

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const MONGODB_URI = process.env.MONGODB_URI!;

// ---------- Razorpay Instance ----------
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// ---------- Concurrency Lock ----------
const processingLocks = new Set<string>();

// ---------- Circuit Breaker ----------
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  constructor(private threshold = 5, private resetMs = 15000) {}

  get currentState() {
    if (this.state === 'OPEN' && Date.now() - this.lastFailure > this.resetMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  canExecute() {
    const s = this.currentState;
    return s === 'CLOSED' || s === 'HALF_OPEN';
  }

  recordSuccess() { this.failures = 0; this.state = 'CLOSED'; }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.log(`[CircuitBreaker] OPEN after ${this.failures} failures`);
    }
  }

  getInfo() {
    return { state: this.currentState, failures: this.failures, threshold: this.threshold, resetMs: this.resetMs };
  }
}

const circuitBreaker = new CircuitBreaker();

// ---------- Rate Limiter ----------
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ---------- Razorpay Status Mapping ----------
function mapRazorpayStatus(rzpStatus: string): IPayment['status'] {
  switch (rzpStatus) {
    case 'created': return 'PENDING';
    case 'authorized': return 'PROCESSING';
    case 'captured': return 'SUCCESS';
    case 'failed': return 'FAILED';
    case 'refunded': return 'FAILED';
    default: return 'PROCESSING';
  }
}

// ---------- Helper: Add log to payment ----------
async function addLog(paymentId: string, event: string, details?: string) {
  await Payment.findByIdAndUpdate(paymentId, {
    $push: { logs: { timestamp: new Date(), event, details } },
  });
}

// ---------- Helper: Retry wrapper for Razorpay API calls ----------
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, label = 'API'): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (!circuitBreaker.canExecute()) {
      throw new Error('CIRCUIT_BREAKER_OPEN');
    }
    try {
      const result = await fn();
      circuitBreaker.recordSuccess();
      return result;
    } catch (err: any) {
      circuitBreaker.recordFailure();
      if (attempt === maxRetries - 1) throw err;
      const backoff = Math.pow(2, attempt + 1) * 500;
      console.log(`[Retry] ${label} attempt ${attempt + 1} failed: ${err.message}. Backoff ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error('MAX_RETRIES_EXCEEDED');
}

// ===================================================================
// Express Server
// ===================================================================
async function startServer() {
  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log('[MongoDB] Connected successfully');

  const app = express();
  const PORT = 3001;

  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ========================================
  // POST /api/payments — Create Razorpay order + payment record
  // ========================================
  app.post('/api/payments', async (req, res) => {
    const { amount, currency, userId, idempotencyKey, metadata } = req.body;

    if (!amount || !currency || !userId || !idempotencyKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    try {
      // Idempotency: return existing payment if key already used
      const existing = await Payment.findOne({ idempotencyKey });
      if (existing) {
        console.log(`[Idempotency] Duplicate key ${idempotencyKey}`);
        return res.json({
          payment: existing,
          razorpayKeyId: RAZORPAY_KEY_ID,
          duplicate: true,
        });
      }

      // Create Razorpay order (amount in paise)
      const order = await withRetry(
        () => razorpay.orders.create({
          amount: Math.round(amount * 100),
          currency: currency.toUpperCase(),
          receipt: idempotencyKey,
          notes: { userId, ...(metadata || {}) },
        }),
        3,
        'RazorpayOrderCreate'
      );

      // Persist payment in MongoDB
      const payment = await Payment.create({
        userId,
        amount,
        currency: currency.toUpperCase(),
        status: 'PENDING',
        idempotencyKey,
        razorpayOrderId: order.id,
        metadata: metadata || {},
        logs: [{ timestamp: new Date(), event: 'ORDER_CREATED', details: `Razorpay Order: ${order.id}` }],
      });

      console.log(`[Payment] Created ${payment._id} | Order ${order.id} | ₹${amount}`);

      res.status(201).json({
        payment,
        razorpayKeyId: RAZORPAY_KEY_ID,
        razorpayOrderId: order.id,
      });
    } catch (err: any) {
      console.error('[API Error] POST /api/payments:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create payment' });
    }
  });

  // ========================================
  // POST /api/payments/verify — Verify Razorpay payment signature
  // ========================================
  app.post('/api/payments/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing verification fields' });
    }

    try {
      // Concurrency lock
      if (processingLocks.has(paymentId)) {
        return res.status(409).json({ error: 'Payment is being processed' });
      }
      processingLocks.add(paymentId);

      try {
        // Verify signature
        const expectedSig = crypto
          .createHmac('sha256', RAZORPAY_KEY_SECRET)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest('hex');

        const isValid = expectedSig === razorpay_signature;

        const payment = await Payment.findById(paymentId);
        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        // Don't update terminal states
        if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
          await addLog(paymentId, 'VERIFY_SKIPPED', `Already ${payment.status}`);
          return res.json({ payment, verified: isValid });
        }

        if (isValid) {
          payment.status = 'SUCCESS';
          payment.razorpayPaymentId = razorpay_payment_id;
          payment.razorpaySignature = razorpay_signature;
          payment.logs.push({ timestamp: new Date(), event: 'PAYMENT_VERIFIED', details: `PaymentID: ${razorpay_payment_id}` });
        } else {
          payment.status = 'FAILED';
          payment.lastError = 'SIGNATURE_MISMATCH';
          payment.logs.push({ timestamp: new Date(), event: 'VERIFICATION_FAILED', details: 'Signature mismatch' });
        }

        await payment.save();
        console.log(`[Verify] Payment ${paymentId} → ${payment.status}`);
        res.json({ payment, verified: isValid });
      } finally {
        processingLocks.delete(paymentId);
      }
    } catch (err: any) {
      processingLocks.delete(paymentId);
      console.error('[API Error] POST /api/payments/verify:', err.message);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // ========================================
  // POST /api/payments/:id/fail — Mark payment as failed
  // ========================================
  app.post('/api/payments/:id/fail', async (req, res) => {
    try {
      const payment = await Payment.findById(req.params.id);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      if (payment.status === 'SUCCESS') {
        return res.status(409).json({ error: 'Cannot fail a successful payment' });
      }

      payment.status = 'FAILED';
      payment.lastError = req.body.reason || 'USER_CANCELLED';
      payment.logs.push({
        timestamp: new Date(),
        event: 'PAYMENT_FAILED',
        details: req.body.reason || 'User cancelled or payment failed in checkout',
      });
      await payment.save();

      console.log(`[Failed] Payment ${req.params.id}: ${payment.lastError}`);
      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // POST /api/payments/:id/sync — Sync status from Razorpay
  // ========================================
  app.post('/api/payments/:id/sync', async (req, res) => {
    try {
      const payment = await Payment.findById(req.params.id);
      if (!payment || !payment.razorpayOrderId) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const order = await withRetry(
        () => razorpay.orders.fetch(payment.razorpayOrderId!),
        2, 'RazorpayOrderFetch'
      ) as any;

      const newStatus = mapRazorpayStatus(order.status);

      if (payment.status !== newStatus && payment.status !== 'SUCCESS' && payment.status !== 'FAILED') {
        payment.status = newStatus;
        payment.logs.push({
          timestamp: new Date(),
          event: 'STATUS_SYNCED',
          details: `Razorpay order status: ${order.status} → ${newStatus}`,
        });
        await payment.save();
      }

      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // GET /api/payments — List user payments
  // ========================================
  app.get('/api/payments', async (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const payments = await Payment.find({ userId }).sort({ createdAt: -1 }).limit(50);
    res.json(payments);
  });

  // ========================================
  // GET /api/payments/:id — Payment detail
  // ========================================
  app.get('/api/payments/:id', async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  });

  // ========================================
  // POST /api/webhooks/razorpay — Razorpay webhook handler
  // ========================================
  app.post('/api/webhooks/razorpay', async (req, res) => {
    const webhookBody = JSON.stringify(req.body);
    const receivedSig = req.headers['x-razorpay-signature'] as string;

    // Verify webhook signature if present
    if (receivedSig) {
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(webhookBody)
        .digest('hex');

      if (expectedSig !== receivedSig) {
        console.log('[Webhook] Invalid signature — rejecting');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body.event;
    const entity = req.body.payload?.payment?.entity;

    if (!entity?.order_id) {
      return res.status(200).send('OK — no order_id');
    }

    console.log(`[Webhook] Event: ${event} | Order: ${entity.order_id}`);

    try {
      const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
      if (!payment) {
        await WebhookLog.create({
          paymentId: 'UNKNOWN',
          source: 'razorpay',
          eventType: event,
          payload: req.body,
          result: 'IGNORED',
        });
        return res.status(200).send('OK — payment not found');
      }

      let result: 'PROCESSED' | 'IGNORED' | 'CONFLICT' = 'PROCESSED';
      const newStatus = mapRazorpayStatus(entity.status);

      // Guard terminal states
      if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
        result = payment.status === newStatus ? 'IGNORED' : 'CONFLICT';
        payment.logs.push({
          timestamp: new Date(),
          event: 'WEBHOOK_IGNORED',
          details: `${event}: payment already ${payment.status}`,
        });
      } else {
        payment.status = newStatus;
        payment.razorpayPaymentId = entity.id;
        if (entity.status === 'failed') {
          payment.lastError = entity.error_description || 'PAYMENT_FAILED';
        }
        payment.logs.push({
          timestamp: new Date(),
          event: 'WEBHOOK_APPLIED',
          details: `${event}: ${entity.status} → ${newStatus}`,
        });
      }

      await payment.save();
      await WebhookLog.create({
        paymentId: payment._id.toString(),
        source: 'razorpay',
        eventType: event,
        payload: req.body,
        result,
      });

      console.log(`[Webhook] Payment ${payment._id} → ${payment.status} (${result})`);
      res.status(200).json({ result });
    } catch (err: any) {
      console.error('[Webhook Error]:', err.message);
      res.status(500).send('ERROR');
    }
  });

  // ========================================
  // GET /api/webhooks — List webhook logs
  // ========================================
  app.get('/api/webhooks', async (_req, res) => {
    const logs = await WebhookLog.find().sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  });

  // ========================================
  // GET /api/system/stats — System statistics
  // ========================================
  app.get('/api/system/stats', async (_req, res) => {
    const [total, pending, processing, success, failed, volume, retries, webhookCount] = await Promise.all([
      Payment.countDocuments(),
      Payment.countDocuments({ status: 'PENDING' }),
      Payment.countDocuments({ status: 'PROCESSING' }),
      Payment.countDocuments({ status: 'SUCCESS' }),
      Payment.countDocuments({ status: 'FAILED' }),
      Payment.aggregate([
        { $match: { status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $group: { _id: null, total: { $sum: '$retryCount' } } },
      ]),
      WebhookLog.countDocuments(),
    ]);

    res.json({
      totalPayments: total,
      byStatus: { PENDING: pending, PROCESSING: processing, SUCCESS: success, FAILED: failed },
      totalVolume: volume[0]?.total || 0,
      totalRetries: retries[0]?.total || 0,
      webhooksReceived: webhookCount,
      circuitBreaker: circuitBreaker.getInfo(),
      activeProcessing: processingLocks.size,
    });
  });

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n══════════════════════════════════════════`);
    console.log(`  NexusPay API — port ${PORT}`);
    console.log(`  Razorpay: ${RAZORPAY_KEY_ID}`);
    console.log(`══════════════════════════════════════════\n`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Server startup failed:', err);
  process.exit(1);
});
