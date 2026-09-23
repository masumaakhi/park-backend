import {
  AdmissionSource,
  AdmissionStatus,
  AdmissionDocumentType,
  AdmissionDocumentStatus,
} from '@prisma/client';

export interface CreateAdmissionDto {
  source: AdmissionSource;
  studentName: string;
  dateOfBirth: string; // ISO date
  gender: string;
  birthCertificateNumber: string;
  previousSchool?: string;
  classAppliedForId: string;

  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianNidNumber: string;
  address: string;
  emergencyContact: string;

  studentPhotoUrl?: string;
  adminNote?: string;
}

export interface ApproveAdmissionDto {
  academicSessionId: string;
  classLevelId: string;
  classSectionId: string;
  rollNumber: string;
  customStudentId?: string;
  temporaryPassword?: string;
}

export interface DocumentReviewDto {
  status: AdmissionDocumentStatus;
  reviewNote?: string;
}

export interface AdmissionQueryFilters {
  search?: string;
  source?: AdmissionSource;
  status?: AdmissionStatus;
  classAppliedForId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'newest' | 'oldest' | 'status';
}
