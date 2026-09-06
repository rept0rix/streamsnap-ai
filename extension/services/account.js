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

/** Where scan packs are bought. The Worker's 402 also carries this URL. */
export const ACCOUNT_PLANS_URL = "https://streamsnap.online/account.html#shopper-plans";

/** Public: pack catalogue, trial size and whether purchases are live. */
export async function fetchBillingInfo() {
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/billing/packages`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

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
        [PROFILE_KEY]: { ...data.user, quota: data.quota, fetchedAt: Date.now() },
        [QUOTA_KEY]: data.quota ? { ...data.quota, fetchedAt: Date.now() } : null
      });
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

const QUOTA_KEY = "lastQuota";

/**
 * Every /resolve answer carries the caller's quota. Keep the latest one so the
 * panel can show "87 of 100 free scans left" without a round trip — for
 * anonymous installs too, which have no profile to hang it on.
 */
export async function rememberQuota(quota) {
  if (!quota || typeof quota !== "object") return;
  const stamped = { ...quota, fetchedAt: Date.now() };
  const updates = { [QUOTA_KEY]: stamped };
  const profile = await getProfile();
  if (profile) updates[PROFILE_KEY] = { ...profile, quota: stamped };
  await chrome.storage.local.set(updates);
}

export async function getQuota() {
  const { [QUOTA_KEY]: quota } = await chrome.storage.local.get([QUOTA_KEY]);
  return quota || null;
}

async function signOutLocal() {
  await chrome.storage.local.remove([SESSION_KEY, PROFILE_KEY, QUOTA_KEY]);
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
