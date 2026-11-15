import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // 1. Handle Zod validation errors cleanly
  if (err instanceof ZodError || err.name === 'ZodError' || Array.isArray(err.issues) || Array.isArray(err.errors)) {
    const issues = err.issues || err.errors || [];
    const firstIssue = issues[0];
    const fieldName = firstIssue?.path?.length ? ` (${firstIssue.path.join('.')})` : '';
    const firstMessage = firstIssue?.message ? `${firstIssue.message}${fieldName}` : 'Validation error';
    return res.status(422).json({
      success: false,
      status: 'fail',
      message: firstMessage,
      errors: issues,
    });
  }

  // 2. Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError || err.name === 'PrismaClientKnownRequestError') {
    let cleanMessage = 'A database error occurred.';
    let statusCode = 400;

    switch (err.code) {
      case 'P2003': {
        statusCode = 409;
        cleanMessage = 'Cannot delete or update this record because it is referenced by other active records (such as classes, assignments, or results). Please deactivate it or unlink related records instead.';
        break;
      }
      case 'P2002': {
        statusCode = 409;
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : (err.meta?.target || 'value');
        cleanMessage = `A record with this ${target} already exists. Please use a unique value.`;
        break;
      }
      case 'P2025': {
        statusCode = 404;
        cleanMessage = 'The requested record was not found or has already been deleted.';
        break;
      }
      case 'P2014': {
        statusCode = 409;
        cleanMessage = 'The relation between these records is required and cannot be removed.';
        break;
      }
      case 'P2000': {
        statusCode = 400;
        cleanMessage = 'One or more fields exceed the allowed length.';
        break;
      }
      default: {
        statusCode = 400;
        cleanMessage = 'A database constraint prevented this operation. Please verify related records.';
        break;
      }
    }

    return res.status(statusCode).json({
      success: false,
      status: 'fail',
      message: cleanMessage,
      ...(process.env.NODE_ENV === 'development' ? { rawMessage: err.message, code: err.code } : {}),
    });
  }

  // 3. Handle Prisma Validation Errors
  if (err instanceof Prisma.PrismaClientValidationError || err.name === 'PrismaClientValidationError') {
    return res.status(400).json({
      success: false,
      status: 'fail',
      message: 'Invalid data format provided for database operation.',
      ...(process.env.NODE_ENV === 'development' ? { rawMessage: err.message } : {}),
    });
  }

  const rawErrMsg = typeof err.message === 'string' ? err.message : '';

  // 4. Handle raw SQL / Foreign Key / Unique constraint violations
  if (
    rawErrMsg.includes('violates RESTRICT setting of foreign key constraint') ||
    rawErrMsg.includes('foreign key constraint') ||
    rawErrMsg.includes('code: "23001"') ||
    rawErrMsg.includes('code: "23503"') ||
    rawErrMsg.includes('23503')
  ) {
    return res.status(409).json({
      success: false,
      status: 'fail',
      message: 'Cannot delete or update this record because it is referenced by other active records in the system. Please deactivate it instead.',
      ...(process.env.NODE_ENV === 'development' ? { rawMessage: rawErrMsg } : {}),
    });
  }

  if (rawErrMsg.includes('violates unique constraint') || rawErrMsg.includes('code: "23505"') || rawErrMsg.includes('23505')) {
    return res.status(409).json({
      success: false,
      status: 'fail',
      message: 'A duplicate record already exists with the same information.',
      ...(process.env.NODE_ENV === 'development' ? { rawMessage: rawErrMsg } : {}),
    });
  }

  // 5. Sanitize any raw database or multiline stack leak in error message
  let userFacingMessage = rawErrMsg;
  if (
    rawErrMsg.includes('ConnectorError') ||
    rawErrMsg.includes("Invalid 'tx.") ||
    rawErrMsg.includes("Invalid `tx.") ||
    rawErrMsg.includes("Invalid 'prisma.") ||
    rawErrMsg.includes("Invalid `prisma.") ||
    rawErrMsg.includes('QueryError') ||
    (rawErrMsg.includes('\n') && rawErrMsg.length > 120)
  ) {
    userFacingMessage = 'A database error occurred while processing this request. Please check related dependencies or deactivate the record.';
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: userFacingMessage || 'An unexpected error occurred.',
      ...(userFacingMessage !== rawErrMsg ? { rawMessage: rawErrMsg } : {}),
      stack: err.stack,
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: userFacingMessage || err.message,
      });
    } else {
      console.error('ERROR 💥', err);
      res.status(err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500).json({
        success: false,
        status: 'error',
        message: userFacingMessage || 'Something went wrong. Please try again.',
      });
    }
  }
};
