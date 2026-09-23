import { Router } from 'express';
import { getRoutines, createRoutine, updateRoutine, deleteRoutine } from './routines.controller';
import { validate } from '../../middleware/validate.middleware';
import { createRoutineSchema, updateRoutineSchema } from './routines.schema';

const router = Router();

router.get('/', getRoutines);
router.post('/', validate(createRoutineSchema), createRoutine);
router.patch('/:id', validate(updateRoutineSchema), updateRoutine);
router.delete('/:id', deleteRoutine);

export default router;

