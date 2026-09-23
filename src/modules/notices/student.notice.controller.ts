import { Request, Response, NextFunction } from 'express';
import { PrismaClient, NoticeAudience } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const getStudentNotices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const student = await prisma.student.findUnique({ 
      where: { userId },
      include: { academicEnrollments: { where: { isCurrent: true } } }
    });
    if (!student) throw new AppError('Student not found', 404);

    const now = new Date();
    const currentEnrollment = student.academicEnrollments[0];

    const notices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.STUDENTS] } },
          { OR: [{ academicSessionId: null }, { academicSessionId: currentEnrollment?.academicSessionId }] },
          { OR: [{ classSectionId: null }, { classSectionId: currentEnrollment?.classSectionId }] }
        ]
      },
      orderBy: [
        { publishAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.status(200).json(new ApiResponse(true, 'Notices fetched', { notices }));
  } catch (error) {
    next(error);
  }
};

export const getStudentNoticeDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    const userId = req.user?.id;
    const student = await prisma.student.findUnique({ 
      where: { userId },
      include: { academicEnrollments: { where: { isCurrent: true } } }
    });
    if (!student) throw new AppError('Student not found', 404);

    const now = new Date();
    const currentEnrollment = student.academicEnrollments[0];

    const notice = await prisma.notice.findFirst({
      where: {
        slug,
        isPublished: true,
        isArchived: false,
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { targetAudience: { in: [NoticeAudience.EVERYONE, NoticeAudience.STUDENTS] } },
          { OR: [{ academicSessionId: null }, { academicSessionId: currentEnrollment?.academicSessionId }] },
          { OR: [{ classSectionId: null }, { classSectionId: currentEnrollment?.classSectionId }] }
        ]
      },
      include: {
        user: { select: { email: true } }
      }
    });

    if (!notice) throw new AppError('Notice not found or you do not have permission to view it', 404);

    res.status(200).json(new ApiResponse(true, 'Notice detail fetched', { notice }));
  } catch (error) {
    next(error);
  }
};

