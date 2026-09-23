import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  AdmissionSource,
  AdmissionStatus,
  AdmissionDocumentType,
  AdmissionDocumentStatus,
  Prisma,
} from '@prisma/client';
import {
  CreateAdmissionDto,
  ApproveAdmissionDto,
  AdmissionQueryFilters,
  DocumentReviewDto,
} from './admission.types';
import { recordAuditLog } from '../audit-logs/audit-log.service';

export class AdmissionService {
  /**
   * Generate next application number e.g. ADM-2026-00001
   */
  static async generateApplicationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.admissionApplication.count();
    const sequence = (count + 1).toString().padStart(5, '0');
    return `ADM-${year}-${sequence}`;
  }

  /**
   * Generate unique student ID e.g. EP-2026-0001
   */
  static async generateStudentId(year?: number): Promise<string> {
    const targetYear = year || new Date().getFullYear();
    const prefix = `EP-${targetYear}-`;

    // Find the latest student with this year prefix
    const latestStudent = await prisma.student.findFirst({
      where: {
        studentId: {
          startsWith: prefix,
        },
      },
      orderBy: {
        studentId: 'desc',
      },
    });

    let sequenceNumber = 1;
    if (latestStudent && latestStudent.studentId) {
      const parts = latestStudent.studentId.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          sequenceNumber = lastSeq + 1;
        }
      }
    }

    const paddedSequence = sequenceNumber.toString().padStart(4, '0');
    let candidateId = `${prefix}${paddedSequence}`;

    // Verify uniqueness
    while (await prisma.student.findUnique({ where: { studentId: candidateId } })) {
      sequenceNumber++;
      candidateId = `${prefix}${sequenceNumber.toString().padStart(4, '0')}`;
    }

    return candidateId;
  }

  /**
   * Create an admission application (Online or Office)
   */
  static async createApplication(
    data: CreateAdmissionDto,
    creatorUserId?: string
  ) {
    const applicationNumber = await this.generateApplicationNumber();

    const application = await prisma.admissionApplication.create({
      data: {
        applicationNumber,
        source: data.source,
        status: data.source === AdmissionSource.OFFICE && data.adminNote?.includes('[DRAFT]') 
          ? AdmissionStatus.DRAFT 
          : AdmissionStatus.PENDING,
        studentName: data.studentName,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        birthCertificateNumber: data.birthCertificateNumber,
        previousSchool: data.previousSchool || null,
        classAppliedForId: data.classAppliedForId,

        guardianName: data.guardianName,
        guardianRelation: data.guardianRelation,
        guardianPhone: data.guardianPhone,
        guardianEmail: data.guardianEmail || null,
        guardianNidNumber: data.guardianNidNumber,
        address: data.address,
        emergencyContact: data.emergencyContact,

        studentPhotoUrl: data.studentPhotoUrl || null,
        adminNote: data.adminNote || null,
      },
      include: {
        classAppliedFor: true,
      },
    });

    await recordAuditLog({
      actorId: creatorUserId,
      actorRole: creatorUserId ? 'ADMIN' : 'PUBLIC',
      action: 'ADMISSION_APPLICATION_CREATED',
      module: 'ADMISSIONS',
      affectedRecordId: application.id,
      safeMetadata: {
        applicationNumber: application.applicationNumber,
        source: application.source,
        studentName: application.studentName,
      },
    });

    return application;
  }

  /**
   * List admission applications with filters & pagination
   */
  static async listApplications(filters: AdmissionQueryFilters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.AdmissionApplicationWhereInput = {};

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { applicationNumber: { contains: search, mode: 'insensitive' } },
        { studentName: { contains: search, mode: 'insensitive' } },
        { guardianName: { contains: search, mode: 'insensitive' } },
        { guardianPhone: { contains: search, mode: 'insensitive' } },
        { birthCertificateNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters.source) {
      where.source = filters.source;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.classAppliedForId) {
      where.classAppliedForId = filters.classAppliedForId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    let orderBy: Prisma.AdmissionApplicationOrderByWithRelationInput = { createdAt: 'desc' };
    if (filters.sortBy === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (filters.sortBy === 'status') {
      orderBy = { status: 'asc' };
    }

    const [total, items] = await Promise.all([
      prisma.admissionApplication.count({ where }),
      prisma.admissionApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          classAppliedFor: true,
          documents: {
            select: {
              id: true,
              documentType: true,
              status: true,
            },
          },
          student: {
            select: {
              id: true,
              studentId: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single application by ID
   */
  static async getApplicationById(id: string) {
    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: {
        classAppliedFor: true,
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        documents: {
          include: {
            verifiedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        student: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                mustChangePassword: true,
              },
            },
            studentDigitalIds: {
              where: { isActive: true },
              take: 1,
            },
            academicEnrollments: {
              where: { isCurrent: true },
              include: {
                academicSession: true,
                classLevel: true,
                classSection: true,
              },
            },
          },
        },
      },
    });

    return application;
  }

  /**
   * Update application basic details / admin note
   */
  static async updateApplication(
    id: string,
    data: Partial<CreateAdmissionDto> & { adminNote?: string },
    adminUserId: string
  ) {
    const existing = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Admission application not found');
    if (existing.status === AdmissionStatus.APPROVED) {
      throw new Error('Cannot modify an approved application');
    }

    const updateData: Prisma.AdmissionApplicationUpdateInput = {};
    if (data.studentName) updateData.studentName = data.studentName;
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.gender) updateData.gender = data.gender;
    if (data.birthCertificateNumber) updateData.birthCertificateNumber = data.birthCertificateNumber;
    if (data.previousSchool !== undefined) updateData.previousSchool = data.previousSchool;
    if (data.classAppliedForId) {
      updateData.classAppliedFor = { connect: { id: data.classAppliedForId } };
    }
    if (data.guardianName) updateData.guardianName = data.guardianName;
    if (data.guardianRelation) updateData.guardianRelation = data.guardianRelation;
    if (data.guardianPhone) updateData.guardianPhone = data.guardianPhone;
    if (data.guardianEmail !== undefined) updateData.guardianEmail = data.guardianEmail;
    if (data.guardianNidNumber) updateData.guardianNidNumber = data.guardianNidNumber;
    if (data.address) updateData.address = data.address;
    if (data.emergencyContact) updateData.emergencyContact = data.emergencyContact;
    if (data.adminNote !== undefined) updateData.adminNote = data.adminNote;

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  /**
   * Transition to UNDER_REVIEW
   */
  static async markUnderReview(id: string, adminUserId: string) {
    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw new Error('Application not found');
    if (application.status === AdmissionStatus.APPROVED) {
      throw new Error('Cannot review an already approved application');
    }

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: {
        status: AdmissionStatus.UNDER_REVIEW,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'ADMISSION_UNDER_REVIEW',
      module: 'ADMISSIONS',
      affectedRecordId: id,
      safeMetadata: { applicationNumber: application.applicationNumber },
    });

    return updated;
  }

  /**
   * Reject application with mandatory reason
   */
  static async rejectApplication(id: string, reason: string, adminUserId: string) {
    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw new Error('Application not found');
    if (application.status === AdmissionStatus.APPROVED) {
      throw new Error('Cannot reject an approved application');
    }

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: {
        status: AdmissionStatus.REJECTED,
        rejectionReason: reason,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'ADMISSION_REJECTED',
      module: 'ADMISSIONS',
      affectedRecordId: id,
      safeMetadata: { applicationNumber: application.applicationNumber, reason },
    });

    return updated;
  }

  /**
   * Cancel application with mandatory reason
   */
  static async cancelApplication(id: string, reason: string, adminUserId: string) {
    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw new Error('Application not found');
    if (application.status === AdmissionStatus.APPROVED) {
      throw new Error('Cannot cancel an approved application');
    }

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: {
        status: AdmissionStatus.CANCELLED,
        rejectionReason: reason,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'ADMISSION_CANCELLED',
      module: 'ADMISSIONS',
      affectedRecordId: id,
      safeMetadata: { applicationNumber: application.applicationNumber, reason },
    });

    return updated;
  }

  /**
   * Review a document (VERIFIED, REJECTED, NEEDS_REUPLOAD)
   */
  static async reviewDocument(
    documentId: string,
    dto: DocumentReviewDto,
    adminUserId: string
  ) {
    const doc = await prisma.admissionDocument.findUnique({
      where: { id: documentId },
      include: { admissionApplication: true },
    });
    if (!doc) throw new Error('Document not found');

    const updatedDoc = await prisma.admissionDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        reviewNote: dto.reviewNote || null,
        verifiedById: dto.status === AdmissionDocumentStatus.VERIFIED ? adminUserId : null,
        verifiedAt: dto.status === AdmissionDocumentStatus.VERIFIED ? new Date() : null,
      },
    });

    // Check if any document needs re-upload or is rejected
    if (dto.status === AdmissionDocumentStatus.NEEDS_REUPLOAD) {
      await prisma.admissionApplication.update({
        where: { id: doc.admissionApplicationId },
        data: { status: AdmissionStatus.DOCUMENTS_REQUIRED },
      });
    }

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: `DOCUMENT_${dto.status}`,
      module: 'ADMISSIONS',
      affectedRecordId: documentId,
      safeMetadata: {
        documentType: doc.documentType,
        applicationId: doc.admissionApplicationId,
        reviewNote: dto.reviewNote,
      },
    });

    return updatedDoc;
  }

  /**
   * Approve Admission & Provision Student Account in single transaction
   */
  static async approveAdmission(
    id: string,
    dto: ApproveAdmissionDto,
    adminUserId: string
  ) {
    // 1. Fetch application with documents and check requirements
    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: {
        documents: true,
        classAppliedFor: true,
      },
    });

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.status === AdmissionStatus.APPROVED || application.studentId) {
      throw new Error('This application has already been approved');
    }

    // 2. Validate required documents are verified
    // Default required types: STUDENT_PHOTO, BIRTH_CERTIFICATE, GUARDIAN_NID
    const requiredTypes: AdmissionDocumentType[] = [
      AdmissionDocumentType.STUDENT_PHOTO,
      AdmissionDocumentType.BIRTH_CERTIFICATE,
      AdmissionDocumentType.GUARDIAN_NID,
    ];

    const missingOrUnverified = requiredTypes.filter((reqType) => {
      const hasVerified = application.documents.some(
        (d: any) => d.documentType === reqType && d.status === AdmissionDocumentStatus.VERIFIED
      );
      return !hasVerified;
    });

    if (missingOrUnverified.length > 0) {
      throw new Error(
        `Cannot approve application. The following required documents must be uploaded and verified: ${missingOrUnverified.join(', ')}`
      );
    }

    // 3. Validate Academic Session, Class Level, and Class Section
    const session = await prisma.academicSession.findUnique({
      where: { id: dto.academicSessionId },
    });
    if (!session) throw new Error('Invalid academic session');

    const classLevel = await prisma.classLevel.findUnique({
      where: { id: dto.classLevelId },
    });
    if (!classLevel) throw new Error('Invalid class level');

    const section = await prisma.classSection.findUnique({
      where: { id: dto.classSectionId },
    });
    if (!section) throw new Error('Invalid class section');
    if (section.classLevelId !== dto.classLevelId) {
      throw new Error('Class section does not belong to the selected class level');
    }

    // 4. Validate Roll Number uniqueness in session + section
    const existingRoll = await prisma.studentEnrollment.findFirst({
      where: {
        academicSessionId: dto.academicSessionId,
        classSectionId: dto.classSectionId,
        rollNumber: dto.rollNumber,
        isCurrent: true,
      },
    });

    if (existingRoll) {
      throw new Error(`Roll number ${dto.rollNumber} is already assigned in this class section`);
    }

    // 5. Determine Student ID
    let finalStudentId = dto.customStudentId?.trim();
    if (!finalStudentId) {
      finalStudentId = await this.generateStudentId();
    } else {
      const existingStudent = await prisma.student.findUnique({
        where: { studentId: finalStudentId },
      });
      if (existingStudent) {
        throw new Error(`Student ID ${finalStudentId} is already in use`);
      }
    }

    // 6. Generate temporary password
    const rawTempPassword = dto.temporaryPassword || Math.random().toString(36).slice(-8) + '!Ab1';
    const passwordHash = await bcrypt.hash(rawTempPassword, 10);

    // 7. Student email determination
    // A guardian may have multiple children or an existing account.
    // Each student account must have a guaranteed unique login email.
    let assignedEmail = application.guardianEmail?.trim()?.toLowerCase();

    if (assignedEmail) {
      const isTaken = await prisma.user.findFirst({
        where: { email: { equals: assignedEmail, mode: 'insensitive' } },
      });
      if (isTaken) {
        assignedEmail = undefined;
      }
    }

    if (!assignedEmail) {
      const sanitizedId = finalStudentId.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      let candidateEmail = `${sanitizedId}@student.edupark.local`;
      let seq = 1;
      while (
        await prisma.user.findFirst({
          where: { email: { equals: candidateEmail, mode: 'insensitive' } },
        })
      ) {
        candidateEmail = `${sanitizedId}_${seq}@student.edupark.local`;
        seq++;
      }
      assignedEmail = candidateEmail;
    }

    const photoDoc =
      application.documents.find(
        (d: any) =>
          d.documentType === AdmissionDocumentType.STUDENT_PHOTO &&
          d.status === AdmissionDocumentStatus.VERIFIED
      ) ||
      application.documents.find(
        (d: any) => d.documentType === AdmissionDocumentType.STUDENT_PHOTO
      );
    const photoUrl = application.studentPhotoUrl || photoDoc?.fileUrl || null;

    // 8. Execute single atomic Prisma transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // a. Create User with role STUDENT
      const user = await tx.user.create({
        data: {
          name: application.studentName,
          email: assignedEmail,
          passwordHash,
          role: 'STUDENT',
          isActive: true,
          mustChangePassword: true,
          passwordSetAt: null,
        },
      });

      // b. Create Student Profile
      const student = await tx.student.create({
        data: {
          userId: user.id,
          studentId: finalStudentId,
          rollNumber: dto.rollNumber,
          phone: application.guardianPhone,
          address: application.address,
          emergencyContact: application.emergencyContact,
          guardianName: application.guardianName,
          guardianPhone: application.guardianPhone,
          guardianRelation: application.guardianRelation,
          profileImage: photoUrl,
        },
      });

      // c. Create StudentEnrollment
      const enrollment = await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicSessionId: dto.academicSessionId,
          classLevelId: dto.classLevelId,
          classSectionId: dto.classSectionId,
          rollNumber: dto.rollNumber,
          status: 'ACTIVE',
          startDate: new Date(),
          isCurrent: true,
        },
      });

      // d. Connect created Student to AdmissionApplication and mark APPROVED
      const updatedApplication = await tx.admissionApplication.update({
        where: { id: application.id },
        data: {
          status: AdmissionStatus.APPROVED,
          studentId: student.id,
          approvedById: adminUserId,
          approvedAt: new Date(),
        },
      });

      // e. Create StudentDigitalId automatically
      const year = new Date().getFullYear();
      const count = await tx.studentDigitalId.count();
      const cardNumber = `EP-ID-${year}-${String(count + 1).padStart(5, '0')}`;
      const verificationToken = crypto.randomBytes(24).toString('hex');
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const digitalId = await tx.studentDigitalId.create({
        data: {
          studentId: student.id,
          cardNumber,
          verificationToken,
          expiryDate,
          isActive: true,
        },
      });

      return {
        user,
        student,
        enrollment,
        application: updatedApplication,
        digitalId,
      };
    });

    // 9. Record audit log
    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'ADMISSION_APPROVED_AND_STUDENT_CREATED',
      module: 'ADMISSIONS',
      affectedRecordId: id,
      safeMetadata: {
        applicationNumber: application.applicationNumber,
        studentId: finalStudentId,
        rollNumber: dto.rollNumber,
        userId: result.user.id,
        digitalId: result.digitalId.id,
      },
    });

    return {
      success: true,
      message: 'Admission approved and student account created successfully',
      studentId: finalStudentId,
      studentName: application.studentName,
      userEmail: result.user.email,
      temporaryPassword: rawTempPassword,
      mustChangePassword: true,
      digitalIdId: result.digitalId.id,
    };
  }
}
