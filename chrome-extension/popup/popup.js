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

/** Format a YYYY-MM-DD string as "Mon D" (e.g. "Apr 22"). */
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

/** Build a one-line rescuer label, e.g. "John Smith" or empty string. */
function rescuerLabel(rec) {
  const parts = [rec.rescuer_first_name, rec.rescuer_last_name].filter(Boolean);
  return parts.join(" ");
}

/** Build a one-line location label. */
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
  card.dataset.rowIndex = rec.row_index;

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
      <button class="submit-btn">Submit to WRMD</button>
    </div>
  `;

  card.querySelector(".submit-btn").addEventListener("click", () => submitRecord(rec, card));
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

  let backendUrl;
  try {
    backendUrl = await getBackendUrl();
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

// ── Submit to WRMD ────────────────────────────────────────────────────────────

async function submitRecord(rec, card) {
  const btn    = card.querySelector(".submit-btn");
  const result = card.querySelector(".card-result");

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Submitting…`;
  result.textContent = "";
  result.className = "card-result";
  card.classList.remove("errored");
  hideStatusBar();

  try {
    const backendUrl = await getBackendUrl();
    const resp = await fetch(`${backendUrl}/api/intake/wrmd-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.detail || `Server returned ${resp.status}`);
    }

    // Success
    card.classList.add("done");
    const caseNum = data.case_number ? ` — case ${data.case_number}` : "";
    result.textContent = `✅ Admitted${caseNum}`;
    result.classList.add("success");
    btn.classList.add("hidden");

    // If all cards are done, show celebration
    const remaining = listEl.querySelectorAll(".record-card:not(.done)");
    if (!remaining.length) {
      setTimeout(() => {
        listEl.innerHTML = "";
        emptyEl.classList.remove("hidden");
      }, 1200);
    }
  } catch (err) {
    card.classList.add("errored");
    result.textContent = `❌ ${err.message}`;
    result.classList.add("error");
    btn.disabled = false;
    btn.textContent = "Retry";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadPending();
