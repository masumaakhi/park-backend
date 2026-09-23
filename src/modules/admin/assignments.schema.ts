import { z } from 'zod';

export const createAssignmentSchema = z.object({
  body: z.object({
    teacherId: z.string().uuid('Invalid teacher ID'),
    departmentId: z.string().uuid('Invalid department ID'),
    programId: z.string().uuid('Invalid program ID'),
    academicSessionId: z.string().uuid('Invalid academic session ID'),
    semesterId: z.string().uuid('Invalid semester ID'),
    batchId: z.string().uuid('Invalid batch ID'),
    classSectionId: z.string().uuid('Invalid class section ID'),
    subjectId: z.string().uuid('Invalid subject ID'),
  })
});

export const updateAssignmentSchema = z.object({
  body: z.object({
    isActive: z.boolean()
  })
});
