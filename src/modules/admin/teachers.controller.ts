import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getTeachers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Teachers fetched successfully', { teachers }));
  } catch (error) {
    next(error);
  }
};

export const createTeacher = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      name, email, password, employeeId, phone, designation 
    } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new AppError('User with this email already exists', 400);

    const existingTeacher = await prisma.teacher.findUnique({ where: { employeeId } });
    if (existingTeacher) throw new AppError('Teacher with this Employee ID already exists', 400);

    const passwordHash = await bcrypt.hash(password, 10);

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'TEACHER',
          isActive: true
        }
      });

      return tx.teacher.create({
        data: {
          userId: user.id,
          employeeId,
          phone,
          designation
        },
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } }
        }
      });
    });

    res.status(201).json(new ApiResponse(true, 'Teacher created successfully', { teacher }));
  } catch (error) {
    next(error);
  }
};

export const updateTeacher = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { 
      name, phone, designation, isActive 
    } = req.body;
    
    const existingTeacher = await prisma.teacher.findUnique({ where: { id }, include: { user: true } });
    if (!existingTeacher) throw new AppError('Teacher not found', 404);

    const updatedTeacher = await prisma.$transaction(async (tx) => {
      if (name || isActive !== undefined) {
        const userData: any = {};
        if (name) userData.name = name;
        if (isActive !== undefined) userData.isActive = isActive;
        
        await tx.user.update({
          where: { id: existingTeacher.userId },
          data: userData
        });
      }

      const teacherData: any = {};
      if (phone !== undefined) teacherData.phone = phone;
      if (designation !== undefined) teacherData.designation = designation;

      if (Object.keys(teacherData).length > 0) {
        return tx.teacher.update({
          where: { id },
          data: teacherData,
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } }
          }
        });
      } else {
        return tx.teacher.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } }
          }
        });
      }
    });

    res.status(200).json(new ApiResponse(true, 'Teacher updated successfully', { teacher: updatedTeacher }));
  } catch (error) {
    next(error);
  }
};
