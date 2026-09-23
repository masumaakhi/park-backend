import { Router } from 'express';
import { forgotPassword } from './password.controller';

const router = Router();

router.post('/forgot-password', forgotPassword);

export default router;
