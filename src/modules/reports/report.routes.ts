import { Router } from 'express';
import { getOverviewReport } from './report.controller';

const router = Router();

router.get('/overview', getOverviewReport);

export default router;
