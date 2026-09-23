import { Request, Response, NextFunction } from 'express';
import { PrismaClient, DayOfWeek, NoticeAudience, MarksEntryStatus, AssignmentStatus, AttendanceSessionStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

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

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401);

    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!teacher) throw new AppError('Teacher profile not found', 404);

    const todayDayOfWeek = DAYS_MAP[new Date().getDay()];
    const todayDateOnly = new Date();
    todayDateOnly.setHours(0, 0, 0, 0);
    const tomorrowDateOnly = new Date(todayDateOnly);
    tomorrowDateOnly.setDate(tomorrowDateOnly.getDate() + 1);

    // Active session
    const activeSession = await prisma.academicSession.findFirst({ where: { isActive: true } });

    // Active teaching assignments
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: {
        classSection: { include: { classLevel: true } },
        subject: true
      }
    });

    const classSectionIds = Array.from(new Set(assignments.map(a => a.classSectionId)));

    // Total unique active students across all teacher's assigned classes
    const uniqueStudentsCount = await prisma.studentEnrollment.groupBy({
      by: ['studentId'],
      where: {
        classSectionId: { in: classSectionIds },
        isCurrent: true,
        status: 'ACTIVE'
      }
    });

    // Today's lectures
    const todayLectures = await prisma.routine.findMany({
      where: {
        teacherSubjectAssignment: { teacherId: teacher.id, isActive: true },
        dayOfWeek: todayDayOfWeek,
        isActive: true
      },
      include: {
        room: true,
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    // Today's completed attendance sessions
    const todayAttendanceSessions = await prisma.attendanceSession.findMany({
      where: {
        createdByTeacherId: teacher.id,
        attendanceDate: { gte: todayDateOnly, lt: tomorrowDateOnly }
      }
    });

    // Draft marks count
    const draftMarksCount = await prisma.studentMark.count({
      where: {
        enteredByTeacherId: teacher.id,
        status: MarksEntryStatus.DRAFT
      }
    });

    // Active assignments count
    const activeAssignmentsCount = await prisma.classAssignment.count({
      where: {
        createdById: teacher.id,
        status: AssignmentStatus.PUBLISHED
      }
    });

    // Latest notices for teachers
    const recentNotices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
        targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.TEACHERS] }
      },
      orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
      take: 4
    });

    res.status(200).json(new ApiResponse(true, 'Teacher dashboard stats fetched', {
      teacher: {
        id: teacher.id,
        name: teacher.user.name,
        email: teacher.user.email,
        employeeId: teacher.employeeId,
        designation: teacher.designation || 'Teacher',
        phone: teacher.phone,
        profileImage: teacher.profileImage
      },
      activeSession: activeSession?.name || 'Current Academic Year',
      stats: {
        totalClasses: assignments.length,
        totalStudents: uniqueStudentsCount.length,
        todayLecturesCount: todayLectures.length,
        pendingAttendanceCount: Math.max(0, todayLectures.length - todayAttendanceSessions.filter(s => s.status === AttendanceSessionStatus.SUBMITTED).length),
        draftMarksCount,
        activeAssignmentsCount
      },
      todayLectures,
      recentNotices
    }));
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        teacher: {
          include: {
            assignments: {
              where: { isActive: true },
              include: {
                subject: true,
                classSection: { include: { classLevel: true } }
              }
            }
          }
        }
      }
    });

    if (!user || !user.teacher) {
      throw new AppError('Teacher profile not found', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Profile fetched', { profile: user }));
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401);

    const { phone, profileImage } = req.body;

    const teacher = await prisma.teacher.update({
      where: { userId },
      data: {
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(profileImage !== undefined && { profileImage: profileImage?.trim() || null })
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Profile updated successfully', { profile: teacher }));
  } catch (error) {
    next(error);
  }
};

export const getAssignedClasses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: {
        subject: true,
        classSection: {
          include: {
            classLevel: true,
            _count: {
              select: {
                studentEnrollments: { where: { isCurrent: true, status: 'ACTIVE' } }
              }
            }
          }
        },
        academicSession: true,
        routines: {
          where: { isActive: true },
          include: { room: true },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
        },
        _count: {
          select: {
            classAssignments: true,
            attendanceSessions: true
          }
        }
      },
      orderBy: [
        { classSection: { classLevel: { sortOrder: 'asc' } } },
        { classSection: { name: 'asc' } }
      ]
    });

    res.status(200).json(new ApiResponse(true, 'Assigned classes fetched', { assignments }));
  } catch (error) {
    next(error);
  }
};

export const getAssignedClassById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const assignmentId = req.params.assignmentId as string;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const assignment = await prisma.teacherSubjectAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.id, isActive: true },
      include: {
        subject: true,
        classSection: {
          include: {
            classLevel: true,
            studentEnrollments: {
              where: { isCurrent: true, status: 'ACTIVE' },
              include: {
                student: {
                  include: { user: { select: { id: true, name: true, email: true } } }
                }
              },
              orderBy: { rollNumber: 'asc' }
            }
          }
        },
        academicSession: true,
        routines: {
          where: { isActive: true },
          include: { room: true },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
        },
        classAssignments: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        attendanceSessions: {
          orderBy: { attendanceDate: 'desc' },
          take: 10
        }
      }
    });

    if (!assignment) {
      throw new AppError('Class assignment not found or access denied', 404);
    }

    res.status(200).json(new ApiResponse(true, 'Assigned class details fetched', { assignment }));
  } catch (error) {
    next(error);
  }
};

