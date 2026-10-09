import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

async function startServer(options = {}) {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, ...options, store: options.store || createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { response, payload: await response.json() };
}

test("production OTP response never exposes the generated code", async () => {
  const { server, baseUrl } = await startServer({ exposeDevelopmentOtp: false });
  try {
    const result = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "secure-otp@example.com" });
    assert.equal(result.response.status, 200);
    assert.equal(Object.hasOwn(result.payload, "devOtp"), false);
    assert.equal(Object.hasOwn(result.payload, "otp"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("signup OTP is not application-autofilled and resend invalidates the previous code", async () => {
  const authSource = await fs.readFile(new URL("../apps/web/auth.js", import.meta.url), "utf8");
  assert.doesNotMatch(authSource, /response\.devOtp/);
  assert.doesNotMatch(authSource, /otpInput\.value\s*=\s*response/);

  const { server, baseUrl } = await startServer({ exposeDevelopmentOtp: true });
  try {
    const first = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "resend-otp@example.com" });
    const second = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "resend-otp@example.com" });
    assert.match(first.payload.devOtp, /^\d{6}$/);
    assert.match(second.payload.devOtp, /^\d{6}$/);
    const stale = await request(baseUrl, "/auth/signup", { name: "Stale", email: "resend-otp@example.com", password: "Secure123", phone: "9876543210", otp: first.payload.devOtp });
    assert.equal(stale.response.status, 401);
    const current = await request(baseUrl, "/auth/signup", { name: "Current", email: "resend-otp@example.com", password: "Secure123", phone: "9876543210", otp: second.payload.devOtp });
    assert.equal(current.response.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("OTP is one-time and invalid attempts are bounded", async () => {
  const { server, baseUrl } = await startServer({ exposeDevelopmentOtp: true });
  try {
    const issued = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "bounded-otp@example.com" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await request(baseUrl, "/auth/signup", { name: "Bounded", email: "bounded-otp@example.com", password: "Secure123", phone: "9876543210", otp: "000000" });
      assert.equal(invalid.response.status, 401);
    }
    const blocked = await request(baseUrl, "/auth/signup", { name: "Bounded", email: "bounded-otp@example.com", password: "Secure123", phone: "9876543210", otp: issued.payload.devOtp });
    assert.equal(blocked.response.status, 401);
    assert.match(blocked.payload.error, /request a new OTP|expired|invalid/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company signup preserves registrant mapping and does not create a partial account on invalid registrant data", async () => {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const { server, baseUrl } = await startServer({ exposeDevelopmentOtp: true, store });
  try {
    const invalidOtp = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "invalid-company@example.com" });
    const invalid = await request(baseUrl, "/auth/signup", { name: "Company Owner", email: "invalid-company@example.com", password: "Secure123", phone: "9876543210", otp: invalidOtp.payload.devOtp, subscriberType: "company", registrantName: "Owner", registrantDesignation: "Director", registrantEmail: "owner@example.com", registrantPhone: "123" });
    assert.equal(invalid.response.status, 400);
    assert.equal(store.exportState().users.length, 0);

    const validOtp = await request(baseUrl, "/auth/email-otp/request", { mode: "signup", email: "valid-company@example.com" });
    const valid = await request(baseUrl, "/auth/signup", { name: "Company Owner", email: "valid-company@example.com", password: "Secure123", phone: "9876543210", otp: validOtp.payload.devOtp, subscriberType: "company", registrantName: "Owner", registrantDesignation: "Director", registrantEmail: "owner@example.com", registrantPhone: "9876543210" });
    assert.equal(valid.response.status, 201);
    assert.deepEqual(valid.payload.user.registrant, { name: "Owner", designation: "Director", email: "owner@example.com", phone: "919876543210" });
    assert.equal(store.exportState().users.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
