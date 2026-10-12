import fs from 'fs';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';

/**
 * Returns optimized Puppeteer launch options that work consistently across
 * local development (Windows/macOS) and production container environments (Railway/Docker/Alpine/Linux).
 */
export function getPuppeteerLaunchOptions(): Parameters<typeof puppeteer.launch>[0] {
  const candidatePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean) as string[];

  let executablePath: string | undefined = undefined;

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }

  // If not found in standard paths and running on Linux, try finding in PATH
  if (!executablePath && process.platform === 'linux') {
    try {
      const found = execSync('which chromium || which chromium-browser || which google-chrome-stable || true', {
        encoding: 'utf-8',
      }).trim();
      if (found && fs.existsSync(found)) {
        executablePath = found;
      }
    } catch {
      // Ignore error and fall back to default
    }
  }

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  };
}