export const getTeacherStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const { classSectionId, search } = req.query;

    const teacherAssignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
      select: { classSectionId: true }
    });

    const allowedSectionIds = Array.from(new Set(teacherAssignments.map(a => a.classSectionId)));

    let targetSectionIds = allowedSectionIds;
    if (classSectionId) {
      if (!allowedSectionIds.includes(classSectionId as string)) {
        throw new AppError('You do not teach in this class section', 403);
      }
      targetSectionIds = [classSectionId as string];
    }

    const whereClause: any = {
      classSectionId: { in: targetSectionIds },
      isCurrent: true,
      status: 'ACTIVE'
    };

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { student: { studentId: { contains: q, mode: 'insensitive' } } },
        { student: { user: { name: { contains: q, mode: 'insensitive' } } } },
        { student: { user: { email: { contains: q, mode: 'insensitive' } } } },
        { rollNumber: { contains: q, mode: 'insensitive' } }
      ];
    }

    const enrollments = await prisma.studentEnrollment.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        classLevel: true,
        classSection: true,
        academicSession: true
      },
      orderBy: [
        { classLevel: { sortOrder: 'asc' } },
        { classSection: { name: 'asc' } },
        { rollNumber: 'asc' }
      ]
    });

    const students = enrollments.map(e => ({
      enrollmentId: e.id,
      studentId: e.student.id,
      customStudentId: e.student.studentId,
      rollNumber: e.rollNumber,
      name: e.student.user.name,
      email: e.student.user.email,
      phone: e.student.phone,
      address: e.student.address,
      emergencyContact: e.student.emergencyContact,
      guardianName: e.student.guardianName,
      guardianPhone: e.student.guardianPhone,
      guardianRelation: e.student.guardianRelation,
      classLevel: e.classLevel.name,
      classSection: e.classSection.name,
      classSectionId: e.classSectionId,
      academicSession: e.academicSession.name
    }));

    res.status(200).json(new ApiResponse(true, 'Students fetched successfully', { students }));
  } catch (error) {
    next(error);
  }
};

export const getTeacherStudentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.params;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const teacherAssignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
      select: { classSectionId: true }
    });
    const allowedSectionIds = Array.from(new Set(teacherAssignments.map(a => a.classSectionId)));

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        studentId: studentId as string,
        classSectionId: { in: allowedSectionIds },
        isCurrent: true,
        status: 'ACTIVE'
      },
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        classLevel: true,
        classSection: true,
        academicSession: true
      }
    });

    if (!enrollment) {
      throw new AppError('Student not found or not enrolled in any of your assigned classes', 404);
    }

    // Also fetch attendance summary for this student in teacher's subjects
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        studentId: studentId as string,
        attendanceSession: {
          createdByTeacherId: teacher.id
        }
      },
      include: {
        attendanceSession: {
          include: {
            teacherSubjectAssignment: {
              include: { subject: true }
            }
          }
        }
      },
      orderBy: { attendanceSession: { attendanceDate: 'desc' } },
      take: 15
    });

    res.status(200).json(new ApiResponse(true, 'Student details fetched', {
      student: {
        id: enrollment.student.id,
        customStudentId: enrollment.student.studentId,
        rollNumber: enrollment.rollNumber,
        name: enrollment.student.user.name,
        email: enrollment.student.user.email,
        phone: enrollment.student.phone,
        address: enrollment.student.address,
        emergencyContact: enrollment.student.emergencyContact,
        guardianName: enrollment.student.guardianName,
        guardianPhone: enrollment.student.guardianPhone,
        guardianRelation: enrollment.student.guardianRelation,
        classLevel: enrollment.classLevel.name,
        classSection: enrollment.classSection.name,
        academicSession: enrollment.academicSession.name
      },
      recentAttendance: attendanceRecords.map(r => ({
        id: r.id,
        date: r.attendanceSession.attendanceDate,
        subject: r.attendanceSession.teacherSubjectAssignment.subject.name,
        status: r.status,
        remarks: r.remarks
      }))
    }));
  } catch (error) {
    next(error);
  }
};

export const getSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ 
      where: { userId },
      include: { user: { select: { name: true } } }
    });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const routines = await prisma.routine.findMany({
      where: {
        teacherSubjectAssignment: { teacherId: teacher.id, isActive: true },
        isActive: true
      },
      include: {
        room: true,
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        }
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });

    res.status(200).json(new ApiResponse(true, 'Schedule fetched', { 
      routines,
      teacherName: teacher.user?.name || ''
    }));
  } catch (error) {
    next(error);
  }
};

export const getTodayLectures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const todayDayOfWeek = DAYS_MAP[new Date().getDay()];

    const routines = await prisma.routine.findMany({
      where: {
        teacherSubjectAssignment: { teacherId: teacher.id, isActive: true },
        dayOfWeek: todayDayOfWeek,
        isActive: true
      },
      include: {
        room: true,
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.status(200).json(new ApiResponse(true, 'Today lectures fetched', { routines, dayOfWeek: todayDayOfWeek }));
  } catch (error) {
    next(error);
  }
};

export const getTeacherNotices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const notices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.TEACHERS] } }
        ]
      },
      orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }]
    });

    res.status(200).json(new ApiResponse(true, 'Notices fetched', { notices }));
  } catch (error) {
    next(error);
  }
};

export const getTeacherNoticeBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const now = new Date();

    const notice = await prisma.notice.findFirst({
      where: {
        slug: slug as string,
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.TEACHERS] } }
        ]
      }
    });

    if (!notice) throw new AppError('Notice not found', 404);

    res.status(200).json(new ApiResponse(true, 'Notice details fetched', { notice }));
  } catch (error) {
    next(error);
  }
};
