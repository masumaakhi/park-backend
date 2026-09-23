import { Request, Response, NextFunction } from 'express';
import { loginUser, getUserById } from './auth.service';
import { signToken } from '../../utils/jwt';
import { getCookieOptions } from '../../utils/cookies';
import { ApiResponse } from '../../utils/api-response';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, identifier, password, portalRole } = req.body;
    const loginId = identifier || email;
    const user = await loginUser(loginId, password, portalRole);

    const token = signToken({ id: user.id, role: user.role });
    const cookieOpts = getCookieOptions();

    // Set general jwt cookie AND role-specific cookie so portals on different localhost ports never collide
    res.cookie('jwt', token, cookieOpts);

    if (user.role === 'STUDENT') {
      res.cookie('student_jwt', token, cookieOpts);
    } else if (user.role === 'TEACHER') {
      res.cookie('teacher_jwt', token, cookieOpts);
    } else if (user.role === 'ADMIN') {
      res.cookie('admin_jwt', token, cookieOpts);
    }

    res.status(200).json(new ApiResponse(true, 'Login successful', { user, token }));
  } catch (error) {
    next(error);
  }
};

export const logout = (req: Request, res: Response) => {
  const expiredOpts = {
    ...getCookieOptions(),
    expires: new Date(Date.now() - 1000),
    maxAge: 0,
  };

  res.cookie('jwt', '', expiredOpts);
  res.cookie('student_jwt', '', expiredOpts);
  res.cookie('teacher_jwt', '', expiredOpts);
  res.cookie('admin_jwt', '', expiredOpts);

  res.status(200).json(new ApiResponse(true, 'Logged out successfully'));
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json(new ApiResponse(false, 'Not logged in'));
    }
    const user = await getUserById(req.user.id);
    res.status(200).json(new ApiResponse(true, 'User fetched successfully', { user }));
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError('Both current and new passwords are required', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError('Current password is incorrect', 400);
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashed,
        mustChangePassword: false,
        passwordSetAt: new Date(),
      },
    });

    res.status(200).json(new ApiResponse(true, 'Password changed successfully'));
  } catch (error) {
    next(error);
  }
};

export const refresh = (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse(true, 'Token refreshed (placeholder)'));
};
