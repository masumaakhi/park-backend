import { Router } from 'express';
import { getPublicCampaigns, initiateDonation } from './public.donation.controller';

const router = Router();

router.get('/campaigns', getPublicCampaigns);
router.post('/initiate', initiateDonation);

export default router;
