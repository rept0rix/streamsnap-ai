/**
 * StreamSnap AI — Cloudflare Worker API client
 *
 * Connects to the existing /resolve endpoint and auth routes.
 */

const WORKER_URL = "https://streamsnap-lens.na0ryank0.workers.dev";

export interface Product {
  title: string;
  asin?: string;
  url: string;
  imageUrl?: string;
  price?: string;
  source: "amazon" | "other";
  confidence?: number;
}

/** Balance the Worker attaches to every metered response (null with your own key). */
export interface Quota {
  plan: "anon" | "free" | "pro" | string;
  period: "lifetime" | "month";
  used: number;
  limit: number;
  remaining: number;
  credits: number;
  available: number;
  exhausted: boolean;
  signedIn: boolean;
}

export interface ResolveResult {
  ok: boolean;
  cached: boolean;
  products: Product[];
  others: Product[];
  count: number;
  engine?: string;
  /** True when the scan ran on the user's own Gemini key (never metered). */
  byoKey?: boolean;
  quota?: Quota | null;
  error?: string;
}

export interface ScanPackage {
  id: string;
  name: string;
  credits: number;
  amountCents: number;
  currency: string;
  popular: boolean;
  blurb?: string;
}

export interface BillingInfo {
  ok: boolean;
  purchasesEnabled: boolean;
  freeTrialScans: number;
  byoKeySupported: boolean;
  upgradeUrl: string;
  packages: ScanPackage[];
}

/** Where scan packs are bought when the Worker does not say otherwise. */
export const ACCOUNT_PLANS_URL = "https://streamsnap.online/account.html#shopper-plans";

/**
 * A non-2xx answer from the Worker, with the paywall fields a 402 carries so
 * screens can offer the right way out (sign in / buy a pack / own key).
 */
export class ApiError extends Error {
  status: number;
  code: string | null;
  needsSignIn: boolean;
  needsUpgrade: boolean;
  canUseOwnKey: boolean;
  upgradeUrl: string | null;
  quota: Quota | null;

  constructor(status: number, body: any, fallback: string) {
    super(body?.error || fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? (status === 402 ? "QUOTA_EXHAUSTED" : null);
    this.needsSignIn = Boolean(body?.needsSignIn);
    this.needsUpgrade = Boolean(body?.needsUpgrade);
    this.canUseOwnKey = Boolean(body?.canUseOwnKey);
    this.upgradeUrl = body?.upgradeUrl ?? null;
    this.quota = body?.quota ?? null;
  }

  /** Out of scans (either "sign in for the trial" or "buy a pack"). */
  get isPaywall(): boolean {
    return this.status === 402 || this.code === "QUOTA_EXHAUSTED" || this.code === "TRIAL_EXHAUSTED_SIGN_IN";
  }

  /** The user's own Gemini key was refused or failed. */
  get isOwnKeyProblem(): boolean {
    return this.code === "BYO_KEY_REJECTED" || this.code === "BYO_KEY_FAILED";
  }
}

export interface ResolveOptions {
  /** The user's own Gemini key. Sent as X-Gemini-Key; the scan is then never metered. */
  geminiKey?: string | null;
}

async function throwForStatus(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new ApiError(response.status, body, `${fallback} (${response.status})`);
}

function resolveHeaders(token?: string | null, options?: ResolveOptions): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const key = (options?.geminiKey || "").trim();
  if (key) headers["X-Gemini-Key"] = key;
  return headers;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: string;
  role: string;
  affiliateTag?: string;
}

export interface AuthMeResult {
  ok: boolean;
  signedIn: boolean;
  user?: UserProfile;
  quota?: Quota;
}

// ---------------------------------------------------------------------------
// Core: resolve an image to products
// ---------------------------------------------------------------------------

export async function resolve(
  imageBase64: string,
  installId: string,
  token?: string | null,
  options?: ResolveOptions
): Promise<ResolveResult> {
  const response = await fetch(`${WORKER_URL}/resolve`, {
    method: "POST",
    headers: resolveHeaders(token, options),
    body: JSON.stringify({ image: imageBase64, installId })
  });

  if (!response.ok) await throwForStatus(response, "Scan failed");
  return response.json() as Promise<ResolveResult>;
}

export async function resolveUrl(
  url: string,
  installId: string,
  token?: string | null,
  options?: ResolveOptions
): Promise<ResolveResult> {
  const response = await fetch(`${WORKER_URL}/resolve-url`, {
    method: "POST",
    headers: resolveHeaders(token, options),
    body: JSON.stringify({ url, installId })
  });

  if (!response.ok) await throwForStatus(response, "Scan failed");
  return response.json() as Promise<ResolveResult>;
}

/** Public: scan packs, trial size, whether purchases are live. */
export async function fetchBillingInfo(): Promise<BillingInfo | null> {
  try {
    const response = await fetch(`${WORKER_URL}/billing/packages`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json()) as BillingInfo;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth: who am I
// ---------------------------------------------------------------------------

export async function getMe(token: string): Promise<AuthMeResult> {
  const response = await fetch(`${WORKER_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json() as Promise<AuthMeResult>;
}

// ---------------------------------------------------------------------------
// Auth: start OAuth flow
// Returns the URL to open in a browser for Google sign-in.
// The worker redirects back to streamsnap://auth/callback#token=...
// ---------------------------------------------------------------------------

export function buildAuthStartUrl(returnTo: string): string {
  const params = new URLSearchParams({
    client: "mobile",
    return_to: returnTo
  });
  return `${WORKER_URL}/auth/start?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Account: update affiliate tag
// ---------------------------------------------------------------------------

export async function updateAffiliateTag(
  token: string,
  affiliateTag: string
): Promise<{ ok: boolean; affiliateTag?: string; error?: string }> {
  const response = await fetch(`${WORKER_URL}/account/tag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ affiliateTag })
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Products: get saved history from cloud
// ---------------------------------------------------------------------------

export async function getUserProducts(token: string): Promise<{ ok: boolean; products?: any[]; error?: string }> {
  const response = await fetch(`${WORKER_URL}/user/products`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
