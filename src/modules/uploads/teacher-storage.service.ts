import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'storage', 'private', 'teacher-recruitment');

// Ensure base upload directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
  fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

export const ALLOWED_CV_EXTENSIONS = ['.pdf', '.doc', '.docx'];
export const ALLOWED_CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ALLOWED_DOC_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
export const ALLOWED_DOC_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_CV_SIZE_MB = parseInt(process.env.MAX_CV_SIZE_MB || '10', 10);
const MAX_DOC_SIZE_MB = parseInt(process.env.MAX_DOC_SIZE_MB || '10', 10);

export interface StoredFileInfo {
  fileName: string;
  storageFileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
}

export class TeacherStorageService {
  /**
   * Validate CV file buffer / multer file
   */
  static validateCV(file: Express.Multer.File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No CV/Resume file provided' };
    }

    if (file.size > MAX_CV_SIZE_MB * 1024 * 1024) {
      return {
        valid: false,
        error: `CV file size exceeds maximum allowed size of ${MAX_CV_SIZE_MB}MB`,
      };
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_CV_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported CV file format "${ext}". Allowed formats: PDF, DOC, DOCX`,
      };
    }

    if (!ALLOWED_CV_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      // Fallback check extension if mime types vary across OS
      if (!ALLOWED_CV_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported MIME type "${file.mimetype}". Allowed: PDF, DOC, DOCX`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate sensitive appointment document
   */
  static validateDocument(file: Express.Multer.File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No document file provided' };
    }

    if (file.size > MAX_DOC_SIZE_MB * 1024 * 1024) {
      return {
        valid: false,
        error: `Document size exceeds maximum allowed size of ${MAX_DOC_SIZE_MB}MB`,
      };
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_DOC_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported document format "${ext}". Allowed: PDF, JPG, JPEG, PNG, WEBP`,
      };
    }

    if (!ALLOWED_DOC_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported MIME type "${file.mimetype}". Allowed: PDF, JPG, PNG, WEBP`,
      };
    }

    return { valid: true };
  }

  /**
   * Store file securely in private directory
   */
  static async savePrivateFile(
    file: Express.Multer.File,
    subfolder: 'cvs' | 'documents' = 'documents'
  ): Promise<StoredFileInfo> {
    const targetDir = path.join(UPLOAD_BASE_DIR, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const safeRandomName = `${crypto.randomUUID()}_${Date.now()}${ext}`;
    const destinationPath = path.join(targetDir, safeRandomName);

    await fs.promises.writeFile(destinationPath, file.buffer);

    return {
      fileName: file.originalname,
      storageFileName: path.join(subfolder, safeRandomName).replace(/\\/g, '/'),
      filePath: destinationPath,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  /**
   * Resolve secure file path
   */
  static getPrivateFilePath(relativeStoragePath: string): string | null {
    const safeRelative = relativeStoragePath.replace(/\.\./g, '');
    const fullPath = path.join(UPLOAD_BASE_DIR, safeRelative);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  /**
   * Generate short-lived HMAC-signed token for preview/download (default 10 minutes)
   */
  static generateSignedToken(referenceId: string, expiresInSeconds: number = 600): string {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const secret = process.env.JWT_SECRET || 'private-doc-secret-teacher-recruitment-key';
    const payload = `${referenceId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}:${signature}`;
  }

  /**
   * Verify HMAC-signed token
   */
  static verifySignedToken(token: string, referenceId: string): boolean {
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return false;
      const [tokenRefId, expiresAtStr, signature] = parts;
      if (tokenRefId !== referenceId) return false;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) return false;

      const secret = process.env.JWT_SECRET || 'private-doc-secret-teacher-recruitment-key';
      const payload = `${tokenRefId}:${expiresAtStr}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }
}
