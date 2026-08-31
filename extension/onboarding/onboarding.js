/**
 * StreamSnap AI — Onboarding Controller
 *
 * Handles the 4-step welcome wizard:
 *  1. Welcome & Feature Highlights
 *  2. Google OAuth Authentication (via account.js & chrome.identity)
 *  3. Configuration (Affiliate Tag, Floating Video Controls, Auto-Scan, Confidence)
 *  4. Quick Guide & Chrome Toolbar Pinning
 */

import {
  signIn,
  signOut,
  fetchProfile,
  saveAffiliateTag
} from "../services/account.js";

let currentStep = 1;
const TOTAL_STEPS = 4;
let maxVisitedStep = 1;

document.addEventListener("DOMContentLoaded", () => {
  initStepper();
  initStepNavigation();
  initAuth();
  initSettings();
  initFinalActions();
  loadInitialData();
});

// ---------------------------------------------------------------------------
// Stepper Navigation
// ---------------------------------------------------------------------------

function goToStep(step) {
  if (step < 1 || step > TOTAL_STEPS) return;
  currentStep = step;
  maxVisitedStep = Math.max(maxVisitedStep, step);

  // Update panes
  document.querySelectorAll(".wizard-step-pane").forEach((pane, idx) => {
    if (idx + 1 === step) {
      pane.classList.add("active");
    } else {
      pane.classList.remove("active");
    }
  });

  // Update stepper navigation
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const stepEl = document.getElementById(`step-nav-${i}`);
    const lineEl = document.getElementById(`step-line-${i}`);

    if (stepEl) {
      stepEl.classList.remove("active", "completed");
      if (i === step) {
        stepEl.classList.add("active");
      } else if (i < step) {
        stepEl.classList.add("completed");
      }

      // Allow clicking previously visited steps
      if (i <= maxVisitedStep) {
        stepEl.classList.add("clickable");
      } else {
        stepEl.classList.remove("clickable");
      }
    }

    if (lineEl) {
      if (i < step) {
        lineEl.classList.add("completed");
      } else {
        lineEl.classList.remove("completed");
      }
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initStepper() {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const stepEl = document.getElementById(`step-nav-${i}`);
    if (stepEl) {
      stepEl.addEventListener("click", () => {
        if (i <= maxVisitedStep) {
          goToStep(i);
        }
      });
    }
  }
}

function initStepNavigation() {
  // Step 1 -> Step 2
  document.getElementById("btn-goto-step-2")?.addEventListener("click", () => {
    goToStep(2);
  });

  // Step 2 -> Step 1
  document.getElementById("btn-back-step-1")?.addEventListener("click", () => {
    goToStep(1);
  });

  // Step 2 -> Step 3
  document.getElementById("btn-goto-step-3")?.addEventListener("click", () => {
    goToStep(3);
  });
  document.getElementById("btn-skip-auth")?.addEventListener("click", () => {
    goToStep(3);
  });

  // Step 3 -> Step 2
  document.getElementById("btn-back-step-2")?.addEventListener("click", () => {
    goToStep(2);
  });

  // Step 3 -> Step 4 (Saves settings automatically)
  document.getElementById("btn-goto-step-4")?.addEventListener("click", async () => {
    await saveAllSettings();
    goToStep(4);
  });

  // Step 4 -> Step 3
  document.getElementById("btn-back-step-3")?.addEventListener("click", () => {
    goToStep(3);
  });

  // Skip All buttons
  document.getElementById("skip-all-btn")?.addEventListener("click", () => {
    completeOnboarding(true);
  });
}

// ---------------------------------------------------------------------------
// Google Sign-In & Authentication
// ---------------------------------------------------------------------------

function renderAuthState(profile) {
  const signedIn = Boolean(profile?.signedIn);
  const signedOutCard = document.getElementById("auth-signed-out-card");
  const signedInCard = document.getElementById("auth-signed-in-card");

  if (signedOutCard) signedOutCard.style.display = signedIn ? "none" : "block";
  if (signedInCard) signedInCard.style.display = signedIn ? "block" : "none";

  if (!signedIn) return;

  const user = profile.user || {};
  const nameEl = document.getElementById("user-name-text");
  const emailEl = document.getElementById("user-email-text");
  const avatarEl = document.getElementById("user-avatar-img");
  const planBadge = document.getElementById("user-plan-badge");
  const quotaText = document.getElementById("user-quota-text");
  const quotaFill = document.getElementById("user-quota-fill");

  if (nameEl) nameEl.textContent = user.name || "Google User";
  if (emailEl) emailEl.textContent = user.email || "";
  if (planBadge) planBadge.textContent = (user.plan || "free").toUpperCase() + " TIER";

  if (avatarEl) {
    if (user.avatarUrl) {
      avatarEl.src = user.avatarUrl;
      avatarEl.style.display = "block";
      avatarEl.addEventListener("error", () => { avatarEl.style.display = "none"; }, { once: true });
    } else {
      avatarEl.style.display = "none";
    }
  }

  const quota = profile.quota || {};
  const used = quota.used ?? 0;
  const limit = quota.limit ?? 100;

  if (quotaText) {
    quotaText.textContent = `${used} of ${limit} scans used this month`;
  }

  if (quotaFill && limit > 0) {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    quotaFill.style.width = `${pct}%`;
  }

  if (user.affiliateTag) {
    const tagInput = document.getElementById("onboarding-affiliate-tag");
    if (tagInput && !tagInput.value) tagInput.value = user.affiliateTag;
  }
}

function showAuthError(msg) {
  const errorEl = document.getElementById("onboarding-signin-error");
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = msg ? "block" : "none";
}

function initAuth() {
  const googleBtn = document.getElementById("onboarding-google-signin-btn");
  const btnText = document.getElementById("google-btn-text");
  const signoutBtn = document.getElementById("onboarding-signout-btn");
  const saveKeyBtn = document.getElementById("onboarding-save-gemini-key-btn");
  const keyInput = document.getElementById("onboarding-gemini-key-input");
  const keyStatus = document.getElementById("onboarding-key-status");

  googleBtn?.addEventListener("click", async () => {
    googleBtn.disabled = true;
    if (btnText) btnText.textContent = "Opening Google Sign-In…";
    showAuthError("");

    try {
      const profile = await signIn();
      renderAuthState(profile);
      showToast("Signed in successfully with Google! 🎉");
    } catch (err) {
      console.warn("[StreamSnap Onboarding] Auth error:", err);
      showAuthError(err.message || "Google sign-in was cancelled or failed.");
    } finally {
      googleBtn.disabled = false;
      if (btnText) btnText.textContent = "Continue with Google";
    }
  });

  signoutBtn?.addEventListener("click", async () => {
    await signOut();
    renderAuthState({ signedIn: false });
    showToast("Signed out of Google account.");
  });

  saveKeyBtn?.addEventListener("click", () => {
    const key = keyInput?.value?.trim() || "";
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      if (keyStatus) {
        keyStatus.textContent = key ? "Custom Gemini key saved ✓" : "No key set";
        keyStatus.style.color = key ? "#10B981" : "#F59E0B";
      }
      showToast("Gemini API key updated.");
    });
  });
}

