import prisma from '../../config/prisma';
import { recordAuditLog } from '../audit-logs/audit-log.service';

export class TeacherAppointmentService {
  /**
   * Get all teacher appointments with filters and pagination
   */
  static async getAppointments(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    employmentType?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status && query.status !== 'ALL') {
      where.appointmentStatus = query.status;
    }

    if (query.employmentType && query.employmentType !== 'ALL') {
      where.employmentType = query.employmentType;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { designation: { contains: term, mode: 'insensitive' } },
        { teacher: { employeeId: { contains: term, mode: 'insensitive' } } },
        { teacher: { user: { name: { contains: term, mode: 'insensitive' } } } },
        { teacher: { user: { email: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.teacherAppointment.count({ where }),
      prisma.teacherAppointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { joiningDate: 'desc' },
        include: {
          teacher: {
            include: {
              user: {
                select: { id: true, name: true, email: true, isActive: true },
              },
            },
          },
          teacherApplication: {
            select: {
              id: true,
              applicationNumber: true,
              fullName: true,
              email: true,
              phone: true,
              subjectExpertise: true,
            },
          },
          appointedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get appointment by ID
   */
  static async getAppointmentById(id: string) {
    const appointment = await prisma.teacherAppointment.findUnique({
      where: { id },
      include: {
        teacher: {
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true, mustChangePassword: true } },
            assignments: {
              include: {
                subject: true,
                classSection: { include: { classLevel: true } },
              },
            },
          },
        },
        teacherApplication: {
          include: {
            documents: true,
            interviews: true,
          },
        },
        appointedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!appointment) throw new Error('Teacher appointment not found');
    return appointment;
  }

  /**
   * Update appointment details
   */
  static async updateAppointment(
    id: string,
    data: {
      designation?: string;
      employmentType?: any;
      probationEndDate?: string;
      salaryNote?: string;
    },
    adminUserId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.teacherAppointment.findUnique({ where: { id } });
    if (!existing) throw new Error('Appointment not found');

    const updated = await prisma.teacherAppointment.update({
      where: { id },
      data: {
        designation: data.designation || existing.designation,
        employmentType: data.employmentType || existing.employmentType,
        probationEndDate:
          data.probationEndDate !== undefined
            ? data.probationEndDate
              ? new Date(data.probationEndDate)
              : null
            : existing.probationEndDate,
        salaryNote: data.salaryNote !== undefined ? data.salaryNote : existing.salaryNote,
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPOINTMENT_UPDATED',
      module: 'TEACHER_APPOINTMENTS',
      affectedRecordId: id,
      safeMetadata: { changes: data },
      ipAddress,
    });

    return updated;
  }

  /**
   * Suspend Appointment
   */
  static async suspendAppointment(
    id: string,
    reason: string,
    adminUserId: string,
    ipAddress?: string
  ) {
    const appointment = await prisma.teacherAppointment.findUnique({
      where: { id },
      include: { teacher: true },
    });
    if (!appointment) throw new Error('Appointment not found');

    // Update appointment status and set User isActive = false
    const result = await prisma.$transaction([
      prisma.teacherAppointment.update({
        where: { id },
        data: { appointmentStatus: 'SUSPENDED' },
      }),
      prisma.user.update({
        where: { id: appointment.teacher.userId },
        data: { isActive: false },
      }),
    ]);

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPOINTMENT_SUSPENDED',
      module: 'TEACHER_APPOINTMENTS',
      affectedRecordId: id,
      safeMetadata: { reason: reason.trim() },
      ipAddress,
    });

    return result[0];
  }

  /**
   * End Appointment
   */
  static async endAppointment(
    id: string,
    reason: string,
    adminUserId: string,
    ipAddress?: string
  ) {
    const appointment = await prisma.teacherAppointment.findUnique({
      where: { id },
      include: { teacher: true },
    });
    if (!appointment) throw new Error('Appointment not found');

    // Never hard delete appointment history: update to ENDED and deactivate user account
    const result = await prisma.$transaction([
      prisma.teacherAppointment.update({
        where: { id },
        data: { appointmentStatus: 'ENDED' },
      }),
      prisma.user.update({
        where: { id: appointment.teacher.userId },
        data: { isActive: false },
      }),
    ]);

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPOINTMENT_ENDED',
      module: 'TEACHER_APPOINTMENTS',
      affectedRecordId: id,
      safeMetadata: { reason: reason.trim() },
      ipAddress,
    });

    return result[0];
  }
}
