import { Router } from 'express';
import { getNotices, createNotice, updateNotice } from './notices.controller';
import { validate } from '../../middleware/validate.middleware';
import { createNoticeSchema, updateNoticeSchema } from './notices.schema';

const router = Router();

router.get('/', getNotices);
router.post('/', validate(createNoticeSchema), createNotice);
router.patch('/:id', validate(updateNoticeSchema), updateNotice);

export default router;
