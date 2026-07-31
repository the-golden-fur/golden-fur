import { Router, type Request, type Response } from 'express';
import {
  parsePaymongoWebhookEvent,
  verifyPaymongoWebhookSignature,
} from '../services/paymongo.service.ts';
import { confirmPaymongoWebhookEvent } from '../services/webhookConfirmation.service.ts';

const router = Router();

/**
 * Issue #83: PayMongo calls this directly (no staff session, no JWT) -
 * authenticated only by the paymongo-signature HMAC, verified against the
 * raw body app.ts's express.json({ verify }) captured onto req.rawBody.
 * Always responds 200 once the signature is valid and the event is parsed,
 * even for a 'failed' event or an already-confirmed transaction (a
 * meaningful non-2xx here would make PayMongo keep retrying redelivery
 * indefinitely for an event this service has already handled).
 */
router.post(
  '/billing/paymongo/webhook',
  async (req: Request & { rawBody?: string }, res: Response) => {
    const rawBody = req.rawBody;
    const signatureHeader = req.header('paymongo-signature');

    if (!rawBody || !verifyPaymongoWebhookSignature(rawBody, signatureHeader)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    try {
      const event = parsePaymongoWebhookEvent(rawBody);
      const result = await confirmPaymongoWebhookEvent(event);
      return res.status(200).json({ received: true, handled: result.handled });
    } catch (error) {
      const statusCode =
        (error as Error & { statusCode?: number }).statusCode ?? 500;
      return res.status(statusCode).json({
        error: (error as Error).message ?? 'Webhook processing failed',
      });
    }
  }
);

export default router;
