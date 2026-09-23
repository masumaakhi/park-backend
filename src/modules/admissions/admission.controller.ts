import { Request, Response, NextFunction } from 'express';
import { AdmissionService } from './admission.service';
import { StorageService } from '../uploads/storage.service';
import {
  publicAdmissionSchema,
  officeAdmissionSchema,
  documentReviewSchema,
  approveAdmissionSchema,
  reasonActionSchema,
} from './admission.schema';
import { ApiResponse } from '../../utils/api-response';
import { AdmissionSource, AdmissionDocumentType } from '@prisma/client';
import prisma from '../../config/prisma';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import fs from 'fs';

export const submitPublicAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const validatedData = publicAdmissionSchema.parse({
      ...req.body,
      consentGiven: req.body.consentGiven === true || req.body.consentGiven === 'true',
    });

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    // Validate required files
    const photoFile = files?.['studentPhoto']?.[0];
    const birthCertFile = files?.['birthCertificate']?.[0];
    const nidFile = files?.['guardianNid']?.[0];
    const reportFile = files?.['previousSchoolReport']?.[0];

    if (!photoFile) {
      return res.status(422).json(new ApiResponse(false, 'Student passport-size photo is required'));
    }
    if (!birthCertFile) {
      return res.status(422).json(new ApiResponse(false, 'Student birth certificate is required'));
    }
    if (!nidFile) {
      return res.status(422).json(new ApiResponse(false, 'Guardian NID is required'));
    }

    // Validate file sizes and types
    for (const [key, fileList] of Object.entries(files || {})) {
      if (fileList?.[0]) {
        const check = StorageService.validateFile(fileList[0]);
        if (!check.valid) {
          return res.status(422).json(new ApiResponse(false, `${key}: ${check.error}`));
        }
      }
    }

    // 1. Create the application
    const application = await AdmissionService.createApplication(
      {
        source: AdmissionSource.ONLINE,
        studentName: validatedData.studentName,
        dateOfBirth: validatedData.dateOfBirth,
        gender: validatedData.gender,
        birthCertificateNumber: validatedData.birthCertificateNumber,
        previousSchool: validatedData.previousSchool || undefined,
        classAppliedForId: validatedData.classAppliedForId,
        guardianName: validatedData.guardianName,
        guardianRelation: validatedData.guardianRelation,
        guardianPhone: validatedData.guardianPhone,
        guardianEmail: validatedData.guardianEmail || undefined,
        guardianNidNumber: validatedData.guardianNidNumber,
        address: validatedData.address,
        emergencyContact: validatedData.emergencyContact,
      }
    );

    // 2. Save private documents to disk & database
    const docsToCreate = [
      { file: photoFile, type: AdmissionDocumentType.STUDENT_PHOTO },
      { file: birthCertFile, type: AdmissionDocumentType.BIRTH_CERTIFICATE },
      { file: nidFile, type: AdmissionDocumentType.GUARDIAN_NID },
      ...(reportFile ? [{ file: reportFile, type: AdmissionDocumentType.PREVIOUS_SCHOOL_REPORT }] : []),
    ];

    for (const item of docsToCreate) {
      const stored = await StorageService.savePrivateFile(item.file);
      await prisma.admissionDocument.create({
        data: {
          admissionApplicationId: application.id,
          documentType: item.type,
          fileName: stored.fileName,
          fileUrl: stored.storageFileName, // private storage reference
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
        },
      });
    }

    // Safe response according to specifications
    return res.status(201).json(
      new ApiResponse(true, 'Application submitted successfully', {
        applicationNumber: application.applicationNumber,
        message:
          'Your application has been received. The school office will review your information and documents.',
      })
    );
  } catch (error) {
    next(error);
  }
};

export const getAdminAdmissions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await AdmissionService.listApplications(req.query as any);
    return res.json(new ApiResponse(true, 'Admissions retrieved successfully', result));
  } catch (error) {
    next(error);
  }
};

