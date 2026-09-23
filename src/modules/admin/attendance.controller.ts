import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getAttendanceSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.attendanceSession.findMany({
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        
        teacherSubjectAssignment: {
          include: {
            subject: { select: { name: true, code: true } }
          }
        },
        _count: {
          select: { records: true }
        }
      },
      orderBy: { attendanceDate: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Attendance sessions fetched successfully', { sessions }));
  } catch (error) {
    next(error);
  }
};

export const getAttendanceSessionRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    
    const records = await prisma.attendanceRecord.findMany({
      where: { attendanceSessionId: id },
      include: {
        student: {
          include: { user: { select: { name: true, email: true } } }
        }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Attendance records fetched successfully', { records }));
  } catch (error) {
    next(error);
  }
};
