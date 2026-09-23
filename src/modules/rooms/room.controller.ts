import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { name: 'asc' }
    });
    res.status(200).json(new ApiResponse(true, 'Rooms fetched successfully', { rooms }));
  } catch (error) {
    next(error);
  }
};

export const createRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, building, floor, capacity } = req.body;
    
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) throw new AppError('Room with this name already exists', 400);

    const room = await prisma.room.create({
      data: { name, building, floor, capacity }
    });

    res.status(201).json(new ApiResponse(true, 'Room created successfully', { room }));
  } catch (error) {
    next(error);
  }
};

export const updateRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, building, floor, capacity, isActive } = req.body;
    
    if (name) {
      const existing = await prisma.room.findFirst({
        where: { name, NOT: { id: id as string } }
      });
      if (existing) throw new AppError('Another room with this name already exists', 400);
    }

    const room = await prisma.room.update({
      where: { id: id as string },
      data: { name, building, floor, capacity, isActive }
    });

    res.status(200).json(new ApiResponse(true, 'Room updated successfully', { room }));
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return next(new AppError('Room not found', 404));
    }
    next(error);
  }
};

export const deleteRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            routines: true
          }
        }
      }
    });

    if (!room) {
      throw new AppError('Room not found', 404);
    }

    if (room._count.routines > 0) {
      throw new AppError(
        'Cannot delete room because it is assigned to active class routines. Please deactivate it instead.',
        400
      );
    }

    await prisma.room.delete({
      where: { id }
    });

    res.status(200).json(new ApiResponse(true, 'Room deleted successfully'));
  } catch (error) {
    next(error);
  }
};

