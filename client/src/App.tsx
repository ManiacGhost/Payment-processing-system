import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCcw, CheckCircle2, ArrowRight, ShieldCheck, Zap, Activity,
  History, AlertCircle, X, Wifi, WifiOff, Loader2, LogIn, UserPlus, Mail, Lock, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Payment, SystemStats, WebhookLogEntry, AuthUser } from './types';
import { apiFetch, apiLogin, apiRegister, apiLogout, getStoredUser, getAccessToken } from './api';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [checking, setChecking] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setChecking(false); return; }
    apiFetch('/api/auth/me').then(async res => {
      if (res.ok) { const u = await res.json(); setUser(u); }
      else setUser(null);
    }).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  const handleLogout = async () => { await apiLogout(); setUser(null); };

  if (checking) return <div className="loading-page"><Loader2 size={18} className="spinner" /> Verifying session...</div>;
  if (!user) return <AuthPage onAuth={setUser} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}

// ===== AUTH PAGE =====
function AuthPage({ onAuth }: { onAuth: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = mode === 'login' ? await apiLogin(email, password) : await apiRegister(name, email, password);
      onAuth(u);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <motion.div className="login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <ShieldCheck size={36} style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
        <h1>NexusPay</h1>
        <p>Resilient Payment Processing System</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>
            <LogIn size={14} /> Sign In
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>
            <UserPlus size={14} /> Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label"><User size={10} /> Name</label>
              <input className="form-input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label"><Mail size={10} /> Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label"><Lock size={10} /> Password</label>
            <input className="form-input" type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? <><Loader2 size={14} className="spinner" /> Please wait...</> : mode === 'login' ? <>Sign In <ArrowRight size={14} /></> : <>Create Account <ArrowRight size={14} /></>}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ===== DASHBOARD =====
function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookLogEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [tab, setTab] = useState<'payments' | 'webhooks'>('payments');

  const fetchData = useCallback(async () => {
    try {
      const [p, s, w] = await Promise.all([
        apiFetch('/api/payments'), apiFetch('/api/webhooks/stats'), apiFetch('/api/webhooks'),
      ]);
      if (p.ok) setPayments(await p.json());
      if (s.ok) setStats(await s.json());
      if (w.ok) setWebhooks(await w.json());
    } catch { }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 2000); return () => clearInterval(id); }, [fetchData]);
  useEffect(() => { if (selected) { const u = payments.find(p => pid(p) === pid(selected)); if (u) setSelected(u); } }, [payments]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.Razorpay) { alert('Razorpay SDK not loaded'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(amount), currency: 'INR',
          idempotencyKey: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          metadata: { device: 'web' },
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const { payment, razorpayKeyId, razorpayOrderId } = await res.json();
      setIsModalOpen(false);

      const rzp = new window.Razorpay({
        key: razorpayKeyId, amount: Math.round(parseFloat(amount) * 100), currency: 'INR',
        name: 'NexusPay', description: `Payment #${pid(payment).slice(0, 8)}`, order_id: razorpayOrderId,
        handler: async (r: any) => {
          await apiFetch('/api/payments/verify', {
            method: 'POST',
            body: JSON.stringify({ razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature, paymentId: pid(payment) }),
          });
          fetchData();
        },
        prefill: { name: user.name, email: user.email },
        theme: { color: '#6c5ce7' },
        modal: {
          ondismiss: async () => {
            await apiFetch(`/api/payments/${pid(payment)}/fail`, { method: 'POST', body: JSON.stringify({ reason: 'USER_DISMISSED' }) });
            fetchData();
          },
        },
      });
      rzp.on('payment.failed', async (r: any) => {
        await apiFetch(`/api/payments/${pid(payment)}/fail`, { method: 'POST', body: JSON.stringify({ reason: r.error?.description || 'FAILED' }) });
        fetchData();
      });
      rzp.open();
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-brand"><Zap size={20} /><span className="header-tag">Authorized Terminal</span></div>
          <h1 className="header-title">NexusPay Dashboard</h1>
        </div>
        <div className="header-right">
          <div className="header-user"><div style={{ color: 'var(--text-dim)' }}>{user.name}</div><div style={{ fontSize: '0.6rem' }}>{user.email}</div></div>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Volume" value={`₹${(stats?.totalVolume ?? 0).toFixed(2)}`} icon={<Activity size={14} />} />
        <StatCard label="Processing" value={String(stats?.byStatus.PROCESSING ?? 0)} icon={<RefreshCcw size={14} className="spinner" />} />
        <StatCard label="Success" value={String(stats?.byStatus.SUCCESS ?? 0)} icon={<CheckCircle2 size={14} />} />
        <StatCard label="Retries" value={String(stats?.totalRetries ?? 0)} icon={<History size={14} />} />
        <StatCard label="Webhooks" value={String(stats?.webhooksReceived ?? 0)} icon={<Wifi size={14} />} />
        <div className="stat-card">
          <div className="stat-header"><ShieldCheck size={14} style={{ color: 'var(--text-muted)' }} /><span className="stat-label">Circuit Breaker</span></div>
          {stats?.circuitBreaker && <span className={`cb-badge ${stats.circuitBreaker.state.toLowerCase()}`}><span className="cb-dot" />{stats.circuitBreaker.state}</span>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>Transactions</button>
        <button className={`tab ${tab === 'webhooks' ? 'active' : ''}`} onClick={() => setTab('webhooks')}>Webhooks</button>
      </div>

      {tab === 'payments' ? (
        <div className="table-container">
          <div className="table-header">
            <h2 className="table-title">Transaction Stream</h2>
            <button className="btn-primary" onClick={() => setIsModalOpen(true)}><Plus size={14} /> New Payment</button>
          </div>
          <div className="table-cols"><div>ID / Time</div><div>Razorpay Order</div><div>Amount</div><div>Status</div><div>Payment ID</div><div></div></div>
          <div style={{ minHeight: '300px' }}>
            {payments.length === 0 ? <div className="table-empty"><WifiOff size={24} /><span>No transactions yet</span></div> : (
              <AnimatePresence>{payments.map(p => (
                <motion.div key={pid(p)} className="table-row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} onClick={() => setSelected(p)}>
                  <div><div className="cell-id">{pid(p).slice(0, 8)}...</div><div className="cell-time">{new Date(p.createdAt).toLocaleTimeString()}</div></div>
                  <div className="cell-key">{p.razorpayOrderId || '—'}</div>
                  <div><span className="cell-amount">₹{p.amount.toFixed(2)}</span><span className="cell-currency">{p.currency}</span></div>
                  <div><StatusBadge status={p.status} retryCount={p.retryCount} /></div>
                  <div className="cell-ref">{p.razorpayPaymentId || '—'}</div>
                  <div className="cell-action"><button><ArrowRight size={14} /></button></div>
                </motion.div>
              ))}</AnimatePresence>
            )}
          </div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header"><h2 className="table-title">Webhook Log</h2></div>
          <div className="wh-cols"><div>Payment</div><div>Event</div><div>Result</div><div>Time</div></div>
          <div style={{ minHeight: '200px' }}>
            {webhooks.length === 0 ? <div className="table-empty"><span>No webhook events</span></div> : webhooks.map(w => (
              <div key={w._id} className="wh-row">
                <div className="cell-id">{w.paymentId.slice(0, 8)}...</div>
                <div className="cell-key">{w.eventType}</div>
                <div><span className={`status-badge ${w.result === 'PROCESSED' ? 'success' : w.result === 'IGNORED' ? 'pending' : 'failed'}`}>{w.result}</span></div>
                <div className="cell-time">{new Date(w.createdAt).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="footer"><div>NexusPay v1.0 — JWT Auth + Razorpay</div><div style={{ display: 'flex', gap: '1.5rem' }}><span>Active: {stats?.activeProcessing ?? 0}</span><span>Total: {stats?.totalPayments ?? 0}</span></div></footer>

      {/* Payment Modal */}
      <AnimatePresence>{isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <motion.div className="modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title-row"><h3 className="modal-title">Initiate Payment</h3><button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={18} /></button></div>
            <form onSubmit={handlePay}>
              <div className="form-group"><label className="form-label">Amount (INR)</label><input type="number" step="1" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="form-input" autoFocus /></div>
              <div className="info-box"><div className="info-box-title"><AlertCircle size={12} /> Test Mode</div><p>Use card <strong>4111 1111 1111 1111</strong>, any future expiry, any CVV.</p></div>
              <button type="submit" className="btn-submit" disabled={submitting}>{submitting ? <><Loader2 size={14} className="spinner" /> Creating...</> : 'Pay with Razorpay'}</button>
            </form>
          </motion.div>
        </div>
      )}</AnimatePresence>

      {/* Detail Panel */}
      <AnimatePresence>{selected && (<>
        <div className="detail-overlay" onClick={() => setSelected(null)} />
        <motion.div className="detail-panel" initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}>
          <div className="modal-title-row"><h3 className="modal-title">Payment Detail</h3><button className="btn-close" onClick={() => setSelected(null)}><X size={18} /></button></div>
          <div className="detail-section">
            <div className="detail-section-title">Overview</div>
            <DR l="ID" v={pid(selected)} /><DR l="Amount" v={`₹${selected.amount.toFixed(2)} ${selected.currency}`} />
            <div className="detail-field"><span className="detail-field-label">Status</span><span><StatusBadge status={selected.status} retryCount={selected.retryCount} /></span></div>
            <DR l="Retries" v={`${selected.retryCount} / ${selected.maxRetries}`} /><DR l="RZP Order" v={selected.razorpayOrderId || '—'} />
            <DR l="RZP Payment" v={selected.razorpayPaymentId || '—'} /><DR l="Idemp. Key" v={selected.idempotencyKey} />
            {selected.lastError && <DR l="Error" v={selected.lastError} c="var(--danger)" />}
            <DR l="Created" v={new Date(selected.createdAt).toLocaleString()} /><DR l="Updated" v={new Date(selected.updatedAt).toLocaleString()} />
          </div>
          <div className="detail-section">
            <div className="detail-section-title">Timeline ({selected.logs.length})</div>
            {selected.logs.map((l, i) => <div key={i} className="log-entry"><div className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</div><div><div className="log-event">{l.event}</div>{l.details && <div className="log-details">{l.details}</div>}</div></div>)}
          </div>
        </motion.div>
      </>)}</AnimatePresence>
    </div>
  );
}

// Helpers
const pid = (p: Payment) => p._id || p.id;
function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="stat-header">{icon}<span className="stat-label">{label}</span></div><div className="stat-value">{value}</div></div>;
}
function DR({ l, v, c }: { l: string; v: string; c?: string }) {
  return <div className="detail-field"><span className="detail-field-label">{l}</span><span className="detail-field-value" style={c ? { color: c } : undefined}>{v}</span></div>;
}
function StatusBadge({ status, retryCount }: { status: string; retryCount: number }) {
  const cls = status === 'PROCESSING' ? 'processing' : status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'failed' : 'pending';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><span className={`status-badge ${cls}`}>{status}{status === 'PROCESSING' && <span className="pulse-dot" />}</span>{retryCount > 0 && status !== 'SUCCESS' && <span className="retry-count">×{retryCount}</span>}</span>;
}
