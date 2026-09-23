import { z } from 'zod';

export const programSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    departmentId: z.string().uuid('Invalid department ID'),
  })
});

export const updateProgramSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    departmentId: z.string().uuid('Invalid department ID').optional(),
    isActive: z.boolean().optional()
  })
});
