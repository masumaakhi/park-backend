import { Router } from 'express';
import {
  getTeacherExams,
  getTeacherExamById,
  getExamSubjectStudents,
  getExamSubjectMarks,
  saveExamSubjectMarks,
  submitExamSubjectMarks
} from './teacher.marks.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('TEACHER'));

router.get('/exams', getTeacherExams);
router.get('/exams/:examId', getTeacherExamById);
router.get('/exams/:examId/subjects/:examSubjectId/students', getExamSubjectStudents);
router.get('/exams/:examId/subjects/:examSubjectId/marks', getExamSubjectMarks);
router.post('/exams/:examId/subjects/:examSubjectId/marks', saveExamSubjectMarks);
router.post('/exams/:examId/subjects/:examSubjectId/submit', submitExamSubjectMarks);

export default router;
