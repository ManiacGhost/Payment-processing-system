import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentLog {
  timestamp: Date;
  event: string;
  details?: string;
}

export interface IPayment extends Document {
  userId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  idempotencyKey: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  gatewayReference?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  logs: IPaymentLog[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentLogSchema = new Schema<IPaymentLog>({
  timestamp: { type: Date, default: Date.now },
  event: { type: String, required: true },
  details: String,
}, { _id: false });

const PaymentSchema = new Schema<IPayment>({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, minlength: 3, maxlength: 3 },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  idempotencyKey: { type: String, required: true, unique: true },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  lastError: String,
  gatewayReference: String,
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: String,
  razorpaySignature: String,
  logs: [PaymentLogSchema],
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
});

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
