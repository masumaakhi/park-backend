import { Router } from 'express';
import { getRoutines, createRoutine, updateRoutine, deleteRoutine } from './routine.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getRoutines);
router.post('/', createRoutine);
router.patch('/:id', updateRoutine);
router.delete('/:id', deleteRoutine);

export default router;

