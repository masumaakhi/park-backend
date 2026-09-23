"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const app_error_1 = require("../utils/app-error");
const validate = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
                return next(new app_error_1.AppError(`Validation failed: ${messages}`, 400));
            }
            next(error);
        }
    };
};
exports.validate = validate;
//# sourceMappingURL=validate.middleware.js.map