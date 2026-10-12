import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/prisma';
import { AdmissionDocumentType, AdmissionDocumentStatus } from '@prisma/client';

export class AdmissionPdfService {
  /**
   * Helper to load logo as base64 data URL
   */
  private static getLogoBase64(): string {
    const candidates = [
      path.join(process.cwd(), '..', 'admin', 'public', 'logo.jpg'),
      path.join(process.cwd(), '..', 'educational-park', 'public', 'logo.jpg'),
      path.join(process.cwd(), 'public', 'logo.jpg'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const buf = fs.readFileSync(p);
          return `data:image/jpeg;base64,${buf.toString('base64')}`;
        } catch {
          // ignore fallback
        }
      }
    }
    return '';
  }

  /**
   * Helper to get student photo as base64 if stored locally
   */
  private static getStudentPhotoBase64(photoDocOrUrl: any): string {
    if (!photoDocOrUrl) return '';

    // If it's a full URL or data URI
    if (typeof photoDocOrUrl === 'string' && (photoDocOrUrl.startsWith('http') || photoDocOrUrl.startsWith('data:'))) {
      return photoDocOrUrl;
    }

    const fileName = typeof photoDocOrUrl === 'string' ? photoDocOrUrl : photoDocOrUrl?.fileUrl || photoDocOrUrl?.fileName;
    if (!fileName) return '';

    const privatePath = path.join(process.cwd(), 'storage', 'private', 'admissions', fileName);
    if (fs.existsSync(privatePath)) {
      try {
        const mime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const buf = fs.readFileSync(privatePath);
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // fallback
      }
    }

    return '';
  }

  /**
   * Format numbers to Bengali digits
   */
  private static toBnDigits(num: string | number | undefined | null): string {
    if (num === undefined || num === null) return '';
    const str = String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return str.replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)]);
  }

  /**
   * Generate Full 2-Page A4 Admission HTML
   */
  public static async generateAdmissionHtml(application: any): Promise<string> {
    const logoDataUrl = this.getLogoBase64();

    // Student Photo resolution
    const photoDoc = (application.documents || []).find(
      (d: any) => d.documentType === AdmissionDocumentType.STUDENT_PHOTO
    );
    const studentPhoto = this.getStudentPhotoBase64(application.studentPhotoUrl || photoDoc);

    // QR code for quick verification
    const verificationUrl = `http://localhost:3004/dashboard/admissions/${application.id}`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 160,
        margin: 1,
        color: { dark: '#02457a', light: '#ffffff' },
      });
    } catch {
      // ignore
    }

    // Date calculations
    const dob = application.dateOfBirth ? new Date(application.dateOfBirth) : null;
    const dobDay = dob ? String(dob.getDate()).padStart(2, '0') : '';
    const dobMonth = dob ? String(dob.getMonth() + 1).padStart(2, '0') : '';
    const dobYear = dob ? String(dob.getFullYear()) : '';

    const appDate = application.createdAt ? new Date(application.createdAt) : new Date();
    const appDay = String(appDate.getDate()).padStart(2, '0');
    const appMonth = String(appDate.getMonth() + 1).padStart(2, '0');
    const appYear = String(appDate.getFullYear());

    const isMale = (application.gender || '').toLowerCase() === 'male' || (application.gender || '').includes('ছেলে');
    const isFemale = (application.gender || '').toLowerCase() === 'female' || (application.gender || '').includes('মেয়ে');

    // Document checks
    const docs = application.documents || [];
    const birthCert = docs.find((d: any) => d.documentType === AdmissionDocumentType.BIRTH_CERTIFICATE);
    const guardianNid = docs.find((d: any) => d.documentType === AdmissionDocumentType.GUARDIAN_NID);
    const schoolReport = docs.find((d: any) => d.documentType === AdmissionDocumentType.PREVIOUS_SCHOOL_REPORT);
    const transferCert = docs.find((d: any) => d.documentType === AdmissionDocumentType.TRANSFER_CERTIFICATE);

    const hasTC = application.hasTransferCertificate || !!transferCert;
    const sessionText = application.sessionName || '২০২৬ – ২০২৭';
    const className = application.classAppliedFor?.name || 'Class';
    const enrollment = application.student?.academicEnrollments?.[0];
    const sectionName = enrollment?.classSection?.name || '';
    const rollNo = enrollment?.rollNumber || '';
    const studentId = application.student?.studentId || '';

    // Address fallback
    const presentVill = application.presentVillage || application.address || '';
    const presentPost = application.presentPost || '';
    const presentUpazila = application.presentUpazila || '';
    const presentDist = application.presentDistrict || 'ব্রাহ্মণবাড়িয়া';

    const permVill = application.permanentVillage || presentVill;
    const permPost = application.permanentPost || presentPost;
    const permUpazila = application.permanentUpazila || presentUpazila;
    const permDist = application.permanentDistrict || presentDist;

    return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>ভর্তি আবেদন ফরম - ${application.applicationNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Hind Siliguri', 'SolaimanLipi', Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      font-size: 13px;
      line-height: 1.35;
    }

    .a4-sheet {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 10mm 12mm 8mm 12mm;
      box-sizing: border-box;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }

    .a4-sheet:last-child {
      page-break-after: avoid;
    }

    /* Top Wave Banner */
    .top-curved-banner {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 22px;
      overflow: hidden;
      z-index: 1;
    }

    /* Header Container */
    .header-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      z-index: 2;
      padding-top: 4px;
      margin-bottom: 6px;
    }

    .logo-container {
      width: 82px;
      height: 82px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-img {
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 50%;
    }

    .header-text {
      flex: 1;
      text-align: center;
    }

    .sub-org {
      font-size: 13px;
      font-weight: 600;
      color: #023e8a;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }

    .school-title {
      font-size: 32px;
      font-weight: 800;
      color: #02457a;
      line-height: 1.1;
      margin: 0 0 4px 0;
      text-shadow: 0 1px 1px rgba(0,0,0,0.06);
    }

    .class-badge {
      display: inline-block;
      background: #00875a;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      padding: 2px 18px;
      border-radius: 20px;
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }

    .contact-line {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .contact-line span.sep {
      color: #94a3b8;
    }

    /* Student Photo Box */
    .photo-box {
      width: 100px;
      height: 118px;
      border: 1.8px solid #02457a;
      border-radius: 8px;
      background: #f8fafc;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      padding: 2px;
    }

    .photo-box img.student-actual-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 6px;
    }

    .photo-placeholder-icon {
      width: 44px;
      height: 44px;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    .photo-caption {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      text-align: center;
      line-height: 1.2;
    }

    /* Title Ribbon */
    .title-ribbon {
      background: linear-gradient(90deg, #023e8a 0%, #004d7a 50%, #023e8a 100%);
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      position: relative;
      margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .ribbon-accents-left, .ribbon-accents-right {
      display: flex;
      gap: 3px;
      align-items: center;
    }

    .ribbon-bar {
      width: 6px;
      height: 18px;
      transform: skewX(-25deg);
      border-radius: 2px;
    }

    .ribbon-bar.yellow { background: #facc15; }
    .ribbon-bar.green { background: #22c55e; }
    .ribbon-bar.cyan { background: #38bdf8; }

    .ribbon-text {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .ribbon-page-badge {
      background: #00875a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.4);
    }

    /* Section styling */
    .form-section {
      margin-bottom: 7px;
    }

    .section-pill-header {
      background: #02457a;
      color: #ffffff;
      padding: 3px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .section-pill-header.green-pill {
      background: #00875a;
    }

    .section-pill-header svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    /* Section 1 Fields */
    .field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 3.5px;
      font-size: 12.5px;
    }

    .field-lbl {
      color: #1e293b;
      font-weight: 600;
      white-space: nowrap;
      min-width: 165px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .field-val-line {
      flex: 1;
      border-bottom: 1px solid #94a3b8;
      padding: 0 4px 1px 4px;
      color: #02457a;
      font-weight: 600;
      min-height: 18px;
    }

    /* Date box style */
    .date-boxes-wrap {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .date-box {
      border: 1px solid #94a3b8;
      border-radius: 4px;
      padding: 1px 8px;
      font-weight: 700;
      color: #02457a;
      min-width: 44px;
      text-align: center;
      background: #ffffff;
      font-size: 12px;
    }

    .date-box.year-box {
      min-width: 62px;
    }

    .date-box-lbl {
      font-size: 10px;
      color: #64748b;
      margin-left: 2px;
    }

    /* Checkbox box */
    .chk-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      border: 1.2px solid #02457a;
      border-radius: 2px;
      margin-right: 4px;
      vertical-align: middle;
      font-size: 10px;
      font-weight: 800;
      color: #02457a;
      line-height: 1;
      background: #ffffff;
    }

    .chk-label {
      font-size: 12.5px;
      color: #1e293b;
      font-weight: 600;
      margin-right: 18px;
      display: inline-flex;
      align-items: center;
    }

    /* Two-col card wrapper */
    .two-col-wrap {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .parent-card {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
      padding: 5px 8px;
    }

    .parent-card.blue-card {
      border-color: #93c5fd;
      background: #f0f7ff;
    }

    .parent-card.green-card {
      border-color: #86efac;
      background: #f6fcf8;
    }

    .parent-card-title {
      font-weight: 700;
      color: #02457a;
      font-size: 13px;
      border-bottom: 1px solid #bfdbfe;
      padding-bottom: 2px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .parent-card.green-card .parent-card-title {
      color: #00875a;
      border-bottom-color: #bbf7d0;
    }

    .card-field-row {
      display: flex;
      align-items: center;
      margin-bottom: 2.5px;
      font-size: 12px;
    }

    .card-field-lbl {
      width: 95px;
      flex-shrink: 0;
      font-weight: 600;
      color: #334155;
    }

    .card-field-val {
      flex: 1;
      border-bottom: 1px solid #cbd5e1;
      color: #0f172a;
      font-weight: 600;
      padding: 0 2px 1px 2px;
      min-height: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Declaration box */
    .declaration-wrap {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      padding: 5px 8px;
      margin-top: 2px;
    }

    .declaration-text {
      font-size: 11.5px;
      color: #334155;
      line-height: 1.35;
      margin-bottom: 6px;
      text-align: justify;
    }

    .declaration-sigs {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
    }

    .sig-field {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .sig-line {
      border-bottom: 1px dashed #64748b;
      min-width: 140px;
      min-height: 18px;
      font-weight: 600;
      color: #02457a;
    }

    /* FOR OFFICE USE ONLY */
    .office-use-box {
      border: 1.5px solid #02457a;
      border-radius: 6px;
      background: #f8fafc;
      overflow: hidden;
      margin-top: 4px;
    }

    .office-use-header {
      background: #02457a;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 2px 10px;
      letter-spacing: 0.3px;
    }

    .office-use-body {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      padding: 6px 10px;
      gap: 12px;
      font-size: 11.5px;
    }

    .office-sig-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      text-align: center;
      padding-top: 14px;
    }

    .office-sig-line {
      width: 150px;
      border-top: 1px dashed #475569;
      margin-bottom: 2px;
    }

    /* Footer Tagline */
    .sheet-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .footer-tagline {
      font-weight: 700;
      color: #02457a;
      letter-spacing: 0.5px;
    }

    /* ============================================================
       PAGE 2 STYLES (DOCUMENTS VERIFICATION & COUNTERFOIL)
       ============================================================ */
    .page-2-header {
      margin-bottom: 8px;
    }

    .doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-bottom: 8px;
    }

    .doc-table th {
      background: #02457a;
      color: #ffffff;
      padding: 4px 6px;
      font-weight: 700;
      text-align: left;
      border: 1px solid #02457a;
    }

    .doc-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      vertical-align: middle;
    }

    .doc-table tr:nth-child(even) {
      background: #f8fafc;
    }

    .badge-verified {
      background: #dcfce7;
      color: #15803d;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #86efac;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 10.5px;
    }

    .badge-pending {
      background: #fef3c7;
      color: #b45309;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #fde68a;
      font-size: 10.5px;
    }

    .rules-list {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11.5px;
      line-height: 1.45;
      margin-bottom: 8px;
      color: #334155;
    }

    .rules-list ol {
      margin: 0;
      padding-left: 18px;
    }

    .approval-tri-boxes {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }

    .approval-seal-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      padding: 6px;
      text-align: center;
      min-height: 85px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .approval-seal-title {
      font-weight: 700;
      font-size: 11.5px;
      color: #02457a;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 2px;
    }

    .cut-line-wrap {
      margin: 6px 0;
      position: relative;
      text-align: center;
    }

    .cut-line {
      border-top: 1.5px dashed #475569;
      width: 100%;
      margin: 8px 0;
    }

    .cut-line-badge {
      display: inline-block;
      background: #ffffff;
      padding: 0 8px;
      position: relative;
      top: -16px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }

    /* Counterfoil Slip */
    .counterfoil-box {
      border: 1.5px solid #00875a;
      border-radius: 8px;
      background: #f6fcf8;
      padding: 8px 12px;
    }

    .counterfoil-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #86efac;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }

    .counterfoil-title {
      font-size: 14px;
      font-weight: 800;
      color: #00875a;
    }

    .counterfoil-appno {
      font-family: monospace;
      font-size: 13px;
      font-weight: 700;
      color: #02457a;
      background: #ffffff;
      padding: 1px 8px;
      border-radius: 4px;
      border: 1px solid #94a3b8;
    }

    .counterfoil-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
      font-size: 11.5px;
    }
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: মূল ভর্তি আবেদন ফরম (FIRST A4 SHEET) -->
  <!-- ========================================================================= -->
  <div class="a4-sheet">
    <!-- Top Decorative Wave Ribbon -->
    <div class="top-curved-banner">
      <svg viewBox="0 0 800 24" preserveAspectRatio="none" style="width:100%; height:100%;">
        <defs>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#023e8a" />
            <stop offset="35%" stop-color="#00a86b" />
            <stop offset="70%" stop-color="#facc15" />
            <stop offset="100%" stop-color="#023e8a" />
          </linearGradient>
        </defs>
        <path d="M0,0 L800,0 L800,14 Q600,24 400,12 Q200,0 0,16 Z" fill="url(#waveGrad)" />
      </svg>
    </div>

    <!-- Header Section -->
    <div class="header-section">
      <!-- Logo -->
      <div class="logo-container">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo-img" alt="Educational Park" />` : `
          <svg viewBox="0 0 100 100" class="logo-img">
            <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#02457a" stroke-width="4"/>
            <circle cx="50" cy="50" r="43" fill="#f8fafc" stroke="#facc15" stroke-width="2"/>
            <path d="M50 20 L58 35 L50 48 L42 35 Z" fill="#e11d48"/>
            <path d="M30 55 Q50 46 70 55 L70 75 Q50 66 30 75 Z" fill="#02457a"/>
            <path d="M50 50 L50 72" stroke="#ffffff" stroke-width="2"/>
          </svg>
        `}
      </div>

      <!-- Main Header Text -->
      <div class="header-text">
        <div class="sub-org">তিতাস সমাজ সংস্থা কর্তৃক পরিচালিত</div>
        <h1 class="school-title">এডুকেশনাল পার্ক</h1>
        <div><span class="class-badge">প্লে থেকে ক্লাস পঞ্চম শ্রেণি</span></div>
        <div class="contact-line">
          <span>📍 গ্রাম: আলীমাবাদ, নবীনগর, ব্রাহ্মণবাড়িয়া</span>
          <span class="sep">|</span>
          <span>📞 +8801711052072</span>
        </div>
      </div>

      <!-- Passport Photo Box -->
      <div class="photo-box">
        ${studentPhoto ? `<img src="${studentPhoto}" class="student-actual-img" alt="Student Photo" />` : `
          <svg class="photo-placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <div class="photo-caption">ছাত্র/ছাত্রীর ছবি<br/>(পাসপোর্ট সাইজ)</div>
        `}
      </div>
    </div>

    <!-- Title Ribbon Banner -->
    <div class="title-ribbon">
      <div class="ribbon-accents-left">
        <div class="ribbon-bar yellow"></div>
        <div class="ribbon-bar green"></div>
        <div class="ribbon-bar cyan"></div>
      </div>
      <div class="ribbon-text">ভর্তি আবেদন ফরম</div>
      <div class="ribbon-page-badge">(প্রথম পৃষ্ঠা)</div>
      <div class="ribbon-accents-right">
        <div class="ribbon-bar cyan"></div>
        <div class="ribbon-bar green"></div>
        <div class="ribbon-bar yellow"></div>
      </div>
    </div>

    <!-- Section 1: শিক্ষার্থীর ব্যক্তিগত তথ্য -->
    <div class="form-section">
      <div class="section-pill-header">
        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        ১. শিক্ষার্থীর ব্যক্তিগত তথ্য
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>১. শিক্ষার্থীর নাম (বাংলা)</span><span>:</span></div>
        <div class="field-val-line">${application.studentNameBn || application.studentName || ''}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>২. শিক্ষার্থীর নাম (ইংরেজি)</span><span>:</span></div>
        <div class="field-val-line" style="font-family: Arial, sans-serif; text-transform: uppercase;">${application.studentName || ''}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৩. জন্ম তারিখ</span><span>:</span></div>
        <div class="date-boxes-wrap">
          <div class="date-box">${dobDay ? this.toBnDigits(dobDay) : ''}<span class="date-box-lbl">দিন</span></div>
          <div class="date-box">${dobMonth ? this.toBnDigits(dobMonth) : ''}<span class="date-box-lbl">মাস</span></div>
          <div class="date-box year-box">${dobYear ? this.toBnDigits(dobYear) : ''}<span class="date-box-lbl">বছর</span></div>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৪. জন্ম নিবন্ধন নম্বর</span><span>:</span></div>
        <div class="field-val-line" style="letter-spacing: 1px;">${this.toBnDigits(application.birthCertificateNumber) || ''}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৫. লিঙ্গ</span><span>:</span></div>
        <div>
          <span class="chk-label"><span class="chk-box">${isMale ? '✓' : ''}</span> ছেলে</span>
          <span class="chk-label"><span class="chk-box">${isFemale ? '✓' : ''}</span> মেয়ে</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৬. জাতীয়তা</span><span>:</span></div>
        <div class="field-val-line">${application.nationality || 'বাংলাদেশী'}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৭. যে শ্রেণিতে ভর্তি হবে</span><span>:</span></div>
        <div class="field-val-line" style="font-weight: 700; color: #02457a;">${className}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৮. শিক্ষাবর্ষ / সেশন</span><span>:</span></div>
        <div class="field-val-line">${sessionText}</div>
      </div>
    </div>

    <!-- Section 2: পূর্ববর্তী বিদ্যালয়ের তথ্য -->
    <div class="form-section">
      <div class="section-pill-header green-pill">
        <svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
        ২. পূর্ববর্তী বিদ্যালয়ের তথ্য
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>১. পূর্ববর্তী বিদ্যালয়ের নাম</span><span>:</span></div>
        <div class="field-val-line">${application.previousSchool || 'প্রযোজ্য নয়'}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>২. উত্তীর্ণ শ্রেণি</span><span>:</span></div>
        <div class="field-val-line">${application.previousSchoolGrade || 'প্রযোজ্য নয়'}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৩. ছাড়পত্র / ট্রান্সফার সার্টিফিকেট আছে কি ?</span><span>:</span></div>
        <div>
          <span class="chk-label"><span class="chk-box">${hasTC ? '✓' : ''}</span> হ্যাঁ</span>
          <span class="chk-label"><span class="chk-box">${!hasTC ? '✓' : ''}</span> না</span>
        </div>
      </div>
    </div>

    <!-- Section 3: পিতা / মাতার তথ্য -->
    <div class="form-section">
      <div class="section-pill-header">
        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        ৩. পিতা / মাতার তথ্য
      </div>

      <div class="two-col-wrap">
        <!-- Father Card -->
        <div class="parent-card blue-card">
          <div class="parent-card-title">পিতার তথ্য</div>
          <div class="card-field-row">
            <span class="card-field-lbl">১. নাম (বাংলা) :</span>
            <span class="card-field-val">${application.fatherNameBn || (application.guardianRelation?.includes('পিতা') ? application.guardianName : '') || ''}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">২. নাম (ইংরেজি) :</span>
            <span class="card-field-val">${application.fatherNameEn || ''}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৩. NID নম্বর :</span>
            <span class="card-field-val">${this.toBnDigits(application.fatherNid || (application.guardianRelation?.includes('পিতা') ? application.guardianNidNumber : ''))}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৪. পেশা :</span>
            <span class="card-field-val">${application.fatherOccupation || 'ব্যবসায়ী / চাকুরীজীবী'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৫. মোবাইল নম্বর :</span>
            <span class="card-field-val">${this.toBnDigits(application.fatherPhone || (application.guardianRelation?.includes('পিতা') ? application.guardianPhone : ''))}</span>
          </div>
        </div>

        <!-- Mother Card -->
        <div class="parent-card blue-card">
          <div class="parent-card-title">মাতার তথ্য</div>
          <div class="card-field-row">
            <span class="card-field-lbl">১. নাম (বাংলা) :</span>
            <span class="card-field-val">${application.motherNameBn || (application.guardianRelation?.includes('মাতা') ? application.guardianName : '') || ''}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">২. নাম (ইংরেজি) :</span>
            <span class="card-field-val">${application.motherNameEn || ''}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৩. NID নম্বর :</span>
            <span class="card-field-val">${this.toBnDigits(application.motherNid || (application.guardianRelation?.includes('মাতা') ? application.guardianNidNumber : ''))}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৪. পেশা :</span>
            <span class="card-field-val">${application.motherOccupation || 'গৃহিণী'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">৫. মোবাইল নম্বর :</span>
            <span class="card-field-val">${this.toBnDigits(application.motherPhone || (application.guardianRelation?.includes('মাতা') ? application.guardianPhone : ''))}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 4: অভিভাবক / গার্ডিয়ান -->
    <div class="form-section">
      <div class="section-pill-header">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><text x="12" y="16" font-size="12" font-weight="bold" fill="#02457a" text-anchor="middle">4</text></svg>
        ৪. অভিভাবক / গার্ডিয়ান (প্রয়োজনে পূরণ করুন)
      </div>

      <div class="parent-card blue-card" style="padding: 4px 8px;">
        <div class="card-field-row">
          <span class="card-field-lbl" style="width: 140px;">অভিভাবকের নাম :</span>
          <span class="card-field-val">${application.guardianName || ''}</span>
        </div>
        <div class="card-field-row" style="margin-top: 2px;">
          <span class="card-field-lbl" style="width: 140px;">শিক্ষার্থীর সাথে সম্পর্ক :</span>
          <div style="flex:1;">
            <span class="chk-label"><span class="chk-box">${application.guardianRelation?.includes('পিতা') ? '✓' : ''}</span> পিতা</span>
            <span class="chk-label"><span class="chk-box">${application.guardianRelation?.includes('মাতা') ? '✓' : ''}</span> মাতা</span>
            <span class="chk-label"><span class="chk-box">${!application.guardianRelation?.includes('পিতা') && !application.guardianRelation?.includes('মাতা') ? '✓' : ''}</span> অন্যান্য (${application.guardianRelation || ''})</span>
          </div>
        </div>
        <div class="card-field-row" style="margin-top: 2px;">
          <span class="card-field-lbl" style="width: 140px;">মোবাইল নম্বর :</span>
          <span class="card-field-val">${this.toBnDigits(application.guardianPhone)}</span>
        </div>
      </div>
    </div>

    <!-- Section 5: বর্তমান ও স্থায়ী ঠিকানা -->
    <div class="form-section">
      <div class="section-pill-header green-pill">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        ৫. বর্তমান ও স্থায়ী ঠিকানা
      </div>

      <div class="two-col-wrap">
        <div class="parent-card green-card">
          <div class="parent-card-title">বর্তমান ঠিকানা</div>
          <div class="card-field-row">
            <span class="card-field-lbl">গ্রাম/মহল্লা :</span>
            <span class="card-field-val">${presentVill}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">ডাকঘর :</span>
            <span class="card-field-val">${presentPost || 'নবীনগর'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">উপজেলা :</span>
            <span class="card-field-val">${presentUpazila || 'নবীনগর'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">জেলা :</span>
            <span class="card-field-val">${presentDist}</span>
          </div>
        </div>

        <div class="parent-card green-card">
          <div class="parent-card-title">স্থায়ী ঠিকানা</div>
          <div class="card-field-row">
            <span class="card-field-lbl">গ্রাম/মহল্লা :</span>
            <span class="card-field-val">${permVill}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">ডাকঘর :</span>
            <span class="card-field-val">${permPost || 'নবীনগর'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">উপজেলা :</span>
            <span class="card-field-val">${permUpazila || 'নবীনগর'}</span>
          </div>
          <div class="card-field-row">
            <span class="card-field-lbl">জেলা :</span>
            <span class="card-field-val">${permDist}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 6: অভিভাবকের ঘোষণা -->
    <div class="form-section">
      <div class="section-pill-header">৬. অভিভাবকের ঘোষণা</div>
      <div class="declaration-wrap">
        <div class="declaration-text">
          আমি এই মর্মে অঙ্গীকার করছি যে, উপরে প্রদত্ত সকল তথ্য সত্য ও নির্ভুল। আমার অভিভাবকত্বাধীন শিক্ষার্থী বিদ্যালয়ের সকল নিয়ম-কানুন ও শৃঙ্খলা মেনে চলতে বাধ্য থাকবে। প্রদত্ত কোনো তথ্য মিথ্যা বা অসত্য প্রমাণিত হলে বিদ্যালয় কর্তৃপক্ষ শিক্ষার্থীর ভর্তি বাতিল করার অধিকার সংরক্ষণ করবে।
        </div>
        <div class="declaration-sigs">
          <div class="sig-field">
            <span>অভিভাবকের নাম :</span>
            <span class="sig-line">${application.guardianName || ''}</span>
          </div>
          <div class="sig-field">
            <span>স্বাক্ষর :</span>
            <span class="sig-line"></span>
          </div>
          <div class="sig-field">
            <span>তারিখ :</span>
            <div class="date-boxes-wrap">
              <div class="date-box">${this.toBnDigits(appDay)}<span class="date-box-lbl">দিন</span></div>
              <div class="date-box">${this.toBnDigits(appMonth)}<span class="date-box-lbl">মাস</span></div>
              <div class="date-box year-box">${this.toBnDigits(appYear)}<span class="date-box-lbl">বছর</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 7: FOR OFFICE USE ONLY -->
    <div class="office-use-box">
      <div class="office-use-header">FOR OFFICE USE ONLY (অফিস কর্তৃপক্ষের জন্য)</div>
      <div class="office-use-body">
        <div>
          <div class="card-field-row">
            <span style="width: 100px; font-weight: 700;">Admission No. :</span>
            <span class="card-field-val" style="font-family: monospace; font-weight: 700; color: #02457a;">${studentId || application.applicationNumber}</span>
          </div>
          <div class="card-field-row" style="margin-top: 3px;">
            <span style="width: 100px; font-weight: 700;">Admission Date :</span>
            <div class="date-boxes-wrap">
              <div class="date-box">${this.toBnDigits(appDay)}<span class="date-box-lbl">দিন</span></div>
              <div class="date-box">${this.toBnDigits(appMonth)}<span class="date-box-lbl">মাস</span></div>
              <div class="date-box year-box">${this.toBnDigits(appYear)}<span class="date-box-lbl">বছর</span></div>
            </div>
          </div>
          <div class="card-field-row" style="margin-top: 3px;">
            <span style="width: 100px; font-weight: 700;">Class :</span>
            <span class="card-field-val">${className}</span>
          </div>
          <div class="card-field-row" style="margin-top: 3px;">
            <span style="width: 100px; font-weight: 700;">Section :</span>
            <span class="card-field-val">${sectionName || 'ক (সকাল)'}</span>
          </div>
        </div>

        <div>
          <div class="card-field-row">
            <span style="width: 70px; font-weight: 700;">Roll No. :</span>
            <span class="card-field-val" style="font-weight: 700; color: #00875a;">${rollNo ? this.toBnDigits(rollNo) : 'নির্ধারিতব্য'}</span>
          </div>
          <div class="card-field-row" style="margin-top: 3px;">
            <span style="width: 70px; font-weight: 700;">Remarks :</span>
            <span class="card-field-val">${application.status === 'APPROVED' ? 'ভর্তি অনুমোদিত' : 'প্রাথমিক যাচাই সম্পন্ন'}</span>
          </div>
          <div class="office-sig-area">
            <div class="office-sig-line"></div>
            <div style="font-weight: 700; color: #02457a; font-size: 11px;">Authorized Signature</div>
            <div style="color: #64748b; font-size: 10px;">(প্রধান শিক্ষক / কর্তৃপক্ষ)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="sheet-footer">
      <div style="display: flex; align-items: center; gap: 4px; color: #00875a; font-weight: 700;">
        🍃 Educational Park Campus
      </div>
      <div class="footer-tagline">— শিক্ষা দিয়ে গড়ি আলোকিত ভবিষ্যৎ —</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 2: সংলগ্নি, আপলোডকৃত ডকুমেন্টস ও অফিসিয়াল ভেরিফিকেশন রিপোর্ট (SECOND A4 SHEET) -->
  <!-- ========================================================================= -->
  <div class="a4-sheet">
    <!-- Top Curved Wave Banner -->
    <div class="top-curved-banner">
      <svg viewBox="0 0 800 24" preserveAspectRatio="none" style="width:100%; height:100%;">
        <path d="M0,0 L800,0 L800,14 Q600,24 400,12 Q200,0 0,16 Z" fill="url(#waveGrad)" />
      </svg>
    </div>

    <!-- Header Section -->
    <div class="header-section page-2-header">
      <div class="logo-container" style="width: 70px; height: 70px;">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo-img" style="width: 68px; height: 68px;" alt="Logo" />` : ''}
      </div>
      <div class="header-text">
        <h2 style="font-size: 24px; font-weight: 800; color: #02457a; margin: 0 0 2px 0;">এডুকেশনাল পার্ক</h2>
        <div style="font-size: 13px; font-weight: 700; color: #00875a;">সংযুক্ত নথিপত্র ও অফিসিয়াল যাচাইকরণ রিপোর্ট</div>
        <div style="font-size: 11px; color: #64748b;">অ্যাপ্লিকেশন ট্র্যাকিং আইডি: <strong style="font-family: monospace; color:#02457a;">${application.applicationNumber}</strong></div>
      </div>
      <div style="width: 70px; text-align: right;">
        ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 65px; height: 65px; border-radius: 4px; border: 1px solid #cbd5e1;" alt="QR" />` : ''}
      </div>
    </div>

    <!-- Title Ribbon Banner -->
    <div class="title-ribbon">
      <div class="ribbon-accents-left">
        <div class="ribbon-bar yellow"></div>
        <div class="ribbon-bar green"></div>
        <div class="ribbon-bar cyan"></div>
      </div>
      <div class="ribbon-text">সংযুক্ত নথিপত্র ও চূড়ান্ত অনুমোদন রেকর্ড</div>
      <div class="ribbon-page-badge">(দ্বিতীয় পৃষ্ঠা)</div>
      <div class="ribbon-accents-right">
        <div class="ribbon-bar cyan"></div>
        <div class="ribbon-bar green"></div>
        <div class="ribbon-bar yellow"></div>
      </div>
    </div>

    <!-- Section 1: জমাকৃত নথিপত্রের পূর্ণাঙ্গ বিবরণী -->
    <div class="form-section">
      <div class="section-pill-header">
        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        ১. আপলোডকৃত প্রয়োজনীয় নথিপত্র ও ভেরিফিকেশন রিপোর্ট
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th style="width: 32px; text-align: center;">নং</th>
            <th style="width: 160px;">ডকুমেন্টের বিবরণ</th>
            <th>শনাক্তকারী নম্বর / ফাইল রেফারেন্স</th>
            <th style="width: 100px; text-align: center;">স্ট্যাটাস</th>
            <th style="width: 110px;">যাচাইকারী মন্তব্য</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center; font-weight: 700;">১</td>
            <td><strong>শিক্ষার্থীর ছবি (পাসপোর্ট সাইজ)</strong></td>
            <td>${photoDoc?.fileName || 'পাসপোর্ট সাইজ রঙিন ছবি'}</td>
            <td style="text-align: center;">
              <span class="${photoDoc?.status === AdmissionDocumentStatus.VERIFIED ? 'badge-verified' : 'badge-pending'}">
                ${photoDoc?.status === AdmissionDocumentStatus.VERIFIED ? '✓ VERIFIED' : 'PENDING'}
              </span>
            </td>
            <td style="color: #00875a; font-weight: 600;">সঠিক ও মানসম্মত</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: 700;">২</td>
            <td><strong>জন্ম নিবন্ধন সনদপত্র</strong></td>
            <td>নম্বর: ${this.toBnDigits(application.birthCertificateNumber)}</td>
            <td style="text-align: center;">
              <span class="${birthCert?.status === AdmissionDocumentStatus.VERIFIED ? 'badge-verified' : 'badge-pending'}">
                ${birthCert?.status === AdmissionDocumentStatus.VERIFIED ? '✓ VERIFIED' : 'PENDING'}
              </span>
            </td>
            <td>অনলাইনে যাচাইকৃত</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: 700;">৩</td>
            <td><strong>অভিভাবক / পিতার এনআইডি</strong></td>
            <td>নম্বর: ${this.toBnDigits(application.guardianNidNumber)}</td>
            <td style="text-align: center;">
              <span class="${guardianNid?.status === AdmissionDocumentStatus.VERIFIED ? 'badge-verified' : 'badge-pending'}">
                ${guardianNid?.status === AdmissionDocumentStatus.VERIFIED ? '✓ VERIFIED' : 'PENDING'}
              </span>
            </td>
            <td>স্বাক্ষরিত কপি সংগৃহীত</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: 700;">৪</td>
            <td><strong>ছাড়পত্র / ট্রান্সফার সার্টিফিকেট</strong></td>
            <td>${application.previousSchool ? `${application.previousSchool}` : 'প্রযোজ্য নয় (নতুন ভর্তি)'}</td>
            <td style="text-align: center;">
              <span class="${hasTC ? 'badge-verified' : 'badge-pending'}">
                ${hasTC ? '✓ সংগৃহীত' : 'প্রযোজ্য নয়'}
              </span>
            </td>
            <td>মূল কপি দাখিলকৃত</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: 700;">৫</td>
            <td><strong>পূর্ববর্তী শ্রেণির রিপোর্ট কার্ড</strong></td>
            <td>${schoolReport?.fileName || (application.previousSchoolGrade ? `উত্তীর্ণ: ${application.previousSchoolGrade}` : 'প্রযোজ্য নয়')}</td>
            <td style="text-align: center;">
              <span class="${schoolReport ? 'badge-verified' : 'badge-pending'}">
                ${schoolReport ? '✓ সংগৃহীত' : 'প্রযোজ্য নয়'}
              </span>
            </td>
            <td>গ্রেড শিট যাচাইকৃত</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 2: ভর্তি সংক্রান্ত সাধারণ নিয়মাবলী -->
    <div class="form-section">
      <div class="section-pill-header green-pill">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        ২. ভর্তি সংক্রান্ত সাধারণ নিয়মাবলী ও আচরণবিধি
      </div>
      <div class="rules-list">
        <ol>
          <li>ভর্তি চূড়ান্তভাবে অনুমোদিত হওয়ার পর নির্ধারিত কার্যদিবসের মধ্যে ভর্তি ফি ও সেশন চার্জ পরিশোধ বাধ্যতামূলক।</li>
          <li>প্রতিটি শিক্ষাদিবসে ক্লাসে উপস্থিতি বাধ্যতামূলক; বাৎসরিক ন্যূনতম ৮০% উপস্থিতি বজায় রাখতে হবে।</li>
          <li>প্রতিষ্ঠান কর্তৃক নির্ধারিত স্কুল ইউনিফর্ম এবং ইস্যুকৃত ডিজিটাল আইডি কার্ড পরিধান করে ক্যাম্পাসে প্রবেশ করতে হবে।</li>
          <li>প্রতিষ্ঠানের নিয়ম-শৃঙ্খলা ও ধর্মীয়/নৈতিক মূল্যবোধ পরিপন্থী যেকোনো কর্মকাণ্ডে ভর্তি বাতিলযোগ্য অপরাধ বলে গণ্য হবে।</li>
          <li>আবেদনপত্রে কোনো অসত্য বা বিভ্রান্তিকর তথ্য প্রমাণিত হলে প্রতিষ্ঠান কর্তৃপক্ষ যেকোনো সময় ভর্তি বাতিল করার পূর্ণ এখতিয়ার সংরক্ষণ করে।</li>
        </ol>
      </div>
    </div>

    <!-- Section 3: অফিসিয়াল অনুমোদন ও সিলমোহর (৩টি বক্স) -->
    <div class="form-section">
      <div class="section-pill-header">
        <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
        ৩. অফিসিয়াল যাচাই ও চূড়ান্ত অনুমোদন রেকর্ড
      </div>

      <div class="approval-tri-boxes">
        <!-- Box 1 -->
        <div class="approval-seal-card">
          <div class="approval-seal-title">১. তথ্য ও নথি যাচাইকারী</div>
          <div style="font-size: 11px; color: #475569; padding-top: 24px;">
            ${application.reviewedBy?.name ? `যাচাইকারী: ${application.reviewedBy.name}` : ''}
          </div>
          <div style="border-top: 1px dashed #cbd5e1; padding-top: 2px; font-size: 10px; color: #64748b;">
            স্বাক্ষর ও তারিখ
          </div>
        </div>

        <!-- Box 2 -->
        <div class="approval-seal-card">
          <div class="approval-seal-title">২. হিসাব ও ফি আদায় শাখা</div>
          <div style="font-size: 11px; color: #475569; padding-top: 24px;">
            রসিদ নং: ........................
          </div>
          <div style="border-top: 1px dashed #cbd5e1; padding-top: 2px; font-size: 10px; color: #64748b;">
            হিসাব কর্মকর্তার স্বাক্ষর
          </div>
        </div>

        <!-- Box 3 -->
        <div class="approval-seal-card" style="border-color: #02457a; background: #f0f7ff;">
          <div class="approval-seal-title" style="color: #02457a;">৩. প্রধান শিক্ষকের অনুমোদন</div>
          <div style="font-size: 11px; color: #02457a; font-weight: 700; padding-top: 24px;">
            ${application.status === 'APPROVED' ? '✓ ভর্তি অনুমোদিত' : 'অপেক্ষমান'}
          </div>
          <div style="border-top: 1px dashed #02457a; padding-top: 2px; font-size: 10px; color: #02457a; font-weight: 700;">
            অফিসিয়াল সিল ও স্বাক্ষর
          </div>
        </div>
      </div>
    </div>

    <!-- Cut Line -->
    <div class="cut-line-wrap">
      <div class="cut-line"></div>
      <span class="cut-line-badge">✂ এখানে কেটে শিক্ষার্থী/অভিভাবককে বুঝিয়ে দিন (রসিদ অংশ)</span>
    </div>

    <!-- Section 4: শিক্ষার্থী ও অভিভাবক প্রাপ্তিস্বীকার রসিদ (Counterfoil) -->
    <div class="counterfoil-box">
      <div class="counterfoil-header">
        <div class="counterfoil-title">এডুকেশনাল পার্ক — ভর্তি আবেদন প্রাপ্তিস্বীকার পত্র (অফিস ও অভিভাবক কপি)</div>
        <div class="counterfoil-appno">${application.applicationNumber}</div>
      </div>

      <div class="counterfoil-grid">
        <div>
          <div class="card-field-row">
            <span style="width: 110px; font-weight: 600;">শিক্ষার্থীর নাম :</span>
            <span class="card-field-val" style="color: #02457a; font-weight: 700;">${application.studentNameBn || application.studentName}</span>
          </div>
          <div class="card-field-row" style="margin-top: 2px;">
            <span style="width: 110px; font-weight: 600;">ভর্তিচ্ছু শ্রেণি :</span>
            <span class="card-field-val"><strong>${className}</strong> (সেশন: ${sessionText})</span>
          </div>
          <div class="card-field-row" style="margin-top: 2px;">
            <span style="width: 110px; font-weight: 600;">অভিভাবকের নাম :</span>
            <span class="card-field-val">${application.guardianName} (${this.toBnDigits(application.guardianPhone)})</span>
          </div>
          <div class="card-field-row" style="margin-top: 2px;">
            <span style="width: 110px; font-weight: 600;">আবেদনের তারিখ :</span>
            <span class="card-field-val">${this.toBnDigits(appDay)}/${this.toBnDigits(appMonth)}/${this.toBnDigits(appYear)} খ্রি.</span>
          </div>
          <div style="margin-top: 4px; font-size: 10.5px; color: #166534;">
            ✓ জমাকৃত ডকুমেন্টস: ছবি [✓], জন্ম সনদ [✓], অভিভাবক এনআইডি [✓], প্রশংসাপত্র [${hasTC ? '✓' : '-'}]
          </div>
        </div>

        <div style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center;">
          <div style="width: 130px; border-top: 1px dashed #166534; padding-top: 2px; font-size: 10.5px; font-weight: 700; color: #166534;">
            গ্রহণকারী কর্মকর্তার স্বাক্ষর
          </div>
          <div style="font-size: 9.5px; color: #64748b;">(অফিসিয়াল সিলমোহরসহ)</div>
        </div>
      </div>
    </div>

    <!-- Sheet Footer -->
    <div class="sheet-footer">
      <div style="display: flex; align-items: center; gap: 4px; color: #00875a; font-weight: 700;">
        📞 হেল্পলাইন: +8801711052072 | গ্রাম: আলীমাবাদ, নবীনগর, ব্রাহ্মণবাড়িয়া
      </div>
      <div class="footer-tagline">— শিক্ষা দিয়ে গড়ি আলোকিত ভবিষ্যৎ —</div>
    </div>
  </div>

</body>
</html>`;
  }

  /**
   * Render vector-sharp 2-Page A4 PDF buffer using Puppeteer
   */
  public static async generateAdmissionPdfBuffer(applicationId: string): Promise<Buffer> {
    const application = await prisma.admissionApplication.findUnique({
      where: { id: applicationId },
      include: {
        classAppliedFor: true,
        reviewedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        documents: true,
        student: {
          include: {
            academicEnrollments: {
              where: { isCurrent: true },
              include: { classSection: true },
            },
          },
        },
      },
    });

    if (!application) {
      throw new Error('Admission application not found');
    }

    const html = await this.generateAdmissionHtml(application);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      // Wait slightly for fonts and styles to render crisply
      await new Promise((r) => setTimeout(r, 400));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate Full 2-Page A4 Blank / Empty Admission HTML
   */
  public static async generateBlankAdmissionHtml(): Promise<string> {
    const logoDataUrl = this.getLogoBase64();

    return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>খালি ভর্তি আবেদন ফরম - এডুকেশনাল পার্ক</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Hind Siliguri', 'SolaimanLipi', Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      font-size: 13px;
      line-height: 1.35;
    }

    .a4-sheet {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 9mm 12mm 7mm 12mm;
      box-sizing: border-box;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }

    .a4-sheet:last-child {
      page-break-after: avoid;
    }

    .header-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      z-index: 2;
      padding-top: 2px;
      margin-bottom: 4px;
    }

    .logo-container {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-img {
      width: 78px;
      height: 78px;
      object-fit: contain;
      border-radius: 50%;
    }

    .header-text {
      flex: 1;
      text-align: center;
    }

    .sub-org {
      font-size: 13px;
      font-weight: 600;
      color: #023e8a;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }

    .school-title {
      font-size: 32px;
      font-weight: 800;
      color: #02457a;
      line-height: 1.1;
      margin: 0 0 3px 0;
    }

    .class-badge {
      display: inline-block;
      background: #00875a;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      padding: 1px 18px;
      border-radius: 20px;
      margin-bottom: 3px;
    }

    .contact-line {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .photo-box {
      width: 98px;
      height: 115px;
      border: 1.8px dashed #02457a;
      border-radius: 8px;
      background: #f8fafc;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px;
      text-align: center;
    }

    .photo-caption {
      font-size: 9.5px;
      font-weight: 600;
      color: #475569;
      line-height: 1.2;
    }

    .title-ribbon {
      background: linear-gradient(90deg, #023e8a 0%, #004d7a 50%, #023e8a 100%);
      color: #ffffff;
      padding: 5px 14px;
      border-radius: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 5px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .form-section {
      margin-bottom: 5px;
    }

    .section-pill-header {
      background: #e2e8f0;
      color: #02457a;
      font-size: 12.5px;
      font-weight: 700;
      padding: 2.5px 10px;
      border-radius: 6px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .section-pill-header.green-pill {
      background: #dcfce7;
      color: #00875a;
    }

    .field-row {
      display: flex;
      align-items: center;
      margin-bottom: 2.5px;
      font-size: 12.5px;
    }

    .field-lbl {
      width: 175px;
      flex-shrink: 0;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      justify-content: space-between;
      padding-right: 8px;
    }

    .dotted-val {
      flex: 1;
      border-bottom: 1.2px dotted #94a3b8;
      min-height: 16px;
    }

    .chk-box {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 1.3px solid #02457a;
      border-radius: 2px;
      margin-right: 3px;
      vertical-align: middle;
    }

    .chk-item {
      display: inline-flex;
      align-items: center;
      margin-right: 14px;
      font-size: 12px;
      font-weight: 500;
    }

    .box-cell {
      display: inline-block;
      width: 15px;
      height: 17px;
      border: 1.2px solid #02457a;
      border-radius: 2px;
      margin-right: 2px;
      vertical-align: middle;
    }

    .two-col-wrap {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .parent-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      padding: 5px 8px;
    }

    .parent-card-title {
      font-weight: 700;
      font-size: 12px;
      color: #02457a;
      border-bottom: 1.5px solid #bfdbfe;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }

    .parent-card.green-card .parent-card-title {
      color: #00875a;
      border-bottom-color: #bbf7d0;
    }

    .card-row {
      display: flex;
      align-items: center;
      margin-bottom: 2px;
      font-size: 12px;
    }

    .card-lbl {
      width: 95px;
      flex-shrink: 0;
      font-weight: 600;
      color: #334155;
    }

    .office-use-box {
      border: 1.5px solid #02457a;
      border-radius: 6px;
      background: #f8fafc;
      overflow: hidden;
      margin-top: 3px;
    }

    .office-use-header {
      background: #02457a;
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 700;
      padding: 2px 10px;
    }

    .office-use-body {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      padding: 5px 10px;
      gap: 10px;
      font-size: 11.5px;
    }

    .sheet-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 3px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-bottom: 6px;
    }

    .doc-table th {
      background: #02457a;
      color: #ffffff;
      padding: 3.5px 6px;
      font-weight: 700;
      text-align: left;
      border: 1px solid #02457a;
    }

    .doc-table td {
      border: 1px solid #cbd5e1;
      padding: 3.5px 6px;
      vertical-align: middle;
    }

    .rules-list {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 11.5px;
      line-height: 1.45;
      margin-bottom: 6px;
      color: #334155;
    }

    .rules-list ol {
      margin: 0;
      padding-left: 18px;
    }

    .approval-tri-boxes {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 6px;
    }

    .approval-seal-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      padding: 5px;
      text-align: center;
      min-height: 82px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .approval-seal-title {
      font-weight: 700;
      font-size: 11.5px;
      color: #02457a;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 2px;
    }

    .counterfoil-box {
      border: 1.5px solid #00875a;
      border-radius: 8px;
      background: #f6fcf8;
      padding: 6px 10px;
    }

    .counterfoil-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #86efac;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: মূল খালি ভর্তি আবেদন ফরম (FIRST A4 SHEET) -->
  <!-- ========================================================================= -->
  <div class="a4-sheet">
    <!-- Header Section -->
    <div class="header-section">
      <div class="logo-container">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo-img" alt="Educational Park" />` : `
          <svg viewBox="0 0 100 100" class="logo-img">
            <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#02457a" stroke-width="4"/>
            <path d="M50 20 L58 35 L50 48 L42 35 Z" fill="#e11d48"/>
            <path d="M30 55 Q50 46 70 55 L70 75 Q50 66 30 75 Z" fill="#02457a"/>
          </svg>
        `}
      </div>

      <div class="header-text">
        <div class="sub-org">তিতাস সমাজ সংস্থা কর্তৃক পরিচালিত</div>
        <h1 class="school-title">এডুকেশনাল পার্ক</h1>
        <div><span class="class-badge">প্লে থেকে ক্লাস পঞ্চম শ্রেণি</span></div>
        <div class="contact-line">
          <span>📍 গ্রাম: আলীমাবাদ, নবীনগর, ব্রাহ্মণবাড়িয়া</span>
          <span style="color:#94a3b8;">|</span>
          <span>📞 +8801711052072</span>
        </div>
      </div>

      <div class="photo-box">
        <svg style="width:36px; height:36px; color:#94a3b8; margin-bottom:2px;" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        <div class="photo-caption">পাসপোর্ট সাইজ রঙিন ছবি<br/>(এখানে আঠা দিয়ে লাগান)</div>
      </div>
    </div>

    <!-- Title Ribbon -->
    <div class="title-ribbon">
      ভর্তি আবেদন ফরম (সেশন: ....................)
    </div>

    <!-- Section 1: শিক্ষার্থীর ব্যক্তিগত তথ্য -->
    <div class="form-section">
      <div class="section-pill-header">১. শিক্ষার্থীর ব্যক্তিগত তথ্য</div>

      <div class="field-row">
        <div class="field-lbl"><span>১. শিক্ষার্থীর নাম (বাংলা)</span><span>:</span></div>
        <div class="dotted-val"></div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>২. শিক্ষার্থীর নাম (ইংরেজি)</span><span>:</span></div>
        <div style="flex:1; display:flex; align-items:center;">
          ${Array(22).fill(0).map(() => '<span class="box-cell"></span>').join('')}
          <span style="font-size:10px; color:#64748b; margin-left:4px;">(BLOCK LETTERS)</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৩. জন্ম তারিখ</span><span>:</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span>দিন</span>
          <span class="box-cell"></span><span class="box-cell"></span>
          <span>মাস</span>
          <span class="box-cell"></span><span class="box-cell"></span>
          <span>সাল</span>
          <span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৪. জন্ম নিবন্ধন নম্বর</span><span>:</span></div>
        <div style="display:flex; align-items:center;">
          ${Array(17).fill(0).map(() => '<span class="box-cell"></span>').join('')}
          <span style="font-size:10px; color:#64748b; margin-left:4px;">(১৭ ডিজিট)</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৫. লিঙ্গ</span><span>:</span></div>
        <div>
          <span class="chk-item"><span class="chk-box"></span> ছাত্র (ছেলে)</span>
          <span class="chk-item"><span class="chk-box"></span> ছাত্রী (মেয়ে)</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৬. জাতীয়তা</span><span>:</span></div>
        <div style="flex:1;">
          <span class="chk-item"><span class="chk-box" style="background:#02457a;"></span> বাংলাদেশী</span>
          <span class="chk-item"><span class="chk-box"></span> অন্যান্য (....................)</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>৭. যে শ্রেণিতে ভর্তিচ্ছু</span><span>:</span></div>
        <div>
          <span class="chk-item"><span class="chk-box"></span> Play</span>
          <span class="chk-item"><span class="chk-box"></span> Nursery</span>
          <span class="chk-item"><span class="chk-box"></span> KG</span>
          <span class="chk-item"><span class="chk-box"></span> ১ম শ্রেণি</span>
          <span class="chk-item"><span class="chk-box"></span> ২য় শ্রেণি</span>
          <span class="chk-item"><span class="chk-box"></span> ৩য় শ্রেণি</span>
          <span class="chk-item"><span class="chk-box"></span> ৪র্থ শ্রেণি</span>
          <span class="chk-item"><span class="chk-box"></span> ৫ম শ্রেণি</span>
        </div>
      </div>
    </div>

    <!-- Section 2: পূর্ববর্তী বিদ্যালয়ের তথ্য -->
    <div class="form-section">
      <div class="section-pill-header green-pill">২. পূর্ববর্তী বিদ্যালয়ের তথ্য (প্রযোজ্য ক্ষেত্রে)</div>

      <div class="field-row">
        <div class="field-lbl"><span>১. বিদ্যালয়ের নাম</span><span>:</span></div>
        <div class="dotted-val"></div>
      </div>

      <div class="field-row">
        <div class="field-lbl"><span>২. উত্তীর্ণ শ্রেণি</span><span>:</span></div>
        <div style="width:200px; margin-right:16px;" class="dotted-val"></div>
        <div style="font-weight:600; margin-right:8px;">ছাড়পত্র (TC) আছে কি? :</div>
        <span class="chk-item"><span class="chk-box"></span> হ্যাঁ</span>
        <span class="chk-item"><span class="chk-box"></span> না</span>
      </div>
    </div>

    <!-- Section 3: পিতা / মাতার তথ্য -->
    <div class="form-section">
      <div class="section-pill-header">৩. পিতা / মাতার তথ্য</div>

      <div class="two-col-wrap">
        <!-- Father Card -->
        <div class="parent-card">
          <div class="parent-card-title">পিতার তথ্য</div>
          <div class="card-row"><span class="card-lbl">১. নাম (বাংলা) :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">২. নাম (ইংরেজি) :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৩. NID নম্বর :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৪. পেশা :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৫. মোবাইল নম্বর :</span><span class="dotted-val"></span></div>
        </div>

        <!-- Mother Card -->
        <div class="parent-card">
          <div class="parent-card-title">মাতার তথ্য</div>
          <div class="card-row"><span class="card-lbl">১. নাম (বাংলা) :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">২. নাম (ইংরেজি) :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৩. NID নম্বর :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৪. পেশা :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">৫. মোবাইল নম্বর :</span><span class="dotted-val"></span></div>
        </div>
      </div>
    </div>

    <!-- Section 4: অভিভাবক বিবরণ -->
    <div class="form-section">
      <div class="section-pill-header">৪. অভিভাবক / গার্ডিয়ান (পিতা/মাতার অনুপস্থিতিতে)</div>
      <div class="parent-card" style="padding:4px 8px;">
        <div class="card-row">
          <span style="width:130px; font-weight:600;">অভিভাবকের নাম :</span>
          <span class="dotted-val" style="margin-right:12px;"></span>
          <span style="font-weight:600; margin-right:6px;">সম্পর্ক :</span>
          <span class="chk-item"><span class="chk-box"></span> পিতা</span>
          <span class="chk-item"><span class="chk-box"></span> মাতা</span>
          <span class="chk-item"><span class="chk-box"></span> অন্যান্য</span>
        </div>
        <div class="card-row" style="margin-top:2px;">
          <span style="width:130px; font-weight:600;">মোবাইল নম্বর :</span>
          <span class="dotted-val" style="margin-right:12px;"></span>
          <span style="font-weight:600; margin-right:6px;">জরুরি ফোন :</span>
          <span class="dotted-val"></span>
        </div>
      </div>
    </div>

    <!-- Section 5: বর্তমান ও স্থায়ী ঠিকানা -->
    <div class="form-section">
      <div class="section-pill-header green-pill">৫. বর্তমান ও স্থায়ী ঠিকানা</div>

      <div class="two-col-wrap">
        <div class="parent-card green-card">
          <div class="parent-card-title">বর্তমান ঠিকানা</div>
          <div class="card-row"><span class="card-lbl">গ্রাম / বাড়ি :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">ডাকঘর :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">উপজেলা :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">জেলা :</span><span class="dotted-val"></span></div>
        </div>

        <div class="parent-card green-card">
          <div class="parent-card-title">স্থায়ী ঠিকানা</div>
          <div class="card-row"><span class="card-lbl">গ্রাম / বাড়ি :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">ডাকঘর :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">উপজেলা :</span><span class="dotted-val"></span></div>
          <div class="card-row"><span class="card-lbl">জেলা :</span><span class="dotted-val"></span></div>
        </div>
      </div>
    </div>

    <!-- Office Use Section -->
    <div class="office-use-box">
      <div class="office-use-header">অফিস ব্যবহারের জন্য (FOR OFFICE USE ONLY)</div>
      <div class="office-use-body">
        <div>
          <div>ভর্তি রোল নম্বর : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:120px;">&nbsp;</strong></div>
          <div style="margin-top:3px;">রেজিস্ট্রেশন নম্বর : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:120px;">&nbsp;</strong></div>
          <div style="margin-top:3px;">শিক্ষার্থী আইডি (ID) : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:120px;">&nbsp;</strong></div>
          <div style="margin-top:3px;">শ্রেণি : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:60px;">&nbsp;</strong> &nbsp; শাখা : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:60px;">&nbsp;</strong></div>
        </div>
        <div style="display:flex; flex-direction:column; justify-content:flex-end; align-items:center;">
          <div style="width:140px; border-top:1px dashed #475569; margin-bottom:2px;"></div>
          <div style="font-size:10px; color:#475569;">দায়িত্বপ্রাপ্ত কর্মকর্তার স্বাক্ষর ও সিল</div>
        </div>
      </div>
    </div>

    <!-- Sheet Footer -->
    <div class="sheet-footer">
      <div>পৃষ্ঠা নং: ০১ (ভর্তি আবেদন ফরম)</div>
      <div style="font-weight:700; color:#02457a;">— শিক্ষা দিয়ে গড়ি আলোকিত ভবিষ্যৎ —</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 2: ডকুমেন্টস চেকলিস্ট, নিয়মাবলী ও প্রাপ্তিস্বীকার রসিদ (SECOND A4 SHEET) -->
  <!-- ========================================================================= -->
  <div class="a4-sheet">
    <!-- Top Header Ribbon -->
    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #02457a; padding-bottom:4px; margin-bottom:6px;">
      <div style="font-weight:800; color:#02457a; font-size:15px;">এডুকেশনাল পার্ক — ভর্তি আবেদন ফরম (পৃষ্ঠা - ০২)</div>
      <div style="font-size:11px; color:#64748b; font-weight:600;">সেশন: ....................</div>
    </div>

    <!-- Section 1: সংযুক্ত নথিপত্র চেকলিস্ট -->
    <div class="form-section">
      <div class="section-pill-header">১. প্রয়োজনীয় সংযুক্ত নথিপত্র চেকলিস্ট (কাগজপত্র জমা দেওয়ার সময় টিক দিন)</div>
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:30px; text-align:center;">নং</th>
            <th>নথিপত্রের বিবরণ (Documents Description)</th>
            <th style="width:100px; text-align:center;">প্রয়োজনীয়তা</th>
            <th style="width:140px; text-align:center;">জমাদান স্ট্যাটাস</th>
            <th>মন্তব্য / অফিস নোট</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align:center; font-weight:700;">১</td>
            <td><strong>শিক্ষার্থীর পাসপোর্ট সাইজ রঙিন ছবি (২ কপি)</strong></td>
            <td style="text-align:center; color:#e11d48; font-weight:700;">বাধ্যতামূলক</td>
            <td><span class="chk-item"><span class="chk-box"></span> দাখিলকৃত</span> <span class="chk-item"><span class="chk-box"></span> অনিষ্পন্ন</span></td>
            <td>সদ্য তোলা ল্যাব প্রিন্ট ছবি</td>
          </tr>
          <tr>
            <td style="text-align:center; font-weight:700;">২</td>
            <td><strong>ডিজিটাল জন্ম নিবন্ধন সনদ (১৭ ডিজিটের অনলাইন কপি)</strong></td>
            <td style="text-align:center; color:#e11d48; font-weight:700;">বাধ্যতামূলক</td>
            <td><span class="chk-item"><span class="chk-box"></span> দাখিলকৃত</span> <span class="chk-item"><span class="chk-box"></span> অনিষ্পন্ন</span></td>
            <td>অনলাইনে যাচাইকৃত ফটোকপি</td>
          </tr>
          <tr>
            <td style="text-align:center; font-weight:700;">৩</td>
            <td><strong>পিতা ও মাতার জাতীয় পরিচয়পত্র (NID) কপি</strong></td>
            <td style="text-align:center; color:#e11d48; font-weight:700;">বাধ্যতামূলক</td>
            <td><span class="chk-item"><span class="chk-box"></span> দাখিলকৃত</span> <span class="chk-item"><span class="chk-box"></span> অনিষ্পন্ন</span></td>
            <td>স্বাক্ষরিত ফটোকপি</td>
          </tr>
          <tr>
            <td style="text-align:center; font-weight:700;">৪</td>
            <td><strong>পূর্ববর্তী বিদ্যালয়ের ছাড়পত্র / ট্রান্সফার সার্টিফিকেট (TC)</strong></td>
            <td style="text-align:center; color:#64748b;">প্রযোজ্য ক্ষেত্রে</td>
            <td><span class="chk-item"><span class="chk-box"></span> দাখিলকৃত</span> <span class="chk-item"><span class="chk-box"></span> প্রযোজ্য নয়</span></td>
            <td>মূল কপি দাখিলযোগ্য</td>
          </tr>
          <tr>
            <td style="text-align:center; font-weight:700;">৫</td>
            <td><strong>পূর্ববর্তী বার্ষিক পরীক্ষার প্রগ্রেস রিপোর্ট / প্রশংসাপত্র</strong></td>
            <td style="text-align:center; color:#64748b;">ঐচ্ছিক</td>
            <td><span class="chk-item"><span class="chk-box"></span> দাখিলকৃত</span> <span class="chk-item"><span class="chk-box"></span> প্রযোজ্য নয়</span></td>
            <td>গ্রেড শিটের ফটোকপি</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 2: ভর্তি সংক্রান্ত সাধারণ নিয়মাবলী -->
    <div class="form-section">
      <div class="section-pill-header green-pill">২. ভর্তি সংক্রান্ত সাধারণ নিয়মাবলী ও আচরণবিধি</div>
      <div class="rules-list">
        <ol>
          <li>ভর্তি চূড়ান্তভাবে অনুমোদিত হওয়ার পর নির্ধারিত কার্যদিবসের মধ্যে ভর্তি ফি ও সেশন চার্জ পরিশোধ বাধ্যতামূলক।</li>
          <li>প্রতিটি শিক্ষাদিবসে ক্লাসে উপস্থিতি বাধ্যতামূলক; বাৎসরিক ন্যূনতম ৮০% উপস্থিতি বজায় রাখতে হবে।</li>
          <li>প্রতিষ্ঠান কর্তৃক নির্ধারিত স্কুল ইউনিফর্ম এবং ইস্যুকৃত ডিজিটাল আইডি কার্ড পরিধান করে ক্যাম্পাসে প্রবেশ করতে হবে।</li>
          <li>প্রতিষ্ঠানের নিয়ম-শৃঙ্খলা ও ধর্মীয়/নৈতিক মূল্যবোধ পরিপন্থী যেকোনো কর্মকাণ্ডে ভর্তি বাতিলযোগ্য অপরাধ বলে গণ্য হবে।</li>
          <li>আবেদনপত্রে কোনো অসত্য বা বিভ্রান্তিকর তথ্য প্রমাণিত হলে প্রতিষ্ঠান কর্তৃপক্ষ যেকোনো সময় ভর্তি বাতিল করার পূর্ণ এখতিয়ার সংরক্ষণ করে।</li>
        </ol>
      </div>
    </div>

    <!-- Section 3: অভিভাবকের অঙ্গীকারনামা -->
    <div class="form-section">
      <div class="section-pill-header">৩. অভিভাবকের অঙ্গীকারনামা</div>
      <div style="border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:11.5px; line-height:1.45; background:#ffffff;">
        <p style="margin:0 0 8px 0; text-align:justify;">
          আমি এই মর্মে অঙ্গীকার করছি যে, উপরে প্রদত্ত সকল তথ্য সত্য ও নির্ভুল। আমার অভিভাবকত্বাধীন শিক্ষার্থী বিদ্যালয়ের সকল নিয়ম-কানুন ও শৃঙ্খলা মেনে চলতে বাধ্য থাকবে। প্রদত্ত কোনো তথ্য মিথ্যা বা অসত্য প্রমাণিত হলে বিদ্যালয় কর্তৃপক্ষ শিক্ষার্থীর ভর্তি বাতিল করার অধিকার সংরক্ষণ করবে।
        </p>
        <div style="display:flex; justify-content:space-between; align-items:flex-end; padding-top:14px;">
          <div>তারিখ : <strong style="border-bottom:1px dotted #94a3b8; display:inline-block; width:120px;">&nbsp;</strong></div>
          <div style="text-align:center;">
            <div style="border-top:1px dashed #475569; width:180px; margin-bottom:2px;"></div>
            <div style="font-size:11px; font-weight:700; color:#02457a;">অভিভাবকের পূর্ণ স্বাক্ষর</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 4: অফিসিয়াল অনুমোদন ও সিলমোহর (৩টি বক্স) -->
    <div class="form-section">
      <div class="section-pill-header green-pill">৪. অফিসিয়াল যাচাই ও চূড়ান্ত অনুমোদন রেকর্ড</div>
      <div class="approval-tri-boxes">
        <div class="approval-seal-card">
          <div class="approval-seal-title">১. তথ্য ও নথি যাচাইকারী</div>
          <div style="font-size:10.5px; color:#64748b; padding-top:22px;">মন্তব্য : ..............................</div>
          <div style="border-top:1px dashed #cbd5e1; padding-top:2px; font-size:10px; color:#64748b;">স্বাক্ষর ও তারিখ</div>
        </div>

        <div class="approval-seal-card">
          <div class="approval-seal-title">২. হিসাব ও ফি আদায় শাখা</div>
          <div style="font-size:10.5px; color:#64748b; padding-top:22px;">রসিদ নং: ........................</div>
          <div style="border-top:1px dashed #cbd5e1; padding-top:2px; font-size:10px; color:#64748b;">হিসাব কর্মকর্তার স্বাক্ষর</div>
        </div>

        <div class="approval-seal-card" style="border-color:#02457a; background:#f0f7ff;">
          <div class="approval-seal-title" style="color:#02457a;">৩. প্রধান শিক্ষকের অনুমোদন</div>
          <div style="font-size:10.5px; color:#02457a; font-weight:700; padding-top:22px;">[ &nbsp; ] অনুমোদিত &nbsp; [ &nbsp; ] বাতিল</div>
          <div style="border-top:1px dashed #02457a; padding-top:2px; font-size:10px; color:#02457a; font-weight:700;">অফিসিয়াল সিল ও স্বাক্ষর</div>
        </div>
      </div>
    </div>

    <!-- Cut Line -->
    <div style="margin:5px 0; position:relative; text-align:center;">
      <div style="border-top:1.5px dashed #475569; width:100%; margin:6px 0;"></div>
      <span style="display:inline-block; background:#ffffff; padding:0 8px; position:relative; top:-14px; font-size:11px; font-weight:600; color:#475569;">
        ✂ এখানে কেটে শিক্ষার্থী/অভিভাবককে বুঝিয়ে দিন (রসিদ অংশ)
      </span>
    </div>

    <!-- Section 5: শিক্ষার্থী ও অভিভাবক প্রাপ্তিস্বীকার রসিদ (Counterfoil) -->
    <div class="counterfoil-box">
      <div class="counterfoil-header">
        <div style="font-size:13px; font-weight:800; color:#00875a;">এডুকেশনাল পার্ক — ভর্তি আবেদন প্রাপ্তিস্বীকার পত্র (অভিভাবক কপি)</div>
        <div style="font-size:12px; font-weight:700; color:#02457a; border:1px solid #94a3b8; background:#fff; padding:1px 6px; border-radius:4px;">
          আবেদন নং: ADM-2026-________
        </div>
      </div>

      <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px; font-size:11.5px;">
        <div>
          <div style="margin-bottom:2px;">
            <span>শিক্ষার্থীর নাম :</span>
            <span style="border-bottom:1px dotted #94a3b8; display:inline-block; width:220px;">&nbsp;</span>
          </div>
          <div style="margin-bottom:2px;">
            <span>ভর্তিচ্ছু শ্রেণি :</span>
            <span style="border-bottom:1px dotted #94a3b8; display:inline-block; width:100px;">&nbsp;</span>
            <span style="margin-left:8px;">সেশন : <span style="border-bottom:1px dotted #94a3b8; display:inline-block; width:90px;">&nbsp;</span></span>
          </div>
          <div style="margin-bottom:2px;">
            <span>অভিভাবকের নাম :</span>
            <span style="border-bottom:1px dotted #94a3b8; display:inline-block; width:180px;">&nbsp;</span>
            <span style="margin-left:8px;">ফোন :</span>
            <span style="border-bottom:1px dotted #94a3b8; display:inline-block; width:100px;">&nbsp;</span>
          </div>
          <div style="font-size:10.5px; color:#166534; margin-top:3px;">
            ✓ জমাকৃত ডকুমেন্টস: ছবি [ &nbsp; ], জন্ম সনদ [ &nbsp; ], অভিভাবক NID [ &nbsp; ], প্রশংসাপত্র [ &nbsp; ]
          </div>
        </div>

        <div style="display:flex; flex-direction:column; justify-content:flex-end; align-items:center; text-align:center;">
          <div style="width:90px; height:45px; border:1px dashed #166534; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#64748b; margin-bottom:2px;">
            অফিস সিল
          </div>
          <div style="font-size:10px; font-weight:700; color:#166534;">গ্রহণকারী কর্মকর্তার স্বাক্ষর</div>
        </div>
      </div>
    </div>

    <!-- Sheet Footer -->
    <div class="sheet-footer">
      <div style="display:flex; align-items:center; gap:4px; color:#00875a; font-weight:700;">
        📞 হেল্পলাইন: +8801711052072 | গ্রাম: আলীমাবাদ, নবীনগর, ব্রাহ্মণবাড়িয়া
      </div>
      <div style="font-weight:700; color:#02457a;">— শিক্ষা দিয়ে গড়ি আলোকিত ভবিষ্যৎ —</div>
    </div>
  </div>

</body>
</html>`;
  }

  /**
   * Render vector-sharp 2-Page A4 Blank PDF buffer using Puppeteer
   */
  public static async generateBlankAdmissionPdfBuffer(): Promise<Buffer> {
    const html = await this.generateBlankAdmissionHtml();

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 400));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
