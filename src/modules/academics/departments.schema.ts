import { z } from 'zod';

export const departmentSchema = z.object({
  body: z.object({
    name: z.string().min(2, { message: 'Department name is too short' }),
  })
});

export const updateDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2, { message: 'Department name is too short' }).optional(),
    isActive: z.boolean().optional()
  })
});
