import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import {
  submitPublicAdmission,
  getAdminAdmissions,
  createOfficeAdmission,
  getAdminAdmissionById,
  updateAdminAdmission,
  markAdmissionUnderReview,
  rejectAdminAdmission,
  cancelAdminAdmission,
  getAdmissionDocuments,
  uploadAdmissionDocument,
  viewAdmissionDocument,
  downloadAdmissionDocument,
  reviewAdmissionDocument,
  approveAdmission,
} from './admission.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file ceiling
});

const publicAdmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // limit each IP to 10 submissions per hour
  message: {
    success: false,
    message: 'Too many admission applications submitted from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Public Router ---
export const publicAdmissionRouter = Router();

publicAdmissionRouter.post(
  '/',
  publicAdmissionLimiter,
  upload.fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'guardianNid', maxCount: 1 },
    { name: 'previousSchoolReport', maxCount: 1 },
  ]),
  submitPublicAdmission
);

import { StorageService } from '../uploads/storage.service';

// --- Admin Router ---
export const adminAdmissionRouter = Router();

const verifyAdminOrSignedDocToken = async (req: Request, res: Response, next: NextFunction) => {
  const queryToken = (req.query.token as string) || (req.headers['x-signed-token'] as string);
  const documentId = req.params.documentId as string;

  if (queryToken && documentId) {
    const isValid = StorageService.verifySignedToken(queryToken, documentId);
    if (isValid) {
      return next();
    }
  }

  // Fallback to Admin session auth
  return requireAuth(req, res, () => {
    return requireRole('ADMIN')(req, res, next);
  });
};

// Document View and Download (permits authenticated Admin or valid signed token)
adminAdmissionRouter.get('/:id/documents/:documentId/view', verifyAdminOrSignedDocToken, viewAdmissionDocument);
adminAdmissionRouter.get('/:id/documents/:documentId/download', verifyAdminOrSignedDocToken, downloadAdmissionDocument);

// Protect all other admin admission routes
adminAdmissionRouter.use(requireAuth, requireRole('ADMIN'));

adminAdmissionRouter.get('/', getAdminAdmissions);
adminAdmissionRouter.post(
  '/',
  upload.fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'guardianNid', maxCount: 1 },
    { name: 'previousSchoolReport', maxCount: 1 },
    { name: 'transferCertificate', maxCount: 1 },
  ]),
  createOfficeAdmission
);

adminAdmissionRouter.get('/:id', getAdminAdmissionById);
adminAdmissionRouter.patch('/:id', updateAdminAdmission);

adminAdmissionRouter.get('/:id/documents', getAdmissionDocuments);
adminAdmissionRouter.post(
  '/:id/documents',
  upload.single('file'),
  uploadAdmissionDocument
);
adminAdmissionRouter.patch(
  '/:id/documents/:documentId/review',
  reviewAdmissionDocument
);

adminAdmissionRouter.post('/:id/under-review', markAdmissionUnderReview);
adminAdmissionRouter.post('/:id/approve', approveAdmission);
adminAdmissionRouter.post('/:id/reject', rejectAdminAdmission);
adminAdmissionRouter.post('/:id/cancel', cancelAdminAdmission);
