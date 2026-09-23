import { z } from 'zod';

export const classSectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    batchId: z.string().uuid('Invalid batch ID'),
  })
});

export const updateClassSectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    batchId: z.string().uuid('Invalid batch ID').optional(),
    isActive: z.boolean().optional()
  })
});
