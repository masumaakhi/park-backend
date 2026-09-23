import { Request, Response, NextFunction } from 'express';
import {
  PrismaClient,
  DayOfWeek,
  NoticeAudience,
  AttendanceStatus,
  ExamStatus,
  MarksEntryStatus,
  AssignmentStatus,
  SubmissionStatus
} from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import bcrypt from 'bcrypt';
import { generateComprehensiveMarksheet } from '../admin/marksheet-engine.service';
import { generateDigitalIdPdfBuffer } from '../digital-ids/pdf-template';

const prisma = new PrismaClient();

const DAYS_MAP: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY
];

// Helper to get authenticated student with current enrollment
async function getAuthenticatedStudent(userId?: string) {
  if (!userId) throw new AppError('Unauthorized', 401);

  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
      academicEnrollments: {
        where: { isCurrent: true, status: 'ACTIVE' },
        include: {
          classLevel: true,
          classSection: true,
          academicSession: true
        },
        take: 1
      }
    }
  });

  if (!student) {
    throw new AppError('Student profile not found', 404);
  }

  const currentEnrollment = student.academicEnrollments[0];
  return { student, currentEnrollment };
}

// 1. Dashboard
export const getStudentDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const todayDayOfWeek = DAYS_MAP[new Date().getDay()];

    const classSectionId = currentEnrollment?.classSectionId;

    // Today's Routine
    let todayRoutine: any[] = [];
    if (classSectionId) {
      todayRoutine = await prisma.routine.findMany({
        where: {
          classSectionId,
          dayOfWeek: todayDayOfWeek,
          isActive: true
        },
        include: {
          room: true,
          teacherSubjectAssignment: {
            include: {
              subject: true,
              teacher: { include: { user: { select: { name: true } } } }
            }
          }
        },
        orderBy: { startTime: 'asc' }
      });
    }

    // Attendance, Homework & Dress Up Stats
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: { studentId: student.id }
    });

    const totalSessions = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(r => r.status === AttendanceStatus.PRESENT).length;
    const absentCount = attendanceRecords.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const lateCount = attendanceRecords.filter(r => r.status === AttendanceStatus.LATE).length;
    const excusedCount = attendanceRecords.filter(r => r.status === AttendanceStatus.EXCUSED).length;
    const attended = presentCount + lateCount + excusedCount;
    const attendancePercentage = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 100;

    let homeworkCompleted = 0;
    let dressupScoreTotal = 0;
    for (const r of attendanceRecords) {
      let hasHomework = true;
      let dressup = 'PERFECT';
      if (r.remarks) {
        try {
          const parsed = JSON.parse(r.remarks);
          if (typeof parsed.hasHomework === 'boolean') hasHomework = parsed.hasHomework;
          if (parsed.dressup) dressup = parsed.dressup;
        } catch {}
      }
      if (hasHomework) homeworkCompleted++;
      if (dressup === 'PERFECT') dressupScoreTotal += 1.0;
      else if (dressup === 'MODERATE') dressupScoreTotal += 0.6;
      else if (dressup === 'IMPROPER') dressupScoreTotal += 0.0;
      else dressupScoreTotal += 1.0;
    }
    const homeworkPercentage = totalSessions > 0 ? Math.round((homeworkCompleted / totalSessions) * 100) : 100;
    const dressupPercentage = totalSessions > 0 ? Math.round((dressupScoreTotal / totalSessions) * 100) : 100;

    // Latest Published Result
    let latestResult: any = null;
    if (classSectionId) {
      const publishedExam = await prisma.exam.findFirst({
        where: {
          classSectionId,
          isPublished: true,
          status: ExamStatus.PUBLISHED
        },
        include: {
          examType: true,
          subjects: {
            include: {
              subject: true,
              marks: { where: { studentId: student.id } }
            }
          }
        },
        orderBy: { endDate: 'desc' }
      });

      if (publishedExam) {
        let totalObtained = 0;
        let totalFull = 0;
        let allPassed = true;

        const subjectMarks = publishedExam.subjects.map(es => {
          const mark = es.marks[0];
          const obtained = mark ? (mark.isAbsent ? 0 : mark.marksObtained || 0) : 0;
          const passed = !mark?.isAbsent && obtained >= (es.passMarks || 40);
          if (!passed) allPassed = false;
          totalObtained += obtained;
          totalFull += es.fullMarks || 100;

          return {
            subject: es.subject.name,
            obtained,
            fullMarks: es.fullMarks,
            passMarks: es.passMarks,
            passed,
            isAbsent: Boolean(mark?.isAbsent)
          };
        });

        const percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 100) : 0;
        let grade = 'F';
        if (percentage >= 80) grade = 'A+';
        else if (percentage >= 70) grade = 'A';
        else if (percentage >= 60) grade = 'A-';
        else if (percentage >= 50) grade = 'B';
        else if (percentage >= 40) grade = 'C';
        else if (percentage >= 33) grade = 'D';

        latestResult = {
          examId: publishedExam.id,
          title: publishedExam.title,
          examType: publishedExam.examType.name,
          totalObtained,
          totalFull,
          percentage,
          grade: allPassed ? grade : 'F',
          isPassed: allPassed,
          subjectMarks
        };
      }
    }

    // Pending Assignments count
    let pendingAssignmentsCount = 0;
    if (classSectionId) {
      const publishedAssignments = await prisma.classAssignment.findMany({
        where: {
          status: AssignmentStatus.PUBLISHED,
          teacherSubjectAssignment: { classSectionId }
        },
        include: {
          submissions: { where: { studentId: student.id } }
        }
      });

      pendingAssignmentsCount = publishedAssignments.filter(
        a => a.submissions.length === 0 || a.submissions[0].status === SubmissionStatus.SUBMITTED
      ).length;
    }

    // Digital ID
    const digitalId = await prisma.studentDigitalId.findFirst({
      where: { studentId: student.id, isActive: true },
      select: { cardNumber: true, isActive: true, expiryDate: true, verificationToken: true }
    });

    // Recent Notices
    const recentNotices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
        targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.STUDENTS] },
        AND: [
          { OR: [{ classLevelId: null }, { classLevelId: currentEnrollment?.classLevelId }] },
          { OR: [{ classSectionId: null }, { classSectionId: currentEnrollment?.classSectionId }] }
        ]
      },
      orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
      take: 4
    });

    res.status(200).json(new ApiResponse(true, 'Student dashboard fetched', {
      student: {
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        studentId: student.studentId,
        profileImage: student.profileImage,
        phone: student.phone,
        rollNumber: currentEnrollment?.rollNumber || null,
        classLevel: currentEnrollment?.classLevel?.name || 'Unassigned',
        classSection: currentEnrollment?.classSection?.name || 'Unassigned',
        academicSession: currentEnrollment?.academicSession?.name || '2026'
      },
      todayRoutine,
      attendanceStats: {
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendancePercentage,
        homeworkPercentage,
        homeworkCompleted,
        dressupPercentage
      },
      latestResult,
      pendingAssignmentsCount,
      digitalId,
      recentNotices
    }));
  } catch (error) {
    next(error);
  }
};

