import { PrismaClient, ExamTerm } from '@prisma/client';

const prisma = new PrismaClient();

export interface SubjectTermMarks {
  monthlyTestMarks: number | null; // e.g. 80 (out of 100)
  monthlyAverage25: number | null; // A = 25% (e.g. 20.0)
  termEndMarks: number | null;     // e.g. 85 (out of 100)
  termEnd75: number | null;        // B = 75% (e.g. 63.75)
  totalMarks100: number | null;    // A + B = 100% (e.g. 83.75)
  subjectHighest: number | null;   // highest total in section for this subject
}

export interface SubjectFinalResult {
  term1Score30: number | null;     // 30% of Term 1 Total
  term2Score30: number | null;     // 30% of Term 2 Total
  term3Score40: number | null;     // 40% of Term 3 Total
  grandTotal100: number | null;    // 30% + 30% + 40%
  subjectHighest: number | null;   // highest grand total in section
}

export interface MarksheetSubjectRow {
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  fullMarks: number;
  term1: SubjectTermMarks;
  term2: SubjectTermMarks;
  term3: SubjectTermMarks;
  finalResult: SubjectFinalResult;
}

export interface TermSummary {
  totalMarks: number;
  percentage: number;
  positionInClass: number | null;
  totalStudents: number;
  totalWorkingDays: number;
  presentDays: number;
}

export interface ComprehensiveMarksheetData {
  marksheetNumber: string;
  verificationToken: string;
  issuedAt: string;
  student: {
    id: string;
    studentId: string;
    name: string;
    rollNumber: string;
    classLevel: string;
    classSection: string;
    sessionName: string;
    profileImage: string | null;
  };
  subjects: MarksheetSubjectRow[];
  summary: {
    term1: TermSummary;
    term2: TermSummary;
    term3: TermSummary;
    finalResult: {
      totalMarks: number;
      percentage: number;
      positionInClass: number | null;
      totalStudents: number;
      totalWorkingDays: number;
      presentDays: number;
    };
  };
  coCurricular: {
    discipline: string;
    sportsAndGames: string;
    cleanliness: string;
    handwriting: string;
    teacherRemarks: string;
    promotionStatus: string; // "PROMOTED" | "FAILED" | "PENDING"
  };
}

/**
 * Calculates and returns the Comprehensive 3-Term Academic Marksheet
 * matching the official physical report card format.
 */
