import { Router } from 'express';
import { getClassLevels, createClassLevel, updateClassLevel, deleteClassLevel } from './class-levels.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { classLevelSchema, updateClassLevelSchema } from './class-levels.schema';

const router = Router();

// Allow reading class levels for public admission forms and portals
router.get('/', getClassLevels);

// Require admin auth for managing class levels
router.use(requireAuth, requireRole('ADMIN'));

router.post('/', validate(classLevelSchema), createClassLevel);
router.patch('/:id', validate(updateClassLevelSchema), updateClassLevel);
router.delete('/:id', deleteClassLevel);

export default router;
