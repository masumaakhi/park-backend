import { z } from 'zod';

export const createCircularSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  positions: z.string().min(2, 'At least one position is required'),
  vacancyCount: z.coerce.number().min(1).optional().nullable(),
  startDate: z.string().optional(),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid deadline date is required',
  }),
  googleFormUrl: z.string().url().optional().or(z.literal('')).nullable(),
  allowOnlineForm: z.boolean().optional().default(true),
});

export const updateCircularSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  positions: z.string().min(2).optional(),
  vacancyCount: z.coerce.number().min(1).optional().nullable(),
  startDate: z.string().optional(),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid deadline date is required',
  }).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
  googleFormUrl: z.string().url().optional().or(z.literal('')).nullable(),
  allowOnlineForm: z.boolean().optional(),
});
