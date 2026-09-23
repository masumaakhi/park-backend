import { z } from 'zod';

export const semesterSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
  })
});

export const updateSemesterSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    isActive: z.boolean().optional()
  })
});
