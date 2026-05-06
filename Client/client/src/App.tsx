import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCcw, CheckCircle2, ArrowRight, ShieldCheck, Zap, Activity,
  History, AlertCircle, X, Wifi, WifiOff, Loader2, LogIn, UserPlus, Mail, Lock, User,
  Play, Layers, GitBranch, Cpu, Server, RotateCcw as RotateCcwIcon, Webhook, Moon, Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Payment, SystemStats, WebhookLogEntry, AuthUser } from './types';
import { apiFetch, apiLogin, apiRegister, apiLogout, getStoredUser, getAccessToken } from './api';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [checking, setChecking] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('nexuspay-theme');
    const isDark = stored !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    return isDark;
  });
  const toggleDark = () => setDarkMode(d => {
    const next = !d;
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('nexuspay-theme', next ? 'dark' : 'light');
    return next;
  });

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
  return <Dashboard user={user} onLogout={handleLogout} darkMode={darkMode} toggleDark={toggleDark} />;
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
function Dashboard({ user, onLogout, darkMode, toggleDark }: { user: AuthUser; onLogout: () => void; darkMode: boolean; toggleDark: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookLogEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [tab, setTab] = useState<'payments' | 'webhooks' | 'simulate'>('payments');
  const [txPage, setTxPage] = useState(1);
  const [whPage, setWhPage] = useState(1);
  const PER_PAGE = 10;

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

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 5000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (selected) {
      const u = payments.find(p => pid(p) === pid(selected));
      if (u && JSON.stringify(u) !== JSON.stringify(selected)) {
        setSelected(u);
      }
    }
  }, [payments, selected]);

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
          <button className="btn-theme-toggle" onClick={toggleDark} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
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
        <button className={`tab ${tab === 'simulate' ? 'active' : ''}`} onClick={() => setTab('simulate')}>Simulate</button>
      </div>

      {tab === 'webhooks' ? (
        <div className="table-container">
          <div className="table-header"><h2 className="table-title">Webhook Log</h2></div>
          <div className="wh-cols"><div>Payment</div><div>Event</div><div>Result</div><div>Time</div></div>
          <div style={{ minHeight: '200px' }}>
            {webhooks.length === 0 ? <div className="table-empty"><span>No webhook events</span></div> : webhooks.slice((whPage - 1) * PER_PAGE, whPage * PER_PAGE).map(w => (
              <div key={w._id} className="wh-row">
                <div className="cell-id">{w.paymentId.slice(0, 8)}...</div>
                <div className="cell-key">{w.eventType}</div>
                <div><span className={`status-badge ${w.result === 'PROCESSED' ? 'success' : w.result === 'IGNORED' ? 'pending' : 'failed'}`}>{w.result}</span></div>
                <div className="cell-time">{new Date(w.createdAt).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
          <Pagination page={whPage} total={webhooks.length} perPage={PER_PAGE} onChange={setWhPage} />
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            <h2 className="table-title">Transaction Stream</h2>
            {tab === 'payments' && <button className="btn-primary" onClick={() => setIsModalOpen(true)}><Plus size={14} /> New Payment</button>}
          </div>
          <div className="table-cols"><div>ID / Time</div><div>Razorpay Order</div><div>Amount</div><div>Status</div><div>Payment ID</div><div></div></div>
          <div style={{ minHeight: '300px' }}>
            {payments.length === 0 ? <div className="table-empty"><WifiOff size={24} /><span>No transactions yet</span></div> : (
              <AnimatePresence>{payments.slice((txPage - 1) * PER_PAGE, txPage * PER_PAGE).map(p => (
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
          <Pagination page={txPage} total={payments.length} perPage={PER_PAGE} onChange={setTxPage} />
        </div>
      )}

      {tab === 'simulate' && <div style={{ marginTop: '1.75rem' }}><SimulationPanel onRefresh={fetchData} /></div>}

      <footer className="footer"><div>NexusPay v1.0 — JWT Auth + Razorpay</div><div style={{ display: 'flex', gap: '1.5rem' }}><span>Active: {stats?.activeProcessing ?? 0}</span><span>Total: {stats?.totalPayments ?? 0}</span></div></footer>

      {/* Payment Modal */}
      <AnimatePresence>{isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <motion.div className="modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title-row"><h3 className="modal-title">Initiate Payment</h3><button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={18} /></button></div>
            <form onSubmit={handlePay}>
              <div className="form-group"><label className="form-label">Amount (INR)</label><input type="number" step="1" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="form-input" autoFocus /></div>
              <div className="info-box"><div className="info-box-title"><AlertCircle size={12} /> Test Mode</div><p>Domestic: <strong>5267 3181 8797 5449</strong> (Mastercard) &nbsp;·&nbsp; International: <strong>4111 1111 1111 1111</strong> (Visa — enable in Razorpay Dashboard → Settings → Payment Methods → International). Any future expiry, any CVV.</p></div>
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
function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="pag-btn" onClick={() => onChange(page - 1)} disabled={page === 1}>← Prev</button>
      <span className="pag-info">Page {page} of {pages} <span className="pag-count">({total} total)</span></span>
      <button className="pag-btn" onClick={() => onChange(page + 1)} disabled={page === pages}>Next →</button>
    </div>
  );
}

// ===== SIMULATION PANEL =====
interface SimLog { msg: string; type: 'info' | 'success' | 'error' | 'warn'; ts: string; }

function SimulationPanel({ onRefresh }: { onRefresh: () => void }) {
  const [logs, setLogs] = useState<Record<string, SimLog[]>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [queueStats, setQueueStats] = useState<any>(null);
  const [scenario, setScenario] = useState<string>('success');

  const addLog = (id: string, msg: string, type: SimLog['type'] = 'info') =>
    setLogs(prev => ({ ...prev, [id]: [...(prev[id] || []), { msg, type, ts: new Date().toLocaleTimeString() }] }));

  const runSim = async (id: string, fn: () => Promise<void>) => {
    setRunning(prev => ({ ...prev, [id]: true }));
    setLogs(prev => ({ ...prev, [id]: [] }));
    try { await fn(); } catch (e: any) { addLog(id, `Unexpected: ${e.message}`, 'error'); }
    setRunning(prev => ({ ...prev, [id]: false }));
    onRefresh();
  };

  // ── Idempotency: replay same key twice → 409 ──────────────────────────────
  const simIdempotency = () => runSim('idemp', async () => {
    const key = `idemp_sim_${Date.now()}`;
    addLog('idemp', `Using idempotency key: ${key}`);
    const r1 = await apiFetch('/api/payments', { method: 'POST', body: JSON.stringify({ amount: 1, currency: 'INR', idempotencyKey: key, metadata: { sim: 'idempotency' } }) });
    const d1 = await r1.json();
    if (r1.ok || r1.status === 202) addLog('idemp', `Request 1 → ${r1.status}: Payment ${((d1.payment?._id || d1.payment?.id) ?? '').toString().slice(0, 8)} created`, 'success');
    else { addLog('idemp', `Request 1 → ${r1.status}: ${d1.error}`, 'error'); return; }
    addLog('idemp', `Replaying exact same key...`);
    const r2 = await apiFetch('/api/payments', { method: 'POST', body: JSON.stringify({ amount: 1, currency: 'INR', idempotencyKey: key, metadata: { sim: 'idempotency' } }) });
    const d2 = await r2.json();
    if (r2.status === 409) addLog('idemp', `Request 2 → 409 Conflict — Duplicate blocked ✓`, 'success');
    else addLog('idemp', `Request 2 → ${r2.status}: ${d2.error || JSON.stringify(d2)}`, r2.ok ? 'warn' : 'error');
  });

  // ── Concurrent burst: 4 simultaneous payments ─────────────────────────────
  const simConcurrent = () => runSim('concurrent', async () => {
    addLog('concurrent', 'Firing 4 simultaneous requests via Promise.all...');
    const ts = Date.now();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        apiFetch('/api/payments', { method: 'POST', body: JSON.stringify({ amount: 1, currency: 'INR', idempotencyKey: `conc_${ts}_${i}`, metadata: { sim: 'concurrency' } }) })
          .then(async r => ({ status: r.status, data: await r.json() }))
      )
    );
    results.forEach((r, i) => {
      const id = ((r.data.payment?._id || r.data.payment?.id) ?? '').toString().slice(0, 8);
      if (r.status < 300 || r.status === 202)
        addLog('concurrent', `Request ${i + 1} → ${r.status}: ${id || 'queued'}`, 'success');
      else
        addLog('concurrent', `Request ${i + 1} → ${r.status}: ${r.data.error || 'see logs'}`, r.status === 429 ? 'warn' : 'error');
    });
    addLog('concurrent', 'All 4 settled — check Transaction Stream', 'info');
  });

  // ── Rate limit: 12 rapid requests vs 10/min window ───────────────────────
  const simRateLimit = () => runSim('ratelimit', async () => {
    addLog('ratelimit', 'Sending 12 rapid requests (server limit: 10/min)...');
    let passed = 0, blocked = 0;
    const ts = Date.now();
    for (let i = 0; i < 12; i++) {
      const r = await apiFetch('/api/payments', { method: 'POST', body: JSON.stringify({ amount: 1, currency: 'INR', idempotencyKey: `rl_${ts}_${i}`, metadata: { sim: 'ratelimit' } }) });
      if (r.status === 429) { blocked++; addLog('ratelimit', `#${i + 1} → 429 Too Many Requests ✓`, 'warn'); }
      else { passed++; addLog('ratelimit', `#${i + 1} → ${r.status} Accepted`, 'success'); }
    }
    addLog('ratelimit', `Done — ${passed} accepted, ${blocked} rate-limited`, blocked > 0 ? 'success' : 'warn');
    if (blocked === 0) addLog('ratelimit', 'Note: window may have reset — try again immediately', 'info');
  });

  // ── Payment scenarios: POST /api/simulate/payment ─────────────────────────
  const simScenario = () => runSim('scenario', async () => {
    addLog('scenario', `Running scenario: ${scenario}...`);
    const r = await apiFetch('/api/simulate/payment', { method: 'POST', body: JSON.stringify({ amount: 500, currency: 'INR', scenario }) });
    const d = await r.json();
    if (r.ok || r.status === 202) {
      const st = d.payment?.status ?? d.status ?? 'unknown';
      const id = ((d.payment?._id || d.payment?.id) ?? '').toString().slice(0, 8);
      const retries = d.payment?.retryCount ?? d.retryCount ?? 0;
      addLog('scenario', `Status: ${st} ${id ? `| ID: ${id}` : ''}${retries ? ` | Retries: ${retries}` : ''}`, st === 'SUCCESS' ? 'success' : st === 'FAILED' ? 'error' : 'warn');
      if (d.message) addLog('scenario', d.message, 'info');
    } else {
      addLog('scenario', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  // ── Async queue retry: POST /api/simulate/payment/retry ──────────────────
  const simQueueRetry = () => runSim('queueretry', async () => {
    addLog('queueretry', 'Enqueuing async retry job (partial_failure scenario)...');
    const r = await apiFetch('/api/simulate/payment/retry', { method: 'POST', body: JSON.stringify({ amount: 500, currency: 'INR' }) });
    const d = await r.json();
    if (r.status === 202) {
      const id = ((d.payment?._id || d.payment?.id) ?? '').toString().slice(0, 8);
      addLog('queueretry', `202 Accepted — Payment ${id} queued`, 'success');
      addLog('queueretry', 'Backoff: fail×2 → succeed on attempt 3', 'info');
      addLog('queueretry', 'Poll "Retry Queue Inspector" to watch job progress', 'info');
    } else {
      addLog('queueretry', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  // ── Circuit breaker: POST /api/simulate/circuit-breaker ──────────────────
  const simCircuitTrip = () => runSim('circuit', async () => {
    addLog('circuit', 'Sending 6 failures to POST /api/simulate/circuit-breaker...');
    addLog('circuit', 'Threshold: 5 failures → OPEN');
    const r = await apiFetch('/api/simulate/circuit-breaker', { method: 'POST', body: JSON.stringify({ failures: 6 }) });
    const d = await r.json();
    if (r.ok) {
      const state = d.circuitBreaker?.state ?? d.state ?? 'unknown';
      addLog('circuit', `Circuit state → ${state}`, state === 'OPEN' ? 'error' : 'warn');
      if (d.message) addLog('circuit', d.message, 'info');
      addLog('circuit', 'Watch the Circuit Breaker stat card above ↑', 'success');
    } else {
      addLog('circuit', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  const simCircuitReset = () => runSim('circuit', async () => {
    addLog('circuit', 'Resetting circuit breaker → CLOSED...');
    const r = await apiFetch('/api/simulate/circuit-breaker/reset', { method: 'POST', body: JSON.stringify({}) });
    const d = await r.json();
    if (r.ok) {
      const state = d.circuitBreaker?.state ?? d.state ?? 'CLOSED';
      addLog('circuit', `Circuit reset → ${state} ✓`, 'success');
    } else {
      addLog('circuit', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  // ── Queue stats: GET /api/payments/queue/stats ────────────────────────────
  const simQueueStats = () => runSim('queue', async () => {
    addLog('queue', 'Fetching /api/payments/queue/stats...');
    const r = await apiFetch('/api/payments/queue/stats');
    if (!r.ok) { addLog('queue', `Error ${r.status} — endpoint unavailable`, 'error'); return; }
    const data = await r.json();
    setQueueStats(data);
    const history: any[] = data.history ?? data.jobs ?? [];
    addLog('queue', `Active queue length: ${data.queueLength ?? data.pending ?? 0}`, 'info');
    addLog('queue', `Job history: ${history.length} entries`, 'info');
    if (history.length > 0) {
      const counts: Record<string, number> = {};
      history.forEach((j: any) => { counts[j.status] = (counts[j.status] || 0) + 1; });
      Object.entries(counts).forEach(([k, v]) =>
        addLog('queue', `  ${k}: ${v} job(s)`, k === 'success' ? 'success' : k === 'failed' ? 'error' : 'info')
      );
    } else {
      addLog('queue', 'No jobs yet — run Queue Retry to enqueue one', 'warn');
    }
  });

  // ── Webhook edge cases ────────────────────────────────────────────────────
  const simWebhookEarly = () => runSim('wh_early', async () => {
    addLog('wh_early', 'Firing webhook for a non-existent order...');
    const r = await apiFetch('/api/simulate/webhook/early', { method: 'POST', body: JSON.stringify({}) });
    const d = await r.json();
    if (r.ok) {
      addLog('wh_early', `${r.status}: ${d.message || 'Early callback fired'}`, 'success');
      addLog('wh_early', 'Result logged as IGNORED/UNKNOWN — check Webhook Log tab', 'info');
    } else {
      addLog('wh_early', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  const simWebhookDuplicate = () => runSim('wh_dup', async () => {
    addLog('wh_dup', 'Creating payment and firing same webhook event twice...');
    const r = await apiFetch('/api/simulate/webhook/duplicate', { method: 'POST', body: JSON.stringify({}) });
    const d = await r.json();
    if (r.ok) {
      addLog('wh_dup', `${r.status}: ${d.message || 'Duplicate webhook fired'}`, 'success');
      addLog('wh_dup', 'Event 1 → PROCESSED, Event 2 → IGNORED via deduplication', 'info');
      addLog('wh_dup', 'Check Webhook Log tab for both entries', 'info');
    } else {
      addLog('wh_dup', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  const simWebhookConflict = () => runSim('wh_conflict', async () => {
    addLog('wh_conflict', 'Creating FAILED payment then firing payment.captured webhook...');
    const r = await apiFetch('/api/simulate/webhook/conflict', { method: 'POST', body: JSON.stringify({}) });
    const d = await r.json();
    if (r.ok) {
      addLog('wh_conflict', `${r.status}: ${d.message || 'Conflict webhook fired'}`, 'success');
      addLog('wh_conflict', 'Payment state NOT overwritten — logged as CONFLICT', 'warn');
      addLog('wh_conflict', 'Check Webhook Log tab for the CONFLICT entry', 'info');
    } else {
      addLog('wh_conflict', `${r.status}: ${d.error || JSON.stringify(d)}`, 'error');
    }
  });

  const SCENARIOS = ['success', 'failure', 'timeout', 'network_error', 'partial_failure', 'random'];

  return (
    <div className="sim-grid">
      {/* Payment Scenarios */}
      <div className="sim-card" style={{ '--sim-color': 'var(--accent)' } as React.CSSProperties}>
        <div className="sim-card-header">
          <span className="sim-icon" style={{ color: 'var(--accent)' }}><Play size={16} /></span>
          <span className="sim-title">Payment Scenarios</span>
          <button className="sim-run-btn" onClick={simScenario} disabled={!!running['scenario']} style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {running['scenario'] ? <><Loader2 size={11} className="spinner" /> Running</> : <><Play size={11} /> Run</>}
          </button>
        </div>
        <p className="sim-desc">Runs a controlled scenario via <code>/api/simulate/payment</code>. Select a scenario to see how the backend handles each case end-to-end.</p>
        <div className="sim-scenario-row">
          {SCENARIOS.map(s => (
            <button key={s} className={`sim-scenario-btn ${scenario === s ? 'active' : ''}`} onClick={() => setScenario(s)}>{s}</button>
          ))}
        </div>
        {logs['scenario']?.length > 0 && (
          <div className="sim-log">
            {logs['scenario'].map((l, i) => <div key={i} className={`sim-line sim-${l.type}`}><span className="sim-ts">{l.ts}</span><span>{l.msg}</span></div>)}
          </div>
        )}
      </div>

      {/* Async Queue Retry */}
      <SimCard id="queueretry" title="Async Queue Retry" color="var(--success)"
        icon={<RotateCcwIcon size={16} />}
        description="Calls POST /api/simulate/payment/retry → 202 Accepted immediately. Backend enqueues a partial_failure job: fails attempts 1 & 2, succeeds on attempt 3 with exponential backoff."
        onRun={simQueueRetry} running={!!running['queueretry']} logs={logs['queueretry'] || []} />

      {/* Circuit Breaker */}
      <div className="sim-card" style={{ '--sim-color': 'var(--danger)' } as React.CSSProperties}>
        <div className="sim-card-header">
          <span className="sim-icon" style={{ color: 'var(--danger)' }}><Server size={16} /></span>
          <span className="sim-title">Circuit Breaker</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="sim-run-btn" onClick={simCircuitTrip} disabled={!!running['circuit']} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
              {running['circuit'] ? <><Loader2 size={11} className="spinner" /> Running</> : <><Play size={11} /> Trip</>}
            </button>
            <button className="sim-run-btn" onClick={simCircuitReset} disabled={!!running['circuit']} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>
              Reset
            </button>
          </div>
        </div>
        <p className="sim-desc">Trip: calls <code>/api/simulate/circuit-breaker</code> with 6 failures — opens circuit after threshold of 5. Reset: restores CLOSED state immediately.</p>
        {logs['circuit']?.length > 0 && (
          <div className="sim-log">
            {logs['circuit'].map((l, i) => <div key={i} className={`sim-line sim-${l.type}`}><span className="sim-ts">{l.ts}</span><span>{l.msg}</span></div>)}
          </div>
        )}
      </div>

      {/* Idempotency */}
      <SimCard id="idemp" title="Idempotency Guard" color="var(--processing)"
        icon={<Layers size={16} />}
        description="Creates a payment, then replays the exact same idempotency key. The second request must return 409 Conflict — duplicate prevention in action."
        onRun={simIdempotency} running={!!running['idemp']} logs={logs['idemp'] || []} />

      {/* Concurrency */}
      <SimCard id="concurrent" title="Concurrent Burst" color="#a29bfe"
        icon={<GitBranch size={16} />}
        description="Fires 4 payments simultaneously via Promise.all. Concurrency locks on the backend prevent the same idempotency key from being double-processed under parallel load."
        onRun={simConcurrent} running={!!running['concurrent']} logs={logs['concurrent'] || []} />

      {/* Rate Limit */}
      <SimCard id="ratelimit" title="Rate Limit Probe" color="var(--warning)"
        icon={<Cpu size={16} />}
        description="Sends 12 sequential requests against the configurable 10 req/min sliding window. Requests 11–12 should receive 429 Too Many Requests."
        onRun={simRateLimit} running={!!running['ratelimit']} logs={logs['ratelimit'] || []} />

      {/* Queue Stats */}
      <SimCard id="queue" title="Retry Queue Inspector" color="#fd79a8"
        icon={<Activity size={16} />}
        description="Fetches GET /api/payments/queue/stats — shows live queue length and last 200 job history entries with attempt counts and backoff status."
        onRun={simQueueStats} running={!!running['queue']} logs={logs['queue'] || []}
        extra={queueStats && <QueueJobTable data={queueStats} />} />

      {/* Webhook Edge Cases */}
      <SimCard id="wh_early" title="Webhook: Early Callback" color="#74b9ff"
        icon={<Webhook size={16} />}
        description="Fires a webhook for an order_id that doesn't exist in the DB yet. Logged as IGNORED/UNKNOWN — visible in the Webhook Log tab."
        onRun={simWebhookEarly} running={!!running['wh_early']} logs={logs['wh_early'] || []} />

      <SimCard id="wh_dup" title="Webhook: Duplicate Callback" color="#a29bfe"
        icon={<Webhook size={16} />}
        description="Creates a payment and fires the same webhook event twice. First → PROCESSED, second → IGNORED via deduplication. Both visible in Webhook Log."
        onRun={simWebhookDuplicate} running={!!running['wh_dup']} logs={logs['wh_dup'] || []} />

      <SimCard id="wh_conflict" title="Webhook: Conflicting Callback" color="var(--warning)"
        icon={<Webhook size={16} />}
        description="Creates a FAILED payment then fires payment.captured for it. Payment state is NOT overwritten — logged as CONFLICT in the Webhook Log."
        onRun={simWebhookConflict} running={!!running['wh_conflict']} logs={logs['wh_conflict'] || []} />
    </div>
  );
}

function SimCard({ title, description, icon, color, onRun, running, logs, extra }: {
  id: string; title: string; description: string; icon: React.ReactNode;
  color: string; onRun: () => void; running: boolean; logs: SimLog[]; extra?: React.ReactNode;
}) {
  return (
    <div className="sim-card" style={{ '--sim-color': color } as React.CSSProperties}>
      <div className="sim-card-header">
        <span className="sim-icon" style={{ color }}>{icon}</span>
        <span className="sim-title">{title}</span>
        <button className="sim-run-btn" onClick={onRun} disabled={running} style={{ color, borderColor: color }}>
          {running ? <><Loader2 size={11} className="spinner" /> Running</> : <><Play size={11} /> Run</>}
        </button>
      </div>
      <p className="sim-desc">{description}</p>
      {(logs.length > 0 || extra) && (
        <div className="sim-log">
          {logs.map((l, i) => (
            <div key={i} className={`sim-line sim-${l.type}`}>
              <span className="sim-ts">{l.ts}</span>
              <span>{l.msg}</span>
            </div>
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}

function QueueJobTable({ data }: { data: any }) {
  const history: any[] = data.history ?? data.jobs ?? [];
  if (!history.length) return null;
  return (
    <div className="sim-queue-table">
      <div className="sim-queue-header"><span>Job / Payment</span><span>Attempt</span><span>Status</span></div>
      {history.slice(0, 10).map((j: any, i: number) => (
        <div key={i} className="sim-queue-row">
          <span className="cell-id">{(j.id ?? j.paymentId ?? '').toString().slice(0, 8)}…</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>{j.attempt}/{j.maxAttempts}</span>
          <span className={`status-badge ${j.status === 'success' ? 'success' : j.status === 'failed' ? 'failed' : 'processing'}`}>{j.status}</span>
        </div>
      ))}
    </div>
  );
}