// 2. Profile
export const getStudentProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);

    const digitalId = await prisma.studentDigitalId.findFirst({
      where: {
        studentId: student.id,
        isActive: true,
      },
    });

    res.status(200).json(new ApiResponse(true, 'Student profile fetched', {
      profile: {
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        studentId: student.studentId,
        phone: student.phone,
        address: student.address,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        guardianRelation: student.guardianRelation,
        emergencyContact: student.emergencyContact,
        profileImage: student.profileImage,
        rollNumber: currentEnrollment?.rollNumber || null,
        classLevel: currentEnrollment?.classLevel?.name || null,
        classSection: currentEnrollment?.classSection?.name || null,
        academicSession: currentEnrollment?.academicSession?.name || null,
        createdAt: student.createdAt,
        digitalId: digitalId
          ? {
              id: digitalId.id,
              cardNumber: digitalId.cardNumber,
              verificationToken: digitalId.verificationToken,
              issueDate: digitalId.issueDate,
              expiryDate: digitalId.expiryDate,
            }
          : null,
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const updateStudentProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student } = await getAuthenticatedStudent(req.user?.id);
    const { phone, address, guardianPhone, emergencyContact, profileImage } = req.body;

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: {
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(guardianPhone !== undefined && { guardianPhone: guardianPhone?.trim() || null }),
        ...(emergencyContact !== undefined && { emergencyContact: emergencyContact?.trim() || null }),
        ...(profileImage !== undefined && { profileImage: profileImage?.trim() || null })
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Profile updated successfully', { profile: updated }));
  } catch (error) {
    next(error);
  }
};

// 3. Academic Information & History
export const getStudentAcademicInformation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);

    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment found', { enrollment: null, subjects: [] }));
      return;
    }

    // Get subjects for this class section with assigned teachers
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: {
        classSectionId: currentEnrollment.classSectionId,
        isActive: true
      },
      include: {
        subject: true,
        teacher: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Academic information fetched', {
      enrollment: {
        id: currentEnrollment.id,
        rollNumber: currentEnrollment.rollNumber,
        status: currentEnrollment.status,
        startDate: currentEnrollment.startDate,
        classLevel: currentEnrollment.classLevel.name,
        classSection: currentEnrollment.classSection.name,
        academicSession: currentEnrollment.academicSession.name
      },
      subjects: assignments.map(a => ({
        id: a.subject.id,
        name: a.subject.name,
        code: a.subject.code,
        fullMarks: a.subject.fullMarks,
        passingMarks: a.subject.passingMarks,
        teacherName: a.teacher.user.name,
        teacherDesignation: a.teacher.designation || 'Teacher'
      }))
    }));
  } catch (error) {
    next(error);
  }
};

