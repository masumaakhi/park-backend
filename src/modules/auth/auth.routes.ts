import { Router } from 'express';
import { login, logout, getMe, refresh, changePassword } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema } from './auth.schema';
import { requireAuth } from '../../middleware/auth.middleware';
import { authLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);
router.post('/change-password', requireAuth, changePassword);
router.post('/refresh', refresh);

export default router;
