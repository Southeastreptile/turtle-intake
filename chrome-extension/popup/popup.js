const DEFAULT_BACKEND = "https://serc-intake-api-4d3j3nugya-uk.a.run.app";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl   = document.getElementById("loading");
const emptyEl     = document.getElementById("emptyState");
const listEl      = document.getElementById("recordList");
const statusBar   = document.getElementById("statusBar");
const settingsBtn = document.getElementById("settingsBtn");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND }, ({ backendUrl }) => {
      resolve(backendUrl.replace(/\/$/, ""));
    });
  });
}

/** Format YYYY-MM-DD → "Mon D" (e.g. "Apr 22"). */
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function rescuerLabel(rec) {
  return [rec.rescuer_first_name, rec.rescuer_last_name].filter(Boolean).join(" ");
}

function locationLabel(rec) {
  return [rec.address_found, rec.city_found].filter(Boolean).join(", ")
      || [rec.rescuer_address, rec.rescuer_city].filter(Boolean).join(", ")
      || "";
}

function showStatusBar(msg, isError = false) {
  statusBar.textContent = msg;
  statusBar.classList.remove("hidden", "error");
  if (isError) statusBar.classList.add("error");
}

function hideStatusBar() {
  statusBar.classList.add("hidden");
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderRecord(rec) {
  const card = document.createElement("div");
  card.className = "record-card";

  const rescuer  = rescuerLabel(rec);
  const location = locationLabel(rec);
  const dateStr  = fmtDate(rec.admitted_at);

  card.innerHTML = `
    <div class="card-species">${esc(rec.common_name)}</div>
    <div class="card-meta">
      ${ dateStr ? `<span>${esc(dateStr)}</span>` : "" }
      ${ rescuer  ? `<span>${esc(rescuer)}</span>` : "" }
      ${ rec.reasons_for_admission ? `<span>${esc(rec.reasons_for_admission)}</span>` : "" }
      ${ location ? `<span>${esc(location)}</span>` : "" }
    </div>
    <div class="card-footer">
      <span class="card-result"></span>
      <button class="submit-btn">Fill WRMD Form</button>
    </div>
  `;

  card.querySelector(".submit-btn").addEventListener("click", () => openWrmd(rec, card));
  return card;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Fetch pending ─────────────────────────────────────────────────────────────

async function loadPending() {
  loadingEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");
  listEl.innerHTML = "";
  hideStatusBar();

  try {
    const backendUrl = await getBackendUrl();
    const resp = await fetch(`${backendUrl}/api/intake/pending`);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const records = await resp.json();

    loadingEl.classList.add("hidden");

    if (!records.length) {
      emptyEl.classList.remove("hidden");
      return;
    }

    for (const rec of records) {
      listEl.appendChild(renderRecord(rec));
    }
  } catch (err) {
    loadingEl.classList.add("hidden");
    showStatusBar(`Could not load records: ${err.message}`, true);
  }
}

// ── Open WRMD and pre-fill ────────────────────────────────────────────────────

async function openWrmd(rec, card) {
  const btn    = card.querySelector(".submit-btn");
  const result = card.querySelector(".card-result");

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Opening…`;
  result.textContent = "";
  hideStatusBar();

  // Store the record for the content script to pick up
  await chrome.storage.local.set({ pendingFill: rec });

  // Open WRMD in a new tab (background service worker handles this)
  chrome.runtime.sendMessage({ type: 'OPEN_WRMD' });

  // Update card to show it's in progress
  card.classList.add("done");
  result.textContent = "⏳ Filling form in new tab…";
  result.classList.add("success");
  btn.classList.add("hidden");

  // Close popup so user sees the new WRMD tab
  window.close();
}

// ── Init ──────────────────────────────────────────────────────────────────────

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadPending();
