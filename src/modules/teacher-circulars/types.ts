import { TeacherCircularStatus } from '@prisma/client';

export interface CreateCircularDto {
  title: string;
  description?: string | null;
  positions: string;
  vacancyCount?: number | null;
  startDate?: string;
  deadline: string;
  googleFormUrl?: string | null;
  allowOnlineForm?: boolean;
}

export interface UpdateCircularDto {
  title?: string;
  description?: string | null;
  positions?: string;
  vacancyCount?: number | null;
  startDate?: string;
  deadline?: string;
  status?: TeacherCircularStatus;
  googleFormUrl?: string | null;
  allowOnlineForm?: boolean;
}
