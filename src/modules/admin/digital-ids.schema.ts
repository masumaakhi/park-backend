import { z } from 'zod';

export const generateDigitalIdSchema = z.object({
  body: z.object({
    studentId: z.string().uuid('Invalid student ID'),
    expiryDate: z.string().datetime('Invalid expiry date'),
  })
});

export const revokeDigitalIdSchema = z.object({
  body: z.object({
    revokedReason: z.string().min(1, 'Reason is required')
  })
});
