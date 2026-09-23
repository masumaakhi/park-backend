"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const express_1 = require("express");
const jwt_1 = require("../utils/jwt");
const app_error_1 = require("../utils/app-error");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const requireAuth = async (req, res, next) => {
    try {
        let token;
        if (req.cookies.jwt) {
            token = req.cookies.jwt;
        }
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            return next(new app_error_1.AppError('You are not logged in! Please log in to get access.', 401));
        }
        const decoded = (0, jwt_1.verifyToken)(token);
        const currentUser = await prisma.user.findUnique({
            where: { id: decoded.id }
        });
        if (!currentUser) {
            return next(new app_error_1.AppError('The user belonging to this token does no longer exist.', 401));
        }
        if (!currentUser.isActive) {
            return next(new app_error_1.AppError('This user has been deactivated.', 403));
        }
        req.user = {
            id: currentUser.id,
            role: currentUser.role,
            name: currentUser.name,
            email: currentUser.email,
        };
        next();
    }
    catch (error) {
        return next(new app_error_1.AppError('Invalid token or authorization error.', 401));
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.middleware.js.map