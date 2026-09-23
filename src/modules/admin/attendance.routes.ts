import { Router } from 'express';
import { getAttendanceSessions, getAttendanceSessionRecords } from './attendance.controller';

const router = Router();

router.get('/', getAttendanceSessions);
router.get('/:id/records', getAttendanceSessionRecords);

export default router;
