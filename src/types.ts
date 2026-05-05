export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  retryCount: number;
  lastError?: string;
  gatewayReference?: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
  metadata?: Record<string, any>;
}
