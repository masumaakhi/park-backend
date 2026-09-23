import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Handle Zod validation errors cleanly
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

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      stack: err.stack,
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
      });
    } else {
      console.error('ERROR 💥', err);
      res.status(500).json({
        success: false,
        status: 'error',
        message: 'Something went very wrong!',
      });
    }
  }
};
