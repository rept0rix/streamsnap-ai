/**
 * StreamSnap AI — Cloudflare Worker API client
 *
 * Connects to the existing /resolve endpoint and auth routes.
 */

const WORKER_URL = "https://streamsnap-lens.na0ryank0.workers.dev";

export interface Product {
  title: string;
  asin?: string | null;
  url: string;
  /** Catalog (Amazon listing) image. Never a video frame. */
  imageUrl?: string | null;
  price?: string | null;
  /** True when `price` is the vision model's estimate, not a listing price. */
  priceEstimated?: boolean;
  source: "amazon" | "other" | string;
  confidence?: number;
  /** True when an Amazon listing (ASIN) was verified for this detection. */
  verified?: boolean;
  /** Title of the matched Amazon listing, when verified. */
  matchedTitle?: string | null;
  matchReason?: string | null;
  videoTitle?: string | null;
  videoUrl?: string | null;
  /** Data URL of the video frame (or tight crop) this product was seen in. */
  frameImage?: string | null;
  /** Data URL of the box_2d crop around the product, when available. */
  sourceCrop?: string | null;
  /** True when the live scan fired because the viewer paused the video. */
  capturedOnPause?: boolean;
}

export interface ResolveResult {
  ok: boolean;
  cached: boolean;
  products: Product[];
  others: Product[];
  count: number;
  error?: string;
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
  quota?: { used: number; limit: number; remaining: number };
}

// ---------------------------------------------------------------------------
// Core: resolve an image to products
// ---------------------------------------------------------------------------

export async function resolve(
  imageBase64: string,
  installId: string,
  token?: string | null
): Promise<ResolveResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${WORKER_URL}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ image: imageBase64, installId })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Worker error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<ResolveResult>;
}

export async function resolveUrl(
  url: string,
  installId: string,
  token?: string | null
): Promise<ResolveResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${WORKER_URL}/resolve-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, installId })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Worker error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<ResolveResult>;
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

export async function registerMobileDevice(
  token: string,
  platformOs: string = "Mobile",
  existingDeviceId?: string | null
): Promise<{ ok: boolean; deviceId?: string; error?: string }> {
  try {
    const response = await fetch(`${WORKER_URL}/auth/device/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        deviceId: existingDeviceId || undefined,
        deviceType: "mobile",
        deviceName: `StreamSnap Mobile (${platformOs})`,
        platformOs
      })
    });
    return response.json();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function sendMobileHeartbeat(
  token: string,
  deviceId: string
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${WORKER_URL}/auth/device/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ deviceId })
    });
    return response.json();
  } catch {
    return { ok: false };
  }
}

export async function getSyncState(
  token: string
): Promise<{
  ok: boolean;
  user?: any;
  savedProducts?: any[];
  cartItems?: any[];
  recentSearches?: any[];
  devices?: any[];
  gear?: any[];
  settings?: any;
  error?: string;
}> {
  try {
    const response = await fetch(`${WORKER_URL}/sync/state`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.json();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function sendSyncEvent(
  token: string,
  event: string,
  data: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${WORKER_URL}/sync/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ event, data })
    });
    return response.json();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
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
