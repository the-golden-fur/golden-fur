import { createHmac, timingSafeEqual } from 'node:crypto';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

function getSecretKey(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throwWithStatus(500, 'PAYMONGO_SECRET_KEY is not configured');
  return key;
}

/**
 * TRUST BOUNDARY: Sprint 0 Issue 0-D ("PayMongo sandbox credentials +
 * published rate source") is referenced throughout the Sprint5-EpicA-Guide
 * but does not exist anywhere in this repo - no Sprint 0 issue docs, no
 * PAYMONGO_* env vars, no rate-source mechanism. PayMongo also has no public
 * "current fee rate" API endpoint to poll. This reads a configured env var
 * instead of hardcoding a number, so it is at least swappable without a
 * code change once a real rate source exists - set
 * PAYMONGO_SERVICE_FEE_PERCENT to PayMongo's actual currently published
 * rate for the relevant channel before relying on this in production.
 */
export function getPaymongoServiceFeeRate(): number {
  const configured = process.env.PAYMONGO_SERVICE_FEE_PERCENT;
  const parsed = configured ? Number(configured) : NaN;
  return Number.isFinite(parsed) ? parsed : 2.5;
}

const SOURCE_TYPE_BY_METHOD: Record<'GCash' | 'Maya', string> = {
  GCash: 'gcash',
  Maya: 'paymaya',
};

export interface InitiatePaymongoPaymentInput {
  paymentMethod: 'GCash' | 'Maya';
  amount: number;
  description: string;
  redirectSuccessUrl: string;
  redirectFailedUrl: string;
}

export interface InitiatePaymongoPaymentResult {
  sourceId: string;
  checkoutUrl: string;
}

/**
 * Creates a PayMongo e-wallet Source (the correct PayMongo primitive for
 * GCash/Maya redirect-based checkout) for a customer-portal payment. Only
 * relevant to the 'portal' channel - the 'walk_in_qr' channel is a
 * cashier-shown static QR with no per-transaction API call, confirmed
 * manually like any other manual method (paymentMethod.service.ts).
 */
export async function initiatePaymongoPayment({
  paymentMethod,
  amount,
  description,
  redirectSuccessUrl,
  redirectFailedUrl,
}: InitiatePaymongoPaymentInput): Promise<InitiatePaymongoPaymentResult> {
  const secretKey = getSecretKey();

  const response = await fetch(`${PAYMONGO_API_BASE}/sources`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          // PayMongo amounts are in centavos.
          amount: Math.round(amount * 100),
          currency: 'PHP',
          type: SOURCE_TYPE_BY_METHOD[paymentMethod],
          description,
          redirect: {
            success: redirectSuccessUrl,
            failed: redirectFailedUrl,
          },
        },
      },
    }),
  });

  const body = (await response.json()) as {
    data?: { id: string; attributes: { redirect: { checkout_url: string } } };
    errors?: Array<{ detail: string }>;
  };

  if (!response.ok || !body.data) {
    throwWithStatus(
      502,
      body.errors?.[0]?.detail ?? 'Failed to initiate PayMongo payment'
    );
  }

  return {
    sourceId: body.data.id,
    checkoutUrl: body.data.attributes.redirect.checkout_url,
  };
}

/**
 * PayMongo signs webhook payloads as `t=<timestamp>,te=<test_signature>`
 * (test mode) or `t=<timestamp>,li=<live_signature>` (live mode), where the
 * signature is HMAC-SHA256 of `${timestamp}.${rawBody}` using the webhook
 * secret. Verifying against the raw request body (not the parsed JSON) is
 * required for the HMAC to match - see paymongoWebhook.routes.ts, which
 * captures the raw body before Express's json() parser transforms it.
 */
export function verifyPaymongoWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );

  const timestamp = parts.t;
  const providedSignature = parts.li ?? parts.te;
  if (!timestamp || !providedSignature) return false;

  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export interface PaymongoWebhookEvent {
  eventId: string;
  sourceId: string;
  status: 'paid' | 'failed';
}

/** Extracts just what the webhook handler needs from PayMongo's event
 * envelope - id (for idempotency), the source id (to look up which
 * transaction it belongs to), and the resulting status. */
export function parsePaymongoWebhookEvent(
  rawBody: string
): PaymongoWebhookEvent {
  const parsed = JSON.parse(rawBody) as {
    data?: {
      id: string;
      attributes: {
        type: string;
        data: { id: string; attributes: { status: string } };
      };
    };
  };

  const event = parsed.data;
  if (!event) throwWithStatus(400, 'Malformed PayMongo webhook payload');

  const status = event.attributes.data.attributes.status;

  return {
    eventId: event.id,
    sourceId: event.attributes.data.id,
    status: status === 'chargeable' || status === 'paid' ? 'paid' : 'failed',
  };
}
