import { Router } from 'express';
import {
  getPromotionCandidates,
  executePromotion,
  getPromotionHistory,
} from './promotions.controller';

const router = Router();

// 1. Get eligible promotion candidates for selected class and session
router.get('/candidates', getPromotionCandidates);

// 2. Execute promotion (bulk / individual)
router.post('/execute', executePromotion);

// 3. Get promotion audit history
router.get('/history', getPromotionHistory);

export default router;

