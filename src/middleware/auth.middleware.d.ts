import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: string;
                name: string;
                email: string;
            };
        }
    }
}
export declare const requireAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map