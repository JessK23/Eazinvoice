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

test("web auth source keeps Google button available for login and signup, hidden only in reset", async () => {
  const { readFileSync } = await import("node:fs");
  const authMarkup = readFileSync(new URL("../apps/web/auth.html", import.meta.url), "utf8");
  const authScript = readFileSync(new URL("../apps/web/auth.js", import.meta.url), "utf8");
  assert.match(authMarkup, /id="googleAuth"/);
  assert.match(authScript, /googleAuth\.hidden = mode === "reset"/);
  assert.match(authScript, /const oauthMode = mode === "signup" \? "signup" : "login"/);
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

test("oauth callback helper utilities identify and clean expected query params", () => {
  const browser = installBrowserMocks("https://eazinvoice.com/apps/web/index.html?token=abc123&provider=google&mode=signup&error=none&keep=1#anchor");
  assert.equal(oauthCallbackTokenFromUrl(), "abc123");
  assert.equal(hasOauthCallbackParams(), true);
  assert.deepEqual(getTokenCandidates(), ["abc123"]);
  cleanupOauthCallbackUrl();
  assert.equal(browser.locationUrl.search, "?keep=1");
  assert.equal(browser.locationUrl.hash, "#anchor");
});
