import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getResults = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { examId, search } = req.query;

    // Fetch exams list for selector
    const exams = await prisma.exam.findMany({
      include: {
        examType: { select: { name: true } },
        classLevel: { select: { name: true } },
        classSection: { select: { name: true } },
        academicSession: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Default to the first exam if none specified
    const targetExamId = (typeof examId === 'string' && examId) ? examId : exams[0]?.id;

    if (!targetExamId) {
      return res.status(200).json(new ApiResponse(true, 'No exams found', {
        exams: [],
        results: [],
        summary: { totalAppeared: 0, passCount: 0, failCount: 0, passRate: 0, averagePercentage: 0 }
      }));
    }

    // Get grade scales for letter grade determination
    const gradeScales = await prisma.gradeScale.findMany({
      orderBy: { minPercentage: 'desc' }
    });

    // Get exam subjects
    const examSubjects = await prisma.examSubject.findMany({
      where: { examId: targetExamId },
      include: { subject: true }
    });

    const totalPossibleMarks = examSubjects.reduce((acc, curr) => acc + (curr.fullMarks || (curr as any).totalMarks || 100), 0);

    // Get student marks for this exam
    const studentMarks = await prisma.studentMark.findMany({
      where: {
        examSubject: { examId: targetExamId }
      },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        examSubject: {
          include: { subject: true }
        }
      }
    });

    // Group marks by student
    const studentMap = new Map<string, any>();

    for (const sm of studentMarks) {
      if (!studentMap.has(sm.studentId)) {
        studentMap.set(sm.studentId, {
          studentId: sm.student.studentId,
          studentUuid: sm.studentId,
          name: sm.student.user.name,
          email: sm.student.user.email,
          marks: [],
          totalObtained: 0,
          totalMax: 0,
          isAbsentAny: false
        });
      }

      const sData = studentMap.get(sm.studentId);
      const obtained = sm.isAbsent ? 0 : (sm.marksObtained || 0);
      const maxMarks = (sm.examSubject as any).fullMarks || (sm.examSubject as any).totalMarks || 100;

      sData.marks.push({
        subjectName: sm.examSubject.subject.name,
        subjectCode: sm.examSubject.subject.code,
        marksObtained: sm.isAbsent ? 'Absent' : sm.marksObtained,
        totalMarks: maxMarks,
        passMarks: sm.examSubject.passMarks || 40,
        isAbsent: sm.isAbsent
      });

      sData.totalObtained += obtained;
      sData.totalMax += maxMarks;
      if (sm.isAbsent) sData.isAbsentAny = true;
    }

    // Also include enrolled students who might not have marks entered yet
    const exam = exams.find(e => e.id === targetExamId);
    if (exam && exam.classSectionId) {
      const enrollments = await prisma.studentEnrollment.findMany({
        where: { classSectionId: exam.classSectionId, isCurrent: true },
        include: { student: { include: { user: { select: { name: true, email: true } } } } }
      });

      for (const en of enrollments) {
        if (!studentMap.has(en.studentId)) {
          studentMap.set(en.studentId, {
            studentId: en.student.studentId,
            studentUuid: en.studentId,
            name: en.student.user.name,
            email: en.student.user.email,
            marks: [],
            totalObtained: 0,
            totalMax: totalPossibleMarks || 100,
            isAbsentAny: false
          });
        }
      }
    }

    let results = Array.from(studentMap.values()).map(s => {
      const percentage = s.totalMax > 0 ? (s.totalObtained / s.totalMax) * 100 : 0;
      
      // Determine grade
      let letterGrade = 'F';
      let gradePoint = 0.0;
      for (const gs of gradeScales) {
        if (percentage >= gs.minPercentage && percentage <= gs.maxPercentage) {
          letterGrade = gs.grade;
          gradePoint = (gs as any).gradePoint ?? (gs as any).point ?? 0.0;
          break;
        }
      }

      if (letterGrade === 'F' && percentage >= 80) letterGrade = 'A+';
      else if (letterGrade === 'F' && percentage >= 70) letterGrade = 'A';
      else if (letterGrade === 'F' && percentage >= 60) letterGrade = 'B';
      else if (letterGrade === 'F' && percentage >= 50) letterGrade = 'C';
      else if (letterGrade === 'F' && percentage >= 40) letterGrade = 'D';

      const isPassed = percentage >= 40 && !s.isAbsentAny;

      return {
        ...s,
        percentage: Number(percentage.toFixed(2)),
        letterGrade,
        gradePoint,
        isPassed
      };
    });

    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      results = results.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.studentId.toLowerCase().includes(term)
      );
    }

    const totalAppeared = results.length;
    const passCount = results.filter(r => r.isPassed).length;
    const failCount = totalAppeared - passCount;
    const passRate = totalAppeared > 0 ? Number(((passCount / totalAppeared) * 100).toFixed(1)) : 0;
    const totalScoreSum = results.reduce((acc, curr) => acc + curr.percentage, 0);
    const averagePercentage = totalAppeared > 0 ? Number((totalScoreSum / totalAppeared).toFixed(1)) : 0;

    res.status(200).json(new ApiResponse(true, 'Results calculated successfully', {
      selectedExam: exam,
      exams,
      examSubjects,
      results,
      summary: {
        totalAppeared,
        passCount,
        failCount,
        passRate,
        averagePercentage
      }
    }));
  } catch (error) {
    next(error);
  }
};
