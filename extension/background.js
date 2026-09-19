/* The service worker, which exists for one reason: it is allowed to reach the
 * sidecar and the content script is not.
 *
 * A content script runs with the page's origin, so a fetch from
 * https://play.riftatlas.com to http://127.0.0.1:8787 is a public site
 * reaching into the loopback address space. Chrome blocks that outright —
 * "Permission was denied for this request to access the `loopback` address
 * space" — and no amount of CORS headers on the sidecar changes it, because
 * the request never leaves the browser.
 *
 * The extension's own service worker is a different matter: it runs on the
 * extension's origin with the host permission declared in the manifest, so
 * it may make exactly this request. The content script now hands the snapshot
 * here and this does the posting.
 */
"use strict";

const SIDECAR = "http://127.0.0.1:8787";

async function post(snapshot) {
  const res = await fetch(`${SIDECAR}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`sidecar answered ${res.status}`);
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "rbc:snapshot") return undefined;

  post(message.snapshot)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  // Keeps the message channel open for the async reply.
  return true;
});