export const getStudentAcademicHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student } = await getAuthenticatedStudent(req.user?.id);

    const allEnrollments = await prisma.studentEnrollment.findMany({
      where: { studentId: student.id },
      include: {
        classLevel: true,
        classSection: true,
        academicSession: true,
        promotionsFrom: true,
        promotionsTo: true
      },
      orderBy: { academicSession: { startDate: 'desc' } }
    });

    res.status(200).json(new ApiResponse(true, 'Academic history fetched', {
      history: allEnrollments.map(e => ({
        id: e.id,
        session: e.academicSession.name,
        classLevel: e.classLevel.name,
        classSection: e.classSection.name,
        rollNumber: e.rollNumber,
        status: e.status,
        isCurrent: e.isCurrent,
        startDate: e.startDate,
        endDate: e.endDate
      }))
    }));
  } catch (error) {
    next(error);
  }
};

// 4. Routine
export const getStudentRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment', { routines: [] }));
      return;
    }

    const routines = await prisma.routine.findMany({
      where: {
        classSectionId: currentEnrollment.classSectionId,
        isActive: true
      },
      include: {
        room: true,
        teacherSubjectAssignment: {
          include: {
            subject: true,
            teacher: { include: { user: { select: { name: true } } } }
          }
        }
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });

    res.status(200).json(new ApiResponse(true, 'Routine fetched', { 
      routines,
      classLevel: currentEnrollment.classLevel?.name || '',
      classSection: currentEnrollment.classSection?.name || '',
      session: currentEnrollment.academicSession?.name || ''
    }));
  } catch (error) {
    next(error);
  }
};

