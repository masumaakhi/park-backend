import { Router } from 'express';
import {
  getStudentDashboard,
  getStudentProfile,
  updateStudentProfile,
  getStudentAcademicInformation,
  getStudentAcademicHistory,
  getStudentRoutine,
  getStudentTodayRoutine,
  getStudentAttendance,
  getStudentResults,
  getStudentResultById,
  getStudentMarksheets,
  getStudentComprehensiveMarksheet,
  getStudentMarksheetByExamId,
  getStudentAssignments,
  getStudentAssignmentById,
  submitStudentAssignment,
  getStudentNotices,
  getStudentNoticeBySlug,
  getStudentDigitalId,
  downloadMyDigitalIdPdf,
  getStudentTeachers,
  getStudentTeacherById
} from './student.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

// Enforce STUDENT authentication & role check for all routes
router.use(requireAuth, requireRole('STUDENT'));

// 1. Dashboard
router.get('/dashboard', getStudentDashboard);

// 2. Profile
router.get('/profile', getStudentProfile);
router.patch('/profile', updateStudentProfile);

// 3. Academic Info & History
router.get('/academic-information', getStudentAcademicInformation);
router.get('/academic-history', getStudentAcademicHistory);

// 4. Routine
router.get('/routine', getStudentRoutine);
router.get('/routine/today', getStudentTodayRoutine);

// 5. Attendance
router.get('/attendance', getStudentAttendance);
router.get('/attendance/history', getStudentAttendance);

// 6. Results
router.get('/results', getStudentResults);
router.get('/results/:examId', getStudentResultById);

// 7. Marksheets
router.get('/marksheets', getStudentMarksheets);
router.get('/marksheets/comprehensive', getStudentComprehensiveMarksheet);
router.get('/marksheets/:examId', getStudentMarksheetByExamId);
router.get('/marksheets/:examId/download', getStudentMarksheetByExamId);

// 8. Assignments / Classwork
router.get('/assignments', getStudentAssignments);
router.get('/assignments/:id', getStudentAssignmentById);
router.get('/assignments/:id/submission', getStudentAssignmentById);
router.post('/assignments/:id/submission', submitStudentAssignment);
router.patch('/assignments/:id/submission', submitStudentAssignment);
router.post('/assignments/:id/submit', submitStudentAssignment);

// 9. Notices
router.get('/notices', getStudentNotices);
router.get('/notices/:slug', getStudentNoticeBySlug);

// 10. Digital ID
router.get('/digital-id', getStudentDigitalId);
router.get('/digital-id/download', downloadMyDigitalIdPdf);

// 11. Teachers
router.get('/teachers', getStudentTeachers);
router.get('/teachers/:teacherId', getStudentTeacherById);

export default router;
