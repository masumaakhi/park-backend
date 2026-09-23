import { z } from 'zod';

export const createStudentSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    studentId: z.string().min(1, 'Student ID is required'),
    phone: z.string().optional(),
    departmentId: z.string().uuid('Invalid department ID').optional(),
    programId: z.string().uuid('Invalid program ID').optional(),
    batchId: z.string().uuid('Invalid batch ID').optional(),
    semesterId: z.string().uuid('Invalid semester ID').optional(),
    classSectionId: z.string().uuid('Invalid class section ID').optional(),
    academicSessionId: z.string().uuid('Invalid academic session ID').optional(),
  })
});

export const updateStudentSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().optional(),
    departmentId: z.string().uuid('Invalid department ID').optional(),
    programId: z.string().uuid('Invalid program ID').optional(),
    batchId: z.string().uuid('Invalid batch ID').optional(),
    semesterId: z.string().uuid('Invalid semester ID').optional(),
    classSectionId: z.string().uuid('Invalid class section ID').optional(),
    academicSessionId: z.string().uuid('Invalid academic session ID').optional(),
    isActive: z.boolean().optional()
  })
});
