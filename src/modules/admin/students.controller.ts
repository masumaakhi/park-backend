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
          where: { status: 'ACTIVE' },
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
      name, phone, isActive
    } = req.body;
    
    const existingStudent = await prisma.student.findUnique({ where: { id }, include: { user: true } });
    if (!existingStudent) throw new AppError('Student not found', 404);

    const updatedStudent = await prisma.$transaction(async (tx) => {
      if (name || isActive !== undefined) {
        const userData: any = {};
        if (name) userData.name = name;
        if (isActive !== undefined) userData.isActive = isActive;
        
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
