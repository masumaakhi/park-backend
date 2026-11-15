import { z } from 'zod';

export const subjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    classLevelId: z.string().uuid('Valid Class Level ID is required'),
    fullMarks: z.number().optional(),
    passingMarks: z.number().optional(),
    creditHours: z.number().optional(),
    isActive: z.boolean().optional()
  })
});

export const updateSubjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    code: z.string().min(1, 'Code is required').optional(),
    classLevelId: z.string().uuid().optional(),
    fullMarks: z.number().optional(),
    passingMarks: z.number().optional(),
    creditHours: z.number().optional(),
    isActive: z.boolean().optional()
  })
});

