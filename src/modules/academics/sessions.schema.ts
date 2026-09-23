import { z } from 'zod';

export const sessionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    startDate: z.string().datetime('Start date is invalid'),
    endDate: z.string().datetime('End date is invalid'),
  })
});

export const updateSessionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    startDate: z.string().datetime('Start date is invalid').optional(),
    endDate: z.string().datetime('End date is invalid').optional(),
    isActive: z.boolean().optional()
  })
});
