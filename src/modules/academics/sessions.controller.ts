import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.academicSession.findMany({
      orderBy: { startDate: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Sessions fetched successfully', { sessions }));
  } catch (error) {
    next(error);
  }
};

export const createSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, startDate, endDate } = req.body;
    
    const existing = await prisma.academicSession.findUnique({ where: { name } });
    if (existing) throw new AppError('Session with this name already exists', 400);

    const session = await prisma.academicSession.create({
      data: { 
        name, 
        startDate: new Date(startDate), 
        endDate: new Date(endDate) 
      }
    });

    res.status(201).json(new ApiResponse(true, 'Session created successfully', { session }));
  } catch (error) {
    next(error);
  }
};

export const updateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, startDate, endDate, isActive } = req.body;
    
    if (name) {
      const existing = await prisma.academicSession.findFirst({
        where: { name, NOT: { id } }
      });
      if (existing) throw new AppError('Another session with this name already exists', 400);
    }

    // If making this active, deactivate all others (assuming only one active session at a time)
    if (isActive === true) {
      await prisma.academicSession.updateMany({
        where: { id: { not: id } },
        data: { isActive: false }
      });
    }

    const data: any = {};
    if (name) data.name = name;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (isActive !== undefined) data.isActive = isActive;

    const session = await prisma.academicSession.update({
      where: { id },
      data
    });

    res.status(200).json(new ApiResponse(true, 'Session updated successfully', { session }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Session not found', 404));
    }
    next(error);
  }
};

export const deleteSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.academicSession.findUnique({ where: { id } });
    if (!existing) throw new AppError('Academic session not found', 404);

    if (existing.isActive) {
      throw new AppError('Cannot delete the currently active academic session. Switch to another active session first.', 400);
    }

    const sectionsCount = await prisma.classSection.count({ where: { academicSessionId: id } });
    if (sectionsCount > 0) {
      throw new AppError(`Cannot delete session '${existing.name}' because it has ${sectionsCount} section(s) attached.`, 400);
    }

    await prisma.academicSession.delete({ where: { id } });
    res.status(200).json(new ApiResponse(true, 'Academic session deleted successfully'));
  } catch (error) {
    next(error);
  }
};
