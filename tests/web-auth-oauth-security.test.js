import assert from "node:assert/strict";
import test from "node:test";

import { apiClient } from "../apps/api/src/client.js";
import {
  cleanupOauthCallbackUrl,
  getTokenCandidates,
  hasOauthCallbackParams,
  oauthCallbackTokenFromUrl,
  requireSession,
} from "../apps/web/common.js";

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function installBrowserMocks(urlText) {
  const state = {
    redirectTo: null,
    replaceStateCalls: 0,
    replaceSearchAtRedirect: "",
  };
  const locationUrl = new URL(urlText);
  const location = {
    get href() {
      return locationUrl.href;
    },
    set href(value) {
      const next = new URL(value, locationUrl.origin);
      locationUrl.href = next.href;
    },
    get search() {
      return locationUrl.search;
    },
    get pathname() {
      return locationUrl.pathname;
    },
    get hash() {
      return locationUrl.hash;
    },
    replace(destination) {
      state.replaceSearchAtRedirect = locationUrl.search;
      state.redirectTo = destination;
    },
  };

  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const document = {
    title: "EazInvoice",
    cookie: "",
  };
  const windowObj = {
    location,
    localStorage,
    sessionStorage,
    history: {
      replaceState(_data, _title, nextPath) {
        state.replaceStateCalls += 1;
        const next = new URL(nextPath, locationUrl.origin);
        locationUrl.href = next.href;
      },
    },
  };

  global.window = windowObj;
  global.document = document;
  global.localStorage = localStorage;
  global.sessionStorage = sessionStorage;

  return { state, locationUrl, localStorage, sessionStorage, document };
}

function installHomeDomBootstrapMocks() {
  const locationUrl = new URL("https://eazinvoice.com/apps/web/index.html");
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const elementMap = new Map();
  function createElement() {
    return {
      hidden: false,
      textContent: "",
      href: "",
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      contains() {
        return false;
      },
    };
  }
  const document = {
    title: "EazInvoice",
    cookie: "",
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    getElementById(id) {
      if (!elementMap.has(id)) elementMap.set(id, createElement());
      return elementMap.get(id);
    },
    addEventListener() {},
  };
  const windowObj = {
    location: {
      get href() {
        return locationUrl.href;
      },
      set href(value) {
        const next = new URL(value, locationUrl.origin);
        locationUrl.href = next.href;
      },
      get search() {
        return locationUrl.search;
      },
      get pathname() {
        return locationUrl.pathname;
      },
      get hash() {
        return locationUrl.hash;
      },
      replace(destination) {
        const next = new URL(destination, locationUrl.origin);
        locationUrl.href = next.href;
      },
    },
    localStorage,
    sessionStorage,
    history: {
      replaceState(_data, _title, nextPath) {
        const next = new URL(nextPath, locationUrl.origin);
        locationUrl.href = next.href;
      },
    },
    scrollTo() {},
  };

  global.window = windowObj;
  global.document = document;
  global.localStorage = localStorage;
  global.sessionStorage = sessionStorage;
  global.Node = class {};
}

async function loadHomeModule() {
  installHomeDomBootstrapMocks();
  const moduleUrl = new URL(`../apps/web/home.js?test=${Date.now()}`, import.meta.url);
  return import(moduleUrl);
}

test("web auth source keeps Google button available for login and signup, hidden only in reset", async () => {
  const { readFileSync } = await import("node:fs");
  const authMarkup = readFileSync(new URL("../apps/web/auth.html", import.meta.url), "utf8");
  const authScript = readFileSync(new URL("../apps/web/auth.js", import.meta.url), "utf8");
  assert.match(authMarkup, /id="googleAuth"/);
  assert.match(authScript, /googleAuth\.hidden = mode === "reset"/);
  assert.match(authScript, /const oauthMode = mode === "signup" \? "signup" : "login"/);
});

test("index landing script references cache-busted home and common oauth-cleanup modules", async () => {
  const { readFileSync } = await import("node:fs");
  const indexMarkup = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");
  const homeScript = readFileSync(new URL("../apps/web/home.js", import.meta.url), "utf8");
  assert.match(indexMarkup, /<script type="module" src="\.\/home\.js\?v=20260924-oauth-cleanup"><\/script>/);
  assert.match(homeScript, /from "\.\/common\.js\?v=20260924-oauth-cleanup"/);
  assert.match(homeScript, /callbackParamsPresent: hasOauthCallbackParams\(\)/);
  assert.match(homeScript, /cleanupCallbackUrl: cleanupOauthCallbackUrl/);
});

test("oauth callback token is consumed and then removed from URL parameters", async () => {
  const browser = installBrowserMocks("https://eazinvoice.com/apps/web/index.html?token=oauth-test-token&provider=google&mode=login");
  const originalMe = apiClient.me;
  const seenTokens = [];
  try {
    apiClient.me = async (token) => {
      seenTokens.push(token);
      return { user: { id: "u1", email: "user@example.com" }, plan: { plan: "free" } };
    };
    const session = await requireSession("/apps/web/auth.html");
    assert.equal(session?.token, "oauth-test-token");
    assert.deepEqual(seenTokens, ["oauth-test-token"]);
    assert.equal(browser.locationUrl.search, "");
    assert.equal(browser.state.replaceStateCalls, 1);
    assert.equal(browser.localStorage.getItem("eazinvoice_token"), "oauth-test-token");
    assert.equal(browser.sessionStorage.getItem("eazinvoice_token"), "oauth-test-token");
  } finally {
    apiClient.me = originalMe;
  }
});

