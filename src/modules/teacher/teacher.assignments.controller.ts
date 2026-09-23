import { Request, Response, NextFunction } from 'express';
import { PrismaClient, AssignmentStatus, SubmissionStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

// Helper to check teacher ownership of an assignment
async function verifyTeacherAssignment(userId: string, assignmentId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) throw new AppError('Teacher profile not found', 404);

  const assignment = await prisma.classAssignment.findFirst({
    where: {
      id: assignmentId,
      createdById: teacher.id
    },
    include: {
      teacherSubjectAssignment: {
        include: {
          subject: true,
          classSection: { include: { classLevel: true } },
          academicSession: true
        }
      }
    }
  });

  if (!assignment) {
    throw new AppError('Assignment not found or access denied', 404);
  }

  return { teacher, assignment };
}

export const getAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const { status, teacherSubjectAssignmentId } = req.query;

    const whereClause: any = {
      createdById: teacher.id
    };

    if (status && Object.values(AssignmentStatus).includes(status as AssignmentStatus)) {
      whereClause.status = status as AssignmentStatus;
    }

    if (teacherSubjectAssignmentId) {
      whereClause.teacherSubjectAssignmentId = teacherSubjectAssignmentId as string;
    }

    const assignments = await prisma.classAssignment.findMany({
      where: whereClause,
      include: {
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        },
        _count: {
          select: { submissions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(new ApiResponse(true, 'Assignments fetched successfully', { assignments }));
  } catch (error) {
    next(error);
  }
};

export const getAssignmentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;

    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    const stats = await prisma.assignmentSubmission.groupBy({
      by: ['status'],
      where: { assignmentId: id as string },
      _count: { _all: true }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment details fetched', {
      assignment,
      submissionStats: stats
    }));
  } catch (error) {
    next(error);
  }
};

export const createAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) throw new AppError('Teacher not found', 404);

    const {
      title,
      instructions,
      totalMarks,
      passMarks,
      dueDate,
      allowLate,
      attachmentUrl,
      status,
      teacherSubjectAssignmentId
    } = req.body;

    if (!title || !dueDate || !teacherSubjectAssignmentId) {
      throw new AppError('Title, Due Date, and Class Subject Assignment are required', 400);
    }

    // Verify teacher is assigned to this teacherSubjectAssignmentId
    const assignmentRecord = await prisma.teacherSubjectAssignment.findFirst({
      where: {
        id: teacherSubjectAssignmentId,
        teacherId: teacher.id,
        isActive: true
      }
    });

    if (!assignmentRecord) {
      throw new AppError('You do not teach this subject/class', 403);
    }

    const newAssignment = await prisma.classAssignment.create({
      data: {
        title: title.trim(),
        instructions: instructions || null,
        totalMarks: totalMarks !== undefined ? Number(totalMarks) : 100,
        passMarks: passMarks !== undefined ? Number(passMarks) : 40,
        dueDate: new Date(dueDate),
        allowLate: Boolean(allowLate),
        attachmentUrl: attachmentUrl || null,
        status: status && Object.values(AssignmentStatus).includes(status) ? status : AssignmentStatus.PUBLISHED,
        teacherSubjectAssignmentId,
        createdById: teacher.id
      },
      include: {
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        }
      }
    });

    res.status(201).json(new ApiResponse(true, 'Assignment created successfully', { assignment: newAssignment }));
  } catch (error) {
    next(error);
  }
};

