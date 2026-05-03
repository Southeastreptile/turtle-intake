const DEFAULT_BACKEND = "https://serc-intake-api-4d3j3nugya-uk.a.run.app";

const input  = document.getElementById("backendUrl");
const btn    = document.getElementById("save");
const status = document.getElementById("status");

// Load saved value
chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND }, ({ backendUrl }) => {
  input.value = backendUrl;
});

btn.addEventListener("click", () => {
  const url = input.value.trim().replace(/\/$/, ""); // strip trailing slash
  if (!url) {
    status.textContent = "URL cannot be empty.";
    status.style.color = "#b00020";
    return;
  }
  chrome.storage.sync.set({ backendUrl: url }, () => {
    status.textContent = "Saved!";
    status.style.color = "#4a7c3f";
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
});
