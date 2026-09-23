import prisma from '../../config/prisma';
import { CreateCircularDto, UpdateCircularDto } from './types';
import { TeacherCircularStatus } from '@prisma/client';

export class TeacherCircularService {
  /**
   * Generate sequential circular number: CIR-YYYY-XXXX
   */
  static async generateCircularNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CIR-${year}-`;
    const count = await prisma.teacherCircular.count({
      where: {
        circularNumber: {
          startsWith: prefix,
        },
      },
    });
    const nextSeq = String(count + 1).padStart(4, '0');
    return `${prefix}${nextSeq}`;
  }

  /**
   * Safely resolve admin user ID
   */
  static async resolveAdminUserId(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return user.id;
    const defaultAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    return defaultAdmin ? defaultAdmin.id : null;
  }

  /**
   * Create a recruitment circular
   */
  static async createCircular(data: CreateCircularDto, adminUserId?: string) {
    const circularNumber = await this.generateCircularNumber();
    const resolvedAdminId = await this.resolveAdminUserId(adminUserId);

    const deadlineDate = new Date(data.deadline);
    // Set deadline to end of day if time was not specified
    if (data.deadline.length === 10) {
      deadlineDate.setHours(23, 59, 59, 999);
    }

    const circular = await prisma.teacherCircular.create({
      data: {
        circularNumber,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        positions: data.positions.trim(),
        vacancyCount: data.vacancyCount ? Number(data.vacancyCount) : null,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        deadline: deadlineDate,
        status: TeacherCircularStatus.PUBLISHED, // published right away so candidates can apply
        googleFormUrl: data.googleFormUrl?.trim() || null,
        allowOnlineForm: data.allowOnlineForm !== undefined ? data.allowOnlineForm : true,
        createdById: resolvedAdminId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return circular;
  }

  /**
   * List circulars with application counts
   */
  static async getCirculars(query: { status?: string; search?: string }) {
    const where: any = {};
    if (query.status) {
      where.status = query.status as TeacherCircularStatus;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { circularNumber: { contains: query.search, mode: 'insensitive' } },
        { positions: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const circulars = await prisma.teacherCircular.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    const now = new Date();
    return circulars.map((c: any) => {
      const isExpired = new Date(c.deadline) < now;
      const msLeft = new Date(c.deadline).getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      return {
        ...c,
        totalApplications: c._count.applications,
        isExpired,
        daysLeft: isExpired ? 0 : daysLeft,
      };
    });
  }

  /**
   * Get single circular with its applications
   */
  static async getCircularById(id: string) {
    const circular = await prisma.teacherCircular.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        applications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            applicationNumber: true,
            fullName: true,
            email: true,
            phone: true,
            appliedPosition: true,
            subjectExpertise: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!circular) {
      throw new Error('Recruitment circular not found');
    }

    const now = new Date();
    const isExpired = new Date(circular.deadline) < now;
    const msLeft = new Date(circular.deadline).getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    return {
      ...circular,
      totalApplications: circular.applications.length,
      isExpired,
      daysLeft: isExpired ? 0 : daysLeft,
    };
  }

  /**
   * Update circular
   */
  static async updateCircular(id: string, data: UpdateCircularDto, adminUserId?: string) {
    const existing = await prisma.teacherCircular.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Recruitment circular not found');
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.positions !== undefined) updateData.positions = data.positions.trim();
    if (data.vacancyCount !== undefined) updateData.vacancyCount = data.vacancyCount ? Number(data.vacancyCount) : null;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.deadline !== undefined) {
      const d = new Date(data.deadline);
      if (data.deadline.length === 10) d.setHours(23, 59, 59, 999);
      updateData.deadline = d;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.googleFormUrl !== undefined) updateData.googleFormUrl = data.googleFormUrl?.trim() || null;
    if (data.allowOnlineForm !== undefined) updateData.allowOnlineForm = data.allowOnlineForm;

    const updated = await prisma.teacherCircular.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  /**
   * Close circular
   */
  static async closeCircular(id: string) {
    return prisma.teacherCircular.update({
      where: { id },
      data: { status: TeacherCircularStatus.CLOSED },
    });
  }

  /**
   * Publish circular
   */
  static async publishCircular(id: string) {
    return prisma.teacherCircular.update({
      where: { id },
      data: { status: TeacherCircularStatus.PUBLISHED },
    });
  }

  /**
   * Get active public circular for the careers page.
   * Returns published circular where current time <= deadline.
   */
  static async getActivePublicCircular() {
    const now = new Date();
    const circular = await prisma.teacherCircular.findFirst({
      where: {
        status: TeacherCircularStatus.PUBLISHED,
        deadline: {
          gte: now,
        },
      },
      orderBy: { deadline: 'desc' },
      select: {
        id: true,
        circularNumber: true,
        title: true,
        description: true,
        positions: true,
        vacancyCount: true,
        startDate: true,
        deadline: true,
        googleFormUrl: true,
        allowOnlineForm: true,
        createdAt: true,
      },
    });

    if (!circular) return null;

    const msLeft = new Date(circular.deadline).getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    return {
      ...circular,
      daysLeft,
    };
  }

  /**
   * Get all active public circulars whose deadline >= now and status is PUBLISHED
   */
  static async getActivePublicCirculars() {
    const now = new Date();
    const circulars = await prisma.teacherCircular.findMany({
      where: {
        status: TeacherCircularStatus.PUBLISHED,
        deadline: {
          gte: now,
        },
      },
      orderBy: { deadline: 'desc' },
      select: {
        id: true,
        circularNumber: true,
        title: true,
        description: true,
        positions: true,
        vacancyCount: true,
        startDate: true,
        deadline: true,
        googleFormUrl: true,
        allowOnlineForm: true,
        createdAt: true,
      },
    });

    return circulars.map((c: any) => {
      const msLeft = new Date(c.deadline).getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      return {
        ...c,
        daysLeft,
      };
    });
  }
}
