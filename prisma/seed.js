"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminName = process.env.INITIAL_ADMIN_NAME || 'Admin';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
        console.error('Missing INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD in environment variables.');
        process.exit(1);
    }
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail }
    });
    if (existingAdmin) {
        console.log('Admin user already exists. Skipping seed.');
        return;
    }
    const passwordHash = await bcrypt_1.default.hash(adminPassword, 10);
    await prisma.user.create({
        data: {
            name: adminName,
            email: adminEmail,
            passwordHash,
            role: 'ADMIN',
            isActive: true,
        }
    });
    console.log('Initial Admin user created successfully.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map