export const updateAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;
    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    const {
      title,
      instructions,
      totalMarks,
      passMarks,
      dueDate,
      allowLate,
      attachmentUrl,
      status
    } = req.body;

    const updated = await prisma.classAssignment.update({
      where: { id: assignment.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(instructions !== undefined && { instructions }),
        ...(totalMarks !== undefined && { totalMarks: Number(totalMarks) }),
        ...(passMarks !== undefined && { passMarks: Number(passMarks) }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(allowLate !== undefined && { allowLate: Boolean(allowLate) }),
        ...(attachmentUrl !== undefined && { attachmentUrl }),
        ...(status && Object.values(AssignmentStatus).includes(status) && { status })
      },
      include: {
        teacherSubjectAssignment: {
          include: {
            subject: true,
            classSection: { include: { classLevel: true } }
          }
        }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment updated successfully', { assignment: updated }));
  } catch (error) {
    next(error);
  }
};

export const deleteAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;
    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    // Check if there are any submissions already
    const count = await prisma.assignmentSubmission.count({
      where: { assignmentId: assignment.id }
    });

    if (count > 0) {
      // Archive instead of hard delete to preserve student records
      await prisma.classAssignment.update({
        where: { id: assignment.id },
        data: { status: AssignmentStatus.ARCHIVED }
      });
      res.status(200).json(new ApiResponse(true, 'Assignment has submissions and was moved to Archived'));
      return;
    }

    await prisma.classAssignment.delete({
      where: { id: assignment.id }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment deleted successfully'));
  } catch (error) {
    next(error);
  }
};

export const publishAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;
    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    const updated = await prisma.classAssignment.update({
      where: { id: assignment.id },
      data: { status: AssignmentStatus.PUBLISHED }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment published successfully', { assignment: updated }));
  } catch (error) {
    next(error);
  }
};

export const closeAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;
    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    const updated = await prisma.classAssignment.update({
      where: { id: assignment.id },
      data: { status: AssignmentStatus.CLOSED }
    });

    res.status(200).json(new ApiResponse(true, 'Assignment closed successfully', { assignment: updated }));
  } catch (error) {
    next(error);
  }
};

export const getAssignmentSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id } = req.params;
    const { assignment } = await verifyTeacherAssignment(userId, id as string);

    // Get all enrolled students in this class section
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: assignment.teacherSubjectAssignment.classSectionId,
        isCurrent: true,
        status: 'ACTIVE'
      },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      },
      orderBy: { rollNumber: 'asc' }
    });

    // Get submissions
    const submissions = await prisma.assignmentSubmission.findMany({
      where: { assignmentId: assignment.id },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        gradedBy: {
          include: {
            user: { select: { name: true } }
          }
        }
      }
    });

    const submissionMap = new Map(submissions.map(s => [s.studentId, s]));

    const report = enrollments.map(e => {
      const sub = submissionMap.get(e.studentId);
      return {
        studentId: e.student.id,
        customStudentId: e.student.studentId,
        rollNumber: e.rollNumber,
        studentName: e.student.user.name,
        studentEmail: e.student.user.email,
        hasSubmitted: Boolean(sub),
        submissionId: sub?.id || null,
        status: sub?.status || 'NOT_SUBMITTED',
        submittedAt: sub?.submittedAt || null,
        content: sub?.content || null,
        attachmentUrl: sub?.attachmentUrl || null,
        marksObtained: sub?.marksObtained ?? null,
        feedback: sub?.feedback || null,
        gradedAt: sub?.gradedAt || null,
        gradedByName: sub?.gradedBy?.user?.name || null
      };
    });

    res.status(200).json(new ApiResponse(true, 'Submissions fetched successfully', {
      assignment,
      submissions: report
    }));
  } catch (error) {
    next(error);
  }
};

export const gradeSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!;
    const { id, submissionId } = req.params;
    const { teacher, assignment } = await verifyTeacherAssignment(userId, id as string);

    const { marksObtained, feedback } = req.body;

    if (marksObtained === undefined || marksObtained === null) {
      throw new AppError('Marks obtained is required', 400);
    }

    const marks = Number(marksObtained);
    if (isNaN(marks) || marks < 0 || marks > assignment.totalMarks) {
      throw new AppError(`Marks must be a number between 0 and ${assignment.totalMarks}`, 400);
    }

    const submission = await prisma.assignmentSubmission.findFirst({
      where: { id: submissionId as string, assignmentId: assignment.id }
    });

    if (!submission) {
      throw new AppError('Submission not found for this assignment', 404);
    }

    const updated = await prisma.assignmentSubmission.update({
      where: { id: submission.id },
      data: {
        marksObtained: marks,
        feedback: feedback || null,
        status: SubmissionStatus.GRADED,
        gradedAt: new Date(),
        gradedById: teacher.id
      }
    });

    res.status(200).json(new ApiResponse(true, 'Submission graded successfully', { submission: updated }));
  } catch (error) {
    next(error);
  }
};
