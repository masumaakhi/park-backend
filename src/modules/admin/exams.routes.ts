import { Router } from 'express';
import { 
  getExamTypes, createExamType, updateExamType, deleteExamType,
  getGradeScales, createGradeScale, updateGradeScale, deleteGradeScale,
  getExams, createExam, updateExam, deleteExam, syncExamSubjects 
} from './exams.controller';
import { validate } from '../../middleware/validate.middleware';
import { examTypeSchema, gradeScaleSchema, examSchema, updateExamSchema } from './exams.schema';

const router = Router();

// Exam Types
router.get('/types', getExamTypes);
router.post('/types', validate(examTypeSchema), createExamType);
router.patch('/types/:id', updateExamType); // for toggling isActive
router.delete('/types/:id', deleteExamType);


// Grade Scales
router.get('/grade-scales', getGradeScales);
router.post('/grade-scales', validate(gradeScaleSchema), createGradeScale);
router.patch('/grade-scales/:id', validate(gradeScaleSchema), updateGradeScale);
router.delete('/grade-scales/:id', deleteGradeScale);

// Exams
router.get('/', getExams);
router.post('/', validate(examSchema), createExam);
router.post('/:id/sync-subjects', syncExamSubjects);
router.patch('/:id', validate(updateExamSchema), updateExam);
router.delete('/:id', deleteExam);

export default router;
