import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import appRoutes from './shared/app.routes.ts';
import { corsOptions } from './shared/config/cors/cors.config.ts';
import { errorHandler } from './shared/errors/errorHandler.middleware.ts';
import { startPromoExpiryScheduler } from './features/maintenance/jobs/promoExpiry.job.ts';
import { startAppointmentReminderScheduler } from './features/notifications/services/appointmentReminder.job.ts';

const app = express();

// This server only ever returns JSON API responses, never static assets, so
// there's no benefit to conditional GET here - Express's default weak ETag
// generation just risks a browser-cached 304 with an empty body being
// mistaken for a failed request by *.api.ts's response.json() parsing.
app.set('etag', false);

app.use(cors(corsOptions));
app.use(
  express.json({
    // PayMongo webhook signature verification (paymongo.service.ts's
    // verifyPaymongoWebhookSignature) needs the exact raw request body the
    // HMAC was computed over - the parsed JSON object round-trips through
    // JSON.stringify differently (key order, whitespace) and would fail
    // verification. Every other route ignores req.rawBody.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString();
    },
  })
);
app.use(appRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

// SERVER_PORT is the explicit local/dev knob; PORT is what managed hosts
// (Render, etc.) inject and expect the process to bind. Prefer SERVER_PORT
// when set so local .env stays authoritative, then fall back to the
// platform's PORT, then the dev default.
const PORT = Number(process.env.SERVER_PORT || process.env.PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}.`); // eslint-disable-line no-console
  });

  // Issue #42: application-level fallback for promo expiry - the pg_cron
  // schedule (migration ...032) is the preferred mechanism when the
  // extension is available; this covers projects where it isn't.
  startPromoExpiryScheduler();

  // Issue #99: daily 8:00 AM appointment_reminder CRON - no scheduler
  // infrastructure existed anywhere in the app before this issue.
  startAppointmentReminderScheduler();
}

export default app;
