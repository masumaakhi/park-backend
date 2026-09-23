import { Router } from 'express';
import {
  getEligibleClasses,
  createAttendanceSession,
  getAttendanceSessions,
  getAttendanceSessionById,
  updateAttendanceSession,
  submitAttendanceSession
} from './teacher.attendance.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('TEACHER'));

router.get('/eligible-classes', getEligibleClasses);
router.get('/sessions', getAttendanceSessions);
router.post('/sessions', createAttendanceSession);
router.get('/sessions/:sessionId', getAttendanceSessionById);
router.patch('/sessions/:sessionId', updateAttendanceSession);
router.post('/sessions/:sessionId/submit', submitAttendanceSession);

export default router;
