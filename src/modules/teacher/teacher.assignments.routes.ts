import { Router } from 'express';
import {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  publishAssignment,
  closeAssignment,
  getAssignmentSubmissions,
  gradeSubmission
} from './teacher.assignments.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('TEACHER'));

router.get('/', getAssignments);
router.post('/', createAssignment);
router.get('/:id', getAssignmentById);
router.patch('/:id', updateAssignment);
router.delete('/:id', deleteAssignment);
router.post('/:id/publish', publishAssignment);
router.post('/:id/close', closeAssignment);
router.get('/:id/submissions', getAssignmentSubmissions);
router.post('/:id/submissions/:submissionId/grade', gradeSubmission);

export default router;
