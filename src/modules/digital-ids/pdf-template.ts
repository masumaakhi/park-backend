import QRCode from 'qrcode';
import puppeteer from 'puppeteer';

export interface GenerateDigitalIdPdfOptions {
  studentName: string;
  studentId: string;
  className: string;
  sectionName: string;
  sessionName: string;
  rollNumber: string | number;
  guardianPhone: string;
  cardNumber: string;
  issueDate: string;
  expiryDate: string;
  photoUrl?: string;
  verificationToken: string;
  verificationBaseUrl?: string;
}

export async function generateDigitalIdPdfBuffer(options: GenerateDigitalIdPdfOptions): Promise<Buffer> {
  const {
    studentName,
    studentId,
    className,
    sectionName,
    sessionName,
    rollNumber,
    guardianPhone,
    cardNumber,
    issueDate,
    expiryDate,
    photoUrl,
    verificationToken,
    verificationBaseUrl = 'http://localhost:3001',
  } = options;

  const verifyUrl = `${verificationBaseUrl}/verify/student-id/${verificationToken}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 250,
    margin: 1,
    color: {
      dark: '#0e2a47',
      light: '#ffffff',
    },
  });

  const cardNoShort = cardNumber ? cardNumber.replace(/^[^\d]*/, '') : '000125';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Student ID Card - ${studentName}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 15mm;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #f8fafc;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .page-header {
    text-align: center;
    margin-bottom: 25px;
  }
  .page-header h1 {
    font-size: 18px;
    font-weight: 800;
    color: #0e2a47;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .page-header p {
    font-size: 11px;
    color: #64748b;
    margin-top: 3px;
  }
  .cards-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 35px;
  }

  /* CARD DIMENSIONS (Standard CR80 scaled: 500px x 316px) */
  .id-card {
    width: 500px;
    height: 316px;
    background: #ffffff;
    border-radius: 20px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.08);
    border: 1px solid #e2e8f0;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* ============ FRONT CARD ============ */
  .front-header {
    padding: 18px 24px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 2;
  }
  .front-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .crest-logo {
    width: 38px;
    height: 44px;
    flex-shrink: 0;
  }
  .school-title {
    font-size: 18px;
    font-weight: 900;
    color: #0e2a47;
    letter-spacing: 0.5px;
    line-height: 1;
  }
  .school-tagline {
    font-size: 8.5px;
    font-weight: 700;
    color: #008b8b;
    letter-spacing: 2px;
    margin-top: 4px;
    text-transform: uppercase;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    border-left: 1px solid #e2e8f0;
    padding-left: 10px;
  }
  .header-motto {
    font-size: 7.5px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    line-height: 1.1;
    letter-spacing: 0.5px;
  }

  .front-body {
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex: 1;
    z-index: 2;
    margin-top: 4px;
  }
  .photo-frame {
    width: 105px;
    height: 125px;
    border-radius: 12px;
    overflow: hidden;
    background: #f1f5f9;
    border: 2px solid #e2e8f0;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .photo-placeholder {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 20px;
    color: #0e2a47;
  }
  .accent-line {
    width: 2px;
    height: 115px;
    background: linear-gradient(to bottom, #009688, #0284c7);
    border-radius: 2px;
    flex-shrink: 0;
  }
  .details-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
  }
  .detail-row {
    display: flex;
    align-items: baseline;
  }
  .detail-lbl {
    width: 75px;
    flex-shrink: 0;
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
  }
  .detail-val {
    font-weight: 800;
    color: #0e2a47;
    font-size: 12.5px;
  }
  .detail-val.name {
    font-size: 13.5px;
    color: #0e2a47;
  }

  .front-right {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 125px;
    flex-shrink: 0;
  }
  .signature-box {
    text-align: center;
    margin-bottom: 4px;
  }
  .sig-script {
    height: 28px;
    width: 90px;
  }
  .sig-label {
    font-size: 7.5px;
    color: #64748b;
    font-weight: 500;
  }
  .mini-qr-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .mini-qr {
    width: 44px;
    height: 44px;
    padding: 2px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
  }
  .card-no {
    font-family: monospace;
    font-size: 7px;
    font-weight: 700;
    color: #64748b;
    margin-top: 2px;
  }

  .front-footer-wave {
    position: relative;
    height: 56px;
    width: 100%;
    margin-top: auto;
  }
  .wave-svg {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 56px;
  }
  .front-footer-text {
    position: absolute;
    bottom: 10px;
    left: 20px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
  }
  .motto-text {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    line-height: 1.15;
  }

  /* ============ BACK CARD ============ */
  .back-header {
    background: #103554;
    color: #ffffff;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .back-title {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .header-sep {
    width: 1px;
    height: 16px;
    background: rgba(255,255,255,0.3);
  }
  .back-inst-info {
    text-align: right;
  }
  .back-inst-name {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .back-inst-grades {
    font-size: 7.5px;
    font-weight: 700;
    color: #5eead4;
    letter-spacing: 1px;
  }

  .back-body {
    padding: 12px 24px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    flex: 1;
    position: relative;
    z-index: 2;
  }
  .large-qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }
  .large-qr-box {
    width: 105px;
    height: 105px;
    padding: 6px;
    background: #ffffff;
    border: 2px solid #cbd5e1;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  }
  .large-qr-box img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .scan-label {
    font-size: 8.5px;
    font-weight: 900;
    color: #1e293b;
    letter-spacing: 1px;
    text-align: center;
    margin-top: 6px;
    text-transform: uppercase;
    line-height: 1.2;
  }

  .back-right-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .contact-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .contact-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #008b8b;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
  }
  .contact-text {
    font-size: 9.5px;
    line-height: 1.2;
  }
  .contact-lbl {
    color: #64748b;
    font-weight: 500;
    display: block;
    font-size: 9px;
  }
  .contact-val {
    font-weight: 700;
    color: #1e293b;
  }

  .back-footer-actions {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid #f1f5f9;
  }
  .return-notice {
    font-size: 8px;
    color: #64748b;
    line-height: 1.25;
  }
  .auth-sig-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .auth-sig-line {
    width: 90px;
    height: 1px;
    background: #0f172a;
    margin-top: 2px;
  }
  .auth-sig-lbl {
    font-size: 7.5px;
    color: #64748b;
    font-weight: 600;
    margin-top: 2px;
  }

  .back-bottom-banner {
    background: linear-gradient(to right, #f0fdf4, #e0f2fe, #f0fdf4);
    border-top: 1px solid #ccfbf1;
    padding: 6px 20px;
    text-align: center;
    font-size: 8.5px;
    font-weight: 900;
    color: #103554;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .watermark {
    position: absolute;
    right: 20px;
    top: 50px;
    width: 140px;
    height: 140px;
    opacity: 0.08;
    pointer-events: none;
    color: #008b8b;
  }
</style>
</head>
<body>

  <div class="page-header">
    <h1>Educational Park — Official Digital Student Identity Card</h1>
    <p>Valid & Verifiable Academic Credential · School Administration Office</p>
  </div>

  <div class="cards-container">
    <!-- ======================= FRONT OF CARD ======================= -->
    <div class="id-card">
      <div class="front-header">
        <div class="front-brand">
          <svg class="crest-logo" viewBox="0 0 40 46" fill="none">
            <path d="M20 2L4 7V22C4 32.5 10.8 40.5 20 44C29.2 40.5 36 32.5 36 22V7L20 2Z" fill="#0e2a47" stroke="#0284c7" stroke-width="1.2" />
            <path d="M12 28C14.5 26.5 17.5 26.5 20 28C22.5 26.5 25.5 26.5 28 28V33C25.5 31.5 22.5 31.5 20 33C17.5 31.5 14.5 31.5 12 33V28Z" fill="#ffffff" />
            <path d="M20 26V15" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
            <path d="M20 18C17 15 15 18 15 20C17 20.5 19 19.5 20 18Z" fill="#4ade80" />
            <path d="M20 16C23 13 25 16 25 18C23 18.5 21 17.5 20 16Z" fill="#86efac" />
          </svg>
          <div>
            <div class="school-title">EDUCATIONAL PARK</div>
            <div class="school-tagline">LEARN &nbsp;•&nbsp; PLAY &nbsp;•&nbsp; GROW &nbsp;•&nbsp; BELONG</div>
          </div>
        </div>

        <div class="header-right">
          <div class="header-motto">A BRIGHTER<br />TOMORROW<br />TOGETHER</div>
          <svg style="width:22px; height:22px; color:#00a896;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke-linecap="round" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke-linecap="round" />
            <path d="M12 6v6" stroke="#00a896" stroke-width="1.8" />
            <circle cx="12" cy="5" r="1.5" fill="#00a896" />
          </svg>
        </div>
      </div>

      <div class="front-body">
        <div class="photo-frame">
          ${photoUrl ? `<img src="${photoUrl}" alt="Photo" />` : `<div class="photo-placeholder">${studentName ? studentName[0].toUpperCase() : 'S'}</div>`}
        </div>

        <div class="accent-line"></div>

        <div class="details-col">
          <div class="detail-row">
            <span class="detail-lbl">Name:</span>
            <span class="detail-val name">${studentName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-lbl">Student ID:</span>
            <span class="detail-val" style="font-family:monospace;">${studentId}</span>
          </div>
          <div class="detail-row">
            <span class="detail-lbl">Class:</span>
            <span class="detail-val">${className} &nbsp;•&nbsp; Section ${sectionName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-lbl">Session:</span>
            <span class="detail-val">${sessionName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-lbl">Guardian:</span>
            <span class="detail-val">${guardianPhone}</span>
          </div>
        </div>

        <div class="front-right">
          <div class="signature-box">
            <svg class="sig-script" viewBox="0 0 140 38" fill="none">
              <path d="M10 28C25 15 32 8 42 12C48 15 45 28 36 29C28 30 25 18 38 12C55 4 80 32 95 20C105 12 110 8 130 14" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M18 20L40 20" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <div class="sig-label">Principal's Signature</div>
          </div>

          <div class="mini-qr-box">
            <img class="mini-qr" src="${qrDataUrl}" alt="QR" />
            <div class="card-no">Card No. ${cardNoShort}</div>
          </div>
        </div>
      </div>

      <div class="front-footer-wave">
        <svg class="wave-svg" viewBox="0 0 500 56" preserveAspectRatio="none">
          <path d="M0 26 C 140 10, 240 38, 500 18 L 500 56 L 0 56 Z" fill="#009688" />
          <path d="M0 34 C 150 18, 260 48, 500 28 L 500 56 L 0 56 Z" fill="#0e2a47" />
        </svg>

        <div class="front-footer-text">
          <svg style="width:16px; height:16px; color:#6ee7b7;" viewBox="0 0 20 20" fill="none">
            <path d="M10 18V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <path d="M10 12C7 9 5 12 5 14C7 14.5 9 13.5 10 12Z" fill="currentColor" />
            <path d="M10 10C13 7 15 10 15 12C13 12.5 11 11.5 10 10Z" fill="currentColor" />
          </svg>
          <div class="motto-text">KINDER HEARTS<br />BRIGHTER FUTURES</div>
        </div>
      </div>
    </div>

    <!-- ======================= BACK OF CARD ======================= -->
    <div class="id-card">
      <div class="back-header">
        <div class="back-title">
          <svg style="width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke-linecap="round" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke-linecap="round" />
          </svg>
          <span>STUDENT ID CARD</span>
        </div>

        <div class="header-sep"></div>

        <div style="display:flex; align-items:center; gap:8px;">
          <svg style="width:16px; height:16px; color:#5eead4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
          <div class="back-inst-info">
            <div class="back-inst-name">EDUCATIONAL PARK</div>
            <div class="back-inst-grades">PLAY TO CLASS 7</div>
          </div>
        </div>
      </div>

      <svg class="watermark" viewBox="0 0 100 120" fill="currentColor">
        <path d="M50 110 C50 70 80 40 90 10 C60 20 40 50 40 80 Z" />
        <path d="M50 80 C30 60 20 40 10 20 C25 35 35 55 45 75 Z" />
      </svg>

      <div class="back-body">
        <div class="large-qr-container">
          <div class="large-qr-box">
            <img src="${qrDataUrl}" alt="Verification QR" />
          </div>
          <div class="scan-label">SCAN FOR<br />VERIFICATION</div>
        </div>

        <div class="back-right-col">
          <div class="contact-list">
            <div class="contact-item">
              <div class="contact-icon">✉</div>
              <div class="contact-text">
                <span class="contact-lbl">Email:</span>
                <span class="contact-val">info@educationalpark.edu.bd</span>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">🌐</div>
              <div class="contact-text">
                <span class="contact-lbl">Website:</span>
                <span class="contact-val">educationalpark.tista.org</span>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">📞</div>
              <div class="contact-text">
                <span class="contact-lbl">Phone:</span>
                <span class="contact-val">+880 17 0000 0000</span>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">📍</div>
              <div class="contact-text">
                <span class="contact-lbl">Address:</span>
                <span class="contact-val">Uttara, Dhaka, Bangladesh</span>
              </div>
            </div>
          </div>

          <div class="back-footer-actions">
            <div class="return-notice">
              If found, return to:<br />
              <strong style="color:#0e2a47;">Educational Park</strong><br />
              Dhaka, Bangladesh
            </div>

            <div class="auth-sig-box">
              <svg style="height:22px; width:75px;" viewBox="0 0 100 28" fill="none">
                <path d="M5 22C18 10 24 5 32 8C38 10 35 22 28 23C20 24 22 12 34 8C48 2 68 25 80 14C88 8 92 6 98 10" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />
              </svg>
              <div class="auth-sig-line"></div>
              <div class="auth-sig-lbl">Authorized Signature</div>
            </div>
          </div>
        </div>
      </div>

      <div class="back-bottom-banner">
        SAFE STUDENTS &nbsp;•&nbsp; STRONGER TOMORROWS
      </div>
    </div>
  </div>

</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
