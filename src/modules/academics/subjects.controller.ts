import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getSubjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classLevelId } = req.query;
    const where: any = {};
    if (classLevelId && typeof classLevelId === 'string') {
      where.classLevelId = classLevelId;
    }

    const subjects = await prisma.subject.findMany({
      where,
      include: { classLevel: true },
      orderBy: [
        { classLevel: { sortOrder: 'asc' } },
        { createdAt: 'desc' }
      ]
    });
    res.status(200).json(new ApiResponse(true, 'Subjects fetched successfully', { subjects }));
  } catch (error) {
    next(error);
  }
};

export const createSubject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, code, classLevelId, fullMarks, passingMarks, isActive } = req.body;
    
    const existing = await prisma.subject.findFirst({
      where: {
        classLevelId,
        name: { equals: name.trim(), mode: 'insensitive' }
      }
    });
    if (existing) {
      throw new AppError('Subject with this name already exists for this class', 400);
    }

    const subject = await prisma.subject.create({
      data: {
        name: name.trim(),
        code: code ? code.trim().toUpperCase() : null,
        classLevelId,
        fullMarks: fullMarks !== undefined && fullMarks !== null ? parseInt(fullMarks) : 100,
        passingMarks: passingMarks !== undefined && passingMarks !== null ? parseInt(passingMarks) : 40,
        isActive: isActive !== undefined ? isActive : true
      },
      include: { classLevel: true }
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
    
    const current = await prisma.subject.findUnique({ where: { id } });
    if (!current) throw new AppError('Subject not found', 404);

    const targetClassId = classLevelId || current.classLevelId;

    if (name) {
      const existing = await prisma.subject.findFirst({
        where: {
          classLevelId: targetClassId,
          name: { equals: name.trim(), mode: 'insensitive' },
          NOT: { id }
        }
      });
      if (existing) {
        throw new AppError('Another subject with this name already exists for this class', 400);
      }
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(code !== undefined && { code: code ? code.trim().toUpperCase() : null }),
        ...(classLevelId && { classLevelId }),
        ...(fullMarks !== undefined && { fullMarks: parseInt(fullMarks) }),
        ...(passingMarks !== undefined && { passingMarks: parseInt(passingMarks) }),
        ...(isActive !== undefined && { isActive })
      },
      include: { classLevel: true }
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

    const hasLinkedRecords = subject._count.assignments > 0 || subject._count.examSubjects > 0;

    if (subject.isActive && hasLinkedRecords) {
      throw new AppError(
        'This subject is currently Active and linked to teacher assignments or exam schedules. Please deactivate it first before deleting.',
        400
      );
    }

    // If inactive (deactivated) or unlinked, safely cascade delete all linked records
    await prisma.$transaction(async (tx) => {
      // 1. Delete exam subjects and student marks
      const examSubjects = await tx.examSubject.findMany({
        where: { subjectId: id },
        select: { id: true }
      });
      const examSubjectIds = examSubjects.map(es => es.id);
      if (examSubjectIds.length > 0) {
        await tx.studentMark.deleteMany({
          where: { examSubjectId: { in: examSubjectIds } }
        });
        await tx.examSubject.deleteMany({
          where: { subjectId: id }
        });
      }

      // 2. Delete teacher assignments and their child records
      const assignments = await tx.teacherSubjectAssignment.findMany({
        where: { subjectId: id },
        select: { id: true }
      });
      const assignmentIds = assignments.map(a => a.id);

      if (assignmentIds.length > 0) {
        const sessions = await tx.attendanceSession.findMany({
          where: { teacherSubjectAssignmentId: { in: assignmentIds } },
          select: { id: true }
        });
        const sessionIds = sessions.map(s => s.id);
        if (sessionIds.length > 0) {
          await tx.attendanceRecord.deleteMany({
            where: { attendanceSessionId: { in: sessionIds } }
          });
          await tx.attendanceSession.deleteMany({
            where: { id: { in: sessionIds } }
          });
        }

        await tx.attendanceSession.updateMany({
          where: { routine: { teacherSubjectAssignmentId: { in: assignmentIds } } },
          data: { routineId: null }
        });

        await tx.routine.deleteMany({
          where: { teacherSubjectAssignmentId: { in: assignmentIds } }
        });

        await tx.classAssignment.deleteMany({
          where: { teacherSubjectAssignmentId: { in: assignmentIds } }
        });

        await tx.teacherSubjectAssignment.deleteMany({
          where: { subjectId: id }
        });
      }

      // 3. Finally delete the subject
      await tx.subject.delete({
        where: { id }
      });
    });

    res.status(200).json(new ApiResponse(true, 'Subject deleted successfully'));
  } catch (error) {
    next(error);
  }
};

