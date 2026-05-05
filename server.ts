import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import * as admin from 'firebase-admin';
import { fileURLToPath } from 'url';

import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

// Use the specific database ID from config
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const paymentsDb = db.collection('payments');
const webhooksDb = db.collection('webhook_logs');

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- External Gateway Simulation ---
  const Gateway = {
    async charge(amount: number, currency: string) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

      const roll = Math.random();
      if (roll < 0.1) return { status: 'TIMEOUT' };
      if (roll < 0.2) return { status: 'FAILED', error: 'INSUFFICIENT_FUNDS' };
      if (roll < 0.3) return { status: 'FAILED', error: 'TRANSIENT_NETWORK_ERROR' };
      if (roll < 0.8) return { status: 'SUCCESS', reference: `gw_${Math.random().toString(36).substring(7)}` };
      
      // Async success via webhook
      return { status: 'PENDING', reference: `gw_async_${Math.random().toString(36).substring(7)}` };
    }
  };

  // --- Payment Processing Logic ---
  async function processPaymentWithRetry(paymentId: string) {
    const maxRetries = 3;
    let paymentDoc = await paymentsDb.doc(paymentId).get();
    
    if (!paymentDoc.exists) return;
    let payment = paymentDoc.data()!;

    while (payment.retryCount < maxRetries && payment.status === 'PROCESSING') {
      console.log(`[Processing] Payment ${paymentId}, Attempt ${payment.retryCount + 1}`);
      
      try {
        const result = await Gateway.charge(payment.amount, payment.currency);
        console.log(`[Gateway Result] ${paymentId}:`, result);

        if (result.status === 'SUCCESS') {
          await paymentsDb.doc(paymentId).update({
            status: 'SUCCESS',
            gatewayReference: result.reference,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return;
        }

        if (result.status === 'FAILED') {
          if (result.error === 'TRANSIENT_NETWORK_ERROR') {
            // Rethrow to trigger retry
            throw new Error(result.error);
          } else {
            // Hard failure
            await paymentsDb.doc(paymentId).update({
              status: 'FAILED',
              lastError: result.error,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return;
          }
        }

        if (result.status === 'PENDING') {
          // Wait for webhook
          await paymentsDb.doc(paymentId).update({
            gatewayReference: result.reference,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
            // Keep status as PROCESSING or set to something like AWAITING_WEBHOOK
          });
          
          // Simulate webhook arrival
          setTimeout(async () => {
             const webhookPayload = {
               paymentId,
               reference: result.reference,
               status: 'SUCCESS'
             };
             await fetch(`http://localhost:${PORT}/api/webhooks/gateway`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(webhookPayload)
             }).catch(err => console.error('Webhook simulation failed', err));
          }, 3000 + Math.random() * 5000);
          
          return;
        }

        if (result.status === 'TIMEOUT') {
          throw new Error('GATEWAY_TIMEOUT');
        }

      } catch (error: any) {
        const backoff = Math.pow(2, payment.retryCount) * 1000;
        console.log(`[Retry] Payment ${paymentId} failed: ${error.message}. Retrying in ${backoff}ms...`);
        
        await paymentsDb.doc(paymentId).update({
          retryCount: admin.firestore.FieldValue.increment(1),
          lastError: error.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Wait for backoff
        await new Promise(resolve => setTimeout(resolve, backoff));
        
        // Refresh payment data
        const nextDoc = await paymentsDb.doc(paymentId).get();
        payment = nextDoc.data()!;
      }
    }

    // If we exhausted retries
    const finalDoc = await paymentsDb.doc(paymentId).get();
    if (finalDoc.data()?.status === 'PROCESSING') {
      await paymentsDb.doc(paymentId).update({
        status: 'FAILED',
        lastError: 'MAX_RETRIES_EXCEEDED',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // --- API Routes ---

  app.post('/api/payments', async (req, res) => {
    const { amount, currency, userId, idempotencyKey } = req.body;

    if (!amount || !currency || !userId || !idempotencyKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // 1. Handle Idempotency & Concurrency via Transaction
      const resultPayment = await db.runTransaction(async (transaction) => {
        const query = await paymentsDb.where('idempotencyKey', '==', idempotencyKey).limit(1).get();
        
        if (!query.empty) {
          const existingPayment = query.docs[0].data();
          return { ...existingPayment, id: query.docs[0].id, existing: true };
        }

        // Create new payment record
        const newPaymentRef = paymentsDb.doc();
        const paymentData = {
          userId,
          amount,
          currency,
          status: 'PROCESSING',
          idempotencyKey,
          retryCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          metadata: req.body.metadata || {}
        };

        transaction.set(newPaymentRef, paymentData);
        return { ...paymentData, id: newPaymentRef.id, existing: false };
      });

      // 2. Respond to client immediately
      res.json(resultPayment);

      // 3. Kick off async processing if new
      if (!(resultPayment as any).existing) {
        processPaymentWithRetry(resultPayment.id).catch(err => {
          console.error(`[Error] Processing payment ${resultPayment.id}:`, err);
        });
      }

    } catch (error: any) {
      console.error('[API Error] /api/payments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/webhooks/gateway', async (req, res) => {
    const { paymentId, reference, status } = req.body;
    console.log(`[Webhook Received] Payment: ${paymentId}, Status: ${status}`);

    try {
      await db.runTransaction(async (transaction) => {
        const paymentRef = paymentsDb.doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);

        if (!paymentDoc.exists) {
          throw new Error('Payment not found');
        }

        const payment = paymentDoc.data()!;
        
        // Log webhook
        const logRef = webhooksDb.doc();
        transaction.set(logRef, {
          paymentId,
          payload: req.body,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: (payment.status === 'SUCCESS' || payment.status === 'FAILED') ? 'IGNORED' : 'PROCESSED'
        });

        // Only update if not already terminal
        if (payment.status !== 'SUCCESS' && payment.status !== 'FAILED') {
          transaction.update(paymentRef, {
            status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
            gatewayReference: reference,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Webhook Error]:', error);
      res.status(500).send('ERROR');
    }
  });

  // --- Vite Setup ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NexusPay server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start listener:', error);
  }
}

startServer().catch(err => {
  console.error('CRITICAL: Server startup failed:', err);
});
