import { Router } from 'express';
import { getAcademicInformation } from './student.enrollment.controller';

const router = Router();

router.get('/academic-information', getAcademicInformation);

export default router;
