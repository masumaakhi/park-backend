import { Request, Response, NextFunction } from 'express';
import { PrismaClient, VolunteerApplicationStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

const prisma = new PrismaClient();

export const submitVolunteerApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
       fullName, email, phone, dateOfBirth, gender, address, 
       occupation, education, skills, interests, availability, 
       preferredWorkArea, preferredProjectId, motivation 
    } = req.body;
    
    if (!fullName || !email || !phone || !motivation) {
       throw new AppError('Missing required fields', 400);
    }
    
    // Check for existing pending/review applications
    const existing = await prisma.volunteerApplication.findFirst({
       where: {
          email,
          status: {
             in: [VolunteerApplicationStatus.PENDING, VolunteerApplicationStatus.UNDER_REVIEW]
          }
       }
    });

    if (existing) {
       throw new AppError('You already have a pending volunteer application under review.', 409);
    }

    const application = await prisma.volunteerApplication.create({
      data: {
        fullName,
        email,
        phone,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        address,
        occupation,
        education,
        skills,
        interests,
        availability,
        preferredWorkArea,
        preferredProjectId,
        motivation,
        status: VolunteerApplicationStatus.PENDING
      }
    });

    res.status(201).json(new ApiResponse(true, 'Volunteer application submitted successfully', { 
        applicationId: application.id 
    }));
  } catch (error) {
    next(error);
  }
};
