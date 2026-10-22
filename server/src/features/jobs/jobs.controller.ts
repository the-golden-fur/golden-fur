import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { runDueJobs } from './jobs.service.ts';

export const JOBS_SECRET_HEADER = 'x-jobs-secret';

function secretMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * POST /jobs/tick - authenticated by a shared secret, not a user session:
 * the caller is Supabase pg_cron (migration ..._custom_jobs_tick_cron.sql),
 * which sends JOBS_TICK_SECRET in the x-jobs-secret header.
 *
 * Answers 202 straight away and runs the jobs after responding - pg_net
 * gives up on a request after a few seconds, and a cold Render start plus a
 * batch of Brevo sends can take longer than that.
 */
export function jobsTickController(req: Request, res: Response) {
  const expected = process.env.JOBS_TICK_SECRET;

  if (!expected) {
    return res
      .status(503)
      .json({ error: 'JOBS_TICK_SECRET is not configured' });
  }

  const provided = req.header(JOBS_SECRET_HEADER);

  if (!provided || !secretMatches(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(202).json({ status: 'accepted' });

  void runDueJobs().catch((error) => {
    console.error('Job tick failed:', error); // eslint-disable-line no-console
  });
}
