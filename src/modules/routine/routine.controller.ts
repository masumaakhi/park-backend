import { Request, Response, NextFunction } from 'express';
import { PrismaClient, DayOfWeek } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

const validateRoutineConflict = async (
  dayOfWeek: DayOfWeek,
  startTime: string,
  endTime: string,
  teacherSubjectAssignmentId: string,
  roomId: string,
  excludeRoutineId?: string
) => {
  if (startTime >= endTime) {
    throw new AppError('Start time must be before end time', 400);
  }

  const assignment = await prisma.teacherSubjectAssignment.findUnique({
    where: { id: teacherSubjectAssignmentId }
  });
  
  if (!assignment) throw new AppError('Teacher Assignment not found', 404);
  if (!assignment.isActive) throw new AppError('Teacher Assignment is inactive', 400);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (!room.isActive) throw new AppError('Room is inactive', 400);

  // Check overlapping times
  const overlappingRoutines = await prisma.routine.findMany({
    where: {
      dayOfWeek,
      isActive: true,
      ...(excludeRoutineId ? { NOT: { id: excludeRoutineId } } : {}),
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } }
      ]
    },
    include: { teacherSubjectAssignment: true }
  });

  for (const routine of overlappingRoutines) {
    if (routine.roomId === roomId) {
      throw new AppError('Room is already booked for this time slot', 409);
    }
    if (routine.teacherSubjectAssignment.teacherId === assignment.teacherId) {
      throw new AppError('Teacher is already booked for another class at this time', 409);
    }
    if (routine.teacherSubjectAssignment.classSectionId === assignment.classSectionId) {
      throw new AppError('Class section already has a routine at this time', 409);
    }
  }
};

export const getRoutines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routines = await prisma.routine.findMany({
      include: {
        teacherSubjectAssignment: { include: { teacher: true, subject: true } },
        room: true,
        
        
      },
      orderBy: { dayOfWeek: 'asc' }
    });
    res.status(200).json(new ApiResponse(true, 'Routines fetched', { routines }));
  } catch (error) {
    next(error);
  }
};

export const createRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teacherSubjectAssignmentId, roomId, dayOfWeek, startTime, endTime } = req.body;

    await validateRoutineConflict(dayOfWeek, startTime, endTime, teacherSubjectAssignmentId, roomId);

    const assignment = await prisma.teacherSubjectAssignment.findUnique({
      where: { id: teacherSubjectAssignmentId }
    });
    if (!assignment) throw new AppError('Assignment not found', 404);

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

    res.status(201).json(new ApiResponse(true, 'Routine created', { routine }));
  } catch (error) {
    next(error);
  }
};

export const updateRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { teacherSubjectAssignmentId, roomId, dayOfWeek, startTime, endTime, isActive } = req.body;

    const existingRoutine = await prisma.routine.findUnique({ where: { id: id as string } });
    if (!existingRoutine) throw new AppError('Routine not found', 404);

    const checkDay = dayOfWeek || existingRoutine.dayOfWeek;
    const checkStart = startTime || existingRoutine.startTime;
    const checkEnd = endTime || existingRoutine.endTime;
    const checkAssignment = teacherSubjectAssignmentId || existingRoutine.teacherSubjectAssignmentId;
    const checkRoom = roomId || existingRoutine.roomId;

    if (dayOfWeek || startTime || endTime || teacherSubjectAssignmentId || roomId) {
      await validateRoutineConflict(checkDay, checkStart, checkEnd, checkAssignment, checkRoom, id);
    }

    const routine = await prisma.routine.update({
      where: { id: id as string },
      data: { 
        teacherSubjectAssignmentId, 
        roomId, 
        dayOfWeek, 
        startTime, 
        endTime, 
        isActive 
      }
    });

    res.status(200).json(new ApiResponse(true, 'Routine updated', { routine }));
  } catch (error) {
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

