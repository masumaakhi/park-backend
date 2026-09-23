import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../utils/api-response';
import { TeacherRecruitmentService } from './teacher-recruitment.service';
import { TeacherStorageService } from '../uploads/teacher-storage.service';
import prisma from '../../config/prisma';
import fs from 'fs';
import path from 'path';
import {
  publicTeacherApplicationSchema,
  officeTeacherApplicationSchema,
  updateApplicationSchema,
  rejectOrCancelApplicationSchema,
  scheduleInterviewSchema,
  updateInterviewSchema,
  reviewDocumentSchema,
  approveAppointmentSchema,
} from './teacher-recruitment.schema';

export const submitPublicTeacherApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const validatedData = publicTeacherApplicationSchema.parse(req.body);
    const cvFile = req.file;

    if (!cvFile) {
      return res
        .status(400)
        .json(new ApiResponse(false, 'CV/Resume file is required (PDF, DOC, DOCX)'));
    }

    const result = await TeacherRecruitmentService.submitPublicApplication(
      validatedData as any,
      cvFile,
      req.ip
    );

    return res.status(201).json(
      new ApiResponse(
        true,
        'Your application has been received. The school will contact shortlisted candidates.',
        result
      )
    );
  } catch (error: any) {
    return next(error);
  }
};

export const getAdminTeacherApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await TeacherRecruitmentService.getTeacherApplications(req.query);
    return res.status(200).json(new ApiResponse(true, 'Applications fetched successfully', result));
  } catch (error: any) {
    return next(error);
  }
};

export const createOfficeTeacherApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const validatedData = officeTeacherApplicationSchema.parse(req.body);
    const cvFile = req.file;

    if (!cvFile) {
      return res.status(400).json(new ApiResponse(false, 'CV file is required'));
    }

    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const application = await TeacherRecruitmentService.createOfficeApplication(
      validatedData,
      cvFile,
      adminUserId,
      req.ip
    );

    return res
      .status(201)
      .json(new ApiResponse(true, 'Office application recorded successfully', application));
  } catch (error: any) {
    return next(error);
  }
};

export const getAdminTeacherApplicationById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const application = await TeacherRecruitmentService.getTeacherApplicationById(id);
    return res.status(200).json(new ApiResponse(true, 'Application fetched', application));
  } catch (error: any) {
    return next(error);
  }
};

