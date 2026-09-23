"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookieOptions = void 0;
const express_1 = require("express");
const getCookieOptions = () => {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        domain: isProd ? '.tista.org' : undefined,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
};
exports.getCookieOptions = getCookieOptions;
//# sourceMappingURL=cookies.js.map