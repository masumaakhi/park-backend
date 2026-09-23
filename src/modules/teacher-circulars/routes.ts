import { Router } from 'express';
import { TeacherCircularController } from './controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

// Public route to get active circular (no authentication required)
router.get('/active', TeacherCircularController.getActivePublicCircular);
router.get('/list', TeacherCircularController.getActivePublicCirculars);

// Admin routes (require authentication and ADMIN/SUPER_ADMIN role)
router.get('/', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.getCirculars);
router.get('/:id', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.getCircularById);
router.post('/', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.createCircular);
router.patch('/:id', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.updateCircular);
router.post('/:id/close', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.closeCircular);
router.post('/:id/publish', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), TeacherCircularController.publishCircular);

export default router;
