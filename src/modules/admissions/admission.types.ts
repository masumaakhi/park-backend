import {
  AdmissionSource,
  AdmissionStatus,
  AdmissionDocumentType,
  AdmissionDocumentStatus,
} from '@prisma/client';

export interface CreateAdmissionDto {
  source: AdmissionSource;
  studentName: string;
  studentNameBn?: string;
  nationality?: string;
  dateOfBirth: string; // ISO date
  gender: string;
  birthCertificateNumber: string;
  previousSchool?: string;
  previousSchoolGrade?: string;
  hasTransferCertificate?: boolean;
  classAppliedForId: string;
  sessionName?: string;

  fatherNameBn?: string;
  fatherNameEn?: string;
  fatherNid?: string;
  fatherOccupation?: string;
  fatherPhone?: string;

  motherNameBn?: string;
  motherNameEn?: string;
  motherNid?: string;
  motherOccupation?: string;
  motherPhone?: string;

  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianNidNumber: string;
  address: string;
  presentVillage?: string;
  presentPost?: string;
  presentUpazila?: string;
  presentDistrict?: string;
  permanentVillage?: string;
  permanentPost?: string;
  permanentUpazila?: string;
  permanentDistrict?: string;
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
