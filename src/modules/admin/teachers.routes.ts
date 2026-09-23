import { Router } from 'express';
import { getTeachers, createTeacher, updateTeacher } from './teachers.controller';
import { validate } from '../../middleware/validate.middleware';
import { createTeacherSchema, updateTeacherSchema } from './teachers.schema';

const router = Router();

router.get('/', getTeachers);
router.post('/', validate(createTeacherSchema), createTeacher);
router.patch('/:id', validate(updateTeacherSchema), updateTeacher);

export default router;
