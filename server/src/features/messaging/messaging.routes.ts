import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import { ANNOUNCEMENT_SENDER_ROLES } from '../staff/staff.types.ts';
import {
  createAnnouncementController,
  createDraftController,
  createMailThreadController,
  deleteDraftController,
  deleteThreadController,
  getDraftController,
  getThreadDetailController,
  handleAttachmentUploadError,
  listDraftsController,
  listMessagingDirectoryController,
  listThreadsController,
  markThreadReadController,
  replyToThreadController,
  sendDraftController,
  starThreadController,
  updateDraftController,
  uploadMessageAttachmentController,
} from './messaging.controller.ts';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * Announcement threads are gated Supervisor/Admin/Superadmin
 * (ANNOUNCEMENT_SENDER_ROLES). Mail threads and every other route below are
 * shared customer-or-staff routes (jwtMiddleware only), same pattern as
 * notifications.routes.ts - membership/ownership is resolved in the
 * controller. Static segments (/messages/directory, /messages/drafts) are
 * registered as their own top-level paths, not under /messages/threads/:id,
 * so there's no Express :id-vs-literal-segment ordering hazard to worry
 * about.
 */
const router = Router();

router.post(
  '/messages/announcements',
  jwtMiddleware,
  requireRole([...ANNOUNCEMENT_SENDER_ROLES]),
  requireBranch,
  createAnnouncementController
);
router.post('/messages/mail', jwtMiddleware, createMailThreadController);
router.get(
  '/messages/directory',
  jwtMiddleware,
  listMessagingDirectoryController
);
router.post(
  '/messages/attachments',
  jwtMiddleware,
  attachmentUpload.single('file'),
  handleAttachmentUploadError,
  uploadMessageAttachmentController
);

router.get('/messages/threads', jwtMiddleware, listThreadsController);
router.get('/messages/threads/:id', jwtMiddleware, getThreadDetailController);
router.post(
  '/messages/threads/:id/messages',
  jwtMiddleware,
  replyToThreadController
);
router.patch(
  '/messages/threads/:id/read',
  jwtMiddleware,
  markThreadReadController
);
router.patch('/messages/threads/:id/star', jwtMiddleware, starThreadController);
router.post(
  '/messages/threads/:id/delete',
  jwtMiddleware,
  deleteThreadController
);

router.get('/messages/drafts', jwtMiddleware, listDraftsController);
router.post('/messages/drafts', jwtMiddleware, createDraftController);
router.get('/messages/drafts/:id', jwtMiddleware, getDraftController);
router.patch('/messages/drafts/:id', jwtMiddleware, updateDraftController);
router.delete('/messages/drafts/:id', jwtMiddleware, deleteDraftController);
router.post('/messages/drafts/:id/send', jwtMiddleware, sendDraftController);

export default router;