export const getStudentTodayRoutine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment', { routines: [] }));
      return;
    }

    const todayDayOfWeek = DAYS_MAP[new Date().getDay()];

    const routines = await prisma.routine.findMany({
      where: {
        classSectionId: currentEnrollment.classSectionId,
        dayOfWeek: todayDayOfWeek,
        isActive: true
      },
      include: {
        room: true,
        teacherSubjectAssignment: {
          include: {
            subject: true,
            teacher: { include: { user: { select: { name: true } } } }
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.status(200).json(new ApiResponse(true, 'Today routine fetched', { routines, dayOfWeek: todayDayOfWeek }));
  } catch (error) {
    next(error);
  }
};

// 5. Attendance
export const getStudentAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student } = await getAuthenticatedStudent(req.user?.id);

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: student.id },
      include: {
        attendanceSession: {
          include: {
            teacherSubjectAssignment: { include: { subject: true } }
          }
        }
      },
      orderBy: { attendanceSession: { attendanceDate: 'desc' } }
    });

    const totalSessions = records.length;
    const presentCount = records.filter(r => r.status === AttendanceStatus.PRESENT).length;
    const absentCount = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const lateCount = records.filter(r => r.status === AttendanceStatus.LATE).length;
    const excusedCount = records.filter(r => r.status === AttendanceStatus.EXCUSED).length;
    const attended = presentCount + lateCount + excusedCount;
    const percentage = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 100;

    let homeworkCompleted = 0;
    let dressupScoreTotal = 0;

    const history = records.map(r => {
      let hasHomework = true;
      let dressup = 'PERFECT';
      if (r.remarks) {
        try {
          const parsed = JSON.parse(r.remarks);
          if (typeof parsed.hasHomework === 'boolean') hasHomework = parsed.hasHomework;
          if (parsed.dressup) dressup = parsed.dressup;
        } catch {
          // not json
        }
      }

      if (hasHomework) homeworkCompleted++;
      if (dressup === 'PERFECT') dressupScoreTotal += 1.0;
      else if (dressup === 'MODERATE') dressupScoreTotal += 0.6;
      else if (dressup === 'IMPROPER') dressupScoreTotal += 0.0;
      else dressupScoreTotal += 1.0;

      return {
        id: r.id,
        date: r.attendanceSession.attendanceDate,
        subject: r.attendanceSession.teacherSubjectAssignment.subject.name,
        status: r.status,
        hasHomework,
        dressup,
        remarks: r.remarks
      };
    });

    const homeworkPercentage = totalSessions > 0 ? Math.round((homeworkCompleted / totalSessions) * 100) : 100;
    const dressupPercentage = totalSessions > 0 ? Math.round((dressupScoreTotal / totalSessions) * 100) : 100;

    res.status(200).json(new ApiResponse(true, 'Attendance summary fetched', {
      summary: {
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        percentage,
        attendancePercentage: percentage,
        homeworkPercentage,
        homeworkCompleted,
        dressupPercentage
      },
      history
    }));
  } catch (error) {
    next(error);
  }
};

// 6. Results & Marks
export const getStudentResults = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment', { results: [] }));
      return;
    }

    const exams = await prisma.exam.findMany({
      where: {
        classSectionId: currentEnrollment.classSectionId,
        isPublished: true,
        status: ExamStatus.PUBLISHED
      },
      include: {
        examType: true,
        classLevel: true,
        classSection: true,
        academicSession: true,
        subjects: {
          include: {
            subject: true,
            marks: { where: { studentId: student.id } }
          }
        }
      },
      orderBy: { endDate: 'desc' }
    });

    const results = exams.map(exam => {
      let totalObtained = 0;
      let totalFullMarks = 0;
      let allPassed = true;

      const subjectMarks = exam.subjects.map(es => {
        const mark = es.marks[0];
        const obtained = mark ? (mark.isAbsent ? 0 : mark.marksObtained || 0) : 0;
        const passMarks = es.passMarks || 40;
        const fullMarks = es.fullMarks || 100;
        const isPassed = !mark?.isAbsent && obtained >= passMarks;
        if (!isPassed) allPassed = false;

        totalObtained += obtained;
        totalFullMarks += fullMarks;

        return {
          subjectId: es.subject.id,
          subjectName: es.subject.name,
          subjectCode: es.subject.code,
          fullMarks,
          passMarks,
          marksObtained: obtained,
          isAbsent: Boolean(mark?.isAbsent),
          isPassed,
          remarks: mark?.remarks || null
        };
      });

      const percentage = totalFullMarks > 0 ? Math.round((totalObtained / totalFullMarks) * 100) : 0;
      let grade = 'F';
      let gradePoint = 0.0;
      if (allPassed) {
        if (percentage >= 80) { grade = 'A+'; gradePoint = 5.0; }
        else if (percentage >= 70) { grade = 'A'; gradePoint = 4.0; }
        else if (percentage >= 60) { grade = 'A-'; gradePoint = 3.5; }
        else if (percentage >= 50) { grade = 'B'; gradePoint = 3.0; }
        else if (percentage >= 40) { grade = 'C'; gradePoint = 2.0; }
        else if (percentage >= 33) { grade = 'D'; gradePoint = 1.0; }
      }

      return {
        examId: exam.id,
        examTitle: exam.title,
        examType: exam.examType.name,
        academicSession: exam.academicSession.name,
        classLevel: exam.classLevel.name,
        classSection: exam.classSection.name,
        startDate: exam.startDate,
        endDate: exam.endDate,
        totalObtained,
        totalFullMarks,
        percentage,
        grade,
        gradePoint,
        isPassed: allPassed,
        publishedDate: exam.updatedAt,
        subjects: subjectMarks
      };
    });

    res.status(200).json(new ApiResponse(true, 'Results fetched', { results }));
  } catch (error) {
    next(error);
  }
};

