"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const express_1 = require("express");
const app_error_1 = require("../utils/app-error");
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            success: false,
            status: err.status,
            message: err.message,
            stack: err.stack,
        });
    }
    else {
        // Production
        if (err.isOperational) {
            res.status(err.statusCode).json({
                success: false,
                status: err.status,
                message: err.message,
            });
        }
        else {
            console.error('ERROR 💥', err);
            res.status(500).json({
                success: false,
                status: 'error',
                message: 'Something went very wrong!',
            });
        }
    }
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.middleware.js.map