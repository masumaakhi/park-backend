import { z } from 'zod';

export const batchSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    programId: z.string().uuid('Invalid program ID'),
  })
});

export const updateBatchSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    programId: z.string().uuid('Invalid program ID').optional(),
    isActive: z.boolean().optional()
  })
});
