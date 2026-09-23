import { Router } from 'express';
import { getResults } from './results.controller';

const router = Router();

router.get('/', getResults);

export default router;
