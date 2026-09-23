import { Router } from 'express';
import { getStudents, createStudent, updateStudent } from './students.controller';
import { validate } from '../../middleware/validate.middleware';
import { createStudentSchema, updateStudentSchema } from './students.schema';

const router = Router();

router.get('/', getStudents);
router.post('/', validate(createStudentSchema), createStudent);
router.patch('/:id', validate(updateStudentSchema), updateStudent);

export default router;