// ---------------------------------------------------------------------------
// Settings & Preferences
// ---------------------------------------------------------------------------

function initSettings() {
  const tagInput = document.getElementById("onboarding-affiliate-tag");
  const saveTagBtn = document.getElementById("onboarding-save-tag-btn");
  const floatingToggle = document.getElementById("onboarding-floating-controls");
  const autoScanSelect = document.getElementById("onboarding-auto-scan-select");
  const confSlider = document.getElementById("onboarding-conf-slider");
  const confBadge = document.getElementById("onboarding-conf-badge");

  confSlider?.addEventListener("input", () => {
    if (confBadge) confBadge.textContent = `${confSlider.value}%`;
  });

  saveTagBtn?.addEventListener("click", async () => {
    const raw = tagInput?.value?.trim() || "";
    if (raw && !/^[A-Za-z0-9_-]{3,25}$/.test(raw)) {
      tagInput?.setCustomValidity("Use 3-25 letters, numbers, hyphens or underscores.");
      tagInput?.reportValidity();
      return;
    }
    tagInput?.setCustomValidity("");
    const tag = raw || "streamsnap03-20";
    await chrome.storage.local.set({ affiliateTag: tag });
    saveAffiliateTag(tag).catch(() => {});
    showToast(`Saved affiliate tracking tag: ${tag} ✓`);
  });
}

