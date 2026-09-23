import { Router } from 'express';
import { getSessions, createSession, updateSession, deleteSession } from './sessions.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { sessionSchema, updateSessionSchema } from './sessions.schema';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getSessions);
router.post('/', validate(sessionSchema), createSession);
router.patch('/:id', validate(updateSessionSchema), updateSession);
router.delete('/:id', deleteSession);

export default router;
