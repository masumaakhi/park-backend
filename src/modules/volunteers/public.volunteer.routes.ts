import { Router } from 'express';
import { submitVolunteerApplication } from './public.volunteer.controller';

const router = Router();

router.post('/applications', submitVolunteerApplication);

export default router;
