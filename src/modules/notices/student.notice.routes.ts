import { Router } from 'express';
import { getStudentNotices, getStudentNoticeDetail } from './student.notice.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('STUDENT'));

router.get('/', getStudentNotices);
router.get('/:slug', getStudentNoticeDetail);

export default router;
