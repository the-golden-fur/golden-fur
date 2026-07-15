import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import appRoutes from './shared/app.routes.ts';
import { corsOptions } from './shared/config/cors/cors.config.ts';
import { errorHandler } from './shared/errors/errorHandler.middleware.ts';
import { startPromoExpiryScheduler } from './features/maintenance/jobs/promoExpiry.job.ts';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(appRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

const PORT = Number(process.env.SERVER_PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}.`); // eslint-disable-line no-console
  });

  // Issue #42: application-level fallback for promo expiry - the pg_cron
  // schedule (migration ...032) is the preferred mechanism when the
  // extension is available; this covers projects where it isn't.
  startPromoExpiryScheduler();
}

export default app;
