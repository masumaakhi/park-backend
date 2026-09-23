import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const verifyMarksheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    
    const marksheet = await prisma.marksheet.findUnique({
      where: { verificationToken: token as string },
      include: {
        student: { include: { user: true } },
        exam: { include: { examType: true } }
      }
    });

    if (!marksheet) {
      throw new AppError('Marksheet Not Found', 404);
    }

    // Prepare safe public payload
    const publicData = {
      institutionName: "EduPark Institution",
      studentName: marksheet.student.user.name,
      studentId: marksheet.student.studentId,
      
      examTitle: marksheet.exam?.title || 'N/A',
      examType: marksheet.exam?.examType?.name || 'N/A',
      issueDate: marksheet.issuedAt,
      marksheetNumber: marksheet.marksheetNumber,
      status: marksheet.isActive ? 'Valid' : 'Revoked',
      isRevoked: !marksheet.isActive,
      revokedReason: marksheet.revokedReason
    };

    res.status(200).json(new ApiResponse(true, 'Marksheet verified', publicData));
  } catch (error) {
    next(error);
  }
};

export const verifyStudentDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;

    const digitalId = await prisma.studentDigitalId.findUnique({
      where: { verificationToken: token },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            academicEnrollments: {
              where: { isCurrent: true },
              include: {
                academicSession: true,
                classLevel: true,
                classSection: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!digitalId) {
      return res.status(404).json(
        new ApiResponse(false, 'Digital ID Not Found', {
          status: 'Not Found',
        })
      );
    }

    const currentEnrollment = digitalId.student.academicEnrollments[0];
    const isExpired = new Date(digitalId.expiryDate) < new Date();

    let statusText: 'Valid' | 'Inactive' | 'Revoked' | 'Expired' = 'Valid';
    if (digitalId.revokedAt) {
      statusText = 'Revoked';
    } else if (!digitalId.isActive) {
      statusText = 'Inactive';
    } else if (isExpired) {
      statusText = 'Expired';
    }

    // Safe public payload ONLY
    const safeData = {
      status: statusText,
      institutionName: 'Educational Park',
      studentName: digitalId.student.user.name,
      studentId: digitalId.student.studentId,
      classLevel: currentEnrollment?.classLevel?.name || 'N/A',
      classSection: currentEnrollment?.classSection?.name || 'N/A',
      academicSession: currentEnrollment?.academicSession?.name || 'N/A',
      cardNumber: digitalId.cardNumber,
      issueDate: digitalId.issueDate,
      expiryDate: digitalId.expiryDate,
    };

    return res.status(200).json(new ApiResponse(true, 'Digital ID verified successfully', safeData));
  } catch (error) {
    next(error);
  }
};

