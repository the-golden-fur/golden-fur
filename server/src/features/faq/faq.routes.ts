import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createFaqController,
  deleteFaqController,
  listAllFaqsController,
  listPublicFaqsController,
  updateFaqController,
} from './faq.controller.ts';
import { FAQ_WRITE_ROLES } from './faq.types.ts';

/**
 * The help mascot's FAQs. Two audiences, so two existing path prefixes
 * (both already forwarded by client/vite.proxy.config.ts):
 *
 * - `/public/faqs` - what the mascot shows. No auth at all, same as
 *   public.routes.ts: the mascot is on the marketing pages too.
 * - `/maintenance/faqs` - the Superadmin settings screen that edits them.
 */
const router = Router();

const superadminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...FAQ_WRITE_ROLES]),
];

router.get('/public/faqs', listPublicFaqsController);

router.get('/maintenance/faqs', superadminOnly, listAllFaqsController);
router.post('/maintenance/faqs', superadminOnly, createFaqController);
router.patch('/maintenance/faqs/:id', superadminOnly, updateFaqController);
router.delete('/maintenance/faqs/:id', superadminOnly, deleteFaqController);

export default router;
