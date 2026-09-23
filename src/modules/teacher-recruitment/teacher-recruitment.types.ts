export type TeacherApplicationSource = 'ONLINE' | 'OFFICE';

export type TeacherApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'DEMO_CLASS_SCHEDULED'
  | 'DEMO_CLASS_COMPLETED'
  | 'SELECTED'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_VERIFIED'
  | 'APPOINTED'
  | 'REJECTED'
  | 'CANCELLED';

export type TeacherInterviewType = 'INTERVIEW' | 'DEMO_CLASS';

export type TeacherInterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type TeacherAppointmentDocumentType =
  | 'PROFILE_PHOTO'
  | 'NID'
  | 'CV'
  | 'EDUCATIONAL_CERTIFICATE'
  | 'EXPERIENCE_CERTIFICATE'
  | 'REFERENCE_LETTER'
  | 'APPOINTMENT_LETTER'
  | 'JOINING_LETTER'
  | 'EMPLOYMENT_CONTRACT'
  | 'OTHER';

export type TeacherAppointmentDocumentStatus =
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'NEEDS_REUPLOAD';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';

export type TeacherAppointmentStatus =
  | 'DRAFT'
  | 'PENDING_DOCUMENTS'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ENDED';
