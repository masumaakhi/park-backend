import { Router } from 'express';
import {
  getMarksheets,
  generateMarksheets,
  toggleMarksheetStatus,
  deleteMarksheet,
  getComprehensiveMarksheetHandler,
  updateCoCurricularMarksheetHandler
} from './marksheets.controller';

const router = Router();

router.get('/', getMarksheets);
router.post('/generate', generateMarksheets);
router.get('/comprehensive/:studentId', getComprehensiveMarksheetHandler);
router.post('/co-curricular', updateCoCurricularMarksheetHandler);
router.patch('/:id/toggle', toggleMarksheetStatus);
router.delete('/:id', deleteMarksheet);

export default router;
