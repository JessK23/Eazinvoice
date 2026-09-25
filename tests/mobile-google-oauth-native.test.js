import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobileScript = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function googleBranch() {
  const match = mobileScript.match(/if \(action === "google-auth"\) \{([\s\S]*?)\n  \}/);
  return match ? match[1] : "";
}

test("mobile auth mode selector only targets auth-mode toggle controls", () => {
  assert.match(mobileScript, /const authModeButton = target\.closest\("\.auth-mode-toggle \[data-auth-mode\]"\);/);
  assert.match(mobileScript, /<div class="auth-mode-toggle" role="tablist" aria-label="Authentication options">/);
  assert.match(mobileScript, /<form id="authForm" class="form-stack" novalidate data-auth-mode="\$\{resetMode \? "reset" : signupMode \? "signup" : "login"\}">/);
});

test("mobile auth mode controls remain login-signup-reset buttons", () => {
  assert.match(mobileScript, /<button type="button" data-auth-mode="login"/);
  assert.match(mobileScript, /<button type="button" data-auth-mode="signup"/);
  assert.match(mobileScript, /<button type="button" data-auth-mode="reset"/);
  assert.match(mobileScript, /setAuthMode\(authModeButton\.dataset\.authMode\);/);
});

test("mobile google auth click still dispatches through handleAction", () => {
  assert.match(mobileScript, /const action = target\.closest\("\[data-action\]"\);/);
  assert.match(mobileScript, /void handleAction\(action\.dataset\.action, action\.dataset\);/);
  assert.match(mobileScript, /if \(action === "google-auth"\) \{/);
});

test("mobile google auth branch bypasses email-otp validation and uses auth mode", () => {
  const branch = googleBranch();
  assert.match(branch, /const mode = state\.authMode === "signup" \? "signup" : "login";/);
  assert.doesNotMatch(branch, /Enter email, password, and OTP\./);
  assert.doesNotMatch(branch, /Enter your name, email, mobile number, password, and OTP\./);
  assert.doesNotMatch(branch, /requestSubmit\(/);
});

test("mobile google auth uses absolute backend OAuth URL for native Browser.open", () => {
  assert.match(mobileScript, /return `\$\{state\.apiBase\}\/auth\/google\/start\?mode=\$\{encodeURIComponent\(safeMode\)\}&client=mobile`;/);
  assert.match(mobileScript, /const authUrl = api\.startGoogleOAuth\(mode\);/);
  assert.match(mobileScript, /const browser = window\.Capacitor\?\.Plugins\?\.Browser;/);
  assert.match(mobileScript, /await browser\.open\(\{ url: authUrl \}\);/);
});

test("mobile oauth callback binding uses Capacitor App plugin appUrlOpen", () => {
  assert.equal(Boolean(packageJson.dependencies?.["@capacitor/app"]), true);
  assert.match(mobileScript, /const appPlugin = window\.Capacitor\?\.Plugins\?\.App;/);
  assert.match(mobileScript, /appPlugin\.addListener\("appUrlOpen", \(event\) => \{/);
  assert.match(mobileScript, /if \(!event\?\.url\) return;/);
  assert.match(mobileScript, /void applyExternalOAuth\(event\.url\);/);
});

test("mobile oauth callback consumes token, validates via refreshSessionAndData, and hydrates auth state", () => {
  assert.match(mobileScript, /function oauthCallbackDataFromUrl\(urlText = ""\)/);
  assert.match(mobileScript, /const token = parsed\.searchParams\.get\("token"\) \|\| "";/);
  assert.match(mobileScript, /if \(!token && !error\) return null;/);
  assert.match(mobileScript, /state\.token = payload\.token;/);
  assert.match(mobileScript, /const refreshed = await refreshSessionAndData\(\{ quietUnauthorized: true \}\);/);
  assert.match(mobileScript, /if \(!refreshed\) \{[\s\S]*Google sign-in did not complete\. Please try again\./);
  assert.match(mobileScript, /setStatus\("Signed in with Google\.", "success", "home"\);/);
});

test("mobile oauth callback is single-use and cannot silently replay", () => {
  assert.match(mobileScript, /if \(!state\.oauthInFlight\) \{[\s\S]*Google sign-in session expired\. Please try again\./);
  assert.match(mobileScript, /if \(payload\.token === state\.lastConsumedOauthToken\) \{[\s\S]*already used/);
  assert.match(mobileScript, /state\.lastConsumedOauthToken = payload\.token;/);
  assert.match(mobileScript, /state\.oauthInFlight = false;/);
  assert.match(mobileScript, /async function logout\(renderAfter = true\) \{[\s\S]*state\.oauthInFlight = false;/);
});

test("mobile google button is type=button and not a form submit control", () => {
  assert.match(mobileScript, /<button class="secondary full google-auth" type="button" data-action="google-auth"><img class="google-icon" src="\.\/assets\/google-logo-g\.webp" alt="" aria-hidden="true" \/><span>Continue with Google<\/span><\/button>/);
  assert.doesNotMatch(mobileScript, /<button class="secondary full google-auth" type="submit"/);
});

test("mobile auth screens keep top branding and hide auth-only chrome controls", () => {
  assert.doesNotMatch(mobileScript, /<div class="auth-brand-lockup" aria-hidden="true">/);
  assert.match(mobileScript, /document\.getElementById\("topAppBar"\)\?\.toggleAttribute\("hidden", false\);/);
  assert.match(mobileScript, /document\.getElementById\("workspaceBar"\)\?\.toggleAttribute\("hidden", !state\.token\);/);
  assert.match(mobileScript, /if \(dom\.menuButton\) dom\.menuButton\.hidden = !state\.token;/);
  assert.match(mobileScript, /if \(dom\.profileButton\) dom\.profileButton\.hidden = !state\.token;/);
});

test("mobile native runtime uses Browser plugin path without registerPlugin fallback", () => {
  assert.doesNotMatch(mobileScript, /registerPlugin\("Browser"\)/);
  assert.match(mobileScript, /const isCapacitorShell = location\.protocol === "capacitor:" \|\| location\.hostname === "localhost" \|\| Boolean\(window\.Capacitor\);/);
  assert.match(mobileScript, /if \(isCapacitorShell\) \{[\s\S]*Google sign-in is unavailable on this device\. Please retry\.[\s\S]*return;[\s\S]*\}[\s\S]*window\.location\.href = authUrl;/);
});

