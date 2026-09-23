import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import {
  getTeacherAppointments,
  getTeacherAppointmentById,
  updateTeacherAppointment,
  suspendTeacherAppointment,
  endTeacherAppointment,
} from './teacher-appointments.controller';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getTeacherAppointments);
router.get('/:id', getTeacherAppointmentById);
router.patch('/:id', updateTeacherAppointment);
router.post('/:id/suspend', suspendTeacherAppointment);
router.post('/:id/end', endTeacherAppointment);

export default router;
