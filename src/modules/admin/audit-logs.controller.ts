import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200 // Limit to recent 200 logs for performance
    });
    res.status(200).json(new ApiResponse(true, 'Audit logs fetched', { logs }));
  } catch (error) { next(error); }
};
