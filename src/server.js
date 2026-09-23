"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const error_middleware_1 = require("./middleware/error.middleware");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const role_middleware_1 = require("./middleware/role.middleware");
const api_response_1 = require("./utils/api-response");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004'
];
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: "Tista API is running"
    });
});
// API Routes
app.use('/api/v1/auth', auth_routes_1.default);
// Test Protected Routes
app.get('/api/v1/admin/test', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), (req, res) => {
    res.json(new api_response_1.ApiResponse(true, 'Admin access granted'));
});
app.get('/api/v1/teacher/test', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('TEACHER'), (req, res) => {
    res.json(new api_response_1.ApiResponse(true, 'Teacher access granted'));
});
app.get('/api/v1/student/test', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('STUDENT'), (req, res) => {
    res.json(new api_response_1.ApiResponse(true, 'Student access granted'));
});
// Error handling middleware
app.use(error_middleware_1.errorHandler);
app.listen(PORT, () => {
    console.log(`Tista API is running on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map