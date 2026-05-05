import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  History,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, signIn, signOut, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { Payment } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('100.00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setPayments([]);
      return;
    }

    const q = query(
      collection(db, 'payments'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
      setPayments(p);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return unsubscribe;
  }, [user]);

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: 'USD',
          userId: user.uid,
          idempotencyKey: `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          metadata: { device: 'web_dashboard' }
        })
      });

      if (!response.ok) throw new Error('API Request Failed');
      
      setIsModalOpen(false);
    } catch (error) {
      console.error("Payment initiation failed:", error);
      alert("Failed to initiate payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center font-mono">
      <Zap className="animate-spin mr-2" size={16} />
      LOADING_SYSTEM_RESOURCES...
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#E4E3E0]">
      <div className="max-w-md w-full border border-black p-8 bg-white shadow-[8px_8px_0px_#141414]">
        <div className="flex items-center mb-8 gap-2">
          <ShieldCheck size={32} />
          <h1 className="text-2xl font-bold tracking-tighter">NEXUS_PAY_v1.0</h1>
        </div>
        <p className="font-mono text-sm mb-8 opacity-70">
          SECURE_GATEWAY_ACCESS_REQUIRED. PLEASE_AUTHENTICATE_TO_CONTINUE.
        </p>
        <button 
          onClick={signIn}
          className="w-full bg-black text-white p-4 font-mono hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
        >
          AUTH_VIA_GOOGLE <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={20} className="text-black" />
            <span className="font-mono text-xs uppercase tracking-widest opacity-50">Authorized Terminal</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Nexus Dashboard</h1>
        </div>
        
        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="flex flex-col items-end">
            <span className="opacity-50 uppercase">User</span>
            <span>{user.email}</span>
          </div>
          <button 
            onClick={signOut}
            className="border border-black px-3 py-1 hover:bg-black hover:text-white transition-all uppercase"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        <StatCard label="Total Vol" value={`$${payments.filter(p => p.status === 'SUCCESS').reduce((acc, p) => acc + p.amount, 0).toFixed(2)}`} icon={<Activity size={14}/>} />
        <StatCard label="Active" value={payments.filter(p => p.status === 'PROCESSING').length.toString()} icon={<RefreshCcw size={14} className="animate-spin"/>} />
        <StatCard label="Success" value={payments.filter(p => p.status === 'SUCCESS').length.toString()} icon={<CheckCircle2 size={14}/>} />
        <StatCard label="Retries" value={payments.reduce((acc, p) => acc + (p.retryCount || 0), 0).toString()} icon={<History size={14}/>} />
      </div>

      {/* Main Table Container */}
      <div className="bg-white technical-grid shadow-[4px_4px_0px_#141414]">
        <div className="p-4 border-bottom border-black flex justify-between items-center">
          <h2 className="font-serif italic text-lg">Transaction Stream</h2>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-black text-white px-4 py-2 text-xs font-mono flex items-center gap-2 hover:bg-zinc-800 transition-colors"
          >
            <Plus size={14} /> INITIATE_PAYMENT
          </button>
        </div>

        {/* Table Headers */}
        <div className="grid grid-cols-4 md:grid-cols-6 p-4 border-b border-black font-serif italic text-[11px] uppercase opacity-50 tracking-widest bg-zinc-100">
          <div className="col-span-1">ID / Time</div>
          <div className="hidden md:block">Key</div>
          <div>Amount / Curr</div>
          <div>Status</div>
          <div className="hidden md:block">Reference</div>
          <div className="text-right">Actions</div>
        </div>

        {/* Table Body */}
        <div className="min-h-[400px]">
          {payments.length === 0 ? (
            <div className="h-full flex items-center justify-center p-20 font-mono text-sm opacity-30 italic">
              NO_TRANSACTION_HISTORY_FOUND
            </div>
          ) : (
            payments.map((p) => (
              <motion.div 
                layout
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-4 md:grid-cols-6 p-4 technical-row items-center"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs font-bold leading-none">{p.id.slice(0, 8)}...</span>
                  <span className="font-mono text-[10px] opacity-50">
                    {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleTimeString() : 'PENDING...'}
                  </span>
                </div>
                
                <div className="hidden md:block font-mono text-[10px] truncate pr-4 opacity-50">
                  {p.idempotencyKey}
                </div>

                <div className="font-mono text-xs">
                  {p.amount.toFixed(2)} <span className="opacity-50">{p.currency}</span>
                </div>

                <div>
                   <StatusBadge status={p.status} retryCount={p.retryCount} />
                </div>

                <div className="hidden md:block font-mono text-[10px] truncate pr-4 italic">
                  {p.gatewayReference || '—'}
                </div>

                <div className="text-right">
                  <button className="opacity-30 hover:opacity-100 transition-opacity">
                    <ArrowRight size={14} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Footer Info */}
      <footer className="mt-12 flex justify-between font-mono text-[10px] opacity-40 uppercase tracking-widest border-t border-black pt-4">
        <div>Resilient Payment Processor v1.0.42</div>
        <div className="flex gap-4">
          <span>Latency: 142ms</span>
          <span>Status: Operational</span>
        </div>
      </footer>

      {/* New Payment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#E4E3E0] border-2 border-black max-w-sm w-full p-8 shadow-[12px_12px_0px_#141414]"
            >
              <div className="flex justify-between items-start mb-8">
                <h3 className="font-serif italic text-2xl uppercase tracking-tighter">New Payment</h3>
                <button onClick={() => setIsModalOpen(false)}><ArrowRight className="rotate-180" size={18}/></button>
              </div>

              <form onSubmit={handleCreatePayment}>
                <div className="mb-6">
                  <label className="font-mono text-[10px] uppercase opacity-50 block mb-2">Amount (USD)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border border-black p-4 font-mono text-xl focus:outline-none focus:ring-2 ring-black"
                    autoFocus
                  />
                </div>

                <div className="bg-zinc-200 p-4 border border-black/10 mb-8">
                  <div className="flex gap-2 items-center font-mono text-[10px] uppercase opacity-70 mb-2">
                    <AlertCircle size={12}/> System_Directive
                  </div>
                  <p className="font-mono text-[10px] opacity-50">
                    This transaction will simulate random network conditions including timeouts, transient failures, and asynchronous gateway callbacks.
                  </p>
                </div>

                <button 
                  disabled={submitting}
                  type="submit"
                  className="w-full bg-black text-white p-4 font-mono hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'EXECUTING_TX...' : 'CONFIRM_TRANSACTION'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-black p-4 shadow-[2px_2px_0px_#141414]">
      <div className="flex items-center gap-2 mb-2 opacity-50">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-mono font-bold">{value}</div>
    </div>
  );
}

function StatusBadge({ status, retryCount }: { status: Payment['status'], retryCount: number }) {
  const styles = {
    PROCESSING: "text-blue-500 border-blue-500",
    SUCCESS: "text-emerald-600 border-emerald-600",
    FAILED: "text-rose-600 border-rose-600",
    PENDING: "text-amber-500 border-amber-500"
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`status-badge min-w-[80px] text-center ${styles[status]}`}>
        {status}
        {status === 'PROCESSING' && <span className="ml-1 inline-block w-1 h-1 bg-current rounded-full pulse" />}
      </span>
      {retryCount > 0 && status !== 'SUCCESS' && (
        <span className="font-mono text-[9px] opacity-50">Attempt {retryCount + 1}</span>
      )}
    </div>
  );
}
