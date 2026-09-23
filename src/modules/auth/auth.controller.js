"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.getMe = exports.logout = exports.login = void 0;
const express_1 = require("express");
const auth_service_1 = require("./auth.service");
const jwt_1 = require("../../utils/jwt");
const cookies_1 = require("../../utils/cookies");
const api_response_1 = require("../../utils/api-response");
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await (0, auth_service_1.loginUser)(email, password);
        const token = (0, jwt_1.signToken)({ id: user.id, role: user.role });
        res.cookie('jwt', token, (0, cookies_1.getCookieOptions)());
        res.status(200).json(new api_response_1.ApiResponse(true, 'Login successful', { user }));
    }
    catch (error) {
        next(error);
    }
};
exports.login = login;
const logout = (req, res) => {
    res.cookie('jwt', 'loggedout', {
        ...(0, cookies_1.getCookieOptions)(),
        expires: new Date(Date.now() + 10 * 1000), // expire in 10s
    });
    res.status(200).json(new api_response_1.ApiResponse(true, 'Logged out successfully'));
};
exports.logout = logout;
const getMe = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json(new api_response_1.ApiResponse(false, 'Not logged in'));
        }
        const user = await (0, auth_service_1.getUserById)(req.user.id);
        res.status(200).json(new api_response_1.ApiResponse(true, 'User fetched successfully', { user }));
    }
    catch (error) {
        next(error);
    }
};
exports.getMe = getMe;
const refresh = (req, res) => {
    // Not fully implemented yet, placeholder
    res.status(200).json(new api_response_1.ApiResponse(true, 'Token refreshed (placeholder)'));
};
exports.refresh = refresh;
//# sourceMappingURL=auth.controller.js.map