import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: 'api',
    status: 'healthy'
  });
});

router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      service: 'api',
      status: 'ready',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      service: 'api',
      status: 'unready',
      database: 'disconnected'
    });
  }
});

export default router;