const STANDARD_CURRICULUM: Record<string, Array<{ name: string; code: string; fullMarks: number; passingMarks: number }>> = {
  PLAY: [
    { name: 'Bangla', code: 'BAN-P', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-P', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-P', fullMarks: 100, passingMarks: 40 },
    { name: 'Drawing & Rhymes', code: 'DRAW-P', fullMarks: 100, passingMarks: 40 },
  ],
  NURSERY: [
    { name: 'Bangla', code: 'BAN-N', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-N', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-N', fullMarks: 100, passingMarks: 40 },
    { name: 'General Knowledge & Drawing', code: 'GK-N', fullMarks: 100, passingMarks: 40 },
  ],
  KG: [
    { name: 'Bangla', code: 'BAN-KG', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-KG', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-KG', fullMarks: 100, passingMarks: 40 },
    { name: 'General Knowledge', code: 'GK-KG', fullMarks: 100, passingMarks: 40 },
    { name: 'Drawing & Crafts', code: 'DRAW-KG', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_2: [
    { name: 'Bangla', code: 'BAN-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C2', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts/Physical Education', code: 'ART-C2', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_3: [
    { name: 'Bangla', code: 'BAN-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C3', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts/Physical Education', code: 'ART-C3', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_4: [
    { name: 'Bangla', code: 'BAN-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C4', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts/Physical Education', code: 'ART-C4', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_5: [
    { name: 'Bangla', code: 'BAN-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C5', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts/Physical Education', code: 'ART-C5', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_6: [
    { name: 'Bangla', code: 'BAN-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'ICT', code: 'ICT-C6', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts and Crafts', code: 'ART-C6', fullMarks: 100, passingMarks: 40 },
  ],
  CLASS_7: [
    { name: 'Bangla', code: 'BAN-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'English', code: 'ENG-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'Mathematics', code: 'MAT-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'Science', code: 'SCI-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'Bangladesh and Global Studies', code: 'BGS-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'Religion and Moral Education', code: 'REL-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'ICT', code: 'ICT-C7', fullMarks: 100, passingMarks: 40 },
    { name: 'Arts and Crafts', code: 'ART-C7', fullMarks: 100, passingMarks: 40 },
  ],
};

export const seedStandardSubjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classLevelId } = req.body;
    const classes = await prisma.classLevel.findMany({
      where: classLevelId ? { id: classLevelId } : undefined
    });

    let createdCount = 0;
    for (const c of classes) {
      const list = STANDARD_CURRICULUM[c.code];
      if (!list) continue;

      for (const sub of list) {
        await prisma.subject.upsert({
          where: {
            classLevelId_name: {
              classLevelId: c.id,
              name: sub.name,
            }
          },
          update: {
            code: sub.code,
            fullMarks: sub.fullMarks,
            passingMarks: sub.passingMarks,
            isActive: true
          },
          create: {
            name: sub.name,
            code: sub.code,
            classLevelId: c.id,
            fullMarks: sub.fullMarks,
            passingMarks: sub.passingMarks,
            isActive: true
          }
        });
        createdCount++;
      }
    }

    res.status(200).json(new ApiResponse(true, `Successfully seeded ${createdCount} standard curriculum subjects.`));
  } catch (error) {
    next(error);
  }
};


