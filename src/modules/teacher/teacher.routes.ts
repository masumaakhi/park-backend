import { Router } from 'express';
import {
  getDashboardStats,
  getProfile,
  updateProfile,
  getAssignedClasses,
  getAssignedClassById,
  getTeacherStudents,
  getTeacherStudentById,
  getSchedule,
  getTodayLectures,
  getTeacherNotices,
  getTeacherNoticeBySlug
} from './teacher.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('TEACHER'));

// Dashboard & Profile
router.get('/dashboard', getDashboardStats);
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Assigned Classes
router.get('/assigned-classes', getAssignedClasses);
router.get('/assigned-classes/:assignmentId', getAssignedClassById);

// Students
router.get('/students', getTeacherStudents);
router.get('/students/:studentId', getTeacherStudentById);

// Routine & Lectures
router.get('/routine', getSchedule);
router.get('/routine/today', getTodayLectures);
router.get('/schedule', getSchedule);

// Notices
router.get('/notices', getTeacherNotices);
router.get('/notices/:slug', getTeacherNoticeBySlug);

export default router;
