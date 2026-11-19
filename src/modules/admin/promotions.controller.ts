import { Request, Response, NextFunction } from 'express';
import { PrismaClient, StudentEnrollmentStatus, PromotionType } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { resolveStudentPhotoBase64 } from './digital-ids.controller';

const prisma = new PrismaClient();

/**
 * 1. Get Eligible Student Candidates for Promotion
 */
export const getPromotionCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, classLevelId, sectionId } = req.query;

    if (!sessionId || !classLevelId) {
      throw new AppError('Both sessionId and classLevelId are required', 400);
    }

    const currentClass = await prisma.classLevel.findUnique({
      where: { id: String(classLevelId) },
    });

    if (!currentClass) {
      throw new AppError('Source class level not found', 404);
    }

    // Determine the next class level by sortOrder
    const nextClass = await prisma.classLevel.findFirst({
      where: {
        sortOrder: { gt: currentClass.sortOrder },
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const isHighestClass = !nextClass;

    // Build enrollment where clause
    const enrollmentWhere: any = {
      academicSessionId: String(sessionId),
      classLevelId: String(classLevelId),
      isCurrent: true,
      status: StudentEnrollmentStatus.ACTIVE,
    };

    if (sectionId && sectionId !== 'ALL') {
      enrollmentWhere.classSectionId = String(sectionId);
    }

    const enrollments = await prisma.studentEnrollment.findMany({
      where: enrollmentWhere,
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        classLevel: true,
        classSection: true,
        academicSession: true,
      },
      orderBy: [
        { rollNumber: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Check academic exam results for merit calculation
    const exams = await prisma.exam.findMany({
      where: {
        academicSessionId: String(sessionId),
        classLevelId: String(classLevelId),
        isPublished: true,
      },
      include: {
        subjects: {
          include: {
            marks: {
              where: {
                studentId: { in: enrollments.map((e) => e.studentId) },
              },
            },
          },
        },
      },
    });

    // Compute academic summary for each student
    const studentPerformanceMap: Record<string, { totalMarks: number; maxMarks: number; percentage: number; isPassed: boolean; examsCount: number }> = {};
    
    for (const enrollment of enrollments) {
      const sId = enrollment.studentId;
      let totalObtained = 0;
      let totalFull = 0;
      let hasFailed = false;
      let count = 0;

      for (const exam of exams) {
        for (const es of exam.subjects) {
          const mark = es.marks.find((m) => m.studentId === sId);
          if (mark) {
            count++;
            const obtained = mark.isAbsent ? 0 : mark.marksObtained || 0;
            const passMarks = es.passMarks || 40;
            if (mark.isAbsent || obtained < passMarks) {
              hasFailed = true;
            }
            totalObtained += obtained;
            totalFull += es.fullMarks || 100;
          }
        }
      }

      const percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 100) : 0;
      studentPerformanceMap[sId] = {
        totalMarks: totalObtained,
        maxMarks: totalFull,
        percentage,
        isPassed: count > 0 ? !hasFailed : true,
        examsCount: count,
      };
    }

    // Resolve photos and prepare enriched candidates
    const candidates = await Promise.all(
      enrollments.map(async (e, idx) => {
        const photo = await resolveStudentPhotoBase64(e.student.id, e.student.profileImage);
        const perf = studentPerformanceMap[e.student.id] || {
          totalMarks: 0,
          maxMarks: 0,
          percentage: 0,
          isPassed: true,
          examsCount: 0,
        };

        const suggestedNewRoll = String(idx + 1).padStart(2, '0');

        return {
          studentId: e.student.id,
          enrollmentId: e.id,
          studentName: e.student.user.name,
          studentEmail: e.student.user.email,
          studentCustomId: e.student.studentId,
          profileImage: photo,
          currentRoll: e.rollNumber || String(idx + 1).padStart(2, '0'),
          currentClass: e.classLevel.name,
          currentSection: e.classSection.name,
          currentSectionId: e.classSectionId,
          suggestedNewRoll,
          action: isHighestClass ? 'GRADUATE' : perf.isPassed ? 'PROMOTE' : 'RETAIN',
          performance: perf,
        };
      })
    );

    // Also fetch available sessions and target sections for next class
    const allSessions = await prisma.academicSession.findMany({
      orderBy: { startDate: 'desc' },
    });

    res.status(200).json(
      new ApiResponse(true, 'Promotion candidates fetched successfully', {
        currentClass,
        nextClass: nextClass || null,
        isHighestClass,
        totalCandidates: candidates.length,
        candidates,
        allSessions,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Execute Batch / Individual Student Promotion
 */
export const executePromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const {
      sourceSessionId,
      sourceClassLevelId,
      targetSessionId,
      targetClassLevelId,
      defaultTargetSectionId,
      promotions,
      promotionType = 'BULK',
    } = req.body;

    if (!sourceSessionId || !sourceClassLevelId) {
      throw new AppError('Source session and source class level are required', 400);
    }

    if (!Array.isArray(promotions) || promotions.length === 0) {
      throw new AppError('No students provided for promotion', 400);
    }

    // Verify source and target classes
    const sourceClass = await prisma.classLevel.findUnique({
      where: { id: sourceClassLevelId },
    });

    let targetClass: any = null;
    if (targetClassLevelId) {
      targetClass = await prisma.classLevel.findUnique({
        where: { id: targetClassLevelId },
      });
    }

    // Pre-fetch or ensure target sections for targetSessionId & targetClassLevelId
    let targetSections: any[] = [];
    if (targetSessionId && targetClassLevelId) {
      targetSections = await prisma.classSection.findMany({
        where: {
          academicSessionId: targetSessionId,
          classLevelId: targetClassLevelId,
        },
      });

      // If no section exists in target session for that class, auto-create Section 'A'
      if (targetSections.length === 0) {
        const newSec = await prisma.classSection.create({
          data: {
            name: 'A',
            academicSessionId: targetSessionId,
            classLevelId: targetClassLevelId,
            code: `${targetClass?.name || 'Class'}-A`,
            capacity: 40,
            isActive: true,
          },
        });
        targetSections = [newSec];
      }
    }

    let defaultSecId = defaultTargetSectionId;
    if (!defaultSecId && targetSections.length > 0) {
      defaultSecId = targetSections[0].id;
    }

    let promotedCount = 0;
    let retainedCount = 0;
    let graduatedCount = 0;
    let skippedCount = 0;

    // Run transaction
    await prisma.$transaction(async (tx) => {
      for (const item of promotions) {
        const {
          studentId,
          enrollmentId,
          action, // 'PROMOTE' | 'RETAIN' | 'GRADUATE' | 'SKIP'
          newRollNumber,
          targetSectionId,
          remarks,
        } = item;

        if (action === 'SKIP') {
          skippedCount++;
          continue;
        }

        const oldEnrollment = await tx.studentEnrollment.findUnique({
          where: { id: enrollmentId },
        });

        if (!oldEnrollment) continue;

        if (action === 'PROMOTE') {
          if (!targetSessionId || !targetClassLevelId) {
            throw new AppError('Target session and target class level are required for promotion', 400);
          }

          const resolvedSectionId = targetSectionId || defaultSecId || targetSections[0]?.id;
          if (!resolvedSectionId) {
            throw new AppError('No target section available for the target class', 400);
          }

          // 1. Mark old enrollment as PROMOTED
          await tx.studentEnrollment.update({
            where: { id: enrollmentId },
            data: {
              status: StudentEnrollmentStatus.PROMOTED,
              isCurrent: false,
              endDate: new Date(),
            },
          });

          // 2. Create new active enrollment in target class & session
          const newEnrollment = await tx.studentEnrollment.create({
            data: {
              studentId,
              academicSessionId: targetSessionId,
              classLevelId: targetClassLevelId,
              classSectionId: resolvedSectionId,
              rollNumber: newRollNumber || oldEnrollment.rollNumber || null,
              status: StudentEnrollmentStatus.ACTIVE,
              isCurrent: true,
              startDate: new Date(),
            },
          });

          // 3. Update student model roll number
          if (newRollNumber) {
            await tx.student.update({
              where: { id: studentId },
              data: { rollNumber: newRollNumber },
            });
          }

          // 4. Create promotion history entry
          await tx.studentPromotion.create({
            data: {
              studentId,
              fromEnrollmentId: enrollmentId,
              toEnrollmentId: newEnrollment.id,
              promotionType: promotionType === 'INDIVIDUAL' ? PromotionType.INDIVIDUAL : PromotionType.BULK,
              remarks: remarks || `Promoted to ${targetClass?.name || 'next class'} (${newEnrollment.rollNumber ? 'Roll: ' + newEnrollment.rollNumber : ''})`,
              promotedById: adminUserId,
              promotedAt: new Date(),
            },
          });

          promotedCount++;
        } else if (action === 'RETAIN') {
          // Retain in same classLevel in the target session
          const effectiveTargetSession = targetSessionId || sourceSessionId;
          
          // Find or create section in target session for current class level
          let retainSection = await tx.classSection.findFirst({
            where: {
              academicSessionId: effectiveTargetSession,
              classLevelId: sourceClassLevelId,
            },
          });

          if (!retainSection) {
            retainSection = await tx.classSection.create({
              data: {
                name: 'A',
                academicSessionId: effectiveTargetSession,
                classLevelId: sourceClassLevelId,
                code: `${sourceClass?.name || 'Class'}-A`,
                capacity: 40,
                isActive: true,
              },
            });
          }

          // 1. Close old enrollment
          await tx.studentEnrollment.update({
            where: { id: enrollmentId },
            data: {
              status: StudentEnrollmentStatus.TRANSFERRED, // or previous closed
              isCurrent: false,
              endDate: new Date(),
            },
          });

          // 2. Create new enrollment in same class
          const newEnrollment = await tx.studentEnrollment.create({
            data: {
              studentId,
              academicSessionId: effectiveTargetSession,
              classLevelId: sourceClassLevelId,
              classSectionId: retainSection.id,
              rollNumber: newRollNumber || oldEnrollment.rollNumber || null,
              status: StudentEnrollmentStatus.ACTIVE,
              isCurrent: true,
              startDate: new Date(),
            },
          });

          // 3. Create promotion record
          await tx.studentPromotion.create({
            data: {
              studentId,
              fromEnrollmentId: enrollmentId,
              toEnrollmentId: newEnrollment.id,
              promotionType: PromotionType.INDIVIDUAL,
              remarks: remarks || `Retained in ${sourceClass?.name || 'class'} for review/improvement`,
              promotedById: adminUserId,
              promotedAt: new Date(),
            },
          });

          retainedCount++;
        } else if (action === 'GRADUATE') {
          // 1. Mark old enrollment as GRADUATED
          await tx.studentEnrollment.update({
            where: { id: enrollmentId },
            data: {
              status: StudentEnrollmentStatus.GRADUATED,
              isCurrent: false,
              endDate: new Date(),
            },
          });

          // 2. Create promotion history entry with GRADUATED type
          await tx.studentPromotion.create({
            data: {
              studentId,
              fromEnrollmentId: enrollmentId,
              toEnrollmentId: null,
              promotionType: PromotionType.GRADUATED,
              remarks: remarks || `Graduated successfully from ${sourceClass?.name || 'school'}`,
              promotedById: adminUserId,
              promotedAt: new Date(),
            },
          });

          graduatedCount++;
        }
      }
    });

    res.status(200).json(
      new ApiResponse(true, `Promotion process completed successfully!`, {
        totalProcessed: promotions.length,
        promotedCount,
        retainedCount,
        graduatedCount,
        skippedCount,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Get Student Promotion History Logs
 */
export const getPromotionHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, classLevelId, search } = req.query;

    const where: any = {};
    if (sessionId) {
      where.fromEnrollment = { academicSessionId: String(sessionId) };
    }
    if (classLevelId) {
      where.fromEnrollment = {
        ...where.fromEnrollment,
        classLevelId: String(classLevelId),
      };
    }
    if (search) {
      where.student = {
        OR: [
          { studentId: { contains: String(search), mode: 'insensitive' } },
          { user: { name: { contains: String(search), mode: 'insensitive' } } },
        ],
      };
    }

    const history = await prisma.studentPromotion.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        fromEnrollment: {
          include: {
            classLevel: true,
            classSection: true,
            academicSession: true,
          },
        },
        toEnrollment: {
          include: {
            classLevel: true,
            classSection: true,
            academicSession: true,
          },
        },
        promotedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { promotedAt: 'desc' },
      take: 100,
    });

    const enrichedHistory = await Promise.all(
      history.map(async (h) => {
        const photo = await resolveStudentPhotoBase64(h.student.id, h.student.profileImage);
        return {
          id: h.id,
          studentId: h.student.id,
          studentCustomId: h.student.studentId,
          studentName: h.student.user.name,
          profileImage: photo,
          promotionType: h.promotionType,
          remarks: h.remarks,
          promotedAt: h.promotedAt,
          promotedByName: h.promotedBy?.name || 'Administrator',
          from: h.fromEnrollment
            ? {
                session: h.fromEnrollment.academicSession.name,
                classLevel: h.fromEnrollment.classLevel.name,
                section: h.fromEnrollment.classSection.name,
                rollNumber: h.fromEnrollment.rollNumber,
              }
            : null,
          to: h.toEnrollment
            ? {
                session: h.toEnrollment.academicSession.name,
                classLevel: h.toEnrollment.classLevel.name,
                section: h.toEnrollment.classSection.name,
                rollNumber: h.toEnrollment.rollNumber,
              }
            : null,
        };
      })
    );

    res.status(200).json(
      new ApiResponse(true, 'Promotion history retrieved successfully', {
        total: enrichedHistory.length,
        history: enrichedHistory,
      })
    );
  } catch (error) {
    next(error);
  }
};