test("home landing flow consumes callback token then cleans URL while keeping user authenticated", async () => {
  const { resolveHomeAuthSession } = await loadHomeModule();
  const callbackUrl = new URL("https://eazinvoice.com/apps/web/index.html?token=oauth-token&provider=google&mode=login");
  const events = [];
  let persistedToken = "";
  let persistedUser = null;

  const result = await resolveHomeAuthSession({
    tokenCandidates: ["oauth-token"],
    callbackParamsPresent: true,
    readCachedUser: () => ({ name: "Cached User", email: "cached@example.com" }),
    verifyToken: async (token) => {
      events.push(`verify:${token}`);
      return { user: { name: "OAuth User", email: "oauth@example.com" }, plan: { plan: "free" } };
    },
    persistToken: (token) => {
      events.push(`persist-token:${token}`);
      persistedToken = token;
    },
    persistUser: (user) => {
      events.push("persist-user");
      persistedUser = user;
    },
    cleanupCallbackUrl: () => {
      events.push("cleanup");
      callbackUrl.searchParams.delete("token");
      callbackUrl.searchParams.delete("provider");
      callbackUrl.searchParams.delete("mode");
    },
    onAuthenticated: () => {
      events.push("authenticated");
    },
    onLoggedOut: () => {
      events.push("logged-out");
    },
    onFallbackAuthenticated: () => {
      events.push("fallback");
    },
    onMountAdminPlanPreview: () => {
      events.push("mount-admin-preview");
    },
    clearPersistedToken: () => {
      events.push("clear-token");
    },
  });

  assert.equal(result.status, "authenticated");
  assert.equal(persistedToken, "oauth-token");
  assert.equal(persistedUser?.email, "oauth@example.com");
  assert.deepEqual(events, [
    "fallback",
    "verify:oauth-token",
    "persist-token:oauth-token",
    "persist-user",
    "cleanup",
    "authenticated",
    "mount-admin-preview",
  ]);
  assert.equal(callbackUrl.searchParams.has("token"), false);
  assert.equal(callbackUrl.searchParams.has("provider"), false);
  assert.equal(callbackUrl.searchParams.has("mode"), false);
  assert.equal(events.includes("logged-out"), false);
});

test("missing callback token cannot authenticate and callback params are scrubbed before redirect", async () => {
  const browser = installBrowserMocks("https://eazinvoice.com/apps/web/index.html?provider=google&mode=signup");
  const originalMe = apiClient.me;
  try {
    apiClient.me = async () => {
      throw new Error("unexpected");
    };
    const session = await requireSession("/apps/web/auth.html?tab=login");
    assert.equal(session, null);
    assert.equal(browser.state.redirectTo, "/apps/web/auth.html?tab=login");
    assert.equal(browser.locationUrl.search, "");
    assert.equal(browser.state.replaceSearchAtRedirect, "");
    assert.equal(browser.state.replaceStateCalls, 1);
  } finally {
    apiClient.me = originalMe;
  }
});

test("invalid callback token on index landing clears callback params and leaves logged-out state", async () => {
  const { resolveHomeAuthSession } = await loadHomeModule();
  const callbackUrl = new URL("https://eazinvoice.com/apps/web/index.html?token=bad-token&provider=google&mode=signup");
  const events = [];

  const result = await resolveHomeAuthSession({
    tokenCandidates: ["bad-token"],
    callbackParamsPresent: true,
    readCachedUser: () => ({ name: "Cached User", email: "cached@example.com" }),
    verifyToken: async () => {
      events.push("verify-failed");
      throw new Error("invalid token");
    },
    persistToken: () => {
      events.push("persist-token");
    },
    persistUser: () => {
      events.push("persist-user");
    },
    cleanupCallbackUrl: () => {
      events.push("cleanup");
      callbackUrl.searchParams.delete("token");
      callbackUrl.searchParams.delete("provider");
      callbackUrl.searchParams.delete("mode");
    },
    onAuthenticated: () => {
      events.push("authenticated");
    },
    onLoggedOut: () => {
      events.push("logged-out");
    },
    onFallbackAuthenticated: () => {
      events.push("fallback");
    },
    onMountAdminPlanPreview: () => {
      events.push("mount-admin-preview");
    },
    clearPersistedToken: () => {
      events.push("clear-token");
    },
  });

  assert.equal(result.status, "oauth-callback-invalid");
  assert.equal(events.includes("authenticated"), false);
  assert.equal(events.includes("clear-token"), true);
  assert.equal(events.includes("logged-out"), true);
  assert.equal(callbackUrl.searchParams.has("token"), false);
  assert.equal(callbackUrl.searchParams.has("provider"), false);
  assert.equal(callbackUrl.searchParams.has("mode"), false);
});

test("oauth callback helper utilities identify and clean expected query params", () => {
  const browser = installBrowserMocks("https://eazinvoice.com/apps/web/index.html?token=abc123&provider=google&mode=signup&error=none&keep=1#anchor");
  assert.equal(oauthCallbackTokenFromUrl(), "abc123");
  assert.equal(hasOauthCallbackParams(), true);
  assert.deepEqual(getTokenCandidates(), ["abc123"]);
  cleanupOauthCallbackUrl();
  assert.equal(browser.locationUrl.search, "?keep=1");
  assert.equal(browser.locationUrl.hash, "#anchor");
});