async function saveAllSettings() {
  const tagInput = document.getElementById("onboarding-affiliate-tag");
  const floatingToggle = document.getElementById("onboarding-floating-controls");
  const autoScanSelect = document.getElementById("onboarding-auto-scan-select");
  const confSlider = document.getElementById("onboarding-conf-slider");

  const affiliateTag = tagInput?.value?.trim() || "streamsnap03-20";
  const showFloatingControls = floatingToggle ? floatingToggle.checked : true;
  const autoScanIntervalSec = autoScanSelect ? parseInt(autoScanSelect.value, 10) || 0 : 0;
  const minConfidence = confSlider ? parseInt(confSlider.value, 10) || 50 : 50;

  await chrome.storage.local.set({
    affiliateTag,
    showFloatingControls,
    autoScanIntervalSec,
    minConfidence
  });

  saveAffiliateTag(affiliateTag).catch(() => {});
}

// ---------------------------------------------------------------------------
// Completion & Actions
// ---------------------------------------------------------------------------

async function completeOnboarding(openDemo = false) {
  await chrome.storage.local.set({ onboardingCompleted: true });
  showToast("StreamSnap AI setup is complete! 🚀");

  setTimeout(() => {
    if (openDemo) {
      chrome.tabs.create({ url: chrome.runtime.getURL("demo/demo_page.html") });
    }
    // Close the onboarding tab
    window.close();
  }, 900);
}

function initFinalActions() {
  document.getElementById("btn-open-demo")?.addEventListener("click", () => {
    chrome.storage.local.set({ onboardingCompleted: true }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("demo/demo_page.html") });
      window.close();
    });
  });

  document.getElementById("btn-finish-onboarding")?.addEventListener("click", () => {
    completeOnboarding(false);
  });
}

// ---------------------------------------------------------------------------
// Initial Data Load
// ---------------------------------------------------------------------------

async function loadInitialData() {
  // 1. Fetch user profile
  try {
    const profile = await fetchProfile();
    renderAuthState(profile);
  } catch {
    renderAuthState({ signedIn: false });
  }

  // 2. Load stored settings
  chrome.storage.local.get(
    ["affiliateTag", "showFloatingControls", "autoScanIntervalSec", "minConfidence", "geminiApiKey"],
    (res = {}) => {
      const tagInput = document.getElementById("onboarding-affiliate-tag");
      const floatingToggle = document.getElementById("onboarding-floating-controls");
      const autoScanSelect = document.getElementById("onboarding-auto-scan-select");
      const confSlider = document.getElementById("onboarding-conf-slider");
      const confBadge = document.getElementById("onboarding-conf-badge");
      const keyInput = document.getElementById("onboarding-gemini-key-input");
      const keyStatus = document.getElementById("onboarding-key-status");

      if (tagInput && res.affiliateTag) {
        tagInput.value = res.affiliateTag;
      }
      if (floatingToggle && res.showFloatingControls !== undefined) {
        floatingToggle.checked = Boolean(res.showFloatingControls);
      }
      if (autoScanSelect && res.autoScanIntervalSec !== undefined) {
        autoScanSelect.value = String(res.autoScanIntervalSec);
      }
      if (confSlider && res.minConfidence !== undefined) {
        confSlider.value = res.minConfidence;
        if (confBadge) confBadge.textContent = `${res.minConfidence}%`;
      }
      if (keyInput && res.geminiApiKey) {
        keyInput.value = res.geminiApiKey;
        if (keyStatus) {
          keyStatus.textContent = "Custom Gemini key active ✓";
          keyStatus.style.color = "#10B981";
        }
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Toast Notification Helper
// ---------------------------------------------------------------------------

function showToast(msg, duration = 2400) {
  const toast = document.getElementById("toast-message");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, duration);
}
