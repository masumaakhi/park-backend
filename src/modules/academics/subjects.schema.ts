import { z } from 'zod';

export const subjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    creditHours: z.number().optional(),
  })
});

export const updateSubjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    code: z.string().min(1, 'Code is required').optional(),
    creditHours: z.number().optional(),
    isActive: z.boolean().optional()
  })
});
