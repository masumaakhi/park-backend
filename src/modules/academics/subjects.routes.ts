import { Router } from 'express';
import { getSubjects, createSubject, updateSubject, deleteSubject } from './subjects.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { subjectSchema, updateSubjectSchema } from './subjects.schema';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getSubjects);
router.post('/', validate(subjectSchema), createSubject);
router.patch('/:id', validate(updateSubjectSchema), updateSubject);
router.delete('/:id', deleteSubject);

export default router;

