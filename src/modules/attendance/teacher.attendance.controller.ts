import { Request, Response, NextFunction } from 'express';
import { PrismaClient, AttendanceSessionStatus, AttendanceStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

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

    if (session.status !== AttendanceSessionStatus.DRAFT && session.status !== AttendanceSessionStatus.REOPENED) {
      throw new AppError('Cannot edit submitted or locked attendance session', 400);
    }

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

    if (session.status === AttendanceSessionStatus.SUBMITTED || session.status === AttendanceSessionStatus.LOCKED) {
      throw new AppError('Attendance session is already submitted or locked', 400);
    }

    const updated = await prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { status: AttendanceSessionStatus.SUBMITTED }
    });

    res.status(200).json(new ApiResponse(true, 'Attendance session submitted successfully', { session: updated }));
  } catch (error) {
    next(error);
  }
};
