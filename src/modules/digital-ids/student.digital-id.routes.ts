import { Router } from 'express';
import { getStudentDigitalId } from './student.digital-id.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('STUDENT'));

router.get('/', getStudentDigitalId);

export default router;
