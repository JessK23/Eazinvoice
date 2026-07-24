const playStoreLink = document.getElementById("playStoreLink");
const apkLink = document.getElementById("apkLink");

const playStoreUrl = window.EAZINVOICE_PLAY_STORE_URL || "";
const apkUrl = window.EAZINVOICE_ANDROID_APK_URL || "";

if (playStoreUrl) {
  playStoreLink.href = playStoreUrl;
  playStoreLink.target = "_blank";
  playStoreLink.rel = "noreferrer";
  playStoreLink.textContent = "Open Play Store";
} else {
  playStoreLink.setAttribute("aria-disabled", "true");
  playStoreLink.href = "#release-notes";
  playStoreLink.textContent = "Play Store coming soon";
}

if (apkUrl) {
  apkLink.href = apkUrl;
  apkLink.target = "_blank";
  apkLink.rel = "noreferrer";
  apkLink.textContent = "Download APK";
} else {
  apkLink.setAttribute("aria-disabled", "true");
  apkLink.href = "#release-notes";
  apkLink.textContent = "APK for internal testing";
}
