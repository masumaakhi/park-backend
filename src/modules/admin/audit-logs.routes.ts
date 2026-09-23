import { Router } from 'express';
import { getAuditLogs } from './audit-logs.controller';

const router = Router();

router.get('/', getAuditLogs);

export default router;