export const createOfficeAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const validatedData = officeAdmissionSchema.parse(req.body);
    const adminUser = (req as any).user;

    const application = await AdmissionService.createApplication(
      {
        source: AdmissionSource.OFFICE,
        studentName: validatedData.studentName,
        dateOfBirth: validatedData.dateOfBirth,
        gender: validatedData.gender,
        birthCertificateNumber: validatedData.birthCertificateNumber,
        previousSchool: validatedData.previousSchool || undefined,
        classAppliedForId: validatedData.classAppliedForId,
        guardianName: validatedData.guardianName,
        guardianRelation: validatedData.guardianRelation,
        guardianPhone: validatedData.guardianPhone,
        guardianEmail: validatedData.guardianEmail || undefined,
        guardianNidNumber: validatedData.guardianNidNumber,
        address: validatedData.address,
        emergencyContact: validatedData.emergencyContact,
        adminNote: validatedData.saveAsDraft
          ? `[DRAFT] ${validatedData.adminNote || ''}`
          : validatedData.adminNote || undefined,
      },
      adminUser?.id
    );

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      const docMappings: [string, AdmissionDocumentType][] = [
        ['studentPhoto', AdmissionDocumentType.STUDENT_PHOTO],
        ['birthCertificate', AdmissionDocumentType.BIRTH_CERTIFICATE],
        ['guardianNid', AdmissionDocumentType.GUARDIAN_NID],
        ['previousSchoolReport', AdmissionDocumentType.PREVIOUS_SCHOOL_REPORT],
        ['transferCertificate', AdmissionDocumentType.TRANSFER_CERTIFICATE],
      ];

      for (const [fieldName, docType] of docMappings) {
        const file = files[fieldName]?.[0];
        if (file) {
          const check = StorageService.validateFile(file);
          if (check.valid) {
            const stored = await StorageService.savePrivateFile(file);
            await prisma.admissionDocument.create({
              data: {
                admissionApplicationId: application.id,
                documentType: docType,
                fileName: stored.fileName,
                fileUrl: stored.storageFileName,
                mimeType: stored.mimeType,
                fileSize: stored.fileSize,
                uploadedById: adminUser?.id,
              },
            });
          }
        }
      }
    }

    return res
      .status(201)
      .json(new ApiResponse(true, 'Office admission created successfully', application));
  } catch (error) {
    next(error);
  }
};

export const getAdminAdmissionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const application = await AdmissionService.getApplicationById(id);
    if (!application) {
      return res.status(404).json(new ApiResponse(false, 'Admission application not found'));
    }

    const enrichedDocuments = (application.documents || []).map((doc: any) => {
      const isExternalUrl = doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://');
      const signedToken = StorageService.generateSignedToken(doc.id, 86400); // 24-hour token
      return {
        ...doc,
        signedToken,
        viewUrl: isExternalUrl
          ? doc.fileUrl
          : `http://localhost:5000/api/v1/admin/admissions/${id}/documents/${doc.id}/view?token=${encodeURIComponent(signedToken)}`,
        downloadUrl: isExternalUrl
          ? doc.fileUrl
          : `http://localhost:5000/api/v1/admin/admissions/${id}/documents/${doc.id}/download?token=${encodeURIComponent(signedToken)}`,
      };
    });

    return res.json(
      new ApiResponse(true, 'Application retrieved successfully', {
        ...application,
        documents: enrichedDocuments,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const updateAdminAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const adminUser = (req as any).user;
    const updated = await AdmissionService.updateApplication(id, req.body, adminUser?.id);
    return res.json(new ApiResponse(true, 'Application updated successfully', updated));
  } catch (error) {
    next(error);
  }
};

export const markAdmissionUnderReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const adminUser = (req as any).user;
    const updated = await AdmissionService.markUnderReview(id, adminUser?.id);
    return res.json(new ApiResponse(true, 'Application marked as under review', updated));
  } catch (error) {
    next(error);
  }
};

export const rejectAdminAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const { reason } = reasonActionSchema.parse(req.body);
    const adminUser = (req as any).user;
    const updated = await AdmissionService.rejectApplication(id, reason, adminUser?.id);
    return res.json(new ApiResponse(true, 'Application rejected', updated));
  } catch (error) {
    next(error);
  }
};

export const cancelAdminAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const { reason } = reasonActionSchema.parse(req.body);
    const adminUser = (req as any).user;
    const updated = await AdmissionService.cancelApplication(id, reason, adminUser?.id);
    return res.json(new ApiResponse(true, 'Application cancelled', updated));
  } catch (error) {
    next(error);
  }
};

