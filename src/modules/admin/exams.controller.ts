import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

// Exam Types
export const getExamTypes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const examTypes = await prisma.examType.findMany({ orderBy: { name: 'asc' } });
    res.status(200).json(new ApiResponse(true, 'Exam types fetched', { examTypes }));
  } catch (error) { next(error); }
};

export const createExamType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, code, description } = req.body;
    const existing = await prisma.examType.findUnique({ where: { code } });
    if (existing) throw new AppError('Exam type with this code already exists', 400);

    const examType = await prisma.examType.create({ data: { name, code, description } });
    res.status(201).json(new ApiResponse(true, 'Exam type created', { examType }));
  } catch (error) { next(error); }
};

export const updateExamType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { isActive } = req.body;
    const examType = await prisma.examType.update({ where: { id }, data: { isActive } });
    res.status(200).json(new ApiResponse(true, 'Exam type updated', { examType }));
  } catch (error) { next(error); }
};

export const deleteExamType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const examType = await prisma.examType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            exams: true
          }
        }
      }
    });

    if (!examType) {
      throw new AppError('Exam type not found', 404);
    }

    if (examType._count.exams > 0) {
      throw new AppError(
        'Cannot delete exam type because it is linked to existing exams. Please deactivate it instead.',
        400
      );
    }

    await prisma.examType.delete({
      where: { id }
    });

    res.status(200).json(new ApiResponse(true, 'Exam type deleted successfully'));
  } catch (error) {
    next(error);
  }
};


// Grade Scales
export const getGradeScales = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gradeScales = await prisma.gradeScale.findMany({ orderBy: { minPercentage: 'desc' } });
    res.status(200).json(new ApiResponse(true, 'Grade scales fetched', { gradeScales }));
  } catch (error) { next(error); }
};

export const createGradeScale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gradeScale = await prisma.gradeScale.create({ data: req.body });
    res.status(201).json(new ApiResponse(true, 'Grade scale created', { gradeScale }));
  } catch (error) { next(error); }
};

export const updateGradeScale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const gradeScale = await prisma.gradeScale.update({ where: { id }, data: req.body });
    res.status(200).json(new ApiResponse(true, 'Grade scale updated', { gradeScale }));
  } catch (error) { next(error); }
};

export const deleteGradeScale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await prisma.gradeScale.delete({ where: { id } });
    res.status(200).json(new ApiResponse(true, 'Grade scale deleted', null));
  } catch (error) { next(error); }
};

// Exams
export const getExams = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exams = await prisma.exam.findMany({
      include: {
        examType: { select: { name: true } },
        academicSession: { select: { name: true } },
        classLevel: { select: { name: true } },
        classSection: { select: { name: true } },
        _count: { select: { subjects: true, marksheets: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Exams fetched', { exams }));
  } catch (error) { next(error); }
};

export const createExam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exam = await prisma.exam.create({ data: req.body });
    res.status(201).json(new ApiResponse(true, 'Exam created', { exam }));
  } catch (error) { next(error); }
};

export const updateExam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const exam = await prisma.exam.update({ where: { id }, data: req.body });
    res.status(200).json(new ApiResponse(true, 'Exam updated', { exam }));
  } catch (error) { next(error); }
};
