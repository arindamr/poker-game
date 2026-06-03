#!/usr/bin/env node
/**
 * Driver for the poker-game web app (frontend + backend).
 * Usage: node driver.mjs <command> [args]
 *
 * Commands:
 *   screenshot [path]   - Take a screenshot of the home page
 *   login [email] [pw]  - Log in and screenshot the dashboard
 *   lobby               - Navigate to the lobby and screenshot
 *   register [email] [pw] [name] - Register a new user
 *   flow                - Run a full golden-path flow: login → lobby → screenshot
 *   api <path>          - Hit the backend API (GET) and print JSON
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3002';
const SS_DIR = process.env.SS_DIR || '/tmp/poker-screenshots';

const [,, cmd, ...args] = process.argv;

async function mkdirp(dir) {
  const { mkdirSync } = await import('fs');
  try { mkdirSync(dir, { recursive: true }); } catch {}
}

async function screenshot(page, name) {
  await mkdirp(SS_DIR);
  const path = resolve(SS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
  return path;
}

async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  return res.json();
}

async function login(page, email, password) {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  // wait for navigation away from login
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
}

const commands = {
  async screenshot() {
    const [ssPath = 'home'] = args;
    await withBrowser(async page => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');
      await screenshot(page, ssPath);
    });
  },

  async login() {
    const [email = 'test@example.com', password = 'Demo@123456'] = args;
    await withBrowser(async page => {
      await login(page, email, password);
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'after-login');
    });
  },

  async register() {
    const [email = `user${Date.now()}@example.com`, password = 'Demo@123456', name = 'TestUser'] = args;
    await withBrowser(async page => {
      await page.goto(`${FRONTEND_URL}/register`);
      await page.waitForLoadState('networkidle');
      // fill form
      const nameField = page.locator('input[name="username"], input[name="name"], input[placeholder*="name" i]').first();
      await nameField.fill(name);
      await page.fill('input[type="email"], input[name="email"]', email);
      const pwFields = await page.locator('input[type="password"]').all();
      for (const f of pwFields) await f.fill(password);
      await screenshot(page, 'register-filled');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      await screenshot(page, 'after-register');
      console.log(`registered: ${email} / ${password}`);
    });
  },

  async lobby() {
    const [email = 'test@example.com', password = 'Demo@123456'] = args;
    await withBrowser(async page => {
      await login(page, email, password);
      await page.goto(`${FRONTEND_URL}/lobby`);
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'lobby');
    });
  },

  async flow() {
    const [email = 'test@example.com', password = 'Demo@123456'] = args;
    await withBrowser(async page => {
      // 1. Home page
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'flow-1-home');

      // 2. Login
      await login(page, email, password);
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'flow-2-dashboard');

      // 3. Lobby
      await page.goto(`${FRONTEND_URL}/lobby`);
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'flow-3-lobby');

      console.log('flow complete — screenshots in', SS_DIR);
    });
  },

  async api() {
    const [path = '/health'] = args;
    const data = await apiGet(path);
    console.log(JSON.stringify(data, null, 2));
  },
};

if (!cmd || !commands[cmd]) {
  console.error(`Usage: node driver.mjs <${Object.keys(commands).join('|')}> [args...]`);
  process.exit(1);
}

commands[cmd]().catch(err => { console.error(err); process.exit(1); });
