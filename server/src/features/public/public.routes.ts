import { Router } from 'express';
import { packagesPromosController } from './public.controller.ts';

/**
 * Genuinely public routes - no jwtMiddleware, no requireRole. Reserved for
 * read-only content the marketing site (client/src/pages/*) needs before a
 * visitor has signed up or logged in at all.
 */
const router = Router();

router.get('/public/packages-promos', packagesPromosController);

export default router;
