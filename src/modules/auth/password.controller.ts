import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Role, EmailTemplate, EmailNotificationStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { randomBytes, createHash } from 'crypto';

const prisma = new PrismaClient();

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, portalRole } = req.body;
    
    // 1. Generic response for security
    const genericMessage = 'If an account exists for this email, a reset link has been sent.';
    
    if (!email || !portalRole) {
       return res.status(200).json(new ApiResponse(true, genericMessage, {}));
    }

    // 2. Find user matching email and role
    const user = await prisma.user.findFirst({
       where: { email, role: portalRole as Role, isActive: true }
    });

    if (user) {
       // 3. Invalidate old tokens
       await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() }
       });

       // 4. Generate token and hash
       const rawToken = randomBytes(32).toString('hex');
       const tokenHash = createHash('sha256').update(rawToken).digest('hex');
       const expiryMinutes = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || '30', 10);
       
       const expiresAt = new Date();
       expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

       await prisma.passwordResetToken.create({
          data: {
             userId: user.id,
             tokenHash,
             expiresAt
          }
       });

       // 5. Determine portal URL
       let resetUrl = '';
       if (portalRole === Role.STUDENT) resetUrl = process.env.STUDENT_PORTAL_URL || 'http://localhost:3002';
       else if (portalRole === Role.TEACHER) resetUrl = process.env.TEACHER_PORTAL_URL || 'http://localhost:3003';
       else if (portalRole === Role.ADMIN) resetUrl = process.env.ADMIN_PORTAL_URL || 'http://localhost:3004';
       
       resetUrl = `${resetUrl}/reset-password?token=${rawToken}`;

       // 6. Queue Email Notification
       await prisma.emailNotification.create({
          data: {
             recipientEmail: user.email,
             recipientUserId: user.id,
             subject: 'Tista Portal - Password Reset',
             template: EmailTemplate.PASSWORD_RESET,
             status: EmailNotificationStatus.PENDING,
             metadata: JSON.stringify({ resetUrl })
          }
       });
       
       // Trigger actual email send here via notification service
    }

    res.status(200).json(new ApiResponse(true, genericMessage, {}));
  } catch (error) {
    next(error);
  }
};
