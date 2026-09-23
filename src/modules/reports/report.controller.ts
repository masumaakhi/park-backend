import { Request, Response, NextFunction } from 'express';
import { PrismaClient, StudentEnrollmentStatus, InvoiceStatus, DonationStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

const prisma = new PrismaClient();

export const getOverviewReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      activeStudents,
      activeTeachers,
      totalDepartments,
      totalPrograms,
      publishedResults,
      activeAssignments,
      feesCollectedData,
      feesDueData,
      donationsCollectedData,
      activeVolunteers
    ] = await Promise.all([
      prisma.studentEnrollment.count({ where: { status: StudentEnrollmentStatus.ACTIVE, isCurrent: true } }),
      prisma.teacher.count({ where: { user: { isActive: true } } }),
      Promise.resolve(0), // departments removed
      Promise.resolve(0), // programs removed
      prisma.studentMark.count(),
      prisma.teacherSubjectAssignment.count(),
      prisma.studentInvoice.aggregate({ _sum: { paidAmount: true }, where: { status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] } } }),
      prisma.studentInvoice.aggregate({ _sum: { dueAmount: true }, where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } } }),
      prisma.donation.aggregate({ _sum: { amount: true }, where: { status: DonationStatus.PAID } }),
      prisma.volunteer.count({ where: { status: 'ACTIVE' } })
    ]);

    const data = {
       totalActiveStudents: activeStudents,
       totalActiveTeachers: activeTeachers,
       totalDepartments,
       totalPrograms,
       publishedResultsCount: publishedResults,
       activeAssignmentsCount: activeAssignments,
       totalSchoolFeeCollected: feesCollectedData._sum.paidAmount || 0,
       totalSchoolFeeDue: feesDueData._sum.dueAmount || 0,
       totalNgoDonationCollected: donationsCollectedData._sum.amount || 0,
       activeVolunteers
    };

    res.status(200).json(new ApiResponse(true, 'Overview report fetched successfully', data));
  } catch (error) {
    next(error);
  }
};
