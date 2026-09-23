import { Router } from 'express';
import {
  getDigitalIds,
  getDigitalIdById,
  generateDigitalId,
  regenerateDigitalId,
  deactivateDigitalId,
  reactivateDigitalId,
  revokeDigitalId,
  downloadDigitalIdPdf,
} from './digital-ids.controller';

const router = Router();

router.get('/', getDigitalIds);
router.get('/:id', getDigitalIdById);
router.post('/generate', generateDigitalId);
router.post('/', generateDigitalId);
router.post('/:id/regenerate', regenerateDigitalId);
router.post('/:id/deactivate', deactivateDigitalId);
router.post('/:id/reactivate', reactivateDigitalId);
router.post('/:id/revoke', revokeDigitalId);
router.get('/:id/download', downloadDigitalIdPdf);

export default router;
