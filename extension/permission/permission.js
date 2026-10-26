document.getElementById("allow").addEventListener("click", async () => {
  const s = document.getElementById("s");
  const granted = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
  if (granted) {
    await chrome.storage.local.set({ needsCapturePermission: false });
    s.textContent = "Done. Taking you back to the video. Scan again there.";
    const tab = Number(new URLSearchParams(location.search).get("tab"));
    setTimeout(async () => {
      // Return to the tab that asked (not whatever tab Chrome picks).
      if (tab) await chrome.tabs.update(tab, { active: true }).catch(() => {});
      window.close();
    }, 1200);
  } else {
    s.textContent = "Not allowed. You can still scan with the toolbar icon or Alt+Shift+S.";
  }
});
