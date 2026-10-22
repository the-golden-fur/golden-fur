import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jobsRoutes from './jobs.routes.ts';
import { runDueJobs } from './jobs.service.ts';

vi.mock('./jobs.service.ts', () => ({
  runDueJobs: vi.fn(),
}));

const SECRET = 'test-tick-secret';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

describe('POST /jobs/tick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runDueJobs).mockResolvedValue({});
    vi.stubEnv('JOBS_TICK_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the tick and runs the due jobs when the secret matches', async () => {
    const response = await request(buildApp())
      .post('/jobs/tick')
      .set('x-jobs-secret', SECRET);

    expect(response.status).toBe(202);
    expect(runDueJobs).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong secret without running anything', async () => {
    const response = await request(buildApp())
      .post('/jobs/tick')
      .set('x-jobs-secret', 'wrong');

    expect(response.status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();
  });

  it('rejects a missing secret header', async () => {
    const response = await request(buildApp()).post('/jobs/tick');

    expect(response.status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();
  });

  it('refuses every tick when the server has no secret configured', async () => {
    vi.stubEnv('JOBS_TICK_SECRET', '');

    const response = await request(buildApp())
      .post('/jobs/tick')
      .set('x-jobs-secret', '');

    expect(response.status).toBe(503);
    expect(runDueJobs).not.toHaveBeenCalled();
  });
});
