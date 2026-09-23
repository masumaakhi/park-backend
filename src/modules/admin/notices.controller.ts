import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

const generateSlug = (title: string) => {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
};

export const getNotices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notices = await prisma.notice.findMany({
      include: {
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(new ApiResponse(true, 'Notices fetched', { notices }));
  } catch (error) { next(error); }
};

export const createNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const slug = generateSlug(title);
    
    // Check for nullable fields from frontend that might be empty strings
    const data = { ...req.body, slug, createdById: req.user!.id };
    
    
    if (data.academicSessionId === "") data.academicSessionId = null;
    if (data.batchId === "") data.batchId = null;
    if (data.publishAt === "") data.publishAt = null;
    if (data.expiresAt === "") data.expiresAt = null;

    if (data.publishAt) {
      data.publishAt = new Date(data.publishAt);
    } else if (data.isPublished !== false) {
      data.publishAt = new Date();
    }

    if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);

    const notice = await prisma.notice.create({ data });
    res.status(201).json(new ApiResponse(true, 'Notice created', { notice }));
  } catch (error) { next(error); }
};

export const updateNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const data = { ...req.body };

    if (data.publishAt === "") data.publishAt = null;
    if (data.expiresAt === "") data.expiresAt = null;
    if (data.publishAt) data.publishAt = new Date(data.publishAt);
    if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);

    // If publishing without explicit publishAt, default to now
    if (data.isPublished === true && !data.publishAt) {
      const existing = await prisma.notice.findUnique({ where: { id } });
      if (!existing?.publishAt) {
        data.publishAt = new Date();
      }
    }
    
    const notice = await prisma.notice.update({
      where: { id },
      data
    });

    res.status(200).json(new ApiResponse(true, 'Notice updated', { notice }));
  } catch (error) { next(error); }
};
