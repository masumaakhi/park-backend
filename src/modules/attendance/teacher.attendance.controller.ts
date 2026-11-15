import { Request, Response, NextFunction } from 'express';
import { PrismaClient, AttendanceSessionStatus, AttendanceStatus, SubmissionStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

// Sync attendance homework status with ClassAssignment submissions
async function syncAttendanceHomeworkWithAssignments(
  teacherSubjectAssignmentId: string,
  attendanceDate: Date,
  records: Array<{ id?: string; studentId?: string; hasHomework?: boolean; status?: string }>
) {
  try {
    const sessionDate = new Date(attendanceDate);
    const assignments = await prisma.classAssignment.findMany({
      where: { teacherSubjectAssignmentId }
    });

    if (assignments.length === 0) return;

    // Filter assignments whose dueDate falls on the same calendar day (UTC or local)
    const matchingAssignments = assignments.filter((a) => {
      const aDate = new Date(a.dueDate);
      const diffMs = Math.abs(aDate.getTime() - sessionDate.getTime());
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= 26) return true;
      const aIso = aDate.toISOString().slice(0, 10);
      const sIso = sessionDate.toISOString().slice(0, 10);
      if (aIso === sIso) return true;
      const aLocal = aDate.toLocaleDateString('en-CA');
      const sLocal = sessionDate.toLocaleDateString('en-CA');
      return aLocal === sLocal;
    });

    if (matchingAssignments.length === 0) return;

    // Resolve studentId for each record
    const resolvedRecords: Array<{ studentId: string; hasHomework: boolean }> = [];
    for (const r of records) {
      let studentId = r.studentId;
      if (!studentId && r.id) {
        const dbRec = await prisma.attendanceRecord.findUnique({
          where: { id: r.id },
          select: { studentId: true }
        });
        if (dbRec) studentId = dbRec.studentId;
      }
      if (studentId) {
        resolvedRecords.push({
          studentId,
          hasHomework: typeof r.hasHomework === 'boolean' ? r.hasHomework : true
        });
      }
    }

    for (const assignment of matchingAssignments) {
      for (const item of resolvedRecords) {
        if (item.hasHomework) {
          await prisma.assignmentSubmission.upsert({
            where: {
              assignmentId_studentId: {
                assignmentId: assignment.id,
                studentId: item.studentId
              }
            },
            update: {
              status: SubmissionStatus.SUBMITTED,
              submittedAt: sessionDate
            },
            create: {
              assignmentId: assignment.id,
              studentId: item.studentId,
              status: SubmissionStatus.SUBMITTED,
              submittedAt: sessionDate,
              content: 'Completed during class attendance check.'
            }
          });
        } else {
          // If homework was unmarked as completed, remove attendance-generated submission if not graded
          const existing = await prisma.assignmentSubmission.findUnique({
            where: {
              assignmentId_studentId: {
                assignmentId: assignment.id,
                studentId: item.studentId
              }
            }
          });
          if (
            existing &&
            existing.status !== SubmissionStatus.GRADED &&
            existing.content?.includes('attendance check')
          ) {
            await prisma.assignmentSubmission.delete({
              where: { id: existing.id }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to sync attendance homework with assignments:', err);
  }
}

const formatRecord = (r: any) => {
  let hasHomework = true;
  let dressup = 'PERFECT';
  if (r.remarks) {
    try {
      const parsed = JSON.parse(r.remarks);
      if (typeof parsed.hasHomework === 'boolean') hasHomework = parsed.hasHomework;
      if (parsed.dressup) dressup = parsed.dressup;
    } catch {
      // not json, keep defaults
    }
  }
  return {
    ...r,
    hasHomework,
    dressup
  };
};

export const getEligibleClasses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: {
        subject: true,
        classSection: {
          include: { classLevel: true }
        },
        academicSession: true
      }
    });

    res.status(200).json(new ApiResponse(true, 'Eligible classes fetched', { assignments }));
  } catch (error) {
    next(error);
  }
};

export const createAttendanceSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const { teacherSubjectAssignmentId, attendanceDate } = req.body;
    if (!teacherSubjectAssignmentId || !attendanceDate) {
      throw new AppError('Assignment ID and attendance date are required', 400);
    }

    const assignment = await prisma.teacherSubjectAssignment.findFirst({
      where: { id: teacherSubjectAssignmentId, teacherId: teacher.id, isActive: true }
    });

    if (!assignment) throw new AppError('Invalid or unauthorized assignment', 400);

    const date = new Date(attendanceDate);
    date.setHours(0, 0, 0, 0); // Normalize date

    const existing = await prisma.attendanceSession.findFirst({
      where: {
        teacherSubjectAssignmentId,
        classSectionId: assignment.classSectionId,
        attendanceDate: date
      }
    });

    if (existing) throw new AppError('Attendance session already exists for this class and date', 400);

    // Get active students in this class section
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { classSectionId: assignment.classSectionId, isCurrent: true, status: 'ACTIVE' },
      include: {
        student: {
          include: { user: { select: { name: true, email: true } } }
        }
      },
      orderBy: { rollNumber: 'asc' }
    });

    const session = await prisma.attendanceSession.create({
      data: {
        teacherSubjectAssignmentId,
        classSectionId: assignment.classSectionId,
        attendanceDate: date,
        status: AttendanceSessionStatus.DRAFT,
        createdByTeacherId: teacher.id,
        records: {
          create: enrollments.map(e => ({
            studentId: e.studentId,
            status: AttendanceStatus.PRESENT,
            remarks: JSON.stringify({ hasHomework: true, dressup: 'PERFECT' })
          }))
        }
      },
      include: {
        records: {
          include: {
            student: {
              include: { user: { select: { name: true } } }
            }
          }
        }
      }
    });

    const sessionWithFormattedRecords = {
      ...session,
      records: session.records.map(formatRecord)
    };

    // Auto-sync attendance homework status with ClassAssignment submissions
    await syncAttendanceHomeworkWithAssignments(
      teacherSubjectAssignmentId,
      date,
      enrollments.map(e => ({ studentId: e.studentId, hasHomework: true }))
    );

    res.status(201).json(new ApiResponse(true, 'Attendance session created', { session: sessionWithFormattedRecords }));
  } catch (error) {
    next(error);
  }
};

