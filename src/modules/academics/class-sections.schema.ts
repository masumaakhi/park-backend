import { z } from 'zod';

export const classSectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    academicSessionId: z.string().min(1, 'Academic session ID is required'),
    classLevelId: z.string().min(1, 'Class level ID is required'),
    roomNumber: z.string().max(50).optional().nullable(),
    capacity: z.union([z.number().int().positive(), z.string().transform((v) => parseInt(v, 10))]).optional().nullable(),
    code: z.string().max(50).optional().nullable(),
    isActive: z.boolean().optional(),
    batchId: z.string().optional().nullable(),
  })
});

export const updateClassSectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100).optional(),
    academicSessionId: z.string().min(1, 'Academic session ID is required').optional(),
    classLevelId: z.string().min(1, 'Class level ID is required').optional(),
    roomNumber: z.string().max(50).optional().nullable(),
    capacity: z.union([z.number().int().positive(), z.string().transform((v) => parseInt(v, 10))]).optional().nullable(),
    code: z.string().max(50).optional().nullable(),
    isActive: z.boolean().optional(),
    batchId: z.string().optional().nullable(),
  })
});
