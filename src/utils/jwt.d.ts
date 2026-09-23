export interface JwtPayload {
    id: string;
    role: string;
}
export declare const signToken: (payload: JwtPayload) => string;
export declare const verifyToken: (token: string) => JwtPayload;
//# sourceMappingURL=jwt.d.ts.map