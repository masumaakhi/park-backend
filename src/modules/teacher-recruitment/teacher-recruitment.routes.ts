import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { TeacherStorageService } from '../uploads/teacher-storage.service';
import {
  submitPublicTeacherApplication,
  getAdminTeacherApplications,
  createOfficeTeacherApplication,
  getAdminTeacherApplicationById,
  updateAdminTeacherApplication,
  markTeacherApplicationUnderReview,
  shortlistTeacherCandidate,
  selectTeacherCandidate,
  rejectTeacherCandidate,
  cancelTeacherApplication,
  getTeacherInterviews,
  scheduleTeacherInterview,
  updateTeacherInterview,
  getTeacherAppointmentDocuments,
  uploadTeacherAppointmentDocument,
  reviewTeacherAppointmentDocument,
  viewCv,
  downloadCv,
  viewTeacherDocument,
  downloadTeacherDocument,
  approveTeacherAppointment,
} from './teacher-recruitment.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB ceiling
});

// Rate limiting for public teacher applications
const publicTeacherLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 submissions per hour per IP
  message: {
    success: false,
    message: 'Too many applications submitted from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Public Router ---
export const publicTeacherRecruitmentRouter = Router();

publicTeacherRecruitmentRouter.post(
  '/',
  publicTeacherLimiter,
  upload.single('cv'),
  submitPublicTeacherApplication
);

// --- Admin Router ---
export const adminTeacherRecruitmentRouter = Router();

/**
 * Token verifier middleware for direct file links (preview & download)
 */
const verifyAdminOrSignedToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const queryToken = (req.query.token as string) || (req.headers['x-signed-token'] as string);
  const targetId = (req.params.documentId || req.params.id) as string;

  if (queryToken && targetId) {
    const isValid = TeacherStorageService.verifySignedToken(queryToken, targetId);
    if (isValid) {
      return next();
    }
  }

  // Fallback to Admin session auth
  return requireAuth(req, res, () => {
    return requireRole('ADMIN')(req, res, next);
  });
};

// CV viewing and downloading (allows signed token or Admin session)
adminTeacherRecruitmentRouter.get('/:id/cv/view', verifyAdminOrSignedToken, viewCv);
adminTeacherRecruitmentRouter.get('/:id/cv/download', verifyAdminOrSignedToken, downloadCv);

// Sensitive staff document viewing and downloading (allows signed token or Admin session)
adminTeacherRecruitmentRouter.get(
  '/:id/documents/:documentId/view',
  verifyAdminOrSignedToken,
  viewTeacherDocument
);
adminTeacherRecruitmentRouter.get(
  '/:id/documents/:documentId/download',
  verifyAdminOrSignedToken,
  downloadTeacherDocument
);

// Protect all remaining admin recruitment routes
adminTeacherRecruitmentRouter.use(requireAuth, requireRole('ADMIN'));

adminTeacherRecruitmentRouter.get('/', getAdminTeacherApplications);
adminTeacherRecruitmentRouter.post('/', upload.single('cv'), createOfficeTeacherApplication);
adminTeacherRecruitmentRouter.get('/:id', getAdminTeacherApplicationById);
adminTeacherRecruitmentRouter.patch('/:id', updateAdminTeacherApplication);

adminTeacherRecruitmentRouter.post('/:id/submit', markTeacherApplicationUnderReview);
adminTeacherRecruitmentRouter.post('/:id/shortlist', shortlistTeacherCandidate);
adminTeacherRecruitmentRouter.post('/:id/select', selectTeacherCandidate);
adminTeacherRecruitmentRouter.post('/:id/reject', rejectTeacherCandidate);
adminTeacherRecruitmentRouter.post('/:id/cancel', cancelTeacherApplication);

adminTeacherRecruitmentRouter.get('/:id/interviews', getTeacherInterviews);
adminTeacherRecruitmentRouter.post('/:id/interviews', scheduleTeacherInterview);
adminTeacherRecruitmentRouter.patch('/:id/interviews/:interviewId', updateTeacherInterview);

adminTeacherRecruitmentRouter.get('/:id/documents', getTeacherAppointmentDocuments);
adminTeacherRecruitmentRouter.post(
  '/:id/documents',
  upload.single('file'),
  uploadTeacherAppointmentDocument
);
adminTeacherRecruitmentRouter.patch(
  '/:id/documents/:documentId/review',
  reviewTeacherAppointmentDocument
);

adminTeacherRecruitmentRouter.post('/:id/appoint', approveTeacherAppointment);
