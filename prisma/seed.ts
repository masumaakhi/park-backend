import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Admin User
  const adminPassword = await bcrypt.hash('Admin@123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@tista.org' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@tista.org',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log('Admin user created/verified');

  // 2. Create Academic Session
  const session = await prisma.academicSession.upsert({
    where: { name: '2026' },
    update: { isActive: true },
    create: {
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    },
  });
  console.log('Academic Session created/verified');

  // 3. Create Class Levels
  const classLevels = [
    { name: 'Play', code: 'PLAY', sortOrder: 1 },
    { name: 'Nursery', code: 'NURSERY', sortOrder: 2 },
    { name: 'KG', code: 'KG', sortOrder: 3 },
    { name: 'Class 1', code: 'CLASS_1', sortOrder: 4 },
    { name: 'Class 2', code: 'CLASS_2', sortOrder: 5 },
    { name: 'Class 3', code: 'CLASS_3', sortOrder: 6 },
    { name: 'Class 4', code: 'CLASS_4', sortOrder: 7 },
    { name: 'Class 5', code: 'CLASS_5', sortOrder: 8 },
    { name: 'Class 6', code: 'CLASS_6', sortOrder: 9 },
    { name: 'Class 7', code: 'CLASS_7', sortOrder: 10 },
  ];

  for (const level of classLevels) {
    await prisma.classLevel.upsert({
      where: { code: level.code },
      update: {},
      create: level,
    });
  }
  console.log('Class Levels created/verified');

  // 4. Create Class Sections
  const dbClassLevels = await prisma.classLevel.findMany();
  
  const sectionsToCreate = [
    { levelCode: 'CLASS_1', name: 'A', roomNumber: '101', capacity: 40 },
    { levelCode: 'CLASS_1', name: 'B', roomNumber: '102', capacity: 40 },
    { levelCode: 'CLASS_2', name: 'A', roomNumber: '103', capacity: 40 },
    { levelCode: 'CLASS_3', name: 'A', roomNumber: '104', capacity: 40 },
    { levelCode: 'CLASS_4', name: 'A', roomNumber: '105', capacity: 40 },
    { levelCode: 'CLASS_5', name: 'A', roomNumber: '106', capacity: 40 },
    { levelCode: 'CLASS_6', name: 'A', roomNumber: '201', capacity: 40 },
    { levelCode: 'CLASS_7', name: 'A', roomNumber: '202', capacity: 40 },
  ];

  for (const section of sectionsToCreate) {
    const level = dbClassLevels.find(l => l.code === section.levelCode);
    if (level) {
      await prisma.classSection.upsert({
        where: {
          academicSessionId_classLevelId_name: {
            academicSessionId: session.id,
            classLevelId: level.id,
            name: section.name,
          }
        },
        update: {},
        create: {
          name: section.name,
          academicSessionId: session.id,
          classLevelId: level.id,
          roomNumber: section.roomNumber,
          capacity: section.capacity,
        }
      });
    }
  }
  console.log('Class Sections created/verified');

  // 5. Create Subjects for Class 1 as example
  const subjects = [
    'Bangla',
    'English',
    'Mathematics',
    'Science',
    'Bangladesh and Global Studies',
    'Religion and Moral Education',
    'ICT',
    'Arts/Physical Education'
  ];

  const class1 = dbClassLevels.find(l => l.code === 'CLASS_1');
  if (class1) {
    for (const sub of subjects) {
      await prisma.subject.upsert({
        where: {
          classLevelId_name: {
            classLevelId: class1.id,
            name: sub,
          }
        },
        update: {},
        create: {
          name: sub,
          code: sub.substring(0, 3).toUpperCase(),
          classLevelId: class1.id,
          fullMarks: 100,
          passingMarks: 33,
        }
      });
    }
    console.log('Subjects for Class 1 created/verified');
  }

  // 6. Organization Profile
  await prisma.organizationProfile.deleteMany({});
  await prisma.organizationProfile.create({
    data: {
      name: 'Educational Park',
      tagline: 'Empowering future generations',
      email: 'contact@educationalpark.org',
      phone: '+8801700000000',
    }
  });
  console.log('Organization Profile recreated');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
