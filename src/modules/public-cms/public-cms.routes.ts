import { Router } from 'express';
import { getOrganizationProfile, getFeaturedProject } from './public-cms.controller';

const router = Router();

router.get('/organization', getOrganizationProfile);
router.get('/projects/featured', getFeaturedProject);

export default router;
