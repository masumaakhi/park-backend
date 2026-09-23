import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getAcademicInformation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.id;
    if (!studentId) throw new AppError('Unauthorized', 401);

    const enrollments = await prisma.studentEnrollment.findMany({
       where: { 
          studentId: studentId,
          isCurrent: true
       },
       include: {
          
          
          
          
          
          
       }
    });

    const enrollment = enrollments[0];
    if (!enrollment) {
       return res.status(200).json(new ApiResponse(true, 'No active academic enrollment found', null));
    }

    res.status(200).json(new ApiResponse(true, 'Academic information retrieved successfully', enrollment));
  } catch (error) {
    next(error);
  }
};