export const getStudentResultById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { examId } = req.params;

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId as string,
        classSectionId: currentEnrollment?.classSectionId,
        isPublished: true,
        status: ExamStatus.PUBLISHED
      },
      include: {
        examType: true,
        classLevel: true,
        classSection: true,
        academicSession: true,
        subjects: {
          include: {
            subject: true,
            marks: { where: { studentId: student.id } }
          }
        }
      }
    });

    if (!exam) throw new AppError('Exam result not published or access denied', 404);

    let totalObtained = 0;
    let totalFullMarks = 0;
    let allPassed = true;

    const subjects = exam.subjects.map(es => {
      const mark = es.marks[0];
      const obtained = mark ? (mark.isAbsent ? 0 : mark.marksObtained || 0) : 0;
      const passMarks = es.passMarks || 40;
      const fullMarks = es.fullMarks || 100;
      const isPassed = !mark?.isAbsent && obtained >= passMarks;
      if (!isPassed) allPassed = false;

      totalObtained += obtained;
      totalFullMarks += fullMarks;

      return {
        subjectName: es.subject.name,
        subjectCode: es.subject.code,
        fullMarks,
        passMarks,
        marksObtained: obtained,
        isAbsent: Boolean(mark?.isAbsent),
        isPassed,
        remarks: mark?.remarks || null
      };
    });

    const percentage = totalFullMarks > 0 ? Math.round((totalObtained / totalFullMarks) * 100) : 0;
    let grade = 'F';
    let gradePoint = 0.0;
    if (allPassed) {
      if (percentage >= 80) { grade = 'A+'; gradePoint = 5.0; }
      else if (percentage >= 70) { grade = 'A'; gradePoint = 4.0; }
      else if (percentage >= 60) { grade = 'A-'; gradePoint = 3.5; }
      else if (percentage >= 50) { grade = 'B'; gradePoint = 3.0; }
      else if (percentage >= 40) { grade = 'C'; gradePoint = 2.0; }
      else if (percentage >= 33) { grade = 'D'; gradePoint = 1.0; }
    }

    res.status(200).json(new ApiResponse(true, 'Exam result fetched', {
      result: {
        examId: exam.id,
        examTitle: exam.title,
        examType: exam.examType.name,
        academicSession: exam.academicSession.name,
        classLevel: exam.classLevel.name,
        classSection: exam.classSection.name,
        startDate: exam.startDate,
        endDate: exam.endDate,
        totalObtained,
        totalFullMarks,
        percentage,
        grade,
        gradePoint,
        isPassed: allPassed,
        subjects
      }
    }));
  } catch (error) {
    next(error);
  }
};

// 7. Marksheets
export const getStudentMarksheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student } = await getAuthenticatedStudent(req.user?.id);

    const marksheets = await prisma.marksheet.findMany({
      where: {
        studentId: student.id,
        isActive: true,
        exam: { isPublished: true, status: ExamStatus.PUBLISHED }
      },
      include: {
        exam: {
          include: {
            examType: true,
            academicSession: true,
            classLevel: true,
            classSection: true
          }
        }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.status(200).json(new ApiResponse(true, 'Marksheets fetched', { marksheets }));
  } catch (error) {
    next(error);
  }
};

export const getStudentComprehensiveMarksheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student } = await getAuthenticatedStudent(req.user?.id);
    const data = await generateComprehensiveMarksheet(student.id);

    if (!data) {
      throw new AppError('Comprehensive marksheet not found or not yet generated', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Comprehensive marksheet fetched', { marksheet: data }));
  } catch (error) {
    next(error);
  }
};

