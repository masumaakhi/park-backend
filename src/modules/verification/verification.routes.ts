import { Router } from 'express';
import { verifyMarksheet, verifyStudentDigitalId } from './verification.controller';

const router = Router();

// Public routes, no auth middleware
router.get('/marksheet/:token', verifyMarksheet);
router.get('/student-id/:token', verifyStudentDigitalId);

export default router;
