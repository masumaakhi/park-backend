import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStudents,
      totalTeachers,
      totalDepartments,
      totalPrograms,
      totalSubjects,
      activeSession,
      publishedResultsCount,
      recentNotices
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', isActive: true } }),
      prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
      0, // totalDepartments (removed from schema)
      0, // totalPrograms (removed from schema)
      prisma.subject.count({ where: { isActive: true } }),
      prisma.academicSession.findFirst({ where: { isActive: true } }),
      prisma.exam.count({ where: { isPublished: true } }),
      prisma.notice.findMany({ 
        where: { isPublished: true, isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    // Active Assignments (TeacherSubjectAssignments that are active)
    const activeAssignmentsCount = await prisma.teacherSubjectAssignment.count({
      where: { isActive: true }
    });

    // Today's Attendance Percentage
    const todaySessions = await prisma.attendanceSession.findMany({
      where: {
        attendanceDate: {
          gte: today
        }
      },
      include: {
        records: true
      }
    });

    let totalAttendanceRecords = 0;
    let totalPresent = 0;
    todaySessions.forEach(session => {
      totalAttendanceRecords += session.records.length;
      totalPresent += session.records.filter(r => r.status === 'PRESENT').length;
    });

    const attendancePercentage = totalAttendanceRecords > 0 
      ? Math.round((totalPresent / totalAttendanceRecords) * 100) 
      : 0;

    res.status(200).json(
      new ApiResponse(true, 'Dashboard stats fetched successfully', {
        stats: {
          totalStudents,
          totalTeachers,
          totalDepartments,
          totalPrograms,
          totalSubjects,
          activeSession: activeSession?.name || 'No Active Session',
          attendancePercentage,
          publishedResultsCount,
          activeAssignmentsCount,
          recentNotices
        }
      })
    );
  } catch (error) {
    next(error);
  }
};
