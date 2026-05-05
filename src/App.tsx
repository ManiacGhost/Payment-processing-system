import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCcw, CheckCircle2, ArrowRight,
  ShieldCheck, Zap, Activity, History, AlertCircle, X, Wifi, WifiOff, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Payment, SystemStats, WebhookLogEntry } from './types';

const DEMO_USER = 'demo_user_001';
const POLL_MS = 2000;

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookLogEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [activeTab, setActiveTab] = useState<'payments' | 'webhooks'>('payments');

  const userId = DEMO_USER;

  // ---------- Polling ----------
  const fetchData = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const [pRes, sRes, wRes] = await Promise.all([
        fetch(`/api/payments?userId=${userId}`),
        fetch('/api/system/stats'),
        fetch('/api/webhooks'),
      ]);
      if (pRes.ok) setPayments(await pRes.json());
      if (sRes.ok) setStats(await sRes.json());
      if (wRes.ok) setWebhooks(await wRes.json());
    } catch { /* server may be starting */ }
  }, [loggedIn, userId]);

  useEffect(() => {
    if (!loggedIn) return;
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [loggedIn, fetchData]);

  // Keep detail panel synced
  useEffect(() => {
    if (!selectedPayment) return;
    const updated = payments.find(p => (p._id || p.id) === (selectedPayment._id || selectedPayment.id));
    if (updated) setSelectedPayment(updated);
  }, [payments]);

  // ---------- Razorpay Payment Flow ----------
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.Razorpay) {
      alert('Razorpay SDK not loaded. Please check your internet connection.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create order on backend
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: 'INR',
          userId,
          idempotencyKey: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          metadata: { device: 'web_dashboard', initiatedBy: username },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create order');
      }

      const data = await res.json();
      const { payment, razorpayKeyId, razorpayOrderId } = data;

      setIsModalOpen(false);

      // 2. Open Razorpay Checkout
      const options = {
        key: razorpayKeyId,
        amount: Math.round(parseFloat(amount) * 100),
        currency: 'INR',
        name: 'NexusPay',
        description: `Payment #${(payment._id || payment.id).slice(0, 8)}`,
        order_id: razorpayOrderId,
        handler: async (response: any) => {
          // 3. Verify payment on backend
          try {
            await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                paymentId: payment._id || payment.id,
              }),
            });
            fetchData();
          } catch (err) {
            console.error('Verification failed:', err);
          }
        },
        prefill: {
          name: username,
          email: `${username.toLowerCase().replace(/\s/g, '')}@demo.com`,
        },
        theme: { color: '#6c5ce7' },
        modal: {
          ondismiss: async () => {
            // User closed checkout without paying
            try {
              await fetch(`/api/payments/${payment._id || payment.id}/fail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'USER_DISMISSED_CHECKOUT' }),
              });
              fetchData();
            } catch (err) {
              console.error('Failed to mark payment as failed:', err);
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async (response: any) => {
        try {
          await fetch(`/api/payments/${payment._id || payment.id}/fail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: response.error?.description || 'PAYMENT_FAILED',
            }),
          });
          fetchData();
        } catch (err) {
          console.error('Failed to record failure:', err);
        }
      });
      rzp.open();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Login ----------
  if (!loggedIn) {
    return (
      <div className="login-page">
        <motion.div className="login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <ShieldCheck size={36} style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
          <h1>NexusPay v1.0</h1>
          <p>Payment Processing System — Razorpay Integrated</p>
          <input className="form-input login-input" placeholder="Enter your name..."
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && username.trim()) setLoggedIn(true); }} />
          <button className="btn-login" onClick={() => { if (username.trim()) setLoggedIn(true); }}>
            Access Dashboard <ArrowRight size={14} />
          </button>
        </motion.div>
      </div>
    );
  }

  // ---------- Dashboard ----------
  const paymentId = (p: Payment) => p._id || p.id;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-brand"><Zap size={20} /><span className="header-tag">Authorized Terminal</span></div>
          <h1 className="header-title">NexusPay Dashboard</h1>
        </div>
        <div className="header-right">
          <div className="header-user"><div style={{ color: 'var(--text-dim)' }}>User</div><div>{username}</div></div>
          <button className="btn-logout" onClick={() => setLoggedIn(false)}>Logout</button>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard label="Total Volume" value={`₹${(stats?.totalVolume ?? 0).toFixed(2)}`} icon={<Activity size={14} />} />
        <StatCard label="Processing" value={String(stats?.byStatus.PROCESSING ?? 0)} icon={<RefreshCcw size={14} className="spinner" />} />
        <StatCard label="Success" value={String(stats?.byStatus.SUCCESS ?? 0)} icon={<CheckCircle2 size={14} />} />
        <StatCard label="Total Retries" value={String(stats?.totalRetries ?? 0)} icon={<History size={14} />} />
        <StatCard label="Webhooks" value={String(stats?.webhooksReceived ?? 0)} icon={<Wifi size={14} />} />
        <div className="stat-card">
          <div className="stat-header"><ShieldCheck size={14} style={{ color: 'var(--text-muted)' }} /><span className="stat-label">Circuit Breaker</span></div>
          {stats?.circuitBreaker && (
            <span className={`cb-badge ${stats.circuitBreaker.state.toLowerCase().replace('_', '-')}`}>
              <span className="cb-dot" />{stats.circuitBreaker.state}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>Transactions</button>
        <button className={`tab ${activeTab === 'webhooks' ? 'active' : ''}`} onClick={() => setActiveTab('webhooks')}>Webhook Logs</button>
      </div>

      {activeTab === 'payments' ? (
        <div className="table-container">
          <div className="table-header">
            <h2 className="table-title">Transaction Stream</h2>
            <button className="btn-primary" onClick={() => setIsModalOpen(true)}><Plus size={14} /> New Payment</button>
          </div>
          <div className="table-cols">
            <div>ID / Time</div><div>Razorpay Order</div><div>Amount</div><div>Status</div><div>Payment ID</div><div></div>
          </div>
          <div style={{ minHeight: '300px' }}>
            {payments.length === 0 ? (
              <div className="table-empty"><WifiOff size={24} /><span>No transactions yet</span></div>
            ) : (
              <AnimatePresence>
                {payments.map(p => (
                  <motion.div key={paymentId(p)} className="table-row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    onClick={() => setSelectedPayment(p)}>
                    <div>
                      <div className="cell-id">{paymentId(p).slice(0, 8)}...</div>
                      <div className="cell-time">{new Date(p.createdAt).toLocaleTimeString()}</div>
                    </div>
                    <div className="cell-key">{p.razorpayOrderId || '—'}</div>
                    <div><span className="cell-amount">₹{p.amount.toFixed(2)}</span><span className="cell-currency">{p.currency}</span></div>
                    <div><StatusBadge status={p.status} retryCount={p.retryCount} /></div>
                    <div className="cell-ref">{p.razorpayPaymentId || '—'}</div>
                    <div className="cell-action"><button><ArrowRight size={14} /></button></div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header"><h2 className="table-title">Webhook Activity Log</h2></div>
          <div className="wh-cols"><div>Payment ID</div><div>Event</div><div>Result</div><div>Received</div></div>
          <div style={{ minHeight: '200px' }}>
            {webhooks.length === 0 ? (
              <div className="table-empty"><span>No webhook events yet</span></div>
            ) : webhooks.map(w => (
              <div key={w._id} className="wh-row">
                <div className="cell-id">{w.paymentId.slice(0, 8)}...</div>
                <div className="cell-key">{w.eventType}</div>
                <div>
                  <span className={`status-badge ${w.result === 'PROCESSED' ? 'success' : w.result === 'IGNORED' ? 'pending' : 'failed'}`}>
                    {w.result}
                  </span>
                </div>
                <div className="cell-time">{new Date(w.createdAt).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="footer">
        <div>NexusPay — Razorpay Integrated v1.0</div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span>Active: {stats?.activeProcessing ?? 0}</span>
          <span>Payments: {stats?.totalPayments ?? 0}</span>
        </div>
      </footer>

      {/* Payment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
            <motion.div className="modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-title-row">
                <h3 className="modal-title">Initiate Payment</h3>
                <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreatePayment}>
                <div className="form-group">
                  <label className="form-label">Amount (INR)</label>
                  <input type="number" step="1" min="1" value={amount}
                    onChange={e => setAmount(e.target.value)} className="form-input" autoFocus />
                </div>
                <div className="info-box">
                  <div className="info-box-title"><AlertCircle size={12} /> Razorpay Test Mode</div>
                  <p>This uses Razorpay's test environment. Use test card <strong>4111 1111 1111 1111</strong>, any future expiry, and any CVV to simulate a successful payment.</p>
                </div>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="spinner" /> Creating Order...</> : 'Pay with Razorpay'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedPayment && (
          <>
            <div className="detail-overlay" onClick={() => setSelectedPayment(null)} />
            <motion.div className="detail-panel" initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}>
              <div className="modal-title-row">
                <h3 className="modal-title">Payment Detail</h3>
                <button className="btn-close" onClick={() => setSelectedPayment(null)}><X size={18} /></button>
              </div>
              <div className="detail-section">
                <div className="detail-section-title">Overview</div>
                <DetailRow label="ID" value={paymentId(selectedPayment)} />
                <DetailRow label="Amount" value={`₹${selectedPayment.amount.toFixed(2)} ${selectedPayment.currency}`} />
                <div className="detail-field"><span className="detail-field-label">Status</span><span><StatusBadge status={selectedPayment.status} retryCount={selectedPayment.retryCount} /></span></div>
                <DetailRow label="Retries" value={`${selectedPayment.retryCount} / ${selectedPayment.maxRetries}`} />
                <DetailRow label="Razorpay Order" value={selectedPayment.razorpayOrderId || '—'} />
                <DetailRow label="Razorpay Payment" value={selectedPayment.razorpayPaymentId || '—'} />
                <DetailRow label="Idemp. Key" value={selectedPayment.idempotencyKey} />
                {selectedPayment.lastError && <DetailRow label="Last Error" value={selectedPayment.lastError} color="var(--danger)" />}
                <DetailRow label="Created" value={new Date(selectedPayment.createdAt).toLocaleString()} />
                <DetailRow label="Updated" value={new Date(selectedPayment.updatedAt).toLocaleString()} />
              </div>
              <div className="detail-section">
                <div className="detail-section-title">Event Timeline ({selectedPayment.logs.length})</div>
                {selectedPayment.logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    <div className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</div>
                    <div>
                      <div className="log-event">{log.event}</div>
                      {log.details && <div className="log-details">{log.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div className="stat-header">{icon}<span className="stat-label">{label}</span></div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function StatusBadge({ status, retryCount }: { status: string; retryCount: number }) {
  const cls = status === 'PROCESSING' ? 'processing' : status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'failed' : 'pending';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <span className={`status-badge ${cls}`}>
        {status}
        {status === 'PROCESSING' && <span className="pulse-dot" />}
      </span>
      {retryCount > 0 && status !== 'SUCCESS' && <span className="retry-count">×{retryCount}</span>}
    </span>
  );
}