export const getAttendanceSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const sessions = await prisma.attendanceSession.findMany({
      where: { createdByTeacherId: teacher.id },
      include: {
        classSection: {
          include: { classLevel: true }
        },
        teacherSubjectAssignment: {
          include: { subject: true }
        },
        _count: {
          select: { records: true }
        }
      },
      orderBy: { attendanceDate: 'desc' }
    });

    res.status(200).json(new ApiResponse(true, 'Sessions fetched', { sessions }));
  } catch (error) {
    next(error);
  }
};

export const getAttendanceSessionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const sessionId = req.params.sessionId as string;

    const session = await prisma.attendanceSession.findFirst({
      where: {
        id: sessionId,
        createdByTeacherId: teacher.id
      },
      include: {
        classSection: {
          include: { classLevel: true }
        },
        teacherSubjectAssignment: {
          include: { subject: true, academicSession: true }
        },
        records: {
          include: {
            student: {
              include: {
                user: { select: { name: true, email: true } },
                academicEnrollments: {
                  where: { isCurrent: true },
                  take: 1
                }
              }
            }
          },
          orderBy: { student: { studentId: 'asc' } }
        }
      }
    });

    if (!session) throw new AppError('Attendance session not found or access denied', 404);

    const formattedSession = {
      ...session,
      records: session.records.map(formatRecord)
    };

    res.status(200).json(new ApiResponse(true, 'Session fetched successfully', { session: formattedSession }));
  } catch (error) {
    next(error);
  }
};

export const updateAttendanceSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const sessionId = req.params.sessionId as string;
    const { records } = req.body; // Array of { id, status, hasHomework, dressup, remarks }

    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, createdByTeacherId: teacher.id }
    });

    if (!session) throw new AppError('Attendance session not found', 404);

    // Teachers can edit attendance anytime (not locked)
    // if (session.status === AttendanceSessionStatus.LOCKED) {
    //   throw new AppError('This attendance session is locked and cannot be edited', 400);
    // }

    if (Array.isArray(records)) {
      await prisma.$transaction(
        records.map((r: any) => {
          const hasHomework = typeof r.hasHomework === 'boolean' ? r.hasHomework : true;
          const dressup = r.dressup || 'PERFECT';
          const remarks = JSON.stringify({ hasHomework, dressup });

          return prisma.attendanceRecord.update({
            where: { id: r.id },
            data: {
              status: (r.status === 'ABSENT' ? 'ABSENT' : 'PRESENT') as AttendanceStatus,
              remarks
            }
          });
        })
      );

      // Auto-sync attendance homework status with ClassAssignment submissions
      await syncAttendanceHomeworkWithAssignments(
        session.teacherSubjectAssignmentId,
        session.attendanceDate,
        records
      );
    }

    const updated = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        records: {
          include: { student: { include: { user: { select: { name: true } } } } }
        }
      }
    });

    const formattedUpdated = updated
      ? { ...updated, records: updated.records.map(formatRecord) }
      : updated;

    res.status(200).json(new ApiResponse(true, 'Attendance draft updated successfully', { session: formattedUpdated }));
  } catch (error) {
    next(error);
  }
};

export const submitAttendanceSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const sessionId = req.params.sessionId as string;

    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, createdByTeacherId: teacher.id }
    });

    if (!session) throw new AppError('Attendance session not found', 404);

    // Allow re-submitting anytime
    // if (session.status === AttendanceSessionStatus.LOCKED) {
    //   throw new AppError('Attendance session is locked and cannot be modified', 400);
    // }

    const updated = await prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { status: AttendanceSessionStatus.SUBMITTED }
    });

    // Auto-sync attendance homework status with ClassAssignment submissions upon final submission
    const finalRecords = await prisma.attendanceRecord.findMany({
      where: { attendanceSessionId: sessionId }
    });
    await syncAttendanceHomeworkWithAssignments(
      session.teacherSubjectAssignmentId,
      session.attendanceDate,
      finalRecords.map(formatRecord)
    );

    res.status(200).json(new ApiResponse(true, 'Attendance session submitted successfully', { session: updated }));
  } catch (error) {
    next(error);
  }
};
