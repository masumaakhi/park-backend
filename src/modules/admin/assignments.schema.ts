import { z } from 'zod';

export const createAssignmentSchema = z.object({
  body: z.object({
    teacherId: z.string().uuid('Invalid teacher ID'),
    academicSessionId: z.string().uuid('Invalid academic session ID'),
    classSectionId: z.string().uuid('Invalid class section ID'),
    subjectId: z.string().uuid('Invalid subject ID'),
    departmentId: z.string().uuid('Invalid department ID').optional().nullable(),
    programId: z.string().uuid('Invalid program ID').optional().nullable(),
    semesterId: z.string().uuid('Invalid semester ID').optional().nullable(),
    batchId: z.string().uuid('Invalid batch ID').optional().nullable(),
  })
});

export const updateAssignmentSchema = z.object({
  body: z.object({
    isActive: z.boolean()
  })
});
