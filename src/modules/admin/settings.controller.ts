import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let profile = await prisma.organizationProfile.findFirst();
    if (!profile) {
      profile = await prisma.organizationProfile.create({
        data: {
          name: 'Educational Park',
          tagline: 'Learners Today · Brighter Tomorrow',
          mission: 'To empower the next generation with foundational knowledge, compassionate values, and forward-thinking skills.',
          vision: 'A kinder, brighter Bangladesh where quality education is accessible to every child.',
          email: 'info@educationalpark.edu.bd',
          phone: '+880 1711 234 567',
          address: 'Rangpur, Bangladesh',
          facebookUrl: 'https://facebook.com',
          instagramUrl: 'https://instagram.com',
          linkedinUrl: 'https://linkedin.com',
          youtubeUrl: 'https://youtube.com'
        }
      });
    }

    res.status(200).json(new ApiResponse(true, 'Settings retrieved successfully', { profile }));
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      tagline,
      mission,
      vision,
      logoUrl,
      heroImageUrl,
      email,
      phone,
      address,
      facebookUrl,
      instagramUrl,
      linkedinUrl,
      youtubeUrl
    } = req.body;

    let profile = await prisma.organizationProfile.findFirst();

    if (!profile) {
      profile = await prisma.organizationProfile.create({
        data: {
          name: name || 'Educational Park',
          tagline,
          mission,
          vision,
          logoUrl,
          heroImageUrl,
          email,
          phone,
          address,
          facebookUrl,
          instagramUrl,
          linkedinUrl,
          youtubeUrl
        }
      });
    } else {
      profile = await prisma.organizationProfile.update({
        where: { id: profile.id },
        data: {
          name: name ?? profile.name,
          tagline: tagline ?? profile.tagline,
          mission: mission ?? profile.mission,
          vision: vision ?? profile.vision,
          logoUrl: logoUrl ?? profile.logoUrl,
          heroImageUrl: heroImageUrl ?? profile.heroImageUrl,
          email: email ?? profile.email,
          phone: phone ?? profile.phone,
          address: address ?? profile.address,
          facebookUrl: facebookUrl ?? profile.facebookUrl,
          instagramUrl: instagramUrl ?? profile.instagramUrl,
          linkedinUrl: linkedinUrl ?? profile.linkedinUrl,
          youtubeUrl: youtubeUrl ?? profile.youtubeUrl
        }
      });
    }

    res.status(200).json(new ApiResponse(true, 'Settings updated successfully', { profile }));
  } catch (error) {
    next(error);
  }
};