export const updateAdminTeacherApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const validatedData = updateApplicationSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.updateApplication(id, validatedData, adminUserId);
    return res.status(200).json(new ApiResponse(true, 'Application updated', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const markTeacherApplicationUnderReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.markUnderReview(id, adminUserId, req.ip);
    return res.status(200).json(new ApiResponse(true, 'Application is now under review', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const shortlistTeacherCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.shortlistCandidate(id, adminUserId, req.ip);
    return res.status(200).json(new ApiResponse(true, 'Candidate shortlisted successfully', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const selectTeacherCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.selectCandidate(id, adminUserId, req.ip);
    return res.status(200).json(new ApiResponse(true, 'Candidate selected for appointment process', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const rejectTeacherCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { reason } = rejectOrCancelApplicationSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.rejectCandidate(id, reason, adminUserId, req.ip);
    return res.status(200).json(new ApiResponse(true, 'Candidate application rejected', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const cancelTeacherApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { reason } = rejectOrCancelApplicationSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.cancelApplication(id, reason, adminUserId, req.ip);
    return res.status(200).json(new ApiResponse(true, 'Application cancelled', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const getTeacherInterviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const interviews = await prisma.teacherInterview.findMany({
      where: { teacherApplicationId: id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    return res.status(200).json(new ApiResponse(true, 'Interviews fetched', interviews));
  } catch (error: any) {
    return next(error);
  }
};

export const scheduleTeacherInterview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const validatedData = scheduleInterviewSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const interview = await TeacherRecruitmentService.scheduleInterview(
      id,
      validatedData as any,
      adminUserId,
      req.ip
    );
    return res.status(201).json(new ApiResponse(true, 'Interview / Demo Class scheduled', interview));
  } catch (error: any) {
    return next(error);
  }
};

export const updateTeacherInterview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const interviewId = String(req.params.interviewId);
    const validatedData = updateInterviewSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const updated = await TeacherRecruitmentService.updateInterview(
      id,
      interviewId,
      validatedData,
      adminUserId,
      req.ip
    );
    return res.status(200).json(new ApiResponse(true, 'Interview record updated', updated));
  } catch (error: any) {
    return next(error);
  }
};

export const getTeacherAppointmentDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const docs = await prisma.teacherAppointmentDocument.findMany({
      where: { teacherApplicationId: id },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = docs.map((d) => ({
      ...d,
      signedToken: TeacherStorageService.generateSignedToken(d.id, 1800),
    }));

    return res.status(200).json(new ApiResponse(true, 'Documents fetched', enriched));
  } catch (error: any) {
    return next(error);
  }
};

export const uploadTeacherAppointmentDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const documentType = req.body.documentType;
    const file = req.file;

    if (!file) {
      return res.status(400).json(new ApiResponse(false, 'File is required'));
    }
    if (!documentType) {
      return res.status(400).json(new ApiResponse(false, 'documentType is required'));
    }

    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';
    const doc = await TeacherRecruitmentService.uploadAppointmentDocument(
      id,
      documentType,
      file,
      adminUserId,
      req.ip
    );

    return res.status(201).json(new ApiResponse(true, 'Document uploaded successfully', doc));
  } catch (error: any) {
    return next(error);
  }
};

export const reviewTeacherAppointmentDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const documentId = String(req.params.documentId);
    const validatedData = reviewDocumentSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';

    const updated = await TeacherRecruitmentService.reviewDocument(
      id,
      documentId,
      validatedData as any,
      adminUserId,
      req.ip
    );

    return res.status(200).json(new ApiResponse(true, 'Document reviewed successfully', updated));
  } catch (error: any) {
    return next(error);
  }
};

/**
 * Secure CV preview and download
 */
export const viewCv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const app = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!app || !app.cvUrl) {
      return res.status(404).json(new ApiResponse(false, 'CV not found'));
    }

    const filePath = TeacherStorageService.getPrivateFilePath(app.cvUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json(new ApiResponse(false, 'CV file not found on disk'));
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.doc') contentType = 'application/msword';
    else if (ext === '.docx')
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${app.cvPublicId || 'cv' + ext}"`);
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    return next(error);
  }
};

export const downloadCv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const app = await prisma.teacherApplication.findUnique({ where: { id } });
    if (!app || !app.cvUrl) {
      return res.status(404).json(new ApiResponse(false, 'CV not found'));
    }

    const filePath = TeacherStorageService.getPrivateFilePath(app.cvUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json(new ApiResponse(false, 'CV file not found on disk'));
    }

    const ext = path.extname(filePath).toLowerCase();
    const downloadName = `${app.fullName.replace(/[^a-zA-Z0-9_-]/g, '_')}_CV${ext}`;
    return res.download(filePath, downloadName);
  } catch (error) {
    return next(error);
  }
};

/**
 * Secure sensitive appointment document preview and download
 */
export const viewTeacherDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const documentId = String(req.params.documentId);
    const doc = await prisma.teacherAppointmentDocument.findFirst({
      where: { id: documentId, teacherApplicationId: id },
    });

    if (!doc || !doc.fileUrl) {
      return res.status(404).json(new ApiResponse(false, 'Document not found'));
    }

    const filePath = TeacherStorageService.getPrivateFilePath(doc.fileUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json(new ApiResponse(false, 'Document file not found on disk'));
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    return next(error);
  }
};

export const downloadTeacherDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const documentId = String(req.params.documentId);
    const doc = await prisma.teacherAppointmentDocument.findFirst({
      where: { id: documentId, teacherApplicationId: id },
    });

    if (!doc || !doc.fileUrl) {
      return res.status(404).json(new ApiResponse(false, 'Document not found'));
    }

    const filePath = TeacherStorageService.getPrivateFilePath(doc.fileUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json(new ApiResponse(false, 'Document file not found on disk'));
    }

    return res.download(filePath, doc.fileName);
  } catch (error) {
    return next(error);
  }
};

export const approveTeacherAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const validatedData = approveAppointmentSchema.parse(req.body);
    const adminUserId = (req as any).user?.id || 'SYSTEM_ADMIN';

    const result = await TeacherRecruitmentService.approveAppointment(
      id,
      validatedData as any,
      adminUserId,
      req.ip
    );

    return res.status(200).json(new ApiResponse(true, result.message, result));
  } catch (error: any) {
    return next(error);
  }
};
