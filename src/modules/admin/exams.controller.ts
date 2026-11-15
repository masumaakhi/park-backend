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
        examType: { select: { id: true, name: true, code: true } },
        academicSession: { select: { id: true, name: true } },
        classLevel: { select: { id: true, name: true } },
        classSection: { select: { id: true, name: true } },
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } }
          }
        },
        _count: { select: { subjects: true, marksheets: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Exams fetched', { exams }));
  } catch (error) { next(error); }
};

export const createExam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subjectIds, ...rest } = req.body;
    const exam = await prisma.exam.create({
      data: {
        ...rest,
        status: rest.status || 'OPEN'
      }
    });

    let finalSubjectIds: string[] = [];

    if (Array.isArray(subjectIds) && subjectIds.length > 0) {
      finalSubjectIds = subjectIds;
    } else {
      // Gather subjects assigned to this section + subjects belonging to this class level
      const assignedSubjects = await prisma.teacherSubjectAssignment.findMany({
        where: { classSectionId: exam.classSectionId, isActive: true },
        select: { subjectId: true },
        distinct: ['subjectId']
      });

      const classSubjects = exam.classLevelId
        ? await prisma.subject.findMany({
            where: { classLevelId: exam.classLevelId, isActive: true },
            select: { id: true }
          })
        : [];

      const subjectIdSet = new Set<string>([
        ...assignedSubjects.map(a => a.subjectId),
        ...classSubjects.map(s => s.id)
      ]);
      finalSubjectIds = Array.from(subjectIdSet);
    }

    if (finalSubjectIds.length > 0) {
      await prisma.examSubject.createMany({
        data: finalSubjectIds.map(subjectId => ({
          examId: exam.id,
          subjectId,
          fullMarks: exam.totalMarks || 100,
          passMarks: exam.passingMarks || 40
        })),
        skipDuplicates: true
      });
    }

    const createdExam = await prisma.exam.findUnique({
      where: { id: exam.id },
      include: {
        examType: true,
        academicSession: true,
        classLevel: true,
        classSection: true,
        subjects: { include: { subject: true } }
      }
    });

    res.status(201).json(new ApiResponse(true, 'Exam created successfully', { exam: createdExam }));
  } catch (error) { next(error); }
};

export const updateExam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const data: any = { ...req.body };
    if (data.status !== undefined) {
      data.isPublished = data.status === 'PUBLISHED';
    }
    const exam = await prisma.exam.update({ where: { id }, data });

    // Sync student marks lock state with exam status
    if (data.status === 'OPEN') {
      await prisma.studentMark.updateMany({
        where: { examSubject: { examId: id } },
        data: { status: 'DRAFT' }
      });
    } else if (data.status === 'PUBLISHED' || data.status === 'CLOSED') {
      await prisma.studentMark.updateMany({
        where: { examSubject: { examId: id } },
        data: { status: 'SUBMITTED' }
      });
    }

    res.status(200).json(new ApiResponse(true, 'Exam updated', { exam }));
  } catch (error) { next(error); }
};

export const deleteExam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!exam) {
      throw new AppError('Exam not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      const examSubjects = await tx.examSubject.findMany({
        where: { examId: id },
        select: { id: true }
      });
      const examSubjectIds = examSubjects.map(es => es.id);

      if (examSubjectIds.length > 0) {
        await tx.studentMark.deleteMany({
          where: { examSubjectId: { in: examSubjectIds } }
        });
      }

      await tx.examSubject.deleteMany({ where: { examId: id } });
      await tx.marksheet.deleteMany({ where: { examId: id } });
      await tx.exam.delete({ where: { id } });
    });

    res.status(200).json(new ApiResponse(true, 'Exam deleted successfully'));
  } catch (error) { next(error); }
};

export const syncExamSubjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        classLevel: true,
        classSection: true,
        subjects: true
      }
    });

    if (!exam) {
      throw new AppError('Exam not found', 404);
    }

    // Gather subjects assigned to this section + subjects belonging to this class level
    const assignedSubjects = exam.classSectionId
      ? await prisma.teacherSubjectAssignment.findMany({
          where: { classSectionId: exam.classSectionId, isActive: true },
          select: { subjectId: true },
          distinct: ['subjectId']
        })
      : [];

    const classSubjects = exam.classLevelId
      ? await prisma.subject.findMany({
          where: { classLevelId: exam.classLevelId, isActive: true },
          select: { id: true }
        })
      : [];

    const subjectIdSet = new Set<string>([
      ...assignedSubjects.map(a => a.subjectId),
      ...classSubjects.map(s => s.id)
    ]);

    if (subjectIdSet.size === 0) {
      throw new AppError('No active subjects found for this class. Please add subjects first in Academic Setup > Subjects.', 400);
    }

    const created = await prisma.examSubject.createMany({
      data: Array.from(subjectIdSet).map(subjectId => ({
        examId: exam.id,
        subjectId,
        fullMarks: exam.totalMarks || 100,
        passMarks: exam.passingMarks || 40
      })),
      skipDuplicates: true
    });

    const updatedExam = await prisma.exam.findUnique({
      where: { id: exam.id },
      include: {
        examType: { select: { id: true, name: true, code: true } },
        academicSession: { select: { id: true, name: true } },
        classLevel: { select: { id: true, name: true } },
        classSection: { select: { id: true, name: true } },
        subjects: {
          include: {
            subject: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        _count: { select: { subjects: true, marksheets: true } }
      }
    });

    res.status(200).json(new ApiResponse(true, `Successfully synced ${created.count} subjects to this exam`, { exam: updatedExam }));
  } catch (error) { next(error); }
};