export const getAdmissionDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const documents = await prisma.admissionDocument.findMany({
      where: { admissionApplicationId: id },
      include: {
        verifiedBy: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = documents.map((doc) => {
      const isExternalUrl = doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://');
      const signedToken = StorageService.generateSignedToken(doc.id, 86400); // 24-hour token
      return {
        ...doc,
        signedToken,
        viewUrl: isExternalUrl
          ? doc.fileUrl
          : `http://localhost:5000/api/v1/admin/admissions/${id}/documents/${doc.id}/view?token=${encodeURIComponent(signedToken)}`,
        downloadUrl: isExternalUrl
          ? doc.fileUrl
          : `http://localhost:5000/api/v1/admin/admissions/${id}/documents/${doc.id}/download?token=${encodeURIComponent(signedToken)}`,
      };
    });

    return res.json(new ApiResponse(true, 'Documents retrieved successfully', enriched));
  } catch (error) {
    next(error);
  }
};

export const uploadAdmissionDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const adminUser = (req as any).user;
    const file = req.file;
    const documentType = req.body.documentType as AdmissionDocumentType;

    if (!file) {
      return res.status(422).json(new ApiResponse(false, 'No file uploaded'));
    }

    const check = StorageService.validateFile(file);
    if (!check.valid) {
      return res.status(422).json(new ApiResponse(false, check.error || 'Invalid file'));
    }

    const stored = await StorageService.savePrivateFile(file);
    const doc = await prisma.admissionDocument.create({
      data: {
        admissionApplicationId: id,
        documentType: documentType || AdmissionDocumentType.OTHER,
        fileName: stored.fileName,
        fileUrl: stored.storageFileName,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        uploadedById: adminUser?.id,
      },
    });

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'ADMISSION_DOCUMENT_UPLOADED',
      module: 'ADMISSIONS',
      affectedRecordId: doc.id,
      safeMetadata: { documentType: doc.documentType, applicationId: id },
    });

    return res.status(201).json(new ApiResponse(true, 'Document uploaded successfully', doc));
  } catch (error) {
    next(error);
  }
};

export const viewAdmissionDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const documentId = req.params.documentId as string;
    const adminUser = (req as any).user;

    const doc = await prisma.admissionDocument.findFirst({
      where: { id: documentId, admissionApplicationId: id },
    });

    if (!doc) {
      return res.status(404).json(new ApiResponse(false, 'Document not found'));
    }

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'ADMISSION_DOCUMENT_VIEWED',
      module: 'ADMISSIONS',
      affectedRecordId: doc.id,
      safeMetadata: { documentType: doc.documentType, applicationId: id },
    });

    // Support external / Cloudinary URLs
    if (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://')) {
      return res.redirect(doc.fileUrl);
    }

    const filePath = StorageService.getPrivateFilePath(doc.fileUrl);
    if (!filePath) {
      return res.status(404).json(new ApiResponse(false, 'Document file not found on disk'));
    }

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const downloadAdmissionDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const documentId = req.params.documentId as string;
    const adminUser = (req as any).user;

    const doc = await prisma.admissionDocument.findFirst({
      where: { id: documentId, admissionApplicationId: id },
    });

    if (!doc) {
      return res.status(404).json(new ApiResponse(false, 'Document not found'));
    }

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'ADMISSION_DOCUMENT_DOWNLOADED',
      module: 'ADMISSIONS',
      affectedRecordId: doc.id,
      safeMetadata: { documentType: doc.documentType, applicationId: id },
    });

    // Support external / Cloudinary URLs
    if (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://')) {
      return res.redirect(doc.fileUrl);
    }

    const filePath = StorageService.getPrivateFilePath(doc.fileUrl);
    if (!filePath) {
      return res.status(404).json(new ApiResponse(false, 'Document file not found on disk'));
    }

    await recordAuditLog({
      actorId: adminUser?.id,
      actorRole: 'ADMIN',
      action: 'ADMISSION_DOCUMENT_DOWNLOADED',
      module: 'ADMISSIONS',
      affectedRecordId: doc.id,
      safeMetadata: { documentType: doc.documentType, applicationId: id },
    });

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.fileName)}"`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const reviewAdmissionDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const documentId = req.params.documentId as string;
    const validated = documentReviewSchema.parse(req.body);
    const adminUser = (req as any).user;

    const updated = await AdmissionService.reviewDocument(
      documentId,
      {
        status: validated.status as any,
        reviewNote: validated.reviewNote || undefined,
      },
      adminUser?.id
    );

    return res.json(new ApiResponse(true, 'Document reviewed successfully', updated));
  } catch (error) {
    next(error);
  }
};

export const approveAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id as string;
    const validated = approveAdmissionSchema.parse(req.body);
    const adminUser = (req as any).user;

    const result = await AdmissionService.approveAdmission(
      id,
      {
        academicSessionId: validated.academicSessionId,
        classLevelId: validated.classLevelId,
        classSectionId: validated.classSectionId,
        rollNumber: validated.rollNumber,
        customStudentId: validated.customStudentId || undefined,
        temporaryPassword: validated.temporaryPassword || undefined,
      },
      adminUser?.id
    );

    return res.json(new ApiResponse(true, result.message, result));
  } catch (error) {
    next(error);
  }
};
