import { Router } from 'express';
import { jobsTickController } from './jobs.controller.ts';

/**
 * Scheduler entry point. Not behind jwtMiddleware - the caller is Supabase
 * pg_cron, not a signed-in user; jobsTickController checks the shared
 * JOBS_TICK_SECRET instead.
 */
const router = Router();

router.post('/jobs/tick', jobsTickController);

export default router;
