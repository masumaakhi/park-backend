import { Request, Response, NextFunction } from 'express';
import { PrismaClient, FeePaymentStatus, InvoiceStatus, FeePaymentMethod } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export const initiateFeePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId } = req.params;
    const studentId = req.user?.id;
    
    if (!studentId) throw new AppError('Unauthorized', 401);

    const invoice = await prisma.studentInvoice.findUnique({
       where: { id: invoiceId as string }
    });

    if (!invoice || invoice.studentId !== studentId) {
       throw new AppError('Invoice not found or access denied', 404);
    }
    
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.VOID) {
       throw new AppError(`Cannot pay invoice in status: ${invoice.status}`, 400);
    }
    
    if (Number(invoice.dueAmount) <= 0) {
       throw new AppError('Invoice is already fully paid', 400);
    }

    const paymentNumber = `FEE-${randomUUID()}`;

    // Create PENDING FeePayment
    const payment = await prisma.feePayment.create({
      data: {
        invoiceId: invoice.id,
        studentId: studentId,
        paymentNumber,
        amount: invoice.dueAmount,
        paymentMethod: FeePaymentMethod.SSLCOMMERZ,
        status: FeePaymentStatus.PENDING,
      }
    });

    // In a real integration, call SSLCommerz Init API here
    const mockGatewayUrl = `http://localhost:5000/api/v1/payments/fees/sslcommerz/mock-checkout?paymentNumber=${paymentNumber}`;

    res.status(200).json(new ApiResponse(true, 'Fee payment initiated', { 
        paymentNumber,
        gatewayUrl: mockGatewayUrl 
    }));
  } catch (error) {
    next(error);
  }
};
