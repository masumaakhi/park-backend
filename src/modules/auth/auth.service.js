"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserById = exports.loginUser = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const app_error_1 = require("../../utils/app-error");
const prisma = new client_1.PrismaClient();
const loginUser = async (email, passwordString) => {
    const user = await prisma.user.findUnique({
        where: { email },
    });
    if (!user || !(await bcrypt_1.default.compare(passwordString, user.passwordHash))) {
        throw new app_error_1.AppError('Incorrect email or password', 401);
    }
    if (!user.isActive) {
        throw new app_error_1.AppError('Your account has been deactivated', 403);
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };
};
exports.loginUser = loginUser;
const getUserById = async (id) => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
        },
    });
    if (!user) {
        throw new app_error_1.AppError('User not found', 404);
    }
    return user;
};
exports.getUserById = getUserById;
//# sourceMappingURL=auth.service.js.map