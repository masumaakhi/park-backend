export declare const loginUser: (email: string, passwordString: string) => Promise<{
    id: string;
    name: string;
    email: string;
    role: import(".prisma/client").$Enums.Role;
}>;
export declare const getUserById: (id: string) => Promise<{
    email: string;
    id: string;
    isActive: boolean;
    name: string;
    role: import(".prisma/client").$Enums.Role;
}>;
//# sourceMappingURL=auth.service.d.ts.map
