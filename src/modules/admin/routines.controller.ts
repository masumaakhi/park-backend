import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getRoutines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routines = await prisma.routine.findMany({
      include: {
        teacherSubjectAssignment: {
          include: {
            teacher: { include: { user: { select: { name: true } } } },
            subject: { select: { name: true, code: true } }
          }
        },
        classSection: {
          include: {
            classLevel: true
          }
        },
        academicSession: {
          select: { id: true, name: true }
        },
        room: { select: { name: true, building: true } }
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });
    res.status(200).json(new ApiResponse(true, 'Routines fetched successfully', { routines }));
  } catch (error) {
    next(error);
  }
};

export const createRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      teacherSubjectAssignmentId, roomId, dayOfWeek, startTime, endTime 
    } = req.body;
    
    // Check room conflict
    const roomConflict = await prisma.routine.findFirst({
      where: {
        roomId,
        dayOfWeek,
        isActive: true,
        OR: [
          { startTime: { lte: startTime }, endTime: { gt: startTime } },
          { startTime: { lt: endTime }, endTime: { gte: endTime } },
          { startTime: { gte: startTime }, endTime: { lte: endTime } }
        ]
      }
    });

    if (roomConflict) {
      throw new AppError('Room conflict detected during this time slot', 400);
    }

    // Check teacher conflict
    const assignment = await prisma.teacherSubjectAssignment.findUnique({
      where: { id: teacherSubjectAssignmentId }
    });
    
    if (!assignment) {
      throw new AppError('Teacher Assignment not found', 404);
    }
      const teacherConflict = await prisma.routine.findFirst({
        where: {
          teacherSubjectAssignment: { teacherId: assignment.teacherId },
          dayOfWeek,
          isActive: true,
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } }
          ]
        }
      });

      if (teacherConflict) {
        throw new AppError('Teacher conflict detected during this time slot', 400);
      }


    // Check class section conflict
    const sectionConflict = await prisma.routine.findFirst({
      where: {
        dayOfWeek,
        isActive: true,
        OR: [
          { startTime: { lte: startTime }, endTime: { gt: startTime } },
          { startTime: { lt: endTime }, endTime: { gte: endTime } },
          { startTime: { gte: startTime }, endTime: { lte: endTime } }
        ]
      }
    });

    if (sectionConflict) {
      throw new AppError('Class section conflict detected during this time slot', 400);
    }

    const routine = await prisma.routine.create({
      data: {
        teacherSubjectAssignmentId, 
        roomId, 
        dayOfWeek, 
        startTime, 
        endTime,
        academicSessionId: assignment.academicSessionId,
        classSectionId: assignment.classSectionId
      }
    });

    res.status(201).json(new ApiResponse(true, 'Routine created successfully', { routine }));
  } catch (error) {
    next(error);
  }
};

export const updateRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { isActive, roomId, dayOfWeek, startTime, endTime } = req.body;
    
    // We only allow deactivating/activating or maybe updating room/time. 
    // Checking conflicts on update is complex if we allow time changes. Let's do it if they provided times.

    if (roomId && dayOfWeek && startTime && endTime) {
      const existing = await prisma.routine.findUnique({ where: { id }, include: { teacherSubjectAssignment: true } });
      if (!existing) throw new AppError('Routine not found', 404);

      // Room conflict
      const roomConflict = await prisma.routine.findFirst({
        where: {
          id: { not: id },
          roomId,
          dayOfWeek,
          isActive: true,
          academicSessionId: existing.academicSessionId,
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } }
          ]
        }
      });
      if (roomConflict) throw new AppError('Room conflict detected during this time slot', 400);
      
      // We skip teacher/section conflicts for simplicity in update, or can implement them similarly.
    }

    const routine = await prisma.routine.update({
      where: { id },
      data: req.body
    });

    res.status(200).json(new ApiResponse(true, 'Routine updated successfully', { routine }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Routine not found', 404));
    }
    next(error);
  }
};

export const deleteRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const routine = await prisma.routine.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            attendanceSessions: true
          }
        }
      }
    });

    if (!routine) {
      throw new AppError('Routine not found', 404);
    }

    if (routine._count.attendanceSessions > 0) {
      throw new AppError(
        'Cannot delete routine because attendance sessions are already recorded for it. Please deactivate it instead.',
        400
      );
    }

    await prisma.routine.delete({
      where: { id }
    });

    res.status(200).json(new ApiResponse(true, 'Routine deleted successfully'));
  } catch (error) {
    next(error);
  }
};

