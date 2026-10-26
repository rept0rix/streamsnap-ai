document.getElementById("allow").addEventListener("click", async () => {
  const s = document.getElementById("s");
  const granted = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
  if (granted) {
    await chrome.storage.local.set({ needsCapturePermission: false });
    s.textContent = "Done. Go back to the video and scan again. This tab will close.";
    setTimeout(() => window.close(), 1500);
  } else {
    s.textContent = "Not allowed. You can still scan with the toolbar icon or Alt+Shift+S.";
  }
});
