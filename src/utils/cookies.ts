import { CookieOptions } from 'express';

export const getCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    domain: cookieDomain,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
};

