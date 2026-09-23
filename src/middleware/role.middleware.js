"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
const express_1 = require("express");
const app_error_1 = require("../utils/app-error");
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new app_error_1.AppError('You do not have permission to perform this action', 403));
        }
        next();
    };
};
exports.requireRole = requireRole;
//# sourceMappingURL=role.middleware.js.map