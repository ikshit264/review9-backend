export interface DodoWebhookPayload {
  event_type: string;
  payment_id?: string;
  product_id?: string;
  customer?: {
    email: string;
    name: string;
  };
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface WebhookHeaders {
  'webhook-id': string;
  'webhook-signature': string;
  'webhook-timestamp': string;
}
