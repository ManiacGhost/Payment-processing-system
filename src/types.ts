export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface PaymentLog {
  timestamp: string;
  event: string;
  details?: string;
}

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
  gatewayReference?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  logs: PaymentLog[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface SystemStats {
  totalPayments: number;
  byStatus: Record<PaymentStatus, number>;
  totalVolume: number;
  totalRetries: number;
  webhooksReceived: number;
  circuitBreaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    threshold: number;
    resetMs: number;
  };
  activeProcessing: number;
}

export interface WebhookLogEntry {
  _id: string;
  paymentId: string;
  source: string;
  eventType: string;
  payload: any;
  result: 'PROCESSED' | 'IGNORED' | 'CONFLICT';
  createdAt: string;
}

// Razorpay Checkout global type
declare global {
  interface Window {
    Razorpay: any;
  }
}
