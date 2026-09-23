import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getClassLevels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classLevels = await prisma.classLevel.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    res.status(200).json(new ApiResponse(true, 'Class levels fetched successfully', { classLevels }));
  } catch (error) {
    next(error);
  }
};

export const createClassLevel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, code, sortOrder, isActive } = req.body;
    
    const existingCode = await prisma.classLevel.findUnique({ where: { code } });
    if (existingCode) throw new AppError('Class level with this code already exists', 400);

    const existingName = await prisma.classLevel.findUnique({ where: { name } });
    if (existingName) throw new AppError('Class level with this name already exists', 400);

    const existingSort = await prisma.classLevel.findUnique({ where: { sortOrder } });
    if (existingSort) throw new AppError('Class level with this sort order already exists', 400);

    const classLevel = await prisma.classLevel.create({
      data: {
        name,
        code,
        sortOrder,
        isActive: isActive !== undefined ? isActive : true
      }
    });

    res.status(201).json(new ApiResponse(true, 'Class level created successfully', { classLevel }));
  } catch (error) {
    next(error);
  }
};

export const updateClassLevel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, code, sortOrder, isActive } = req.body;
    
    if (code) {
      const existingCode = await prisma.classLevel.findFirst({
        where: { code, NOT: { id } }
      });
      if (existingCode) throw new AppError('Another class level with this code already exists', 400);
    }

    if (name) {
      const existingName = await prisma.classLevel.findFirst({
        where: { name, NOT: { id } }
      });
      if (existingName) throw new AppError('Another class level with this name already exists', 400);
    }

    if (sortOrder !== undefined) {
      const existingSort = await prisma.classLevel.findFirst({
        where: { sortOrder, NOT: { id } }
      });
      if (existingSort) throw new AppError('Another class level with this sort order already exists', 400);
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;

    const classLevel = await prisma.classLevel.update({
      where: { id },
      data
    });

    res.status(200).json(new ApiResponse(true, 'Class level updated successfully', { classLevel }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Class level not found', 404));
    }
    next(error);
  }
};

export const deleteClassLevel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.classLevel.findUnique({ where: { id } });
    if (!existing) throw new AppError('Class level not found', 404);

    const sectionsCount = await prisma.classSection.count({ where: { classLevelId: id } });
    if (sectionsCount > 0) {
      throw new AppError(`Cannot delete class '${existing.name}' because it has ${sectionsCount} section(s) assigned. Delete those sections first or deactivate the class.`, 400);
    }

    const subjectsCount = await prisma.subject.count({ where: { classLevelId: id } });
    if (subjectsCount > 0) {
      throw new AppError(`Cannot delete class '${existing.name}' because it has ${subjectsCount} subject(s) assigned.`, 400);
    }

    await prisma.classLevel.delete({ where: { id } });
    res.status(200).json(new ApiResponse(true, 'Class level deleted successfully'));
  } catch (error) {
    next(error);
  }
};
