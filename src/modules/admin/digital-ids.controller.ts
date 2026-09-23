import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import puppeteer from 'puppeteer';
import { generateDigitalIdPdfBuffer } from '../digital-ids/pdf-template';

export const getDigitalIds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status === 'ACTIVE') {
      where.isActive = true;
      where.revokedAt = null;
    } else if (status === 'INACTIVE') {
      where.isActive = false;
      where.revokedAt = null;
    } else if (status === 'REVOKED') {
      where.revokedAt = { not: null };
    }

    if (search) {
      const searchStr = String(search).trim();
      where.OR = [
        { cardNumber: { contains: searchStr, mode: 'insensitive' } },
        {
          student: {
            OR: [
              { studentId: { contains: searchStr, mode: 'insensitive' } },
              { user: { name: { contains: searchStr, mode: 'insensitive' } } },
              { rollNumber: { contains: searchStr, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, digitalIds] = await Promise.all([
      prisma.studentDigitalId.count({ where }),
      prisma.studentDigitalId.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          student: {
            include: {
              user: { select: { id: true, name: true, email: true, isActive: true } },
              academicEnrollments: {
                where: { isCurrent: true },
                include: {
                  academicSession: true,
                  classLevel: true,
                  classSection: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.status(200).json(
      new ApiResponse(true, 'Digital IDs fetched', {
        digitalIds,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      })
    );
  } catch (error) {
    next(error);
  }
};

export const getDigitalIdById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const digitalId = await prisma.studentDigitalId.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } },
            academicEnrollments: {
              where: { isCurrent: true },
              include: {
                academicSession: true,
                classLevel: true,
                classSection: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!digitalId) {
      throw new AppError('Digital ID not found', 404);
    }

    // Generate QR code data URL pointing to verification page
    const verificationBaseUrl =
      process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const verifyUrl = `${verificationBaseUrl}/verify/student-id/${digitalId.verificationToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 250,
      margin: 1,
      color: {
        dark: '#1e3a8a',
        light: '#ffffff',
      },
    });

    res.status(200).json(
      new ApiResponse(true, 'Digital ID retrieved', {
        ...digitalId,
        qrCodeDataUrl,
        verifyUrl,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const generateDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, expiryDate } = req.body;
    const adminUser = (req as any).user;

    // 1. Check if student exists and is active & enrolled
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        academicEnrollments: {
          where: { isCurrent: true, status: 'ACTIVE' },
        },
      },
    });

    if (!student) throw new AppError('Student not found', 404);
    if (!student.user.isActive) {
      throw new AppError('Cannot generate Digital ID for inactive student account', 400);
    }
    if (student.academicEnrollments.length === 0) {
      throw new AppError('Cannot generate Digital ID for student with no active enrollment', 400);
    }

    // 2. Check if active Digital ID already exists
    const existing = await prisma.studentDigitalId.findFirst({
      where: { studentId, isActive: true, revokedAt: null },
    });
    if (existing) {
      throw new AppError('Student already has an active Digital ID', 400);
    }

    // 3. Generate unique card number (EP-CARD-{YEAR}-{SEQUENCE})
    const year = new Date().getFullYear();
    const count = await prisma.studentDigitalId.count();
    const cardNumber = `EP-ID-${year}-${String(count + 1).padStart(5, '0')}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');

    // Default expiry 1 year from now if not provided
    const targetExpiry = expiryDate
      ? new Date(expiryDate)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const digitalId = await prisma.studentDigitalId.create({
      data: {
        studentId,
        cardNumber,
        verificationToken,
        expiryDate: targetExpiry,
        isActive: true,
      },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'DIGITAL_ID_GENERATED',
      module: 'DIGITAL_ID',
      affectedRecordId: digitalId.id,
      safeMetadata: { studentId: student.studentId, cardNumber },
    });

    res.status(201).json(new ApiResponse(true, 'Digital ID generated successfully', { digitalId }));
  } catch (error) {
    next(error);
  }
};

export const regenerateDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { expiryDate, reason } = req.body;
    const adminUser = (req as any).user;

    const oldDigitalId = await prisma.studentDigitalId.findUnique({
      where: { id },
      include: { student: { include: { user: true, academicEnrollments: { where: { isCurrent: true } } } } },
    });

    if (!oldDigitalId) throw new AppError('Digital ID not found', 404);

    // Deactivate old one
    await prisma.studentDigitalId.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason ? `Superseded by regeneration: ${reason}` : 'Superseded by regeneration',
      },
    });

    const year = new Date().getFullYear();
    const count = await prisma.studentDigitalId.count();
    const cardNumber = `EP-ID-${year}-${String(count + 1).padStart(5, '0')}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');

    const targetExpiry = expiryDate
      ? new Date(expiryDate)
      : oldDigitalId.expiryDate;

    const newDigitalId = await prisma.studentDigitalId.create({
      data: {
        studentId: oldDigitalId.studentId,
        cardNumber,
        verificationToken,
        expiryDate: targetExpiry,
        isActive: true,
      },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'DIGITAL_ID_REGENERATED',
      module: 'DIGITAL_ID',
      affectedRecordId: newDigitalId.id,
      safeMetadata: { oldId: id, newCardNumber: cardNumber, reason },
    });

    res.status(201).json(new ApiResponse(true, 'Digital ID regenerated successfully', { digitalId: newDigitalId }));
  } catch (error) {
    next(error);
  }
};

export const deactivateDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const adminUser = (req as any).user;

    const digitalId = await prisma.studentDigitalId.update({
      where: { id },
      data: { isActive: false },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'DIGITAL_ID_DEACTIVATED',
      module: 'DIGITAL_ID',
      affectedRecordId: id,
    });

    res.status(200).json(new ApiResponse(true, 'Digital ID deactivated', { digitalId }));
  } catch (error) {
    next(error);
  }
};

export const reactivateDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const adminUser = (req as any).user;

    const existing = await prisma.studentDigitalId.findUnique({ where: { id } });
    if (!existing) throw new AppError('Digital ID not found', 404);
    if (existing.revokedAt) {
      throw new AppError('Revoked Digital ID cannot be reactivated; please regenerate a new ID', 400);
    }

    const digitalId = await prisma.studentDigitalId.update({
      where: { id },
      data: { isActive: true },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'DIGITAL_ID_REACTIVATED',
      module: 'DIGITAL_ID',
      affectedRecordId: id,
    });

    res.status(200).json(new ApiResponse(true, 'Digital ID reactivated', { digitalId }));
  } catch (error) {
    next(error);
  }
};

export const revokeDigitalId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { revokedReason } = req.body;
    const adminUser = (req as any).user;

    if (!revokedReason || revokedReason.trim().length < 5) {
      throw new AppError('A mandatory revocation reason of at least 5 characters is required', 400);
    }

    const digitalId = await prisma.studentDigitalId.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: revokedReason.trim(),
      },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'DIGITAL_ID_REVOKED',
      module: 'DIGITAL_ID',
      affectedRecordId: id,
      safeMetadata: { revokedReason },
    });

    res.status(200).json(new ApiResponse(true, 'Digital ID revoked successfully', { digitalId }));
  } catch (error) {
    next(error);
  }
};

export const downloadDigitalIdPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const digitalId: any = await prisma.studentDigitalId.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
            academicEnrollments: {
              where: { isCurrent: true },
              include: {
                academicSession: true,
                classLevel: true,
                classSection: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!digitalId) throw new AppError('Digital ID not found', 404);

    const enrollment = digitalId.student.academicEnrollments[0];
    const verificationBaseUrl =
      process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

    const pdfBuffer = await generateDigitalIdPdfBuffer({
      studentName: digitalId.student.user.name,
      studentId: digitalId.student.studentId,
      className: enrollment?.classLevel?.name || 'Class 5',
      sectionName: enrollment?.classSection?.name || 'A',
      sessionName: enrollment?.academicSession?.name || '2026',
      rollNumber: enrollment?.rollNumber || digitalId.student.rollNumber || '01',
      guardianPhone: digitalId.student.guardianPhone || digitalId.student.phone || '+880 17 0000 0000',
      cardNumber: digitalId.cardNumber,
      issueDate: new Date(digitalId.issueDate).toLocaleDateString('en-GB'),
      expiryDate: new Date(digitalId.expiryDate).toLocaleDateString('en-GB'),
      photoUrl: digitalId.student.profileImage || undefined,
      verificationToken: digitalId.verificationToken,
      verificationBaseUrl,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="student-id-${encodeURIComponent(digitalId.student.studentId)}.pdf"`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store');
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
