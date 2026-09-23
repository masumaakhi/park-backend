import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getOrganizationProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.organizationProfile.findFirst();
    res.status(200).json(new ApiResponse(true, 'Organization profile fetched', { profile }));
  } catch (error) {
    next(error);
  }
};

export const getFeaturedProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        isFeatured: true,
        isPublished: true
      },
      include: {
        impactStats: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' }
        },
        galleryItems: {
          where: { isPublished: true },
          orderBy: { displayOrder: 'asc' },
          take: 4
        }
      }
    });
    res.status(200).json(new ApiResponse(true, 'Featured project fetched', { project }));
  } catch (error) {
    next(error);
  }
};
