// Background service worker — opens WRMD tab when popup requests it

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_WRMD') {
    chrome.tabs.create({ url: 'https://wrmd.org/patients/create' });
    sendResponse({ ok: true });
  }
  return true; // keep channel open for async
});
