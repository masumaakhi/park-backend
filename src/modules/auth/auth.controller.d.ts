import { Request, Response, NextFunction } from 'express';
export declare const login: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const logout: (req: Request, res: Response) => void;
export declare const getMe: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const refresh: (req: Request, res: Response) => void;
//# sourceMappingURL=auth.controller.d.ts.map
