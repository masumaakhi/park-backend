import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../utils/app-error';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        name: string;
        email: string;
      };
    }
  }
}

function tryVerify(token?: string): { id: string; role: string } | null {
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fullPath = (req.originalUrl || req.baseUrl || req.url || '').toLowerCase();
    const origin = ((req.headers.origin as string) || (req.headers.referer as string) || '').toLowerCase();

    const isAdminPortal = origin.includes(':3004') || origin.includes('admin.tista.org');
    const isTeacherPortal = origin.includes(':3003') || origin.includes('teacher.tista.org');
    const isStudentPortal = origin.includes(':3002') || origin.includes('student.tista.org');

    const isAdminRoute = fullPath.startsWith('/api/v1/admin') || fullPath.includes('/admin');
    const isTeacherRoute = !isAdminRoute && (fullPath.startsWith('/api/v1/teacher') || fullPath.includes('/teacher/') || fullPath === '/api/v1/teacher');
    const isStudentRoute = !isAdminRoute && (fullPath.startsWith('/api/v1/student') || fullPath.includes('/student/') || fullPath === '/api/v1/student');

    let bearerToken: string | undefined;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      bearerToken = req.headers.authorization.split(' ')[1];
    }

    let token: string | undefined;
    let decoded: { id: string; role: string } | null = null;

    // 1. If called by or for Admin Portal / Admin Route
    if (isAdminPortal || isAdminRoute) {
      if (req.cookies?.admin_jwt) {
        const d = tryVerify(req.cookies.admin_jwt);
        if (d && d.role === 'ADMIN') {
          token = req.cookies.admin_jwt;
          decoded = d;
        }
      }
      if (!token && req.cookies?.jwt) {
        const d = tryVerify(req.cookies.jwt);
        if (d && d.role === 'ADMIN') {
          token = req.cookies.jwt;
          decoded = d;
        }
      }
      if (!token && bearerToken) {
        const d = tryVerify(bearerToken);
        if (d && d.role === 'ADMIN') {
          token = bearerToken;
          decoded = d;
        }
      }
      if (!token || !decoded) {
        return next(new AppError('Admin login required. Please sign in to the Admin Portal.', 401));
      }
    }
    // 2. If called by or for Teacher Portal / Teacher Route
    else if (isTeacherRoute || isTeacherPortal) {
      if (req.cookies?.teacher_jwt) {
        const d = tryVerify(req.cookies.teacher_jwt);
        if (d && d.role === 'TEACHER') {
          token = req.cookies.teacher_jwt;
          decoded = d;
        }
      }
      if (!token && req.cookies?.jwt) {
        const d = tryVerify(req.cookies.jwt);
        if (d && d.role === 'TEACHER') {
          token = req.cookies.jwt;
          decoded = d;
        }
      }
      if (!token && bearerToken) {
        const d = tryVerify(bearerToken);
        if (d && d.role === 'TEACHER') {
          token = bearerToken;
          decoded = d;
        }
      }
      if (!token || !decoded) {
        return next(new AppError('Teacher login required. Please sign in to the Teacher Portal.', 401));
      }
    }
    // 3. If called by or for Student Portal / Student Route
    else if (isStudentRoute || isStudentPortal) {
      if (req.cookies?.student_jwt) {
        const d = tryVerify(req.cookies.student_jwt);
        if (d && d.role === 'STUDENT') {
          token = req.cookies.student_jwt;
          decoded = d;
        }
      }
      if (!token && req.cookies?.jwt) {
        const d = tryVerify(req.cookies.jwt);
        if (d && d.role === 'STUDENT') {
          token = req.cookies.jwt;
          decoded = d;
        }
      }
      if (!token && bearerToken) {
        const d = tryVerify(bearerToken);
        if (d && d.role === 'STUDENT') {
          token = bearerToken;
          decoded = d;
        }
      }
      if (!token || !decoded) {
        return next(new AppError('Student login required. Please sign in to the Student Portal.', 401));
      }
    }
    // 4. Any other API / generic route
    else {
      const candidates = [
        req.cookies?.jwt,
        req.cookies?.admin_jwt,
        req.cookies?.teacher_jwt,
        req.cookies?.student_jwt,
        bearerToken,
      ].filter(Boolean);

      for (const candidate of candidates) {
        const d = tryVerify(candidate);
        if (d) {
          token = candidate;
          decoded = d;
          break;
        }
      }

      if (!token || !decoded) {
        return next(new AppError('You are not logged in! Please log in to get access.', 401));
      }
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (!currentUser.isActive) {
      return next(new AppError('This user has been deactivated.', 403));
    }

    req.user = {
      id: currentUser.id,
      role: currentUser.role,
      name: currentUser.name,
      email: currentUser.email,
    };

    next();
  } catch (error) {
    return next(new AppError('Invalid token or authorization error.', 401));
  }
};
