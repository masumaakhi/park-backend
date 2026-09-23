import { CookieOptions } from 'express';

export const getCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? '.tista.org' : undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
};
