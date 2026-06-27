import 'dotenv/config';
import express from 'express';
import appRoutes from './shared/app.routes.ts';

const app = express();

app.use(express.json());
app.use(appRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = Number(process.env.SERVER_PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}.`); // eslint-disable-line no-console
  });
}

export default app;
