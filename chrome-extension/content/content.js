/**
 * SERC Intake — WRMD form filler content script.
 * Runs on wrmd.org/patients/create.
 *
 * Flow:
 *  1. Popup stores { pendingFill: PendingRecord } in chrome.storage.local
 *  2. Popup opens this page via background service worker
 *  3. This script reads pendingFill, fills the form, shows a banner
 *  4. User selects species from autocomplete + clicks "Admit Patient"
 *  5. User clicks "Mark as Done" in the banner → backend marks row processed
 */

const DEFAULT_BACKEND = 'https://serc-intake-api-4d3j3nugya-uk.a.run.app';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBackendUrl() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND }, ({ backendUrl }) => {
      resolve(backendUrl.replace(/\/$/, ''));
    });
  });
}

/** Set a form field value the Vue-safe way (bypasses Vue's proxy). */
function fillField(nameOrId, value, byId = false) {
  if (!value && value !== 0) return;
  const el = byId
    ? document.getElementById(nameOrId)
    : document.querySelector(`[name="${nameOrId}"]`);
  if (!el) return;

  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
              : el.tagName === 'SELECT'   ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Convert YYYY-MM-DD → MM/DD/YYYY for datepicker inputs. */
function toUsDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/**
 * Fill a VueDatePicker input by simulating real typing.
 * Simple value-setting doesn't trigger Vue's internal state;
 * execCommand('insertText') fires the native InputEvent that Vue listens to.
 */
async function fillDatePicker(inputId, isoDate) {
  if (!isoDate) return;
  const input = document.getElementById(inputId);
  if (!input) return;

  // Clear any existing value first
  const clearBtn = input.closest('.dp__input_wrap')?.querySelector('[aria-label="Clear value"]')
                || input.parentElement?.querySelector('button');
  if (clearBtn) { clearBtn.click(); await new Promise(r => setTimeout(r, 100)); }

  const formatted = toUsDate(isoDate);
  input.focus();
  input.select();
  document.execCommand('selectAll');
  document.execCommand('insertText', false, formatted);

  // Confirm selection with Enter
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', code: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
}

// ── Main fill logic ───────────────────────────────────────────────────────────

async function fillForm(rec) {
  // 1. Switch to "New Rescuer" tab so rescuer fields are visible
  const newRescuerBtn = [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === 'New Rescuer');
  if (newRescuerBtn) {
    newRescuerBtn.click();
    await new Promise(r => setTimeout(r, 400)); // wait for Vue to render tab
  }

  // 2. Patient identity
  await fillDatePicker('dp-input-date_admitted_at', rec.admitted_at);
  fillField('reference_number', rec.reference_number);

  // Species: type into autocomplete — user picks from dropdown
  const speciesEl = document.getElementById('common_name');
  if (speciesEl && rec.common_name) {
    speciesEl.focus();
    fillField('common_name', rec.common_name, true);
    // Dispatch keyboard event to trigger autocomplete search
    speciesEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
  }

  // 3. Rescuer (New Rescuer tab fields)
  fillField('first_name',  rec.rescuer_first_name);
  fillField('last_name',   rec.rescuer_last_name);
  fillField('phone',       rec.rescuer_phone);
  fillField('address',     rec.rescuer_address);
  fillField('city',        rec.rescuer_city);
  fillField('postal_code', rec.rescuer_postal_code);
  fillField('subdivision', 'US-VA'); // rescuer state = Virginia

  // 4. Intake section
  fillField('admitted_by', rec.admitted_by || 'Linda Nichols');
  await fillDatePicker('dp-input-found_at', rec.found_at || rec.admitted_at);
  fillField('address_found',   rec.address_found || rec.rescuer_address);
  fillField('city_found',      rec.city_found    || rec.rescuer_city);
  fillField('postal_code_found', rec.rescuer_postal_code);
  fillField('subdivision_found', 'US-VA');

  // 5. Admission details
  fillField('reason_for_admission', rec.reasons_for_admission);
  fillField('care_by_rescuer',      rec.care_by_rescuer);
  fillField('notes_about_rescue',   rec.notes_about_rescue);
}

// ── Banner ────────────────────────────────────────────────────────────────────

function showBanner(rec) {
  const banner = document.createElement('div');
  banner.id = 'serc-intake-banner';

  const rescuer = [rec.rescuer_first_name, rec.rescuer_last_name].filter(Boolean).join(' ');
  const subtitle = [rescuer, rec.reasons_for_admission].filter(Boolean).join(' · ');

  banner.innerHTML = `
    <span class="serc-banner-label">🐢 ${rec.common_name || 'Unknown species'}</span>
    ${subtitle ? `<span class="serc-banner-note">${subtitle}</span>` : ''}
    <button class="serc-done-btn" id="serc-mark-done">✅ Mark as Done</button>
    <button class="serc-dismiss-btn" id="serc-dismiss">✕</button>
  `;

  document.body.prepend(banner);
  document.body.classList.add('serc-banner-active');

  document.getElementById('serc-dismiss').addEventListener('click', () => {
    banner.remove();
    document.body.classList.remove('serc-banner-active');
  });

  document.getElementById('serc-mark-done').addEventListener('click', async () => {
    const btn = document.getElementById('serc-mark-done');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const backendUrl = await getBackendUrl();
      const resp = await fetch(`${backendUrl}/api/intake/mark-processed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_index: rec.row_index }),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

      btn.textContent = '✅ Done!';
      banner.style.background = '#4a7c3f';
      setTimeout(() => {
        banner.remove();
        document.body.classList.remove('serc-banner-active');
      }, 1500);

      // Clear the stored record
      chrome.storage.local.remove('pendingFill');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '❌ Retry';
      btn.title = err.message;
    }
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function init() {
  const { pendingFill } = await chrome.storage.local.get('pendingFill');
  if (!pendingFill) return; // nothing to fill

  // Wait briefly for Vue to fully mount the form
  await new Promise(r => setTimeout(r, 800));

  await fillForm(pendingFill);
  showBanner(pendingFill);
}

init();
