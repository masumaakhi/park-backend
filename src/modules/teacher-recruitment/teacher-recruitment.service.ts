import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { TeacherStorageService } from '../uploads/teacher-storage.service';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import {
  TeacherApplicationStatus,
  TeacherAppointmentDocumentType,
  TeacherAppointmentDocumentStatus,
  TeacherInterviewType,
  TeacherInterviewStatus,
  EmploymentType,
} from './teacher-recruitment.types';

export class TeacherRecruitmentService {
  /**
   * Generate Unique Application Number: TEA-{YEAR}-{6DIGITS}
   */
  static async generateApplicationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      const randomPart = Math.floor(100000 + Math.random() * 900000);
      const appNumber = `TEA-${year}-${randomPart}`;
      const existing = await prisma.teacherApplication.findUnique({
        where: { applicationNumber: appNumber },
      });
      if (!existing) return appNumber;
    }
    return `TEA-${year}-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Generate Unique Employee ID: EP-T-{YEAR}-{SEQUENCE}
   */
  static async generateEmployeeId(customYear?: number): Promise<string> {
    const year = customYear || new Date().getFullYear();
    const prefix = `EP-T-${year}-`;

    const existingTeachers = await prisma.teacher.findMany({
      where: {
        employeeId: { startsWith: prefix },
      },
      select: { employeeId: true },
    });

    let maxSeq = 0;
    for (const t of existingTeachers) {
      const parts = t.employeeId.split('-');
      if (parts.length === 4) {
        const seq = parseInt(parts[3], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    const nextSeq = maxSeq + 1;
    const formattedSeq = String(nextSeq).padStart(4, '0');
    return `${prefix}${formattedSeq}`;
  }

  /**
   * Safely resolve admin user ID for foreign key relations
   */
  static async resolveAdminUserId(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return user.id;
    const defaultAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    return defaultAdmin ? defaultAdmin.id : null;
  }

  /**
   * Check for duplicate active application
   */
  static async checkActiveDuplicate(email: string): Promise<boolean> {
    const active = await prisma.teacherApplication.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        status: {
          notIn: ['REJECTED', 'CANCELLED', 'APPOINTED'],
        },
      },
    });
    return !!active;
  }

  /**
   * 1. Public Submission
   */
  static async submitPublicApplication(
    data: {
      fullName: string;
      email: string;
      phone: string;
      currentAddress: string;
      appliedPosition: string;
      subjectExpertise: string;
      preferredClassLevels?: string;
      highestEducation: string;
      yearsOfExperience: number;
      coverMessage: string;
      dateOfBirth?: string;
      gender?: string;
      circularId?: string;
    },
    cvFile: Express.Multer.File,
    ipAddress?: string
  ) {
    const hasActive = await this.checkActiveDuplicate(data.email);
    if (hasActive) {
      throw new Error(
        'An active teacher job application already exists with this email address. You cannot submit multiple active applications.'
      );
    }

    // Check circular deadline if circular is specified or active
    let circular = null;
    if (data.circularId) {
      circular = await prisma.teacherCircular.findUnique({ where: { id: data.circularId } });
    } else {
      circular = await prisma.teacherCircular.findFirst({
        where: {
          status: 'PUBLISHED',
          deadline: { gte: new Date() },
        },
        orderBy: { deadline: 'desc' },
      });
    }

    if (circular) {
      if (circular.status !== 'PUBLISHED') {
        throw new Error('This recruitment circular is currently closed or not active.');
      }
      if (new Date() > new Date(circular.deadline)) {
        throw new Error(
          `The application deadline (${new Date(circular.deadline).toLocaleDateString()}) for this recruitment circular has expired.`
        );
      }
    }

    const cvValidation = TeacherStorageService.validateCV(cvFile);
    if (!cvValidation.valid) {
      throw new Error(cvValidation.error || 'Invalid CV file');
    }

    const storedCv = await TeacherStorageService.savePrivateFile(cvFile, 'cvs');
    const applicationNumber = await this.generateApplicationNumber();

    const application = await prisma.teacherApplication.create({
      data: {
        applicationNumber,
        source: 'ONLINE',
        status: 'SUBMITTED',
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        currentAddress: data.currentAddress.trim(),
        appliedPosition: data.appliedPosition.trim(),
        subjectExpertise: data.subjectExpertise.trim(),
        preferredClassLevels: data.preferredClassLevels?.trim() || null,
        highestEducation: data.highestEducation.trim(),
        yearsOfExperience: Number(data.yearsOfExperience) || 0,
        coverMessage: data.coverMessage.trim(),
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        gender: data.gender || null,
        cvUrl: storedCv.storageFileName,
        cvPublicId: storedCv.fileName,
        teacherCircularId: circular ? circular.id : null,
      },
    });

    await recordAuditLog({
      action: 'TEACHER_APPLICATION_SUBMITTED_ONLINE',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: application.id,
      safeMetadata: {
        applicationNumber,
        email: application.email,
        position: application.appliedPosition,
      },
      ipAddress,
    });

    return {
      applicationNumber,
      fullName: application.fullName,
      email: application.email,
      appliedPosition: application.appliedPosition,
      createdAt: application.createdAt,
    };
  }

  /**
   * 2. Office Submission
   */
  static async createOfficeApplication(
    data: {
      fullName: string;
      email: string;
      phone: string;
      currentAddress: string;
      appliedPosition: string;
      subjectExpertise: string;
      preferredClassLevels?: string;
      highestEducation: string;
      yearsOfExperience: number;
      coverMessage?: string;
      dateOfBirth?: string;
      gender?: string;
      adminNote?: string;
    },
    cvFile: Express.Multer.File,
    adminUserId: string,
    ipAddress?: string
  ) {
    const hasActive = await this.checkActiveDuplicate(data.email);
    if (hasActive) {
      throw new Error(
        'An active application already exists with this email address.'
      );
    }

    const cvValidation = TeacherStorageService.validateCV(cvFile);
    if (!cvValidation.valid) {
      throw new Error(cvValidation.error || 'Invalid CV file');
    }

    const storedCv = await TeacherStorageService.savePrivateFile(cvFile, 'cvs');
    const applicationNumber = await this.generateApplicationNumber();

    const application = await prisma.teacherApplication.create({
      data: {
        applicationNumber,
        source: 'OFFICE',
        status: 'SUBMITTED',
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        currentAddress: data.currentAddress.trim(),
        appliedPosition: data.appliedPosition.trim(),
        subjectExpertise: data.subjectExpertise.trim(),
        preferredClassLevels: data.preferredClassLevels?.trim() || null,
        highestEducation: data.highestEducation.trim(),
        yearsOfExperience: Number(data.yearsOfExperience) || 0,
        coverMessage: data.coverMessage?.trim() || 'Office walk-in submission',
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        gender: data.gender || null,
        adminNote: data.adminNote?.trim() || null,
        cvUrl: storedCv.storageFileName,
        cvPublicId: storedCv.fileName,
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_CREATED_OFFICE',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: application.id,
      safeMetadata: {
        applicationNumber,
        email: application.email,
        position: application.appliedPosition,
      },
      ipAddress,
    });

    return application;
  }

  /**
   * 3. Get Applications (List with filters & pagination)
   */
  static async getTeacherApplications(query: {
    page?: number;
    limit?: number;
    search?: string;
    source?: string;
    status?: string;
    experience?: string;
    preferredClassLevel?: string;
    circularId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.circularId && query.circularId !== 'ALL') {
      where.teacherCircularId = query.circularId;
    }

    if (query.source && query.source !== 'ALL') {
      where.source = query.source;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.preferredClassLevel && query.preferredClassLevel !== 'ALL') {
      where.preferredClassLevels = {
        contains: query.preferredClassLevel,
        mode: 'insensitive',
      };
    }

    if (query.experience && query.experience !== 'ALL') {
      const exp = Number(query.experience);
      if (!isNaN(exp)) {
        where.yearsOfExperience = { gte: exp };
      }
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { applicationNumber: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { appliedPosition: { contains: term, mode: 'insensitive' } },
        { subjectExpertise: { contains: term, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    if (query.sortBy === 'oldest') orderBy = { createdAt: 'asc' };
    if (query.sortBy === 'name') orderBy = { fullName: 'asc' };
    if (query.sortBy === 'experience') orderBy = { yearsOfExperience: 'desc' };

    const [total, items] = await Promise.all([
      prisma.teacherApplication.count({ where }),
      prisma.teacherApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          teacherCircular: {
            select: { id: true, circularNumber: true, title: true, deadline: true },
          },
          interviews: {
            select: { id: true, interviewType: true, status: true, scheduledAt: true, score: true },
          },
          documents: {
            select: { id: true, documentType: true, status: true },
          },
          appointment: {
            select: { id: true, appointmentStatus: true, designation: true, joiningDate: true },
          },
        },
      }),
    ]);

    // Attach short-lived view token for secure CV preview in admin list
    const enrichedItems = items.map((app) => ({
      ...app,
      cvSignedToken: TeacherStorageService.generateSignedToken(app.id, 900),
    }));

    return {
      items: enrichedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 4. Get Application Detail
   */
  static async getTeacherApplicationById(id: string) {
    const application = await prisma.teacherApplication.findUnique({
      where: { id },
      include: {
        teacherCircular: true,
        reviewedBy: { select: { id: true, name: true, email: true } },
        shortlistedBy: { select: { id: true, name: true, email: true } },
        selectedBy: { select: { id: true, name: true, email: true } },
        interviews: {
          include: {
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: 'desc' },
        },
        documents: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
            verifiedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        appointment: {
          include: {
            appointedBy: { select: { id: true, name: true } },
            teacher: { select: { id: true, employeeId: true, phone: true } },
          },
        },
      },
    });

    if (!application) {
      throw new Error('Teacher application not found');
    }

    // Attach signed tokens for CV and documents
    const cvSignedToken = TeacherStorageService.generateSignedToken(application.id, 1800);
    const documentsWithTokens = application.documents.map((doc) => ({
      ...doc,
      signedToken: TeacherStorageService.generateSignedToken(doc.id, 1800),
    }));

    return {
      ...application,
      cvSignedToken,
      documents: documentsWithTokens,
    };
  }

  /**
   * 5. Update Application Basic Info / Notes
   */
  static async updateApplication(id: string, data: any, adminUserId: string) {
    const existing = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Application not found');

    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        adminNote: data.adminNote !== undefined ? data.adminNote : existing.adminNote,
        appliedPosition: data.appliedPosition || existing.appliedPosition,
        subjectExpertise: data.subjectExpertise || existing.subjectExpertise,
        preferredClassLevels: data.preferredClassLevels !== undefined ? data.preferredClassLevels : existing.preferredClassLevels,
      },
    });

    return updated;
  }

  /**
   * 6. Move to UNDER_REVIEW
   */
  static async markUnderReview(id: string, adminUserId: string, ipAddress?: string) {
    const existing = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Application not found');

    if (existing.status === 'APPOINTED' || existing.status === 'REJECTED' || existing.status === 'CANCELLED') {
      throw new Error(`Cannot move application in ${existing.status} status to UNDER_REVIEW`);
    }

    const reviewerId = await this.resolveAdminUserId(adminUserId);
    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_UNDER_REVIEW',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: id,
      ipAddress,
    });

    return updated;
  }

  /**
   * 7. Shortlist Candidate
   */
  static async shortlistCandidate(id: string, adminUserId: string, ipAddress?: string) {
    const existing = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Application not found');

    if (['REJECTED', 'CANCELLED', 'APPOINTED'].includes(existing.status)) {
      throw new Error(`Cannot shortlist an application in ${existing.status} status`);
    }

    const shortlisterId = await this.resolveAdminUserId(adminUserId);
    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        status: 'SHORTLISTED',
        shortlistedById: shortlisterId,
        shortlistedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_SHORTLISTED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: id,
      ipAddress,
    });

    return updated;
  }

  /**
   * 8. Select Candidate
   */
  static async selectCandidate(id: string, adminUserId: string, ipAddress?: string) {
    const existing = await prisma.teacherApplication.findUnique({
      where: { id },
      include: { interviews: true },
    });
    if (!existing) throw new Error('Application not found');

    if (['REJECTED', 'CANCELLED', 'APPOINTED'].includes(existing.status)) {
      throw new Error(`Cannot select candidate in ${existing.status} status`);
    }

    // Must have at least one completed interview / demo class
    const hasCompletedInterview = existing.interviews.some(
      (inv) => inv.status === 'COMPLETED'
    );
    if (!hasCompletedInterview) {
      throw new Error(
        'Candidate must complete at least one Interview or Demo Class before selection.'
      );
    }

    const selectorId = await this.resolveAdminUserId(adminUserId);
    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        status: 'SELECTED',
        selectedById: selectorId,
        selectedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_SELECTED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: id,
      ipAddress,
    });

    return updated;
  }

  /**
   * 9. Reject Candidate (Mandatory reason)
   */
  static async rejectCandidate(
    id: string,
    rejectionReason: string,
    adminUserId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Application not found');

    if (existing.status === 'APPOINTED') {
      throw new Error('Cannot reject an already appointed teacher application');
    }

    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_REJECTED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: id,
      safeMetadata: { rejectionReason: rejectionReason.trim() },
      ipAddress,
    });

    return updated;
  }

  /**
   * 10. Cancel Application (Mandatory reason)
   */
  static async cancelApplication(
    id: string,
    reason: string,
    adminUserId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!existing) throw new Error('Application not found');

    if (existing.status === 'APPOINTED') {
      throw new Error('Cannot cancel an already appointed teacher application');
    }

    const updated = await prisma.teacherApplication.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        rejectionReason: reason.trim(),
      },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPLICATION_CANCELLED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: id,
      safeMetadata: { cancelReason: reason.trim() },
      ipAddress,
    });

    return updated;
  }

  /**
   * 11. Schedule Interview / Demo Class
   */
  static async scheduleInterview(
    applicationId: string,
    data: {
      interviewType: TeacherInterviewType;
      scheduledAt: string;
      location: string;
      interviewerName: string;
    },
    adminUserId: string,
    ipAddress?: string
  ) {
    const app = await prisma.teacherApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error('Application not found');

    if (['REJECTED', 'CANCELLED', 'APPOINTED'].includes(app.status)) {
      throw new Error(`Cannot schedule interview for application in ${app.status} status`);
    }

    const creatorId = await this.resolveAdminUserId(adminUserId);
    const interview = await prisma.teacherInterview.create({
      data: {
        teacherApplicationId: applicationId,
        interviewType: data.interviewType,
        scheduledAt: new Date(data.scheduledAt),
        location: data.location.trim(),
        interviewerName: data.interviewerName.trim(),
        status: 'SCHEDULED',
        createdById: creatorId,
      },
    });

    // Update application status
    const newStatus: TeacherApplicationStatus =
      data.interviewType === 'DEMO_CLASS' ? 'DEMO_CLASS_SCHEDULED' : 'INTERVIEW_SCHEDULED';

    await prisma.teacherApplication.update({
      where: { id: applicationId },
      data: { status: newStatus },
    });

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: `TEACHER_${data.interviewType}_SCHEDULED`,
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: interview.id,
      safeMetadata: {
        applicationId,
        interviewType: data.interviewType,
        scheduledAt: data.scheduledAt,
      },
      ipAddress,
    });

    return interview;
  }

  /**
   * 12. Update Interview / Demo Class (Status, Feedback, Score)
   */
  static async updateInterview(
    applicationId: string,
    interviewId: string,
    data: {
      status?: TeacherInterviewStatus;
      feedback?: string;
      score?: number;
    },
    adminUserId: string,
    ipAddress?: string
  ) {
    const interview = await prisma.teacherInterview.findFirst({
      where: { id: interviewId, teacherApplicationId: applicationId },
    });
    if (!interview) throw new Error('Interview record not found');

    const updated = await prisma.teacherInterview.update({
      where: { id: interviewId },
      data: {
        status: data.status || interview.status,
        feedback: data.feedback !== undefined ? data.feedback : interview.feedback,
        score: data.score !== undefined ? Number(data.score) : interview.score,
      },
    });

    // If marked completed, update application status
    if (data.status === 'COMPLETED') {
      const newStatus: TeacherApplicationStatus =
        interview.interviewType === 'DEMO_CLASS'
          ? 'DEMO_CLASS_COMPLETED'
          : 'INTERVIEW_COMPLETED';

      await prisma.teacherApplication.update({
        where: { id: applicationId },
        data: { status: newStatus },
      });
    }

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: `TEACHER_${interview.interviewType}_EVALUATED`,
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: interview.id,
      safeMetadata: {
        status: updated.status,
        score: updated.score,
      },
      ipAddress,
    });

    return updated;
  }

  /**
   * 13. Upload Sensitive Staff Document (Post-selection)
   */
  static async uploadAppointmentDocument(
    applicationId: string,
    documentType: TeacherAppointmentDocumentType,
    file: Express.Multer.File,
    adminUserId: string,
    ipAddress?: string
  ) {
    const app = await prisma.teacherApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error('Application not found');

    // Documents stage is unlocked only after candidate is SELECTED or later
    const allowedStatuses: TeacherApplicationStatus[] = [
      'SELECTED',
      'DOCUMENTS_PENDING',
      'DOCUMENTS_VERIFIED',
      'APPOINTED',
    ];
    if (!allowedStatuses.includes(app.status)) {
      throw new Error(
        'Documents can only be uploaded after candidate has been moved to SELECTED or DOCUMENTS_PENDING status'
      );
    }

    const validation = TeacherStorageService.validateDocument(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid document file');
    }

    const storedFile = await TeacherStorageService.savePrivateFile(file, 'documents');

    const uploaderId = await this.resolveAdminUserId(adminUserId);
    const document = await prisma.teacherAppointmentDocument.create({
      data: {
        teacherApplicationId: applicationId,
        documentType,
        fileName: storedFile.fileName,
        fileUrl: storedFile.storageFileName,
        mimeType: storedFile.mimeType,
        fileSize: storedFile.fileSize,
        status: 'PENDING_REVIEW',
        uploadedById: uploaderId,
      },
    });

    // If application was SELECTED, set status to DOCUMENTS_PENDING
    if (app.status === 'SELECTED') {
      await prisma.teacherApplication.update({
        where: { id: applicationId },
        data: { status: 'DOCUMENTS_PENDING' },
      });
    }

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_DOCUMENT_UPLOADED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: document.id,
      safeMetadata: {
        applicationId,
        documentType,
        fileName: document.fileName,
      },
      ipAddress,
    });

    return {
      ...document,
      signedToken: TeacherStorageService.generateSignedToken(document.id, 1800),
    };
  }

  /**
   * 14. Review Document (Verify / Reject / Needs Re-upload)
   */
  static async reviewDocument(
    applicationId: string,
    documentId: string,
    data: {
      status: TeacherAppointmentDocumentStatus;
      reviewNote?: string;
    },
    adminUserId: string,
    ipAddress?: string
  ) {
    const doc = await prisma.teacherAppointmentDocument.findFirst({
      where: { id: documentId, teacherApplicationId: applicationId },
    });
    if (!doc) throw new Error('Document record not found');

    if (['REJECTED', 'NEEDS_REUPLOAD'].includes(data.status) && (!data.reviewNote || data.reviewNote.trim().length < 3)) {
      throw new Error('A review note is mandatory when rejecting or requesting re-upload of a document');
    }

    const verifierId = data.status === 'VERIFIED' ? await this.resolveAdminUserId(adminUserId) : null;
    const updatedDoc = await prisma.teacherAppointmentDocument.update({
      where: { id: documentId },
      data: {
        status: data.status,
        reviewNote: data.reviewNote ? data.reviewNote.trim() : null,
        verifiedById: verifierId,
        verifiedAt: data.status === 'VERIFIED' ? new Date() : null,
      },
    });

    // Check if required documents are all verified
    const allDocs = await prisma.teacherAppointmentDocument.findMany({
      where: { teacherApplicationId: applicationId },
    });

    const verifiedTypes = new Set(
      allDocs.filter((d) => d.status === 'VERIFIED').map((d) => d.documentType)
    );

    // Required minimal documents for appointment eligibility
    const requiredTypes: TeacherAppointmentDocumentType[] = [
      'PROFILE_PHOTO',
      'NID',
      'CV',
      'EDUCATIONAL_CERTIFICATE',
    ];

    const hasAllRequired = requiredTypes.every((type) => verifiedTypes.has(type));

    if (hasAllRequired) {
      await prisma.teacherApplication.update({
        where: { id: applicationId },
        data: { status: 'DOCUMENTS_VERIFIED' },
      });
    }

    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: `TEACHER_DOCUMENT_${data.status}`,
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: doc.id,
      safeMetadata: {
        documentType: doc.documentType,
        status: data.status,
        reviewNote: data.reviewNote,
      },
      ipAddress,
    });

    return updatedDoc;
  }

  /**
   * 15. Approve Appointment (Atomic Prisma Transaction)
   */
  static async approveAppointment(
    applicationId: string,
    data: {
      designation: string;
      employmentType: EmploymentType;
      joiningDate: string;
      probationEndDate?: string;
      salaryNote?: string;
      customEmployeeId?: string;
      tempPassword?: string;
      passwordDeliveryMode?: 'EMAIL' | 'TEMP_PASSWORD';
    },
    adminUserId: string,
    ipAddress?: string
  ) {
    const app = await prisma.teacherApplication.findUnique({
      where: { id: applicationId },
      include: {
        interviews: true,
        documents: true,
        appointment: true,
      },
    });

    if (!app) throw new Error('Application not found');

    if (app.appointment || app.status === 'APPOINTED') {
      throw new Error('This candidate has already been appointed');
    }

    // Eligibility check
    const eligibleStatuses: TeacherApplicationStatus[] = [
      'SELECTED',
      'DOCUMENTS_PENDING',
      'DOCUMENTS_VERIFIED',
    ];
    if (!eligibleStatuses.includes(app.status)) {
      throw new Error(
        `Application is in "${app.status}" status. Only SELECTED or DOCUMENTS_VERIFIED candidates can be appointed.`
      );
    }

    // Interview completion check
    const completedInterview = app.interviews.some((inv) => inv.status === 'COMPLETED');
    if (!completedInterview) {
      throw new Error(
        'Candidate cannot be appointed before an Interview or Demo Class is marked COMPLETED.'
      );
    }

    // Required documents check
    const verifiedTypes = new Set(
      app.documents.filter((d) => d.status === 'VERIFIED').map((d) => d.documentType)
    );

    const missingDocs: string[] = [];
    if (!verifiedTypes.has('PROFILE_PHOTO')) missingDocs.push('Profile Photo');
    if (!verifiedTypes.has('NID')) missingDocs.push('NID');
    if (!verifiedTypes.has('CV')) missingDocs.push('CV');
    if (!verifiedTypes.has('EDUCATIONAL_CERTIFICATE')) missingDocs.push('Educational Certificate');

    if (missingDocs.length > 0) {
      throw new Error(
        `Cannot approve appointment. The following required documents are not yet verified: ${missingDocs.join(', ')}`
      );
    }

    // Determine Employee ID
    let finalEmployeeId: string;
    if (data.customEmployeeId && data.customEmployeeId.trim()) {
      finalEmployeeId = data.customEmployeeId.trim();
      const existingTeacher = await prisma.teacher.findUnique({
        where: { employeeId: finalEmployeeId },
      });
      if (existingTeacher) {
        throw new Error(`Employee ID "${finalEmployeeId}" is already assigned to another teacher.`);
      }
    } else {
      finalEmployeeId = await this.generateEmployeeId(new Date(data.joiningDate).getFullYear());
    }

    // Determine profile image URL
    const photoDoc = app.documents.find(
      (d) => d.documentType === 'PROFILE_PHOTO' && d.status === 'VERIFIED'
    );
    const profileImage = photoDoc ? photoDoc.fileUrl : null;

    // Password setup
    const plainPassword = data.tempPassword || 'EduPark@' + Math.floor(100000 + Math.random() * 900000);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Run in atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if user with email already exists
      let user = await tx.user.findUnique({ where: { email: app.email } });
      if (user) {
        if (user.role === 'TEACHER') {
          throw new Error('A teacher account with this email already exists.');
        }
        // Update user to TEACHER role
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            role: 'TEACHER',
            passwordHash,
            mustChangePassword: true,
            isActive: true,
          },
        });
      } else {
        user = await tx.user.create({
          data: {
            name: app.fullName,
            email: app.email,
            passwordHash,
            role: 'TEACHER',
            mustChangePassword: true,
            isActive: true,
          },
        });
      }

      // 2. Create Teacher Profile
      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          employeeId: finalEmployeeId,
          phone: app.phone,
          designation: data.designation.trim(),
          profileImage,
        },
      });

      // 3. Create TeacherAppointment record
      const appointment = await tx.teacherAppointment.create({
        data: {
          teacherApplicationId: app.id,
          teacherId: teacher.id,
          designation: data.designation.trim(),
          employmentType: data.employmentType,
          joiningDate: new Date(data.joiningDate),
          probationEndDate: data.probationEndDate ? new Date(data.probationEndDate) : null,
          salaryNote: data.salaryNote ? data.salaryNote.trim() : null,
          appointmentStatus: 'APPROVED',
          appointedById: await this.resolveAdminUserId(adminUserId),
          appointedAt: new Date(),
        },
      });

      // 4. Update Application status to APPOINTED
      await tx.teacherApplication.update({
        where: { id: app.id },
        data: { status: 'APPOINTED' },
      });

      return {
        user,
        teacher,
        appointment,
        plainPassword,
      };
    });

    // 5. Audit Logging
    await recordAuditLog({
      actorId: adminUserId,
      actorRole: 'ADMIN',
      action: 'TEACHER_APPOINTMENT_APPROVED',
      module: 'TEACHER_RECRUITMENT',
      affectedRecordId: result.appointment.id,
      safeMetadata: {
        applicationId: app.id,
        teacherId: result.teacher.id,
        employeeId: result.teacher.employeeId,
        designation: result.appointment.designation,
        employmentType: result.appointment.employmentType,
      },
      ipAddress,
    });

    return {
      success: true,
      message: 'Teacher appointment approved successfully and teacher account created.',
      teacher: {
        id: result.teacher.id,
        employeeId: result.teacher.employeeId,
        name: result.user.name,
        email: result.user.email,
        designation: result.teacher.designation,
        mustChangePassword: result.user.mustChangePassword,
      },
      appointment: result.appointment,
      credentials: {
        employeeId: result.teacher.employeeId,
        email: result.user.email,
        temporaryPassword: result.plainPassword,
        note: 'Teacher must change password upon first login.',
      },
    };
  }
}
