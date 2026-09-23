import { z } from 'zod';

export const publicTeacherApplicationSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email address is required'),
  phone: z
    .string()
    .min(8, 'Phone number must be at least 8 digits')
    .max(20, 'Phone number too long'),
  currentAddress: z.string().min(5, 'Address must be at least 5 characters'),
  appliedPosition: z.string().min(2, 'Applied position is required'),
  subjectExpertise: z.string().min(2, 'Subject expertise is required'),
  preferredClassLevels: z.string().optional().default(''),
  highestEducation: z.string().min(2, 'Highest education qualification is required'),
  yearsOfExperience: z.coerce.number().min(0, 'Years of experience must be 0 or greater').default(0),
  coverMessage: z.string().min(10, 'Cover message must be at least 10 characters'),
  dateOfBirth: z.string().optional().nullable().or(z.literal('')),
  gender: z.string().optional().nullable().or(z.literal('')),
  circularId: z.string().optional().nullable().or(z.literal('')),
  consentGiven: z.preprocess(
    (val) => val === true || val === 'true' || val === 1 || val === '1',
    z.literal(true, {
      message: 'You must give consent to proceed',
    })
  ),
});

export const officeTeacherApplicationSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email address is required'),
  phone: z.string().min(8, 'Phone number must be at least 8 digits'),
  currentAddress: z.string().min(5, 'Address is required'),
  appliedPosition: z.string().min(2, 'Applied position is required'),
  subjectExpertise: z.string().min(2, 'Subject expertise is required'),
  preferredClassLevels: z.string().optional().default(''),
  highestEducation: z.string().min(2, 'Highest education qualification is required'),
  yearsOfExperience: z.coerce.number().min(0).default(0),
  coverMessage: z.string().optional().default('Office walk-in submission'),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  circularId: z.string().optional(),
  adminNote: z.string().optional(),
});

export const updateApplicationSchema = z.object({
  adminNote: z.string().optional(),
  appliedPosition: z.string().optional(),
  subjectExpertise: z.string().optional(),
  preferredClassLevels: z.string().optional(),
});

export const rejectOrCancelApplicationSchema = z.object({
  reason: z.string().min(5, 'A valid reason of at least 5 characters is mandatory'),
});

export const scheduleInterviewSchema = z.object({
  interviewType: z.enum(['INTERVIEW', 'DEMO_CLASS']),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid scheduled date and time is required',
  }),
  location: z.string().min(1, 'Location / Room name is required'),
  interviewerName: z.string().min(1, 'Interviewer name is required'),
});

export const updateInterviewSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  feedback: z.string().optional(),
  score: z.coerce.number().min(0).max(100).optional(),
});

export const reviewDocumentSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED', 'NEEDS_REUPLOAD']),
  reviewNote: z.string().optional(),
}).refine(
  (data) => {
    if (['REJECTED', 'NEEDS_REUPLOAD'].includes(data.status)) {
      return !!data.reviewNote && data.reviewNote.trim().length >= 3;
    }
    return true;
  },
  {
    message: 'A review note is mandatory when rejecting or requesting re-upload of a document',
    path: ['reviewNote'],
  }
);

export const approveAppointmentSchema = z.object({
  designation: z.string().min(2, 'Designation is required'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid joining date is required',
  }),
  probationEndDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Valid probation end date is required',
    }),
  salaryNote: z.string().optional().nullable().or(z.literal('')),
  customEmployeeId: z.string().optional().nullable().or(z.literal('')),
  tempPassword: z.string().min(6, 'Temporary password must be at least 6 characters').optional(),
  passwordDeliveryMode: z.enum(['EMAIL', 'TEMP_PASSWORD']).default('TEMP_PASSWORD'),
});
