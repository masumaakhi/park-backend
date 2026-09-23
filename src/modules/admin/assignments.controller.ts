import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        academicSession: { select: { name: true } },
        classSection: { select: { name: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Assignments fetched successfully', { assignments }));
  } catch (error) {
    next(error);
  }
};

export const createAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      teacherId, subjectId, classSectionId, academicSessionId
    } = req.body;
    
    const existing = await prisma.teacherSubjectAssignment.findUnique({ 
      where: { 
        teacherId_subjectId_classSectionId_academicSessionId: {
          teacherId, subjectId, classSectionId, academicSessionId
        } 
      } 
    });

    if (existing) throw new AppError('This teacher is already assigned to this subject and class section', 400);

    const assignment = await prisma.teacherSubjectAssignment.create({
      data: {
        teacherId, subjectId, classSectionId, academicSessionId
      }
    });

    res.status(201).json(new ApiResponse(true, 'Assignment created successfully', { assignment }));
  } catch (error) {
    next(error);
  }
};

export const updateAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { isActive } = req.body;
    
    const assignment = await prisma.teacherSubjectAssignment.update({
      where: { id },
      data: { isActive }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment updated successfully', { assignment }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Assignment not found', 404));
    }
    next(error);
  }
};

export const deleteAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const assignment = await prisma.teacherSubjectAssignment.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            routines: true,
            attendanceSessions: true,
            classAssignments: true
          }
        }
      }
    });

    if (!assignment) {
      throw new AppError('Assignment not found', 404);
    }

    if (assignment._count.routines > 0 || assignment._count.attendanceSessions > 0 || assignment._count.classAssignments > 0) {
      throw new AppError(
        'Cannot delete teacher assignment because it is linked to routines, attendance, or class assignments. Please deactivate it instead.',
        400
      );
    }

    await prisma.teacherSubjectAssignment.delete({
      where: { id }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment deleted successfully'));
  } catch (error) {
    next(error);
  }
};

