import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting UAT Database Seed...');
  
  // Create Admin
  const adminPassword = await bcrypt.hash('AdminTest123!', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@edupark.test' },
    update: {},
    create: {
      email: 'admin@edupark.test',
      passwordHash: adminPassword,
      role: 'ADMIN',
      name: 'Super Admin',
      isActive: true,
    },
  });
  console.log('[+] Seeded UAT Admin User');

  // Create Teacher
  const teacherPassword = await bcrypt.hash('TeacherTest123!', 10);
  const teacherUser = await prisma.user.upsert({
    where: { email: 'john.teacher@edupark.test' },
    update: {},
    create: {
      email: 'john.teacher@edupark.test',
      passwordHash: teacherPassword,
      role: 'TEACHER',
      name: 'Teacher One',
      isActive: true,
      teacher: {
        create: {
          employeeId: 'TCH-001',
          phone: '+1234567890',
          designation: 'Senior Mathematics Teacher'
        }
      }
    },
  });
  console.log('[+] Seeded UAT Teacher User');

  // Create Student
  const studentPassword = await bcrypt.hash('StudentTest123!', 10);
  const studentUser = await prisma.user.upsert({
    where: { email: 'alice.student@edupark.test' },
    update: {},
    create: {
      email: 'alice.student@edupark.test',
      passwordHash: studentPassword,
      role: 'STUDENT',
      name: 'Alice Smith',
      isActive: true,
      student: {
        create: {
          studentId: 'STU-2026-001',
          phone: '+0987654321',
          guardianName: 'Bob Smith',
        }
      }
    },
  });
  console.log('[+] Seeded UAT Student User');

  console.log('UAT Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