export const getStudentMarksheetByExamId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { examId } = req.params;

    const marksheet = await prisma.marksheet.findFirst({
      where: {
        studentId: student.id,
        examId: examId as string,
        isActive: true
      },
      include: {
        exam: {
          include: {
            examType: true,
            academicSession: true,
            classLevel: true,
            classSection: true,
            subjects: {
              include: {
                subject: true,
                marks: { where: { studentId: student.id } }
              }
            }
          }
        }
      }
    });

    if (!marksheet || !marksheet.exam) {
      throw new AppError('Marksheet or exam not found', 404);
    }

    let totalObtained = 0;
    let totalFullMarks = 0;
    let allPassed = true;

    const subjects = marksheet.exam.subjects.map(es => {
      const mark = es.marks[0];
      const obtained = mark ? (mark.isAbsent ? 0 : mark.marksObtained || 0) : 0;
      const passMarks = es.passMarks || 40;
      const fullMarks = es.fullMarks || 100;
      const isPassed = !mark?.isAbsent && obtained >= passMarks;
      if (!isPassed) allPassed = false;

      totalObtained += obtained;
      totalFullMarks += fullMarks;

      return {
        subjectName: es.subject.name,
        subjectCode: es.subject.code,
        fullMarks,
        passMarks,
        marksObtained: obtained,
        isAbsent: Boolean(mark?.isAbsent),
        isPassed
      };
    });

    const percentage = totalFullMarks > 0 ? Math.round((totalObtained / totalFullMarks) * 100) : 0;
    let grade = 'F';
    let gradePoint = 0.0;
    if (allPassed) {
      if (percentage >= 80) { grade = 'A+'; gradePoint = 5.0; }
      else if (percentage >= 70) { grade = 'A'; gradePoint = 4.0; }
      else if (percentage >= 60) { grade = 'A-'; gradePoint = 3.5; }
      else if (percentage >= 50) { grade = 'B'; gradePoint = 3.0; }
      else if (percentage >= 40) { grade = 'C'; gradePoint = 2.0; }
      else if (percentage >= 33) { grade = 'D'; gradePoint = 1.0; }
    }

    res.status(200).json(new ApiResponse(true, 'Marksheet fetched', {
      marksheet: {
        id: marksheet.id,
        marksheetNumber: marksheet.marksheetNumber,
        verificationToken: marksheet.verificationToken,
        issuedAt: marksheet.issuedAt,
        studentName: student.user.name,
        studentId: student.studentId,
        rollNumber: currentEnrollment?.rollNumber,
        classLevel: marksheet.exam.classLevel.name,
        classSection: marksheet.exam.classSection.name,
        academicSession: marksheet.exam.academicSession.name,
        examTitle: marksheet.exam.title,
        examType: marksheet.exam.examType.name,
        subjects,
        totalObtained,
        totalFullMarks,
        percentage,
        grade,
        gradePoint,
        isPassed: allPassed
      }
    }));
  } catch (error) {
    next(error);
  }
};

