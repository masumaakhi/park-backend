import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'storage', 'private', 'admissions');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
  fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
export const MAX_FILE_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export interface StoredFileInfo {
  fileName: string;
  storageFileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
}

export class StorageService {
  /**
   * Validate file buffer or uploaded multer file
   */
  static validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${MAX_SIZE_MB}MB`,
      };
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file extension "${ext}". Allowed: PDF, JPG, JPEG, PNG, WEBP`,
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported MIME type "${file.mimetype}". Allowed: PDF, JPG, PNG, WEBP`,
      };
    }

    return { valid: true };
  }

  /**
   * Store a file securely on private storage
   */
  static async savePrivateFile(file: Express.Multer.File): Promise<StoredFileInfo> {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeRandomName = `${crypto.randomUUID()}_${Date.now()}${ext}`;
    const destinationPath = path.join(UPLOAD_BASE_DIR, safeRandomName);

    await fs.promises.writeFile(destinationPath, file.buffer);

    return {
      fileName: file.originalname,
      storageFileName: safeRandomName,
      filePath: destinationPath,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  /**
   * Check if file exists and get its absolute path
   */
  static getPrivateFilePath(storageFileName: string): string | null {
    // Sanitize to prevent directory traversal
    const safeName = path.basename(storageFileName);
    const fullPath = path.join(UPLOAD_BASE_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  /**
   * Generate short-lived HMAC signed access token for document viewing
   */
  static generateSignedToken(documentId: string, expiresInSeconds: number = 300): string {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const secret = process.env.JWT_SECRET || 'private-doc-secret-key-educational-park';
    const payload = `${documentId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}:${signature}`;
  }

  /**
   * Verify short-lived signed access token
   */
  static verifySignedToken(token: string, documentId: string): boolean {
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return false;
      const [tokenDocId, expiresAtStr, signature] = parts;
      if (tokenDocId !== documentId) return false;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) return false;

      const secret = process.env.JWT_SECRET || 'private-doc-secret-key-educational-park';
      const payload = `${tokenDocId}:${expiresAtStr}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }
}
