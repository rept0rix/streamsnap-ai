/**
 * StreamSnap AI — account service.
 *
 * Replaces "paste your API key here" with signing in.
 *
 * Asking a user to paste a billable Google API key into an extension is asking
 * them to accept a risk they cannot evaluate: the key sits in
 * chrome.storage.local as plain text, and whoever obtains it spends their money.
 * Signing in moves the credential to the server, where it belongs, and the
 * extension only ever holds a revocable session token scoped to this product.
 */

const SESSION_KEY = "sessionToken";
const PROFILE_KEY = "userProfile";

/** Configured at build time; overridable for local development. */
export const DEFAULT_API_BASE = "https://streamsnap-lens.na0ryank0.workers.dev";

export async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get(["apiBase"]);
  return (apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
}

export async function getToken() {
  const { [SESSION_KEY]: token } = await chrome.storage.local.get([SESSION_KEY]);
  return token || null;
}

export async function getProfile() {
  const { [PROFILE_KEY]: profile } = await chrome.storage.local.get([PROFILE_KEY]);
  return profile || null;
}

/**
 * Run the Google sign-in flow.
 *
 * chrome.identity.launchWebAuthFlow opens the server's /auth/start, follows it
 * through Google, and resolves once the server redirects back to this
 * extension's own chromiumapp.org URL carrying the token in the fragment. The
 * token never touches a query string, so it stays out of server logs.
 */
export async function signIn() {
  const apiBase = await getApiBase();
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl =
    `${apiBase}/auth/start?client=extension&return_to=${encodeURIComponent(redirectUri)}`;

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!result) {
        reject(new Error("Sign-in was cancelled."));
        return;
      }
      resolve(result);
    });
  });

  const fragment = responseUrl.split("#")[1] || "";
  const token = new URLSearchParams(fragment).get("token");
  if (!token) throw new Error("Sign-in did not return a session.");

  await chrome.storage.local.set({ [SESSION_KEY]: token });

  const profile = await fetchProfile();
  if (!profile?.signedIn) throw new Error("Session could not be verified.");
  return profile;
}

/** Ask the server who we are. Also refreshes the cached quota figures. */
export async function fetchProfile() {
  const token = await getToken();
  if (!token) return { signedIn: false };

  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      // Session expired or revoked server-side; drop the stale token.
      await signOutLocal();
      return { signedIn: false };
    }
    if (!response.ok) return { signedIn: false, error: `Server returned ${response.status}` };

    const data = await response.json();
    if (data.signedIn) {
      await chrome.storage.local.set({
        [PROFILE_KEY]: { ...data.user, quota: data.quota, fetchedAt: Date.now() }
      });
      registerDevice().catch(() => {});
      syncCloudState().catch(() => {});
    }
    return data;
  } catch (err) {
    // Offline: fall back to the cached profile rather than appearing signed out.
    const cached = await getProfile();
    return cached
      ? { signedIn: true, user: cached, quota: cached.quota, stale: true }
      : { signedIn: false, error: err.message };
  }
}

async function signOutLocal() {
  await chrome.storage.local.remove([SESSION_KEY, PROFILE_KEY]);
}

export async function signOut() {
  const token = await getToken();
  if (token) {
    try {
      const apiBase = await getApiBase();
      await fetch(`${apiBase}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      // Server unreachable — still clear locally so the user is signed out here.
    }
  }
  await signOutLocal();
}

/** Permanently delete the account and everything attached to it. */
export async function deleteAccount() {
  const token = await getToken();
  if (!token) throw new Error("Not signed in.");

  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Server returned ${response.status}`);
  }

  await signOutLocal();
  return true;
}

export async function saveAffiliateTag(tag) {
  const token = await getToken();
  if (!token) return { ok: false, error: "Not signed in." };

  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/account/tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ affiliateTag: tag })
  });

  return response.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
}

export async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get(["deviceId"]);
  return deviceId || null;
}

export async function registerDevice() {
  const token = await getToken();
  if (!token) return null;

  try {
    const apiBase = await getApiBase();
    let { deviceId } = await chrome.storage.local.get(["deviceId"]);
    const platformOs = typeof navigator !== "undefined" && navigator.userAgent
      ? (navigator.userAgent.includes("Mac")
        ? "macOS"
        : navigator.userAgent.includes("Win")
        ? "Windows"
        : navigator.userAgent.includes("Linux")
        ? "Linux"
        : "Desktop")
      : "Desktop";

    const response = await fetch(`${apiBase}/auth/device/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: deviceId || undefined,
        deviceType: "extension",
        deviceName: `Chrome Extension v1.6.0 (${platformOs})`,
        platformOs
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.deviceId) {
        await chrome.storage.local.set({ deviceId: data.deviceId });
        return data.deviceId;
      }
    }
  } catch (err) {
    console.warn("[StreamSnap] Device registration failed:", err);
  }
  return null;
}

export async function sendHeartbeat() {
  const token = await getToken();
  const deviceId = await getDeviceId();
  if (!token || !deviceId) return;

  try {
    const apiBase = await getApiBase();
    await fetch(`${apiBase}/auth/device/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId })
    });
  } catch (_) {}
}

export async function syncCloudState() {
  const token = await getToken();
  if (!token) return null;

  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/sync/state`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const state = await response.json();
      if (state.ok) {
        if (state.user?.isStreamer && state.user?.affiliateTag) {
          await chrome.storage.local.set({
            isStreamer: true,
            creatorAffiliateTag: state.user.affiliateTag
          });
        }
        return state;
      }
    }
  } catch (err) {
    console.warn("[StreamSnap] Cloud state sync failed:", err);
  }
  return null;
}

export async function recordSearchEvent(data) {
  const token = await getToken();
  if (!token) return;

  try {
    const apiBase = await getApiBase();
    await fetch(`${apiBase}/sync/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event: "search.record",
        data: {
          deviceType: "extension",
          streamPlatform: data.streamPlatform || "web",
          streamChannel: data.streamChannel || null,
          query: data.query || data.title || "Visual Scan",
          matchedAsin: data.asin || null,
          productTitle: data.title || null,
          confidenceScore: data.confidence || 85,
          sourceFrameUrl: data.sourceFrameUrl || null
        }
      })
    });
  } catch (_) {}
}

export async function syncCartEvent(event, data) {
  const token = await getToken();
  if (!token) return;

  try {
    const apiBase = await getApiBase();
    await fetch(`${apiBase}/sync/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, data })
    });
  } catch (_) {}
}
