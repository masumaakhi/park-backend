import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { generateComprehensiveMarksheet } from './marksheet-engine.service';

const prisma = new PrismaClient();

export const getMarksheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { examId, search } = req.query;

    const where: any = {};
    if (examId && typeof examId === 'string') {
      where.examId = examId;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { marksheetNumber: { contains: search, mode: 'insensitive' } },
        { verificationToken: { contains: search, mode: 'insensitive' } },
        { student: { studentId: { contains: search, mode: 'insensitive' } } },
        { student: { user: { name: { contains: search, mode: 'insensitive' } } } }
      ];
    }

    const marksheets = await prisma.marksheet.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        exam: {
          include: {
            examType: true,
            academicSession: true,
            classLevel: true,
            classSection: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(new ApiResponse(true, 'Marksheets fetched successfully', { marksheets }));
  } catch (error) {
    next(error);
  }
};

export const generateMarksheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { examId, classSectionId } = req.body;
    if (!examId) {
      throw new AppError('Exam ID is required', 400);
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { classSection: true }
    });
    if (!exam) throw new AppError('Exam not found', 404);

    const targetSectionId = classSectionId || exam.classSectionId;

    // Find all students in this section
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: targetSectionId,
        isCurrent: true
      },
      include: {
        student: true
      }
    });

    if (enrollments.length === 0) {
      // Alternatively check students with marks for this exam
      const studentMarks = await prisma.studentMark.findMany({
        where: { examSubject: { examId } },
        select: { studentId: true },
        distinct: ['studentId']
      });

      if (studentMarks.length === 0) {
        throw new AppError('No enrolled students or marks found for this exam', 400);
      }

      let createdCount = 0;
      for (const sm of studentMarks) {
        const existing = await prisma.marksheet.findFirst({
          where: { examId, studentId: sm.studentId }
        });
        if (!existing) {
          const rand = Math.floor(1000 + Math.random() * 9000);
          const msNum = `MS-${new Date().getFullYear()}-${sm.studentId.slice(0, 4).toUpperCase()}-${rand}`;
          const token = crypto.randomUUID();

          await prisma.marksheet.create({
            data: {
              examId,
              studentId: sm.studentId,
              marksheetNumber: msNum,
              verificationToken: token,
              isActive: true
            }
          });
          createdCount++;
        }
      }

      return res.status(201).json(new ApiResponse(true, `Successfully generated ${createdCount} marksheets`, { count: createdCount }));
    }

    let createdCount = 0;
    for (const en of enrollments) {
      const existing = await prisma.marksheet.findFirst({
        where: { examId, studentId: en.studentId }
      });
      if (!existing) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        const msNum = `MS-${new Date().getFullYear()}-${en.student.studentId || rand}-${rand}`;
        const token = crypto.randomUUID();

        await prisma.marksheet.create({
          data: {
            examId,
            studentId: en.studentId,
            marksheetNumber: msNum,
            verificationToken: token,
            isActive: true
          }
        });
        createdCount++;
      }
    }

    res.status(201).json(new ApiResponse(true, `Generated ${createdCount} marksheets for exam`, { count: createdCount }));
  } catch (error) {
    next(error);
  }
};

export const toggleMarksheetStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isActive, revokedReason } = req.body;

    const marksheet = await prisma.marksheet.update({
      where: { id: id as string },
      data: {
        isActive: Boolean(isActive),
        revokedAt: isActive ? null : new Date(),
        revokedReason: isActive ? null : (revokedReason || 'Revoked by administration')
      }
    });

    res.status(200).json(new ApiResponse(true, 'Marksheet status updated', { marksheet }));
  } catch (error) {
    next(error);
  }
};

export const deleteMarksheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.marksheet.delete({ where: { id: id as string } });
    res.status(200).json(new ApiResponse(true, 'Marksheet deleted successfully'));
  } catch (error) {
    next(error);
  }
};

export const getComprehensiveMarksheetHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { classSectionId } = req.query;

    const data = await generateComprehensiveMarksheet(
      studentId as string,
      classSectionId as string | undefined
    );

    if (!data) {
      throw new AppError('Student or academic record not found', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Comprehensive marksheet fetched', { marksheet: data }));
  } catch (error) {
    next(error);
  }
};

export const updateCoCurricularMarksheetHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, classSectionId, discipline, sportsAndGames, cleanliness, handwriting, teacherRemarks, promotionStatus } = req.body;

    if (!studentId) throw new AppError('studentId is required', 400);

    let marksheet = await prisma.marksheet.findFirst({
      where: {
        studentId: studentId as string,
        classSectionId: classSectionId as string | undefined,
      },
    });

    if (marksheet) {
      marksheet = await prisma.marksheet.update({
        where: { id: marksheet.id },
        data: {
          discipline: discipline !== undefined ? discipline : marksheet.discipline,
          sportsAndGames: sportsAndGames !== undefined ? sportsAndGames : marksheet.sportsAndGames,
          cleanliness: cleanliness !== undefined ? cleanliness : marksheet.cleanliness,
          handwriting: handwriting !== undefined ? handwriting : marksheet.handwriting,
          teacherRemarks: teacherRemarks !== undefined ? teacherRemarks : marksheet.teacherRemarks,
          promotionStatus: promotionStatus !== undefined ? promotionStatus : marksheet.promotionStatus,
        },
      });
    } else {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const msNum = `MS-ANNUAL-${new Date().getFullYear()}-${studentId.slice(0, 4).toUpperCase()}-${rand}`;
      const token = crypto.randomUUID();
      marksheet = await prisma.marksheet.create({
        data: {
          studentId: studentId as string,
          classSectionId: classSectionId as string | undefined,
          marksheetNumber: msNum,
          verificationToken: token,
          discipline: discipline || 'A',
          sportsAndGames: sportsAndGames || 'A',
          cleanliness: cleanliness || 'A',
          handwriting: handwriting || 'A',
          teacherRemarks: teacherRemarks || 'Satisfactory academic and co-curricular performance. Keep it up.',
          promotionStatus: promotionStatus || 'PROMOTED',
        },
      });
    }

    res.status(200).json(new ApiResponse(true, 'Co-curricular assessment updated', { marksheet }));
  } catch (error) {
    next(error);
  }
};
