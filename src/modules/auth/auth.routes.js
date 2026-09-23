"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_schema_1 = require("./auth.schema");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../middleware/rate-limit.middleware");
const router = (0, express_1.Router)();
router.post('/login', rate_limit_middleware_1.authLimiter, (0, validate_middleware_1.validate)(auth_schema_1.loginSchema), auth_controller_1.login);
router.post('/logout', auth_controller_1.logout);
router.get('/me', auth_middleware_1.requireAuth, auth_controller_1.getMe);
router.post('/refresh', auth_controller_1.refresh);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map