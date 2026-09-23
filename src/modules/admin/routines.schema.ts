import { z } from 'zod';

const DayOfWeekEnum = z.enum([
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'
]);

export const createRoutineSchema = z.object({
  body: z.object({
    teacherSubjectAssignmentId: z.string().uuid('Invalid assignment ID'),
    academicSessionId: z.string().uuid('Invalid academic session ID'),
    classSectionId: z.string().uuid('Invalid class section ID'),
    roomId: z.string().uuid('Invalid room ID'),
    dayOfWeek: DayOfWeekEnum,
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid start time (HH:mm)'),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid end time (HH:mm)'),
  })
});

export const updateRoutineSchema = z.object({
  body: z.object({
    teacherSubjectAssignmentId: z.string().uuid('Invalid assignment ID').optional(),
    academicSessionId: z.string().uuid('Invalid academic session ID').optional(),
    classSectionId: z.string().uuid('Invalid class section ID').optional(),
    roomId: z.string().uuid('Invalid room ID').optional(),
    dayOfWeek: DayOfWeekEnum.optional(),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid start time (HH:mm)').optional(),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid end time (HH:mm)').optional(),
    isActive: z.boolean().optional()
  })
});
