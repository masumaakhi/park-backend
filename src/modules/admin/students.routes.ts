import { Router } from 'express';
import { getStudents, createStudent, updateStudent, deleteStudent } from './students.controller';
import { validate } from '../../middleware/validate.middleware';
import { createStudentSchema, updateStudentSchema } from './students.schema';

const router = Router();

router.get('/', getStudents);
router.post('/', validate(createStudentSchema), createStudent);
router.patch('/:id', validate(updateStudentSchema), updateStudent);
router.delete('/:id', deleteStudent);

export default router;
