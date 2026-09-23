import jwt from 'jsonwebtoken';

export interface JwtPayload {
  id: string;
  role: string;
}

export const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '7d', // example expiration
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
};
