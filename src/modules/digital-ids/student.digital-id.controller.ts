import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getStudentDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) throw new AppError('Student not found', 404);

    const digitalId = await prisma.studentDigitalId.findFirst({
      where: {
        studentId: student.id,
        isActive: true
      },
      include: {
        student: {
          include: {
            
            
            
            
            
            
          }
        }
      }
    });

    if (!digitalId) {
      throw new AppError('No active Digital ID found for this student', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Digital ID fetched', { digitalId }));
  } catch (error) {
    next(error);
  }
};
