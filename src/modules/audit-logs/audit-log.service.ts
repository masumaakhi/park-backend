import prisma from '../../config/prisma';

export interface RecordAuditLogParams {
  actorId?: string;
  actorRole?: string;
  action: string;
  module: string;
  affectedRecordId?: string;
  safeMetadata?: Record<string, any> | string;
  ipAddress?: string;
}

export const recordAuditLog = async (params: RecordAuditLogParams) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: params.action,
        module: params.module,
        affectedRecordId: params.affectedRecordId,
        safeMetadata:
          typeof params.safeMetadata === 'object'
            ? JSON.stringify(params.safeMetadata)
            : params.safeMetadata,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log:', error);
  }
};
