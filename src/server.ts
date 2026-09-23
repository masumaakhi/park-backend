import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './modules/auth/auth.routes';
import passwordRoutes from './modules/auth/password.routes';
import adminRoutes from './modules/admin/admin.routes';
import sessionRoutes from './modules/academics/sessions.routes';
import classLevelRoutes from './modules/academics/class-levels.routes';
import classSectionRoutes from './modules/academics/class-sections.routes';
import subjectRoutes from './modules/academics/subjects.routes';
import teacherRoutes from './modules/teacher/teacher.routes';
import studentRoutes from './modules/student/student.routes';
import roomRoutes from './modules/rooms/room.routes';
import routineRoutes from './modules/routine/routine.routes';
import teacherAttendanceRoutes from './modules/attendance/teacher.attendance.routes';
import teacherMarksRoutes from './modules/marks/teacher.marks.routes';
import teacherAssignmentsRoutes from './modules/teacher/teacher.assignments.routes';
import verificationRoutes from './modules/verification/verification.routes';
import studentNoticeRoutes from './modules/notices/student.notice.routes';
import studentDigitalIdRoutes from './modules/digital-ids/student.digital-id.routes';
import publicCmsRoutes from './modules/public-cms/public-cms.routes';
import publicDonationRoutes from './modules/donations/public.donation.routes';
import publicVolunteerRoutes from './modules/volunteers/public.volunteer.routes';
import studentFeePaymentRoutes from './modules/fee-payments/student.fee-payment.routes';
import studentEnrollmentRoutes from './modules/academic-enrollments/student.enrollment.routes';
import adminReportRoutes from './modules/reports/report.routes';
import healthRoutes from './modules/health/health.routes';
import { publicAdmissionRouter } from './modules/admissions/admission.routes';
import { publicTeacherRecruitmentRouter } from './modules/teacher-recruitment/teacher-recruitment.routes';
import teacherCircularRoutes from './modules/teacher-circulars/routes';
import { requireAuth } from './middleware/auth.middleware';
import { requireRole } from './middleware/role.middleware';
import { ApiResponse } from './utils/api-response';

dotenv.config();

import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [
      'https://tista.org',
      'https://educationalpark.tista.org',
      'https://student.tista.org',
      'https://teacher.tista.org',
      'https://admin.tista.org'
    ]
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004'
    ];

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Tista API is running"
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/', healthRoutes);
app.use('/api/v1/auth', passwordRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/academic-sessions', sessionRoutes);
app.use('/api/v1/class-levels', classLevelRoutes);
app.use('/api/v1/class-sections', classSectionRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/teacher', teacherRoutes);
app.use('/api/v1/student', studentRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/routines', routineRoutes);
app.use('/api/v1/teacher/attendance', teacherAttendanceRoutes);
app.use('/api/v1/teacher/marks', teacherMarksRoutes);
app.use('/api/v1/teacher/assignments', teacherAssignmentsRoutes);
app.use('/api/v1/verify', verificationRoutes);
app.use('/api/v1/student/notices', studentNoticeRoutes);
app.use('/api/v1/student/digital-id', studentDigitalIdRoutes);
app.use('/api/v1/public', publicCmsRoutes);
app.use('/api/v1/public/admissions', publicAdmissionRouter);
app.use('/api/v1/public/teacher-applications', publicTeacherRecruitmentRouter);
app.use('/api/v1/public/teacher-circulars', teacherCircularRoutes);
app.use('/api/v1/public/donations', publicDonationRoutes);
app.use('/api/v1/public/volunteers', publicVolunteerRoutes);
app.use('/api/v1/student/fee-payments', studentFeePaymentRoutes);
app.use('/api/v1/student/enrollments', studentEnrollmentRoutes);
app.use('/api/v1/admin/reports', adminReportRoutes);

// Test Protected Routes
app.get('/api/v1/admin/test', requireAuth, requireRole('ADMIN'), (req: Request, res: Response) => {
  res.json(new ApiResponse(true, 'Admin access granted'));
});

app.get('/api/v1/teacher/test', requireAuth, requireRole('TEACHER'), (req: Request, res: Response) => {
  res.json(new ApiResponse(true, 'Teacher access granted'));
});

app.get('/api/v1/student/test', requireAuth, requireRole('STUDENT'), (req: Request, res: Response) => {
  res.json(new ApiResponse(true, 'Student access granted'));
});

// Error handling middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Tista API is running on http://localhost:${PORT}`);
});



















