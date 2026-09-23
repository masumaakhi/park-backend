import { Request, Response, NextFunction } from 'express';
import { PrismaClient, MarksEntryStatus, ExamStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

// Helper to verify teacher has access to an exam and examSubject
async function verifyTeacherExamSubjectAccess(userId: string, examId: string, examSubjectId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) throw new AppError('Teacher not found', 404);

  const examSubject = await prisma.examSubject.findFirst({
    where: { id: examSubjectId, examId },
    include: {
      exam: {
        include: {
          classSection: true,
          classLevel: true,
          academicSession: true,
          examType: true
        }
      },
      subject: true
    }
  });

  if (!examSubject) throw new AppError('Exam subject not found', 404);

  // Check if teacher is assigned to this subject in this class section
  const assignment = await prisma.teacherSubjectAssignment.findFirst({
    where: {
      teacherId: teacher.id,
      subjectId: examSubject.subjectId,
      classSectionId: examSubject.exam.classSectionId,
      isActive: true
    }
  });

  if (!assignment) {
    throw new AppError('You are not assigned to teach this subject for this class section', 403);
  }

  return { teacher, examSubject };
}

export const getTeacherExams = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true }
    });

    const classSectionIds = assignments.map(a => a.classSectionId);
    const subjectIds = assignments.map(a => a.subjectId);

    const exams = await prisma.exam.findMany({
      where: {
        status: { in: [ExamStatus.OPEN, ExamStatus.CLOSED, ExamStatus.PUBLISHED] },
        classSectionId: { in: classSectionIds },
        subjects: { some: { subjectId: { in: subjectIds } } }
      },
      include: {
        examType: true,
        classLevel: true,
        classSection: true,
        academicSession: true,
        subjects: {
          where: { subjectId: { in: subjectIds } },
          include: {
            subject: true,
            _count: { select: { marks: true } }
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });

    res.status(200).json(new ApiResponse(true, 'Exams fetched successfully', { exams }));
  } catch (error) {
    next(error);
  }
};

export const getTeacherExamById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const examId = req.params.examId as string;

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true }
    });
    const subjectIds = assignments.map(a => a.subjectId);

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        classSectionId: { in: assignments.map(a => a.classSectionId) }
      },
      include: {
        examType: true,
        classLevel: true,
        classSection: true,
        academicSession: true,
        subjects: {
          where: { subjectId: { in: subjectIds } },
          include: {
            subject: true,
            _count: { select: { marks: true } }
          }
        }
      }
    });

    if (!exam) throw new AppError('Exam not found or access denied', 404);

    res.status(200).json(new ApiResponse(true, 'Exam fetched successfully', { exam }));
  } catch (error) {
    next(error);
  }
};

export const getExamSubjectStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { examId, examSubjectId } = req.params;

    const { examSubject } = await verifyTeacherExamSubjectAccess(userId, examId as string, examSubjectId as string);

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: examSubject.exam.classSectionId,
        isCurrent: true,
        status: 'ACTIVE'
      },
      include: {
        student: {
          include: { user: { select: { name: true, email: true } } }
        }
      },
      orderBy: { rollNumber: 'asc' }
    });

    res.status(200).json(new ApiResponse(true, 'Students fetched', {
      examSubject,
      students: enrollments.map(e => ({
        studentId: e.student.id,
        customStudentId: e.student.studentId,
        rollNumber: e.rollNumber,
        name: e.student.user.name,
        email: e.student.user.email
      }))
    }));
  } catch (error) {
    next(error);
  }
};

export const getExamSubjectMarks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { examId, examSubjectId } = req.params;

    const { examSubject } = await verifyTeacherExamSubjectAccess(userId, examId as string, examSubjectId as string);

    const marks = await prisma.studentMark.findMany({
      where: { examSubjectId: examSubjectId as string },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
            academicEnrollments: { where: { isCurrent: true }, take: 1 }
          }
        }
      },
      orderBy: { student: { studentId: 'asc' } }
    });

    res.status(200).json(new ApiResponse(true, 'Marks fetched', { examSubject, marks }));
  } catch (error) {
    next(error);
  }
};

export const saveExamSubjectMarks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { examId, examSubjectId } = req.params;
    const { marks } = req.body; // Array of { studentId, marksObtained, isAbsent, remarks }

    const { teacher, examSubject } = await verifyTeacherExamSubjectAccess(userId, examId as string, examSubjectId as string);

    if (!Array.isArray(marks)) {
      throw new AppError('Marks must be an array of student records', 400);
    }

    const maxMarks = examSubject.fullMarks || 100;

    // Check if any mark is already submitted and locked
    const existingSubmitted = await prisma.studentMark.findFirst({
      where: {
        examSubjectId: examSubjectId as string,
        status: MarksEntryStatus.SUBMITTED
      }
    });

    if (existingSubmitted) {
      throw new AppError('Marks for this subject have already been submitted. Contact admin to reopen.', 400);
    }

    // Upsert marks in transaction
    await prisma.$transaction(
      marks.map((m: any) => {
        const mRaw = m.monthlyTestMarks !== undefined && m.monthlyTestMarks !== null && m.monthlyTestMarks !== "" ? Number(m.monthlyTestMarks) : null;
        const tRaw = m.termEndMarks !== undefined && m.termEndMarks !== null && m.termEndMarks !== "" ? Number(m.termEndMarks) : null;

        let obtained: number;
        if (m.isAbsent) {
          obtained = 0;
        } else if (mRaw !== null && tRaw !== null) {
          const m25 = mRaw > 25 ? mRaw * 0.25 : mRaw;
          const t75 = tRaw > 75 ? tRaw * 0.75 : tRaw;
          obtained = Math.round((m25 + t75) * 10) / 10;
        } else {
          obtained = Math.min(Math.max(0, Number(m.marksObtained || 0)), maxMarks);
        }

        return prisma.studentMark.upsert({
          where: {
            examSubjectId_studentId: {
              examSubjectId: examSubjectId as string,
              studentId: m.studentId
            }
          },
          update: {
            monthlyTestMarks: mRaw,
            termEndMarks: tRaw,
            marksObtained: obtained,
            isAbsent: Boolean(m.isAbsent),
            remarks: m.remarks || null,
            enteredByTeacherId: teacher.id,
            status: MarksEntryStatus.DRAFT,
            enteredAt: new Date()
          },
          create: {
            examSubjectId: examSubjectId as string,
            studentId: m.studentId,
            monthlyTestMarks: mRaw,
            termEndMarks: tRaw,
            marksObtained: obtained,
            isAbsent: Boolean(m.isAbsent),
            remarks: m.remarks || null,
            enteredByTeacherId: teacher.id,
            status: MarksEntryStatus.DRAFT,
            enteredAt: new Date()
          }
        });
      })
    );

    res.status(200).json(new ApiResponse(true, 'Marks draft saved successfully'));
  } catch (error) {
    next(error);
  }
};

export const submitExamSubjectMarks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { examId, examSubjectId } = req.params;

    const { teacher } = await verifyTeacherExamSubjectAccess(userId, examId as string, examSubjectId as string);

    // Update all draft marks for this subject to SUBMITTED
    await prisma.studentMark.updateMany({
      where: {
        examSubjectId: examSubjectId as string,
        enteredByTeacherId: teacher.id
      },
      data: { status: MarksEntryStatus.SUBMITTED }
    });

    res.status(200).json(new ApiResponse(true, 'Marks submitted successfully and locked for grading'));
  } catch (error) {
    next(error);
  }
};
