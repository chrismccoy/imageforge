/**
 * Api
 */
window.ImageForgeApi = (function () {
  "use strict";

  const meta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = meta ? meta.getAttribute("content") : "";

  const GENERIC_ERR = "Something went wrong.";
  const NOTICE_MS = 5000;

  let noticeEl = null;
  let noticeTimer = null;

  function notice(message) {
    if (!noticeEl) {
      noticeEl = document.createElement("div");
      noticeEl.setAttribute("role", "status");
      noticeEl.setAttribute("aria-live", "polite");
      noticeEl.className =
        "fixed bottom-4 right-4 z-50 max-w-sm rounded-md bg-red-600 px-4 py-2 " +
        "text-sm font-medium text-white shadow-lg";
      document.body.appendChild(noticeEl);
    }

    noticeEl.textContent = message || GENERIC_ERR;
    noticeEl.hidden = false;

    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      noticeEl.hidden = true;
    }, NOTICE_MS);
  }

  async function failureFrom(res) {
    const type = res.headers.get("content-type") || "";

    if (type.indexOf("json") === -1) {
      if (res.status === 504 || res.status === 502) {
        return (
          "The server did not answer in time (" +
          res.status +
          "). A large or unusual image can take longer than the proxy allows; " +
          "the image may still have been made."
        );
      }
      return (
        "The server replied with a page instead of an answer (" +
        res.status +
        "). Check the server log."
      );
    }

    try {
      const body = await res.json();
      return body.message || GENERIC_ERR;
    } catch (err) {
      return GENERIC_ERR;
    }
  }

  /**
   * Read a response this app sent, or throw with something worth showing.
   */
  async function readJson(res) {
    if (!res.ok) throw new Error(await failureFrom(res));

    const type = res.headers.get("content-type") || "";
    if (type.indexOf("json") === -1) throw new Error(await failureFrom(res));

    return res.json();
  }

  /**
   * POST to a path, carrying the CSRF token, and read the JSON back.
   */
  async function post(path, body) {
    const headers = { "x-csrf-token": csrfToken };
    let payload;

    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    return readJson(await fetch(path, { method: "POST", headers, body: payload }));
  }

  return { post, readJson, notice, csrfToken, GENERIC_ERR };
})();
