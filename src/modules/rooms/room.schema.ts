import { z } from 'zod';

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Room name is required'),
    building: z.string().optional(),
    floor: z.string().optional(),
    capacity: z.number().int().positive().optional(),
  })
});

export const updateRoomSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Room name is required').optional(),
    building: z.string().optional(),
    floor: z.string().optional(),
    capacity: z.number().int().positive().optional(),
    isActive: z.boolean().optional()
  })
});
