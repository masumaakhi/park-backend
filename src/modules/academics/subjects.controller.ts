import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getSubjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Subjects fetched successfully', { subjects }));
  } catch (error) {
    next(error);
  }
};

export const createSubject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, code, classLevelId, fullMarks, passingMarks } = req.body;
    
    const existing = await prisma.subject.findFirst({ where: { code, classLevelId } });
    if (existing) {
      throw new AppError('Subject with this code already exists', 400);
    }

    const subject = await prisma.subject.create({
      data: { name, code, classLevelId, fullMarks, passingMarks }
    });

    res.status(201).json(new ApiResponse(true, 'Subject created successfully', { subject }));
  } catch (error) {
    next(error);
  }
};

export const updateSubject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, code, classLevelId, fullMarks, passingMarks, isActive } = req.body;
    
    if (code) {
      const existing = await prisma.subject.findFirst({
        where: { code, NOT: { id } }
      });
      if (existing) {
        throw new AppError('Another subject with this code already exists', 400);
      }
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: { name, code, classLevelId, fullMarks, passingMarks, isActive }
    });

    res.status(200).json(new ApiResponse(true, 'Subject updated successfully', { subject }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Subject not found', 404));
    }
    next(error);
  }
};

export const deleteSubject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
            examSubjects: true,
          }
        }
      }
    });

    if (!subject) {
      throw new AppError('Subject not found', 404);
    }

    if (subject._count.assignments > 0 || subject._count.examSubjects > 0) {
      throw new AppError(
        'Cannot delete subject because it is linked to teacher assignments or exam schedules. Please deactivate it instead.',
        400
      );
    }

    await prisma.subject.delete({
      where: { id }
    });

    res.status(200).json(new ApiResponse(true, 'Subject deleted successfully'));
  } catch (error) {
    next(error);
  }
};

