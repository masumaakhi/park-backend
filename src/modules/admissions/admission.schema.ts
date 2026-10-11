import { z } from 'zod';

export const publicAdmissionSchema = z.object({
  studentName: z.string().min(2, 'Student name must be at least 2 characters').max(100),
  studentNameBn: z.string().max(100).optional().nullable(),
  nationality: z.string().max(50).optional().nullable(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other'] as const),
  birthCertificateNumber: z.string().min(5, 'Birth certificate number must be at least 5 characters').max(50),
  previousSchool: z.string().max(150).optional().nullable(),
  previousSchoolGrade: z.string().max(50).optional().nullable(),
  hasTransferCertificate: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional().nullable(),
  classAppliedForId: z.string().uuid('Please select a valid class'),
  sessionName: z.string().max(50).optional().nullable(),

  fatherNameBn: z.string().max(100).optional().nullable(),
  fatherNameEn: z.string().max(100).optional().nullable(),
  fatherNid: z.string().max(30).optional().nullable(),
  fatherOccupation: z.string().max(100).optional().nullable(),
  fatherPhone: z.string().max(20).optional().nullable(),

  motherNameBn: z.string().max(100).optional().nullable(),
  motherNameEn: z.string().max(100).optional().nullable(),
  motherNid: z.string().max(30).optional().nullable(),
  motherOccupation: z.string().max(100).optional().nullable(),
  motherPhone: z.string().max(20).optional().nullable(),

  guardianName: z.string().min(2, 'Guardian name must be at least 2 characters').max(100),
  guardianRelation: z.string().min(2, 'Relation is required').max(50),
  guardianPhone: z.string().regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Enter a valid Bangladeshi phone number'),
  guardianEmail: z.string().email('Invalid email address').optional().or(z.literal('')).nullable(),
  guardianNidNumber: z.string().min(10, 'Guardian NID must be at least 10 digits').max(20),
  address: z.string().min(3, 'Address must be at least 3 characters').max(300),
  presentVillage: z.string().max(100).optional().nullable(),
  presentPost: z.string().max(100).optional().nullable(),
  presentUpazila: z.string().max(100).optional().nullable(),
  presentDistrict: z.string().max(100).optional().nullable(),
  permanentVillage: z.string().max(100).optional().nullable(),
  permanentPost: z.string().max(100).optional().nullable(),
  permanentUpazila: z.string().max(100).optional().nullable(),
  permanentDistrict: z.string().max(100).optional().nullable(),
  emergencyContact: z.string().regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Enter a valid emergency contact number'),

  consentGiven: z.boolean().refine((val) => val === true, 'You must agree to the terms and consent'),
});

export const officeAdmissionSchema = z.object({
  studentName: z.string().min(2, 'Student name must be at least 2 characters').max(100),
  studentNameBn: z.string().max(100).optional().nullable(),
  nationality: z.string().max(50).optional().nullable(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other'] as const),
  birthCertificateNumber: z.string().min(5, 'Birth certificate number must be at least 5 characters').max(50),
  previousSchool: z.string().max(150).optional().nullable(),
  previousSchoolGrade: z.string().max(50).optional().nullable(),
  hasTransferCertificate: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional().nullable(),
  classAppliedForId: z.string().uuid('Please select a valid class'),
  sessionName: z.string().max(50).optional().nullable(),

  fatherNameBn: z.string().max(100).optional().nullable(),
  fatherNameEn: z.string().max(100).optional().nullable(),
  fatherNid: z.string().max(30).optional().nullable(),
  fatherOccupation: z.string().max(100).optional().nullable(),
  fatherPhone: z.string().max(20).optional().nullable(),

  motherNameBn: z.string().max(100).optional().nullable(),
  motherNameEn: z.string().max(100).optional().nullable(),
  motherNid: z.string().max(30).optional().nullable(),
  motherOccupation: z.string().max(100).optional().nullable(),
  motherPhone: z.string().max(20).optional().nullable(),

  guardianName: z.string().min(2, 'Guardian name must be at least 2 characters').max(100),
  guardianRelation: z.string().min(2, 'Relation is required').max(50),
  guardianPhone: z.string().regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Enter a valid phone number'),
  guardianEmail: z.string().email('Invalid email address').optional().or(z.literal('')).nullable(),
  guardianNidNumber: z.string().min(10, 'Guardian NID must be at least 10 digits').max(20),
  address: z.string().min(3, 'Address must be at least 3 characters').max(300),
  presentVillage: z.string().max(100).optional().nullable(),
  presentPost: z.string().max(100).optional().nullable(),
  presentUpazila: z.string().max(100).optional().nullable(),
  presentDistrict: z.string().max(100).optional().nullable(),
  permanentVillage: z.string().max(100).optional().nullable(),
  permanentPost: z.string().max(100).optional().nullable(),
  permanentUpazila: z.string().max(100).optional().nullable(),
  permanentDistrict: z.string().max(100).optional().nullable(),
  emergencyContact: z.string().regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Enter a valid emergency contact number'),

  adminNote: z.string().max(1000).optional().nullable(),
  saveAsDraft: z.boolean().optional(),
});

export const documentReviewSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED', 'NEEDS_REUPLOAD'] as const),
    reviewNote: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (
        (data.status === 'REJECTED' || data.status === 'NEEDS_REUPLOAD') &&
        (!data.reviewNote || data.reviewNote.trim().length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Review note is mandatory when rejecting or requesting re-upload of a document',
      path: ['reviewNote'],
    }
  );

export const approveAdmissionSchema = z.object({
  academicSessionId: z.string().uuid('Valid academic session is required'),
  classLevelId: z.string().uuid('Valid class level is required'),
  classSectionId: z.string().uuid('Valid class section is required'),
  rollNumber: z.string().min(1, 'Roll number is required').max(20),
  customStudentId: z
    .string()
    .trim()
    .min(1, 'Student ID cannot be empty')
    .max(30, 'Student ID cannot exceed 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Student ID can only contain letters, numbers, hyphens, and underscores')
    .optional()
    .or(z.literal('')),
  temporaryPassword: z
    .string()
    .trim()
    .min(6, 'Temporary password must be at least 6 characters')
    .optional()
    .or(z.literal('')),
});

export const reasonActionSchema = z.object({
  reason: z.string().min(5, 'Mandatory reason of at least 5 characters is required').max(500),
});