// 8. Assignments / Classwork
export const getStudentAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment', { assignments: [] }));
      return;
    }

    const assignments = await prisma.classAssignment.findMany({
      where: {
        status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
        teacherSubjectAssignment: { classSectionId: currentEnrollment.classSectionId }
      },
      include: {
        teacherSubjectAssignment: {
          include: {
            subject: true,
            teacher: { include: { user: { select: { name: true } } } }
          }
        },
        submissions: {
          where: { studentId: student.id }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    const mapped = assignments.map(a => {
      const submission = a.submissions[0] || null;
      return {
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        totalMarks: a.totalMarks,
        passMarks: a.passMarks,
        dueDate: a.dueDate,
        allowLate: a.allowLate,
        status: a.status,
        subject: a.teacherSubjectAssignment.subject.name,
        teacherName: a.teacherSubjectAssignment.teacher.user.name,
        hasSubmitted: Boolean(submission),
        submissionStatus: submission?.status || 'NOT_SUBMITTED',
        submittedAt: submission?.submittedAt || null,
        marksObtained: submission?.marksObtained ?? null,
        feedback: submission?.feedback || null
      };
    });

    res.status(200).json(new ApiResponse(true, 'Assignments fetched', { assignments: mapped }));
  } catch (error) {
    next(error);
  }
};

export const getStudentAssignmentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { id } = req.params;

    const assignment = await prisma.classAssignment.findFirst({
      where: {
        id: id as string,
        teacherSubjectAssignment: { classSectionId: currentEnrollment?.classSectionId }
      },
      include: {
        teacherSubjectAssignment: {
          include: {
            subject: true,
            teacher: { include: { user: { select: { name: true } } } }
          }
        },
        submissions: {
          where: { studentId: student.id }
        }
      }
    });

    if (!assignment) throw new AppError('Assignment not found or not allocated to your class', 404);

    const submission = assignment.submissions[0] || null;

    res.status(200).json(new ApiResponse(true, 'Assignment fetched', {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        instructions: assignment.instructions,
        totalMarks: assignment.totalMarks,
        passMarks: assignment.passMarks,
        dueDate: assignment.dueDate,
        allowLate: assignment.allowLate,
        status: assignment.status,
        subject: assignment.teacherSubjectAssignment.subject.name,
        teacherName: assignment.teacherSubjectAssignment.teacher.user.name,
        submission
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const submitStudentAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { id } = req.params;
    const { content, attachmentUrl } = req.body;

    const assignment = await prisma.classAssignment.findFirst({
      where: {
        id: id as string,
        teacherSubjectAssignment: { classSectionId: currentEnrollment?.classSectionId }
      }
    });

    if (!assignment) throw new AppError('Assignment not found', 404);

    if (assignment.status === AssignmentStatus.CLOSED || assignment.status === AssignmentStatus.ARCHIVED) {
      throw new AppError('Assignment is closed for submissions', 400);
    }

    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);
    if (isLate && !assignment.allowLate) {
      throw new AppError('Submission deadline has passed and late submissions are not allowed', 400);
    }

    const submission = await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment.id,
          studentId: student.id
        }
      },
      update: {
        content: content || null,
        attachmentUrl: attachmentUrl || null,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
        submittedAt: now
      },
      create: {
        assignmentId: assignment.id,
        studentId: student.id,
        content: content || null,
        attachmentUrl: attachmentUrl || null,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
        submittedAt: now
      }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment submitted successfully', { submission }));
  } catch (error) {
    next(error);
  }
};

// 9. Notices
export const getStudentNotices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);

    const now = new Date();
    const notices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.STUDENTS] } },
          { OR: [{ classLevelId: null }, { classLevelId: currentEnrollment?.classLevelId }] },
          { OR: [{ classSectionId: null }, { classSectionId: currentEnrollment?.classSectionId }] }
        ]
      },
      orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }]
    });

    res.status(200).json(new ApiResponse(true, 'Notices fetched', { notices }));
  } catch (error) {
    next(error);
  }
};

export const getStudentNoticeBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { slug } = req.params;
    const now = new Date();

    const notice = await prisma.notice.findFirst({
      where: {
        slug: slug as string,
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.STUDENTS] } },
          { OR: [{ classLevelId: null }, { classLevelId: currentEnrollment?.classLevelId }] },
          { OR: [{ classSectionId: null }, { classSectionId: currentEnrollment?.classSectionId }] }
        ]
      }
    });

    if (!notice) throw new AppError('Notice not found or access denied', 404);

    res.status(200).json(new ApiResponse(true, 'Notice details fetched', { notice }));
  } catch (error) {
    next(error);
  }
};

