export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface PaymentLog { timestamp: string; event: string; details?: string; }

export interface Payment {
  _id: string;
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  logs: PaymentLog[];
  createdAt: string;
  updatedAt: string;
}

export interface SystemStats {
  totalPayments: number;
  byStatus: Record<PaymentStatus, number>;
  totalVolume: number;
  totalRetries: number;
  webhooksReceived: number;
  circuitBreaker: { state: string; failures: number; threshold: number; resetMs: number };
  activeProcessing: number;
}

export interface WebhookLogEntry {
  _id: string;
  paymentId: string;
  eventType: string;
  result: 'PROCESSED' | 'IGNORED' | 'CONFLICT';
  createdAt: string;
  payload: any;
}

export interface AuthUser { id: string; name: string; email: string; }

declare global { interface Window { Razorpay: any; } }
