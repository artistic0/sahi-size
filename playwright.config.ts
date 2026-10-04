import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the production build, served exactly like GitHub Pages serves it
 * (under /sahi-size/, with no security headers), so they prove the in-page CSP and the worker
 * lockdown hold on their own.
 */
const PORT = 4339
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/sahi-size/`,
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, testIgnore: /(mobile|engine)\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    // Canvas JPEG encoders differ between engines; the exact-size promise must hold in all three.
    { name: 'engine-chromium', use: { ...devices['Desktop Chrome'] }, testMatch: /engine\.spec\.ts/ },
    { name: 'engine-webkit', use: { ...devices['Desktop Safari'] }, testMatch: /engine\.spec\.ts/ },
    // Playwright's Firefox needs the Microsoft Visual C++ runtime on Windows; CI (Linux) always runs it.
    ...(process.env.CI || process.env.FIREFOX ? [{ name: 'engine-firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /engine\.spec\.ts/ }] : []),
  ],
  webServer: {
    command: `node tools/static-server.mjs ${PORT} /sahi-size/`,
    url: `http://localhost:${PORT}/sahi-size/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
