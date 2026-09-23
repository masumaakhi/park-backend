import { z } from 'zod';

export const createTeacherSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    employeeId: z.string().min(1, 'Employee ID is required'),
    phone: z.string().optional(),
    designation: z.string().optional(),
    departmentId: z.string().uuid('Invalid department ID').optional(),
  })
});

export const updateTeacherSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().optional(),
    designation: z.string().optional(),
    departmentId: z.string().uuid('Invalid department ID').optional(),
    isActive: z.boolean().optional()
  })
});
