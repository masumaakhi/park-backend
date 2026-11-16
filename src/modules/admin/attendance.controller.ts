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
        classSection: { include: { classLevel: true } },
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
          include: {
            user: { select: { name: true, email: true } },
            academicEnrollments: {
              where: { isCurrent: true },
              take: 1
            }
          }
        }
      }
    });

    // Sort by roll number
    records.sort((a, b) => {
      const rollA = a.student?.academicEnrollments?.[0]?.rollNumber || '';
      const rollB = b.student?.academicEnrollments?.[0]?.rollNumber || '';
      const numA = parseInt(rollA, 10);
      const numB = parseInt(rollB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    res.status(200).json(new ApiResponse(true, 'Attendance records fetched successfully', { records }));
  } catch (error) {
    next(error);
  }
};
