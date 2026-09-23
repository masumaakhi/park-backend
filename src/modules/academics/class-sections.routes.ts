import { Router } from 'express';
import { getClassSections, createClassSection, updateClassSection, deleteClassSection } from './class-sections.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { classSectionSchema, updateClassSectionSchema } from './class-sections.schema';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getClassSections);
router.post('/', validate(classSectionSchema), createClassSection);
router.patch('/:id', validate(updateClassSectionSchema), updateClassSection);
router.delete('/:id', deleteClassSection);

export default router;
