import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getClassSections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classLevelId, academicSessionId } = req.query;
    const where: any = {};
    if (classLevelId) where.classLevelId = String(classLevelId);
    if (academicSessionId) where.academicSessionId = String(academicSessionId);

    const classSections = await prisma.classSection.findMany({
      where,
      include: {
        academicSession: true,
        classLevel: true,
      },
      orderBy: { name: 'asc' },
    });
    res.status(200).json(new ApiResponse(true, 'Class sections fetched successfully', { classSections }));
  } catch (error) {
    next(error);
  }
};

export const createClassSection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, academicSessionId, classLevelId } = req.body;
    
    const existing = await prisma.classSection.findFirst({ 
      where: { name, academicSessionId, classLevelId } 
    });
    
    if (existing) {
      throw new AppError('Class section with this name already exists in the selected class level and session', 400);
    }

    const classSection = await prisma.classSection.create({
      data: { name, academicSessionId, classLevelId },
      include: { 
        academicSession: true,
        classLevel: true
      }
    });

    res.status(201).json(new ApiResponse(true, 'Class section created successfully', { classSection }));
  } catch (error) {
    next(error);
  }
};

export const updateClassSection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, isActive, academicSessionId, classLevelId } = req.body;
    
    if (name || academicSessionId || classLevelId) {
      const existingSection = await prisma.classSection.findUnique({ where: { id } });
      if (!existingSection) throw new AppError('Class section not found', 404);

      const checkName = name || existingSection.name;
      const checkSession = academicSessionId || existingSection.academicSessionId;
      const checkLevel = classLevelId || existingSection.classLevelId;

      const duplicate = await prisma.classSection.findFirst({
        where: { name: checkName, academicSessionId: checkSession, classLevelId: checkLevel, NOT: { id } }
      });
      if (duplicate) {
        throw new AppError('Another class section with this name already exists in the selected level and session', 400);
      }
    }

    const classSection = await prisma.classSection.update({
      where: { id },
      data: { name, isActive },
      include: { 
        academicSession: true,
        classLevel: true
      }
    });

    res.status(200).json(new ApiResponse(true, 'Class section updated successfully', { classSection }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Class section not found', 404));
    }
    next(error);
  }
};

export const deleteClassSection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.classSection.findUnique({ where: { id } });
    if (!existing) throw new AppError('Class section not found', 404);

    const enrollmentsCount = await prisma.studentEnrollment.count({ where: { classSectionId: id } });
    if (enrollmentsCount > 0) {
      throw new AppError(`Cannot delete section '${existing.name}' because it has ${enrollmentsCount} enrolled student(s). Deactivate it instead.`, 400);
    }

    await prisma.classSection.delete({ where: { id } });
    res.status(200).json(new ApiResponse(true, 'Class section deleted successfully'));
  } catch (error) {
    next(error);
  }
};
