import { Router } from 'express';
import { getAssignments, createAssignment, updateAssignment, deleteAssignment } from './assignments.controller';
import { validate } from '../../middleware/validate.middleware';
import { createAssignmentSchema, updateAssignmentSchema } from './assignments.schema';

const router = Router();

router.get('/', getAssignments);
router.post('/', validate(createAssignmentSchema), createAssignment);
router.patch('/:id', validate(updateAssignmentSchema), updateAssignment);
router.delete('/:id', deleteAssignment);

export default router;

