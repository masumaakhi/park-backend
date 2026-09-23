import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../utils/api-response';
import { TeacherAppointmentService } from './teacher-appointments.service';
import { z } from 'zod';

const updateAppointmentSchema = z.object({
  designation: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).optional(),
  probationEndDate: z.string().optional(),
  salaryNote: z.string().optional(),
});

const actionReasonSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

export const getTeacherAppointments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await TeacherAppointmentService.getAppointments(req.query);
    return res.status(200).json(new ApiResponse(true, 'Appointments fetched', result));
  } catch (error) {
    return next(error);
  }
};

export const getTeacherAppointmentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const appointment = await TeacherAppointmentService.getAppointmentById(id);
    return res.status(200).json(new ApiResponse(true, 'Appointment fetched', appointment));
  } catch (error) {
    return next(error);
  }
};

export const updateTeacherAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const validatedData = updateAppointmentSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherAppointmentService.updateAppointment(
      id,
      validatedData,
      adminUserId,
      req.ip
    );
    return res.status(200).json(new ApiResponse(true, 'Appointment updated', updated));
  } catch (error) {
    return next(error);
  }
};

export const suspendTeacherAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { reason } = actionReasonSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherAppointmentService.suspendAppointment(
      id,
      reason,
      adminUserId,
      req.ip
    );
    return res.status(200).json(new ApiResponse(true, 'Teacher appointment suspended', updated));
  } catch (error) {
    return next(error);
  }
};

export const endTeacherAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { reason } = actionReasonSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherAppointmentService.endAppointment(
      id,
      reason,
      adminUserId,
      req.ip
    );
    return res.status(200).json(new ApiResponse(true, 'Teacher appointment ended', updated));
  } catch (error) {
    return next(error);
  }
};
