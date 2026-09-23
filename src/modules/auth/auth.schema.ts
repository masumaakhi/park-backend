import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().optional(),
    identifier: z.string().optional(),
    password: z.string().min(1, { message: 'Password is required' }),
    portalRole: z.string().optional()
  }).refine(data => Boolean(data.email || data.identifier), {
    message: 'Either email or identifier is required',
    path: ['identifier']
  }),
});
