import { z } from 'zod';

export const examTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    description: z.string().optional()
  })
});

export const gradeScaleSchema = z.object({
  body: z.object({
    grade: z.string().min(1, 'Grade is required'),
    minPercentage: z.number().min(0).max(100),
    maxPercentage: z.number().min(0).max(100),
    gradePoint: z.number().min(0),
    remarks: z.string().optional()
  })
});

const ExamStatusEnum = z.enum(['DRAFT', 'OPEN', 'CLOSED', 'PUBLISHED']);

export const examSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    examTypeId: z.string().uuid(),
    academicSessionId: z.string().uuid(),
    programId: z.string().uuid(),
    semesterId: z.string().uuid(),
    batchId: z.string().uuid(),
    classSectionId: z.string().uuid(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    totalMarks: z.number().min(1),
    passingMarks: z.number().min(1),
  })
});

export const updateExamSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    status: ExamStatusEnum.optional(),
    isPublished: z.boolean().optional()
  })
});
