import { z } from 'zod';

export const classLevelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    sortOrder: z.number().int().positive('Sort order must be a positive integer'),
    isActive: z.boolean().optional()
  })
});

export const updateClassLevelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    code: z.string().min(1, 'Code is required').optional(),
    sortOrder: z.number().int().positive('Sort order must be a positive integer').optional(),
    isActive: z.boolean().optional()
  })
});
