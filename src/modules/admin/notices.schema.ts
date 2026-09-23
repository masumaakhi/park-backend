import { z } from 'zod';

export const createNoticeSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    content: z.string().min(1, 'Content is required'),
    summary: z.string().optional(),
    category: z.enum(['GENERAL', 'ACADEMIC', 'EXAM', 'ATTENDANCE', 'ROUTINE', 'EVENT', 'URGENT']).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    targetAudience: z.enum(['EVERYONE', 'STUDENTS', 'TEACHERS', 'PUBLIC']).optional(),
    departmentId: z.string().uuid().optional().nullable(),
    programId: z.string().uuid().optional().nullable(),
    academicSessionId: z.string().uuid().optional().nullable(),
    batchId: z.string().uuid().optional().nullable(),
    publishAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    isPublished: z.boolean().optional(),
    isPublic: z.boolean().optional()
  })
});

export const updateNoticeSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    summary: z.string().optional(),
    category: z.enum(['GENERAL', 'ACADEMIC', 'EXAM', 'ATTENDANCE', 'ROUTINE', 'EVENT', 'URGENT']).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    targetAudience: z.enum(['EVERYONE', 'STUDENTS', 'TEACHERS', 'PUBLIC']).optional(),
    isPublished: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    isArchived: z.boolean().optional()
  })
});
