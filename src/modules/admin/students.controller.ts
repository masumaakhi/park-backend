import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        academicEnrollments: {
          include: {
            classLevel: true,
            classSection: true,
            academicSession: true,
          },
          orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
        },
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Students fetched successfully', { students }));
  } catch (error) {
    next(error);
  }
};

export const createStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name, email, password, studentId, phone 
    } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new AppError('User with this email already exists', 400);

    const existingStudent = await prisma.student.findUnique({ where: { studentId } });
    if (existingStudent) throw new AppError('Student with this ID already exists', 400);

    const passwordHash = await bcrypt.hash(password, 10);

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'STUDENT',
          isActive: true
        }
      });

      return tx.student.create({
        data: {
          userId: user.id,
          studentId,
          phone
        },
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } }
        }
      });
    });

    res.status(201).json(new ApiResponse(true, 'Student created successfully', { student }));
  } catch (error) {
    next(error);
  }
};

export const updateStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const {
      name, phone, isActive, password
    } = req.body;
    
    const existingStudent = await prisma.student.findUnique({ where: { id }, include: { user: true } });
    if (!existingStudent) throw new AppError('Student not found', 404);

    const updatedStudent = await prisma.$transaction(async (tx) => {
      if (name || isActive !== undefined || password) {
        const userData: any = {};
        if (name) userData.name = name;
        if (isActive !== undefined) userData.isActive = isActive;
        if (password && password.trim().length >= 6) {
          userData.passwordHash = await bcrypt.hash(password.trim(), 10);
          userData.mustChangePassword = false;
          userData.passwordSetAt = new Date();
        }
        
        await tx.user.update({
          where: { id: existingStudent.userId },
          data: userData
        });
      }

      const studentData: any = {};
      if (phone !== undefined) studentData.phone = phone;

      if (Object.keys(studentData).length > 0) {
        return tx.student.update({
          where: { id },
          data: studentData,
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } }
          }
        });
      } else {
        return tx.student.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } }
          }
        });
      }
    });

    res.status(200).json(new ApiResponse(true, 'Student updated successfully', { student: updatedStudent }));
  } catch (error) {
    next(error);
  }
};

export const deleteStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const existingStudent = await prisma.student.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            teacher: true,
          },
        },
      },
    });

    if (!existingStudent) {
      throw new AppError('Student not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      // Unlink any admission application referencing this student
      await tx.admissionApplication.updateMany({
        where: { studentId: id },
        data: { studentId: null },
      });

      await tx.attendanceRecord.deleteMany({ where: { studentId: id } });
      await tx.studentMark.deleteMany({ where: { studentId: id } });
      await tx.marksheet.deleteMany({ where: { studentId: id } });
      await tx.studentDigitalId.deleteMany({ where: { studentId: id } });
      await tx.assignmentSubmission.deleteMany({ where: { studentId: id } });
      await tx.feePayment.deleteMany({ where: { studentId: id } });
      await tx.feeDiscount.deleteMany({ where: { studentId: id } });

      const invoices = await tx.studentInvoice.findMany({
        where: { studentId: id },
        select: { id: true },
      });
      const invoiceIds = invoices.map((inv) => inv.id);
      if (invoiceIds.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.studentInvoice.deleteMany({ where: { studentId: id } });
      }

      await tx.studentPromotion.deleteMany({ where: { studentId: id } });
      await tx.studentEnrollment.deleteMany({ where: { studentId: id } });

      // Delete student record
      await tx.student.delete({ where: { id } });

      // Only delete user account if this user is strictly a student and has no teacher/staff role
      const user = existingStudent.user;
      if (user?.id) {
        const isStaffOrTeacherRole = Boolean(
          user.role && ['ADMIN', 'SUPER_ADMIN', 'TEACHER', 'STAFF'].includes(user.role)
        );
        const linkedTeacherCount = await tx.teacher.count({ where: { userId: user.id } });

        if (!isStaffOrTeacherRole && linkedTeacherCount === 0 && user.role === 'STUDENT') {
          await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
          await tx.emailNotification.deleteMany({ where: { recipientUserId: user.id } });
          await tx.user.delete({ where: { id: user.id } });
        }
      }
    });

    res.status(200).json(new ApiResponse(true, 'Student deleted successfully'));
  } catch (error) {
    next(error);
  }
};