export async function generateComprehensiveMarksheet(
  studentId: string,
  classSectionId?: string
): Promise<ComprehensiveMarksheetData | null> {
  // 1. Fetch student and active enrollment
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true, email: true } },
      academicEnrollments: {
        where: { isCurrent: true },
        include: {
          classSection: {
            include: {
              classLevel: true,
              academicSession: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!student || !student.academicEnrollments[0]) {
    return null;
  }

  const enrollment = student.academicEnrollments[0];
  const section = enrollment.classSection;
  const targetSectionId = classSectionId || section.id;
  const session = section.academicSession;
  const classLevel = section.classLevel;

  // 2. Fetch all subjects for this class level
  const allSubjects = await prisma.subject.findMany({
    where: { classLevelId: classLevel.id, isActive: true },
    orderBy: { name: 'asc' },
  });

  // 3. Fetch all active students enrolled in this section to calculate rank & highest marks
  const allSectionEnrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: targetSectionId,
      isCurrent: true,
      status: 'ACTIVE',
    },
    select: { studentId: true, rollNumber: true },
  });
  const allSectionStudentIds = allSectionEnrollments.map((e) => e.studentId);
  const totalStudents = allSectionStudentIds.length || 1;

  // 4. Fetch all exams for this section
  const exams = await prisma.exam.findMany({
    where: {
      classSectionId: targetSectionId,
      status: { in: ['OPEN', 'CLOSED', 'PUBLISHED'] },
    },
    include: {
      examType: true,
      subjects: {
        include: {
          marks: {
            where: { studentId: { in: allSectionStudentIds } },
          },
        },
      },
    },
  });

  // Classify exams into Term 1, Term 2, Term 3
  const termExams: {
    term1: typeof exams;
    term2: typeof exams;
    term3: typeof exams;
  } = { term1: [], term2: [], term3: [] };

  for (const ex of exams) {
    const code = ex.examType.code.toUpperCase();
    const title = ex.title.toUpperCase();
    const termField = ex.term;

    if (termField === ExamTerm.TERM_2 || code.includes('TERM-2') || code.includes('TERM_2') || title.includes('2ND') || title.includes('TERM 2') || title.includes('TERM-2')) {
      termExams.term2.push(ex);
    } else if (termField === ExamTerm.TERM_3 || code.includes('TERM-3') || code.includes('TERM_3') || title.includes('3RD') || title.includes('TERM 3') || title.includes('ANNUAL') || title.includes('TERM-3')) {
      termExams.term3.push(ex);
    } else {
      // Default to Term 1
      termExams.term1.push(ex);
    }
  }

  // 5. Helper to calculate term mark for a student & subject
  function getStudentSubjectTermScore(
    stuId: string,
    subjId: string,
    termExamList: typeof exams
  ): {
    monthlyRaw: number | null;
    monthly25: number | null;
    termEndRaw: number | null;
    termEnd75: number | null;
    total100: number | null;
  } {
    for (const ex of termExamList) {
      const examSubj = ex.subjects.find((s) => s.subjectId === subjId);
      if (!examSubj) continue;
      const mark = examSubj.marks.find((m) => m.studentId === stuId);
      if (mark) {
        if (mark.isAbsent) {
          return { monthlyRaw: 0, monthly25: 0, termEndRaw: 0, termEnd75: 0, total100: 0 };
        }

        const mRaw = mark.monthlyTestMarks !== null && mark.monthlyTestMarks !== undefined ? Number(mark.monthlyTestMarks) : null;
        const tRaw = mark.termEndMarks !== null && mark.termEndMarks !== undefined ? Number(mark.termEndMarks) : null;

        let m25: number | null = null;
        let t75: number | null = null;
        let total: number | null = null;

        if (mRaw !== null) {
          // If out of 100, scale to 25%; if entered <= 25, keep as is
          m25 = mRaw > 25 ? Math.round((mRaw * 0.25) * 10) / 10 : Math.round(mRaw * 10) / 10;
        }

        if (tRaw !== null) {
          // If out of 100, scale to 75%; if entered <= 75, keep as is
          t75 = tRaw > 75 ? Math.round((tRaw * 0.75) * 10) / 10 : Math.round(tRaw * 10) / 10;
        }

        if (m25 !== null && t75 !== null) {
          total = Math.round((m25 + t75) * 10) / 10;
        } else if (mark.marksObtained !== null && mark.marksObtained !== undefined) {
          total = Math.round(Number(mark.marksObtained) * 10) / 10;
          // default split if not specifically entered
          if (m25 === null) m25 = Math.round((total * 0.25) * 10) / 10;
          if (t75 === null) t75 = Math.round((total * 0.75) * 10) / 10;
        }

        return { monthlyRaw: mRaw, monthly25: m25, termEndRaw: tRaw, termEnd75: t75, total100: total };
      }
    }
    return { monthlyRaw: null, monthly25: null, termEndRaw: null, termEnd75: null, total100: null };
  }

  // Precompute subject highest in section for each term and final
  const highestMap: Record<string, { term1: number | null; term2: number | null; term3: number | null; final: number | null }> = {};

  for (const subj of allSubjects) {
    let t1Max: number | null = null;
    let t2Max: number | null = null;
    let t3Max: number | null = null;
    let fMax: number | null = null;

    for (const otherStuId of allSectionStudentIds) {
      const s1 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term1).total100;
      const s2 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term2).total100;
      const s3 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term3).total100;

      if (s1 !== null && (t1Max === null || s1 > t1Max)) t1Max = s1;
      if (s2 !== null && (t2Max === null || s2 > t2Max)) t2Max = s2;
      if (s3 !== null && (t3Max === null || s3 > t3Max)) t3Max = s3;

      let fTot: number | null = null;
      if (s1 !== null || s2 !== null || s3 !== null) {
        fTot = Math.round(((s1 || 0) * 0.3 + (s2 || 0) * 0.3 + (s3 || 0) * 0.4) * 10) / 10;
        if (fMax === null || fTot > fMax) fMax = fTot;
      }
    }

    highestMap[subj.id] = { term1: t1Max, term2: t2Max, term3: t3Max, final: fMax };
  }

  // 6. Build the subject rows for our target student
  const subjectRows: MarksheetSubjectRow[] = [];
  let t1TotalSum = 0;
  let t2TotalSum = 0;
  let t3TotalSum = 0;
  let finalGrandSum = 0;
  let totalFullMarks = 0;

  for (const subj of allSubjects) {
    const fullMarks = subj.fullMarks || 100;
    totalFullMarks += fullMarks;

    const t1 = getStudentSubjectTermScore(student.id, subj.id, termExams.term1);
    const t2 = getStudentSubjectTermScore(student.id, subj.id, termExams.term2);
    const t3 = getStudentSubjectTermScore(student.id, subj.id, termExams.term3);

    if (t1.total100 !== null) t1TotalSum += t1.total100;
    if (t2.total100 !== null) t2TotalSum += t2.total100;
    if (t3.total100 !== null) t3TotalSum += t3.total100;

    // Final result calculation: 30% from Term 1, 30% from Term 2, 40% from Term 3
    const t1Score30 = t1.total100 !== null ? Math.round((t1.total100 * 0.3) * 10) / 10 : null;
    const t2Score30 = t2.total100 !== null ? Math.round((t2.total100 * 0.3) * 10) / 10 : null;
    const t3Score40 = t3.total100 !== null ? Math.round((t3.total100 * 0.4) * 10) / 10 : null;

    let grandTotal100: number | null = null;
    if (t1Score30 !== null || t2Score30 !== null || t3Score40 !== null) {
      grandTotal100 = Math.round(((t1Score30 || 0) + (t2Score30 || 0) + (t3Score40 || 0)) * 10) / 10;
      finalGrandSum += grandTotal100;
    }

    const high = highestMap[subj.id] || { term1: null, term2: null, term3: null, final: null };

    subjectRows.push({
      subjectId: subj.id,
      subjectName: subj.name,
      subjectCode: subj.code,
      fullMarks,
      term1: {
        monthlyTestMarks: t1.monthlyRaw,
        monthlyAverage25: t1.monthly25,
        termEndMarks: t1.termEndRaw,
        termEnd75: t1.termEnd75,
        totalMarks100: t1.total100,
        subjectHighest: high.term1,
      },
      term2: {
        monthlyTestMarks: t2.monthlyRaw,
        monthlyAverage25: t2.monthly25,
        termEndMarks: t2.termEndRaw,
        termEnd75: t2.termEnd75,
        totalMarks100: t2.total100,
        subjectHighest: high.term2,
      },
      term3: {
        monthlyTestMarks: t3.monthlyRaw,
        monthlyAverage25: t3.monthly25,
        termEndMarks: t3.termEndRaw,
        termEnd75: t3.termEnd75,
        totalMarks100: t3.total100,
        subjectHighest: high.term3,
      },
      finalResult: {
        term1Score30: t1Score30,
        term2Score30: t2Score30,
        term3Score40: t3Score40,
        grandTotal100: grandTotal100,
        subjectHighest: high.final,
      },
    });
  }

  // 7. Calculate Class Position (Ranks) for Term 1, Term 2, Term 3, and Final
  const term1Ranks: { stuId: string; total: number }[] = [];
  const term2Ranks: { stuId: string; total: number }[] = [];
  const term3Ranks: { stuId: string; total: number }[] = [];
  const finalRanks: { stuId: string; total: number }[] = [];

  for (const otherStuId of allSectionStudentIds) {
    let s1Tot = 0;
    let s2Tot = 0;
    let s3Tot = 0;

    for (const subj of allSubjects) {
      const s1 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term1).total100 || 0;
      const s2 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term2).total100 || 0;
      const s3 = getStudentSubjectTermScore(otherStuId, subj.id, termExams.term3).total100 || 0;
      s1Tot += s1;
      s2Tot += s2;
      s3Tot += s3;
    }

    const fTot = Math.round((s1Tot * 0.3 + s2Tot * 0.3 + s3Tot * 0.4) * 10) / 10;
    term1Ranks.push({ stuId: otherStuId, total: s1Tot });
    term2Ranks.push({ stuId: otherStuId, total: s2Tot });
    term3Ranks.push({ stuId: otherStuId, total: s3Tot });
    finalRanks.push({ stuId: otherStuId, total: fTot });
  }

  function getRank(list: { stuId: string; total: number }[], targetStuId: string): number {
    const sorted = [...list].sort((a, b) => b.total - a.total);
    const idx = sorted.findIndex((item) => item.stuId === targetStuId);
    return idx >= 0 ? idx + 1 : 1;
  }

  const posTerm1 = getRank(term1Ranks, student.id);
  const posTerm2 = getRank(term2Ranks, student.id);
  const posTerm3 = getRank(term3Ranks, student.id);
  const posFinal = getRank(finalRanks, student.id);

  // 8. Fetch attendance counts for student
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id },
    include: { attendanceSession: true },
  });

  const totalWorkingDays = attendanceRecords.length || 180;
  const presentDays =
    attendanceRecords.filter(
      (r) => r.status === 'PRESENT' || r.status === 'LATE'
    ).length || Math.min(168, totalWorkingDays);

  // Auto-calculate Cleanliness and Discipline from Dressup, Homework & Attendance %
  let homeworkCount = 0;
  let dressupScore = 0;
  for (const r of attendanceRecords) {
    let hasHw = true;
    let dUp = 'PERFECT';
    if (r.remarks) {
      try {
        const p = JSON.parse(r.remarks);
        if (typeof p.hasHomework === 'boolean') hasHw = p.hasHomework;
        if (p.dressup) dUp = p.dressup;
      } catch {}
    }
    if (hasHw) homeworkCount++;
    if (dUp === 'PERFECT') dressupScore += 1.0;
    else if (dUp === 'MODERATE') dressupScore += 0.6;
  }

  const dressupPct = attendanceRecords.length > 0 ? (dressupScore / attendanceRecords.length) * 100 : 90;
  const homeworkPct = attendanceRecords.length > 0 ? (homeworkCount / attendanceRecords.length) * 100 : 90;
  const attendancePct = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 90;

  const getCoCurricularGrade = (percentage: number) => {
    if (percentage >= 80) return 'A';
    if (percentage >= 65) return 'B';
    if (percentage >= 50) return 'C';
    return 'D';
  };

  const calculatedCleanliness = getCoCurricularGrade(dressupPct);
  const calculatedDiscipline = getCoCurricularGrade((homeworkPct + attendancePct) / 2);
  const calculatedHandwriting = getCoCurricularGrade(homeworkPct);
  const calculatedSports = getCoCurricularGrade(attendancePct);

  // 9. Fetch or find existing Marksheet record for co-curricular & remarks
  let marksheet = await prisma.marksheet.findFirst({
    where: {
      studentId: student.id,
      classSectionId: targetSectionId,
    },
  });

  if (!marksheet) {
    // Generate a default official marksheet number and token
    const rand = Math.floor(1000 + Math.random() * 9000);
    const msNum = `MS-${session.name}-${student.studentId}-${rand}`;
    const token = `VT-${Date.now()}-${rand}`;

    marksheet = await prisma.marksheet.create({
      data: {
        studentId: student.id,
        classSectionId: targetSectionId,
        academicSessionId: session.id,
        marksheetNumber: msNum,
        verificationToken: token,
        discipline: calculatedDiscipline,
        sportsAndGames: calculatedSports,
        cleanliness: calculatedCleanliness,
        handwriting: calculatedHandwriting,
        teacherRemarks: 'Satisfactory academic and co-curricular performance.',
        promotionStatus: 'PROMOTED',
      },
    });
  } else {
    // Keep updated based on real-time term percentages
    marksheet = await prisma.marksheet.update({
      where: { id: marksheet.id },
      data: {
        cleanliness: calculatedCleanliness,
        discipline: calculatedDiscipline,
        handwriting: calculatedHandwriting,
        sportsAndGames: calculatedSports,
      }
    });
  }

  const pct = (sum: number) =>
    totalFullMarks > 0 ? Math.round((sum / totalFullMarks) * 1000) / 10 : 0;

  return {
    marksheetNumber: marksheet.marksheetNumber,
    verificationToken: marksheet.verificationToken,
    issuedAt: marksheet.issuedAt.toISOString(),
    student: {
      id: student.id,
      studentId: student.studentId,
      name: student.user.name,
      rollNumber: enrollment.rollNumber || '01',
      classLevel: classLevel.name,
      classSection: section.name,
      sessionName: session.name,
      profileImage: student.profileImage,
    },
    subjects: subjectRows,
    summary: {
      term1: {
        totalMarks: Math.round(t1TotalSum * 10) / 10,
        percentage: pct(t1TotalSum),
        positionInClass: posTerm1,
        totalStudents,
        totalWorkingDays: Math.round(totalWorkingDays / 3),
        presentDays: Math.round(presentDays / 3),
      },
      term2: {
        totalMarks: Math.round(t2TotalSum * 10) / 10,
        percentage: pct(t2TotalSum),
        positionInClass: posTerm2,
        totalStudents,
        totalWorkingDays: Math.round(totalWorkingDays / 3),
        presentDays: Math.round(presentDays / 3),
      },
      term3: {
        totalMarks: Math.round(t3TotalSum * 10) / 10,
        percentage: pct(t3TotalSum),
        positionInClass: posTerm3,
        totalStudents,
        totalWorkingDays: Math.round(totalWorkingDays / 3),
        presentDays: Math.round(presentDays / 3),
      },
      finalResult: {
        totalMarks: Math.round(finalGrandSum * 10) / 10,
        percentage: pct(finalGrandSum),
        positionInClass: posFinal,
        totalStudents,
        totalWorkingDays,
        presentDays,
      },
    },
    coCurricular: {
      discipline: marksheet.discipline || 'A',
      sportsAndGames: marksheet.sportsAndGames || 'A',
      cleanliness: marksheet.cleanliness || 'A',
      handwriting: marksheet.handwriting || 'A',
      teacherRemarks: marksheet.teacherRemarks || 'Satisfactory academic progress.',
      promotionStatus: marksheet.promotionStatus || 'PROMOTED',
    },
  };
}
