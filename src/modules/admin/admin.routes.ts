import { Router } from 'express';
import { getDashboardStats } from './admin.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

import studentRoutes from './students.routes';
import teacherRoutes from './teachers.routes';
import assignmentRoutes from './assignments.routes';
import routineRoutes from './routines.routes';
import attendanceRoutes from './attendance.routes';
import examRoutes from './exams.routes';
import digitalIdRoutes from './digital-ids.routes';
import noticeRoutes from './notices.routes';
import auditLogRoutes from './audit-logs.routes';
import settingsRoutes from './settings.routes';
import marksheetRoutes from './marksheets.routes';
import resultsRoutes from './results.routes';
import { adminAdmissionRouter } from '../admissions/admission.routes';
import { adminTeacherRecruitmentRouter } from '../teacher-recruitment/teacher-recruitment.routes';
import teacherAppointmentRoutes from '../teacher-appointments/teacher-appointments.routes';
import teacherCircularRoutes from '../teacher-circulars/routes';

const router = Router();

// Mount admissions (has internal requireAuth + signed-token support for secure document preview/download)
router.use('/admissions', adminAdmissionRouter);

// Mount teacher applications recruitment router (supports signed tokens for secure preview/download)
router.use('/teacher-applications', adminTeacherRecruitmentRouter);

// Apply auth and admin role requirements to all other admin routes
router.use(requireAuth, requireRole('ADMIN'));

router.use('/teacher-circulars', teacherCircularRoutes);
router.use('/teacher-appointments', teacherAppointmentRoutes);

router.get('/dashboard', getDashboardStats);
router.use('/students', studentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/routines', routineRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/exams', examRoutes);
router.use('/digital-ids', digitalIdRoutes);
router.use('/notices', noticeRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/settings', settingsRoutes);
router.use('/marksheets', marksheetRoutes);
router.use('/results', resultsRoutes);

export default router;