// 10. Digital ID
export const getStudentDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);

    const digitalId = await prisma.studentDigitalId.findFirst({
      where: {
        studentId: student.id,
        isActive: true
      }
    });

    if (!digitalId) {
      throw new AppError('Active digital ID not found for this student', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Digital ID fetched', {
      digitalId: {
        id: digitalId.id,
        cardNumber: digitalId.cardNumber,
        verificationToken: digitalId.verificationToken,
        issueDate: digitalId.issueDate,
        expiryDate: digitalId.expiryDate,
        studentName: student.user.name,
        studentId: student.studentId,
        rollNumber: currentEnrollment?.rollNumber || null,
        classLevel: currentEnrollment?.classLevel?.name || null,
        classSection: currentEnrollment?.classSection?.name || null,
        academicSession: currentEnrollment?.academicSession?.name || null,
        profileImage: student.profileImage,
        guardianPhone: student.guardianPhone || student.phone || "+880 17 0000 0000",
        guardianName: student.guardianName || null,
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const downloadMyDigitalIdPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { student, currentEnrollment } = await getAuthenticatedStudent(req.user?.id);

    const digitalId = await prisma.studentDigitalId.findFirst({
      where: {
        studentId: student.id,
        isActive: true,
      },
    });

    if (!digitalId) {
      throw new AppError('Active digital ID not found for this student', 404);
    }

    const verificationBaseUrl =
      process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

    const pdfBuffer = await generateDigitalIdPdfBuffer({
      studentName: student.user.name,
      studentId: student.studentId,
      className: currentEnrollment?.classLevel?.name || 'Class 5',
      sectionName: currentEnrollment?.classSection?.name || 'A',
      sessionName: currentEnrollment?.academicSession?.name || '2026',
      rollNumber: currentEnrollment?.rollNumber || student.rollNumber || '01',
      guardianPhone: student.guardianPhone || student.phone || '+880 17 0000 0000',
      cardNumber: digitalId.cardNumber,
      issueDate: new Date(digitalId.issueDate).toLocaleDateString('en-GB'),
      expiryDate: new Date(digitalId.expiryDate).toLocaleDateString('en-GB'),
      photoUrl: student.profileImage || undefined,
      verificationToken: digitalId.verificationToken,
      verificationBaseUrl,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="student-id-${encodeURIComponent(student.studentId)}.pdf"`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store');
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// 11. Teachers for own class
export const getStudentTeachers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    if (!currentEnrollment) {
      res.status(200).json(new ApiResponse(true, 'No active enrollment', { teachers: [] }));
      return;
    }

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: {
        classSectionId: currentEnrollment.classSectionId,
        isActive: true
      },
      include: {
        subject: true,
        teacher: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    });

    const teachersMap = new Map();
    for (const a of assignments) {
      const t = a.teacher;
      if (!teachersMap.has(t.id)) {
        teachersMap.set(t.id, {
          id: t.id,
          name: t.user.name,
          email: t.user.email,
          designation: t.designation || 'Faculty Member',
          profileImage: t.profileImage,
          subjects: [a.subject.name]
        });
      } else {
        const existing = teachersMap.get(t.id);
        existing.subjects.push(a.subject.name);
      }
    }

    res.status(200).json(new ApiResponse(true, 'Teachers fetched', {
      teachers: Array.from(teachersMap.values())
    }));
  } catch (error) {
    next(error);
  }
};

export const getStudentTeacherById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentEnrollment } = await getAuthenticatedStudent(req.user?.id);
    const { teacherId } = req.params;

    const assignment = await prisma.teacherSubjectAssignment.findFirst({
      where: {
        teacherId: teacherId as string,
        classSectionId: currentEnrollment?.classSectionId,
        isActive: true
      },
      include: {
        subject: true,
        teacher: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    });

    if (!assignment) throw new AppError('Teacher not found or not assigned to your class', 404);

    res.status(200).json(new ApiResponse(true, 'Teacher details fetched', {
      teacher: {
        id: assignment.teacher.id,
        name: assignment.teacher.user.name,
        email: assignment.teacher.user.email,
        designation: assignment.teacher.designation || 'Faculty Member',
        profileImage: assignment.teacher.profileImage,
        subject: assignment.subject.name
      }
    }));
  } catch (error) {
    next(error);
  }
};
