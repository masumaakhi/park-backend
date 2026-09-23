import { Request, Response, NextFunction } from 'express';
import { PrismaClient, DonationStatus, PaymentMethod } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export const getPublicCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaigns = await prisma.donationCampaign.findMany({
      where: {
        isPublished: true,
        isActive: true
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    res.status(200).json(new ApiResponse(true, 'Campaigns fetched', { campaigns }));
  } catch (error) {
    next(error);
  }
};

export const initiateDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { campaignId, amount, fullName, email, phone, isAnonymous, message } = req.body;
    
    if (!campaignId || !amount || !fullName || !email) {
       throw new AppError('Missing required fields', 400);
    }
    
    const minAmount = parseInt(process.env.DONATION_MIN_AMOUNT || '100', 10);
    if (amount < minAmount) {
       throw new AppError(`Minimum donation amount is ${minAmount} BDT`, 400);
    }

    const campaign = await prisma.donationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || !campaign.isActive || !campaign.isPublished) {
       throw new AppError('Invalid or inactive campaign', 404);
    }

    // Upsert Donor
    let donor = await prisma.donor.findFirst({ where: { email } });
    if (!donor) {
       donor = await prisma.donor.create({
          data: { fullName, email, phone, isAnonymous }
       });
    }

    const transactionId = `TISTA-${randomUUID()}`;

    // Create Pending Donation
    const donation = await prisma.donation.create({
      data: {
        donorId: donor.id,
        campaignId: campaign.id,
        amount,
        transactionId,
        paymentMethod: PaymentMethod.SSLCOMMERZ,
        status: DonationStatus.PENDING,
        message,
        isAnonymous
      }
    });

    await prisma.donationAuditLog.create({
      data: {
        donationId: donation.id,
        action: 'INITIATED',
        metadata: JSON.stringify({ amount, paymentMethod: 'SSLCOMMERZ' })
      }
    });

    // In a real scenario, here we would call SSLCommerz init API.
    // For this mock, we will return a mock gateway URL.
    const mockGatewayUrl = `http://localhost:5000/api/v1/payments/sslcommerz/mock-checkout?transactionId=${transactionId}`;

    res.status(200).json(new ApiResponse(true, 'Donation initiated', { 
        transactionId,
        gatewayUrl: mockGatewayUrl 
    }));
  } catch (error) {
    next(error);
  }
};
