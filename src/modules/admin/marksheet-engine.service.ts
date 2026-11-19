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
  academicMarks: number | null;
  continuousMarks: number | null;
  continuousScore10: number | null;
  continuousGrade: string | null;
  totalMarks: number | null;
  percentage: number | null;
  positionInClass: number | null;
  totalStudents: number;
  totalWorkingDays: number;
  presentDays: number;
}

export interface ComprehensiveMarksheetData {
  marksheetNumber: string;
  verificationToken: string;
  issuedAt: string;
  availableSessions?: {
    id: string;
    name: string;
    classLevel: string;
    classSection: string;
    rollNumber: string | null;
    isCurrent: boolean;
  }[];
  student: {
    id: string;
    studentId: string;
    name: string;
    rollNumber: string;
    classLevel: string;
    classSection: string;
    sessionName: string;
    sessionId?: string;
    profileImage: string | null;
  };
  subjects: MarksheetSubjectRow[];
  summary: {
    term1: TermSummary;
    term2: TermSummary;
    term3: TermSummary;
    finalResult: {
      academicMarks: number | null;
      continuousMarks: number | null;
      continuousScore10: number | null;
      term1ContinuousScore30: number | null;
      term2ContinuousScore30: number | null;
      term3ContinuousScore40: number | null;
      continuousGrade: string | null;
      totalMarks: number | null;
      percentage: number | null;
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
    continuousScore10: number;
    continuousGrade: string;
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
  classSectionId?: string,
  sessionId?: string
): Promise<ComprehensiveMarksheetData | null> {
  // 1. Fetch student and all academic enrollments (active and historical)
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true, email: true } },
      academicEnrollments: {
        include: {
          classSection: {
            include: {
              classLevel: true,
              academicSession: true,
            },
          },
        },
        orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });

  if (!student || student.academicEnrollments.length === 0) {
    return null;
  }

  // Determine target enrollment
  let enrollment = null;
  if (classSectionId) {
    enrollment = student.academicEnrollments.find((e) => e.classSectionId === classSectionId);
  }
  if (!enrollment && sessionId) {
    enrollment = student.academicEnrollments.find((e) => e.academicSessionId === sessionId);
  }
  if (!enrollment) {
    enrollment = student.academicEnrollments.find((e) => e.isCurrent) || student.academicEnrollments[0];
  }

  if (!enrollment) {
    return null;
  }

  const section = enrollment.classSection;
  const targetSectionId = classSectionId || section.id;
  const session = section.academicSession;
  const classLevel = section.classLevel;

  // 2. Fetch all subjects for this class level
  const allSubjects = await prisma.subject.findMany({
    where: { classLevelId: classLevel.id, isActive: true },
    orderBy: { name: 'asc' },
  });

  // 3. Fetch all students enrolled in this section (both active and historical) to calculate rank & highest marks
  const allSectionEnrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: targetSectionId,
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
          // Term End exam is evaluated out of 100 and converted to 75 (x 0.75)
          t75 = Math.round((tRaw * 0.75) * 10) / 10;
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

  const getCoCurricularGrade = (percentage: number) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    return 'D';
  };

  // Helper to calculate 10% Continuous Assessment (Attendance 3.5%, Daily Homework 3.5%, Cleanliness 3.0%)
  const maxContinuousMarks = Math.round((totalFullMarks * 0.1) * 10) / 10;
  async function getStudentContinuousAssessment(stuId: string, maxContMarks: number, targetTerm?: number) {
    const allAttRecords = await prisma.attendanceRecord.findMany({
      where: { studentId: stuId },
      include: { attendanceSession: true },
    });

    let attRecords = allAttRecords;
    if (targetTerm) {
      const termRecords = allAttRecords.filter((r) => {
        const d = new Date(r.attendanceSession?.attendanceDate || r.createdAt);
        const m = d.getMonth() + 1;
        if (targetTerm === 1) return m <= 4;
        if (targetTerm === 2) return m >= 5 && m <= 8;
        if (targetTerm === 3) return m >= 9;
        return true;
      });
      if (termRecords.length > 0) {
        attRecords = termRecords;
      }
    }

    const totWorking = attRecords.length || (targetTerm ? 60 : 180);
    const presDays =
      attRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length ||
      (attRecords.length === 0 ? Math.min(56, totWorking) : 0);

    let hwCount = 0;
    let dScore = 0;
    for (const r of attRecords) {
      let hasHw = true;
      let dUp = 'PERFECT';
      if (r.remarks) {
        try {
          const p = JSON.parse(r.remarks);
          if (typeof p.hasHomework === 'boolean') hasHw = p.hasHomework;
          if (p.dressup) dUp = p.dressup;
        } catch {}
      }
      if (hasHw) hwCount++;
      if (dUp === 'PERFECT') dScore += 1.0;
      else if (dUp === 'MODERATE') dScore += 0.6;
    }

    const attPct = totWorking > 0 ? (presDays / totWorking) * 100 : 90;
    const hwPct = attRecords.length > 0 ? (hwCount / attRecords.length) * 100 : 90;
    const dPct = attRecords.length > 0 ? (dScore / attRecords.length) * 100 : 90;

    // Weightage: Attendance 3.5, Homework 3.5, Cleanliness 3.0 (Total = 10% / 10.0 score)
    const score10 = (attPct * 0.035) + (hwPct * 0.035) + (dPct * 0.030);
    const normalizedScore10 = Math.min(10, Math.max(0, Math.round(score10 * 10) / 10));
    const continuousPct = Math.round(normalizedScore10 * 10 * 10) / 10;
    const continuousMarks = Math.round(((normalizedScore10 / 10) * maxContMarks) * 10) / 10;

    // Specific co-curricular scores out of 10.0
    const disciplineScore = Math.min(10, Math.max(0, Math.round(((hwPct + attPct) / 2 / 10) * 10) / 10));
    const sportsScore = Math.min(10, Math.max(0, Math.round((attPct / 10) * 10) / 10));
    const cleanlinessScore = Math.min(10, Math.max(0, Math.round((dPct / 10) * 10) / 10));
    const handwritingScore = Math.min(10, Math.max(0, Math.round((hwPct / 10) * 10) / 10));

    return {
      totWorking,
      presDays,
      score10: normalizedScore10,
      continuousMarks,
      continuousGrade: getCoCurricularGrade(continuousPct),
      disciplineScore: String(disciplineScore),
      sportsScore: String(sportsScore),
      cleanlinessScore: String(cleanlinessScore),
      handwritingScore: String(handwritingScore),
      cleanliness: getCoCurricularGrade(dPct),
      discipline: getCoCurricularGrade((hwPct + attPct) / 2),
      handwriting: getCoCurricularGrade(hwPct),
      sportsAndGames: getCoCurricularGrade(attPct),
    };
  }

  // Calculate target student's continuous assessment stats
  const myContT1 = await getStudentContinuousAssessment(student.id, maxContinuousMarks, 1);
  const myContT2 = await getStudentContinuousAssessment(student.id, maxContinuousMarks, 2);
  const myContT3 = await getStudentContinuousAssessment(student.id, maxContinuousMarks, 3);
  const myCont = await getStudentContinuousAssessment(student.id, maxContinuousMarks);

  // Term Continuous Scores:
  const t1ContScore = t1TotalSum > 0 ? myContT1.score10 : null;
  const t2ContScore = t2TotalSum > 0 ? myContT2.score10 : null;
  const t3ContScore = t3TotalSum > 0 ? myContT3.score10 : null;

  // Final Result Continuous breakdown:
  const finalT1Cont30 = t1ContScore !== null ? Math.round((t1ContScore * 0.3) * 10) / 10 : null;
  const finalT2Cont30 = t2ContScore !== null ? Math.round((t2ContScore * 0.3) * 10) / 10 : null;
  const finalT3Cont40 = t3ContScore !== null ? Math.round((t3ContScore * 0.4) * 10) / 10 : null;

  let finalContScore10: number | null = null;
  if (finalT1Cont30 !== null || finalT2Cont30 !== null || finalT3Cont40 !== null) {
    finalContScore10 = Math.round(((finalT1Cont30 || 0) + (finalT2Cont30 || 0) + (finalT3Cont40 || 0)) * 10) / 10;
  }

  // 7. Calculate Class Position (Ranks) based on Grand Total (90% Subject Exam + 10% Continuous Assessment)
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

    const otherCont = await getStudentContinuousAssessment(otherStuId, maxContinuousMarks);

    const s1Academic = Math.round(s1Tot * 10) / 10;
    const s2Academic = Math.round(s2Tot * 10) / 10;
    const s3Academic = Math.round(s3Tot * 10) / 10;

    const s1Grand = s1Tot > 0 ? Math.round((s1Academic + (otherCont.score10 || 0)) * 10) / 10 : 0;
    const s2Grand = s2Tot > 0 ? Math.round((s2Academic + (otherCont.score10 || 0)) * 10) / 10 : 0;
    const s3Grand = s3Tot > 0 ? Math.round((s3Academic + (otherCont.score10 || 0)) * 10) / 10 : 0;

    const fTot = Math.round((s1Tot * 0.3 + s2Tot * 0.3 + s3Tot * 0.4) * 10) / 10;
    const fGrand = fTot > 0 ? Math.round((fTot + (otherCont.score10 || 0)) * 10) / 10 : 0;

    term1Ranks.push({ stuId: otherStuId, total: s1Grand });
    term2Ranks.push({ stuId: otherStuId, total: s2Grand });
    term3Ranks.push({ stuId: otherStuId, total: s3Grand });
    finalRanks.push({ stuId: otherStuId, total: fGrand });
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

  // 8. Fetch or find existing Marksheet record for co-curricular & remarks
  let marksheet = await prisma.marksheet.findFirst({
    where: {
      studentId: student.id,
      OR: [
        { classSectionId: targetSectionId },
        { academicSessionId: session.id },
      ],
    },
  });

  function toLetterGrade(val: string | number | null | undefined): string {
    if (!val) return 'A';
    const str = String(val).trim();
    if (['A+', 'A', 'B', 'C', 'D'].includes(str)) return str;
    const num = parseFloat(str);
    if (!isNaN(num)) {
      const pct = num <= 10 ? num * 10 : num;
      if (pct >= 90) return 'A+';
      if (pct >= 80) return 'A';
      if (pct >= 70) return 'B';
      if (pct >= 60) return 'C';
      return 'D';
    }
    return 'A';
  }

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
        discipline: myCont.disciplineScore,
        sportsAndGames: toLetterGrade(myCont.sportsAndGames || myCont.sportsScore),
        cleanliness: myCont.cleanlinessScore,
        handwriting: myCont.handwritingScore,
        teacherRemarks: 'Satisfactory academic and co-curricular performance.',
        promotionStatus: 'PROMOTED',
      },
    });
  } else {
    // Keep updated based on real-time term percentages (using 10-point scale for discipline, cleanliness, handwriting and letter grade for sports)
    marksheet = await prisma.marksheet.update({
      where: { id: marksheet.id },
      data: {
        cleanliness: marksheet.cleanliness && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.cleanliness)
          ? marksheet.cleanliness
          : myCont.cleanlinessScore,
        discipline: marksheet.discipline && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.discipline)
          ? marksheet.discipline
          : myCont.disciplineScore,
        handwriting: marksheet.handwriting && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.handwriting)
          ? marksheet.handwriting
          : myCont.handwritingScore,
        sportsAndGames: toLetterGrade(marksheet.sportsAndGames || myCont.sportsAndGames),
      }
    });
  }

  // 100% Academic Subject Marks (Counted on 100% of subject marks: "age jemon chilo 100 er upore")
  const t1Academic = Math.round(t1TotalSum * 10) / 10;
  const t2Academic = Math.round(t2TotalSum * 10) / 10;
  const t3Academic = Math.round(t3TotalSum * 10) / 10;
  const finalAcademic = Math.round(finalGrandSum * 10) / 10;

  const t1ContMarks = t1TotalSum > 0 ? (t1ContScore ?? myContT1.score10 ?? 0) : 0;
  const t2ContMarks = t2TotalSum > 0 ? (t2ContScore ?? myContT2.score10 ?? 0) : 0;
  const t3ContMarks = t3TotalSum > 0 ? (t3ContScore ?? myContT3.score10 ?? 0) : 0;
  const finalContMarks = finalGrandSum > 0 ? (finalContScore10 ?? myCont.score10 ?? 0) : 0;

  const t1Total = Math.round((t1Academic + t1ContMarks) * 10) / 10;
  const t2Total = Math.round((t2Academic + t2ContMarks) * 10) / 10;
  const t3Total = Math.round((t3Academic + t3ContMarks) * 10) / 10;
  const finalTotal = Math.round((finalAcademic + finalContMarks) * 10) / 10;

  const pct = (sum: number) =>
    totalFullMarks > 0 ? Math.round((sum / totalFullMarks) * 1000) / 10 : 0;

  return {
    marksheetNumber: marksheet.marksheetNumber,
    verificationToken: marksheet.verificationToken,
    issuedAt: marksheet.issuedAt.toISOString(),
    availableSessions: student.academicEnrollments.map((e) => ({
      id: e.academicSessionId,
      name: e.classSection.academicSession.name,
      classLevel: e.classSection.classLevel.name,
      classSection: e.classSection.name,
      rollNumber: e.rollNumber,
      isCurrent: e.isCurrent,
    })),
    student: {
      id: student.id,
      studentId: student.studentId,
      name: student.user.name,
      rollNumber: enrollment.rollNumber || '01',
      classLevel: classLevel.name,
      classSection: section.name,
      sessionName: session.name,
      sessionId: session.id,
      profileImage: student.profileImage,
    },
    subjects: subjectRows,
    summary: {
      term1: {
        academicMarks: t1TotalSum > 0 ? t1Academic : 0,
        continuousMarks: t1TotalSum > 0 ? t1ContMarks : 0,
        continuousScore10: t1ContScore,
        continuousGrade: myContT1.continuousGrade,
        totalMarks: t1TotalSum > 0 ? t1Total : 0,
        percentage: t1TotalSum > 0 ? pct(t1Total) : 0,
        positionInClass: t1TotalSum > 0 ? posTerm1 : null,
        totalStudents,
        totalWorkingDays: myContT1.totWorking,
        presentDays: myContT1.presDays,
      },
      term2: {
        academicMarks: t2TotalSum > 0 ? t2Academic : null,
        continuousMarks: t2TotalSum > 0 ? t2ContMarks : null,
        continuousScore10: t2ContScore,
        continuousGrade: t2TotalSum > 0 ? myContT2.continuousGrade : null,
        totalMarks: t2TotalSum > 0 ? t2Total : null,
        percentage: t2TotalSum > 0 ? pct(t2Total) : null,
        positionInClass: t2TotalSum > 0 ? posTerm2 : null,
        totalStudents,
        totalWorkingDays: t2TotalSum > 0 ? myContT2.totWorking : 0,
        presentDays: t2TotalSum > 0 ? myContT2.presDays : 0,
      },
      term3: {
        academicMarks: t3TotalSum > 0 ? t3Academic : null,
        continuousMarks: t3TotalSum > 0 ? t3ContMarks : null,
        continuousScore10: t3ContScore,
        continuousGrade: t3TotalSum > 0 ? myContT3.continuousGrade : null,
        totalMarks: t3TotalSum > 0 ? t3Total : null,
        percentage: t3TotalSum > 0 ? pct(t3Total) : null,
        positionInClass: t3TotalSum > 0 ? posTerm3 : null,
        totalStudents,
        totalWorkingDays: t3TotalSum > 0 ? myContT3.totWorking : 0,
        presentDays: t3TotalSum > 0 ? myContT3.presDays : 0,
      },
      finalResult: {
        academicMarks: finalGrandSum > 0 ? finalAcademic : null,
        continuousMarks: finalGrandSum > 0 ? finalContMarks : null,
        continuousScore10: finalContScore10,
        term1ContinuousScore30: finalT1Cont30,
        term2ContinuousScore30: finalT2Cont30,
        term3ContinuousScore40: finalT3Cont40,
        continuousGrade: myCont.continuousGrade,
        totalMarks: finalGrandSum > 0 ? finalTotal : null,
        percentage: finalGrandSum > 0 ? pct(finalTotal) : null,
        positionInClass: finalGrandSum > 0 ? posFinal : null,
        totalStudents,
        totalWorkingDays: myCont.totWorking,
        presentDays: myCont.presDays,
      },
    },
    coCurricular: {
      discipline: marksheet.discipline && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.discipline)
        ? marksheet.discipline
        : myCont.disciplineScore,
      cleanliness: marksheet.cleanliness && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.cleanliness)
        ? marksheet.cleanliness
        : myCont.cleanlinessScore,
      handwriting: marksheet.handwriting && !['A+', 'A', 'B', 'C', 'D'].includes(marksheet.handwriting)
        ? marksheet.handwriting
        : myCont.handwritingScore,
      sportsAndGames: toLetterGrade(marksheet.sportsAndGames || myCont.sportsAndGames),
      continuousScore10: myCont.score10,
      continuousGrade: myCont.continuousGrade,
      teacherRemarks: marksheet.teacherRemarks || 'Satisfactory academic progress.',
      promotionStatus: marksheet.promotionStatus || 'PROMOTED',
    },
  };
}
