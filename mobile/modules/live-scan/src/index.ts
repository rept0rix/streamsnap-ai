import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type LiveScanProduct = {
  id?: string;
  title: string;
  asin?: string;
  url?: string;
  imageUrl?: string;
  price?: string;
  source?: "amazon" | "other" | string;
  confidence?: number;
  seenCount?: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
};

export type LiveScanState = {
  available: boolean;
  broadcasting: boolean;
  screenCaptured: boolean;
  scanCount: number;
  findCount: number;
  okCount: number;
  failCount: number;
  skipCount: number;
  lastError: string | null;
  lastPhase: string | null;
  lastStatus: number;
  lastBody: string | null;
  lastJpegBytes: number;
  startedAt: number | null;
  lastFrameAt: number | null;
  workerUrl: string | null;
  installId: string | null;
  hasToken: boolean;
  products: LiveScanProduct[];
};

const EMPTY_STATE: LiveScanState = {
  available: false,
  broadcasting: false,
  screenCaptured: false,
  scanCount: 0,
  findCount: 0,
  okCount: 0,
  failCount: 0,
  skipCount: 0,
  lastError: null,
  lastPhase: null,
  lastStatus: 0,
  lastBody: null,
  lastJpegBytes: 0,
  startedAt: null,
  lastFrameAt: null,
  workerUrl: null,
  installId: null,
  hasToken: false,
  products: []
};

type LiveScanNative = {
  isAvailable(): boolean;
  getState(): LiveScanState;
  startBroadcast(): Promise<void>;
  syncCredentials(token: string | null, installId: string, workerUrl: string): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;
  addListener(event: string, listener: (event: LiveScanState) => void): { remove: () => void };
};

function loadNative(): LiveScanNative | null {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule("LiveScan") as LiveScanNative;
  } catch {
    return null;
  }
}

const native = loadNative();

export function isLiveScanAvailable(): boolean {
  return Platform.OS === "ios" && !!native?.isAvailable();
}

export function getLiveScanState(): LiveScanState {
  if (!native) return EMPTY_STATE;
  return normalize(native.getState());
}

export async function startLiveBroadcast(): Promise<void> {
  if (!native) {
    throw new Error("Live background scan is only available in a native iOS build.");
  }
  await native.startBroadcast();
}

export async function syncLiveScanCredentials(opts: {
  token?: string | null;
  installId: string;
  workerUrl: string;
}): Promise<void> {
  if (!native) return;
  await native.syncCredentials(opts.token ?? null, opts.installId, opts.workerUrl);
}

export async function requestLiveScanNotifications(): Promise<boolean> {
  if (!native) return false;
  return native.requestNotificationPermission();
}

export function addLiveScanListener(
  listener: (state: LiveScanState) => void
): { remove: () => void } {
  if (!native?.addListener) {
    return { remove() {} };
  }
  return native.addListener("onUpdate", (event) => listener(normalize(event)));
}

function normalize(raw: Partial<LiveScanState> | null | undefined): LiveScanState {
  return {
    available: raw?.available ?? false,
    broadcasting: raw?.broadcasting ?? false,
    screenCaptured: raw?.screenCaptured ?? false,
    scanCount: raw?.scanCount ?? 0,
    findCount: raw?.findCount ?? 0,
    okCount: raw?.okCount ?? 0,
    failCount: raw?.failCount ?? 0,
    skipCount: raw?.skipCount ?? 0,
    lastError: raw?.lastError ?? null,
    lastPhase: raw?.lastPhase ?? null,
    lastStatus: raw?.lastStatus ?? 0,
    lastBody: raw?.lastBody ?? null,
    lastJpegBytes: raw?.lastJpegBytes ?? 0,
    startedAt: raw?.startedAt ?? null,
    lastFrameAt: raw?.lastFrameAt ?? null,
    workerUrl: raw?.workerUrl ?? null,
    installId: raw?.installId ?? null,
    hasToken: raw?.hasToken ?? false,
    products: Array.isArray(raw?.products) ? raw.products : []
  };
}
