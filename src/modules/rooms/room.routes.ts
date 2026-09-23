import { Router } from 'express';
import { getRooms, createRoom, updateRoom, deleteRoom } from './room.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createRoomSchema, updateRoomSchema } from './room.schema';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getRooms);
router.post('/', validate(createRoomSchema), createRoom);
router.patch('/:id', validate(updateRoomSchema), updateRoom);
router.delete('/:id', deleteRoom);

export default router;

