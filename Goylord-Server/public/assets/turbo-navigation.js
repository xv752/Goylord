import { cache, config, visit } from "/vendor/hotwired/turbo.es2017-esm.js";

let installed = false;
let pageTrackingEnabled = false;
let visitSequence = 0;
let pendingVisitUrl = "";

const tracked = {
  events: new Set(),
  intervals: new Set(),
  sockets: new Set(),
  workers: new Set(),
};

const original = {};
const loadedClassicScripts = new Set();
const persistentIds = [
  "top-nav",
  "sb-mobile-bar",
  "sb-backdrop",
  "nav-reveal-btn",
  "chat-bubble",
  "chat-panel",
  "cert-trust-banner",
  "command-menu",
];

function normalizeUrl(value, base = window.location.href) {
  try {
    return new URL(value, base).href;
  } catch {
    return value || "";
  }
}

function scriptPath(value) {
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return "";
  }
}

function cleanupPageResources() {
  if (!pageTrackingEnabled) return;
  pageTrackingEnabled = false;
  window.dispatchEvent(new Event("pagehide"));

  for (const id of tracked.intervals) original.clearInterval.call(window, id);
  for (const entry of tracked.events) {
    original.removeEventListener.call(entry.target, entry.type, entry.listener, entry.options);
  }
  for (const socket of tracked.sockets) {
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close(1000, "Turbo navigation");
    } catch {}
  }
  for (const worker of tracked.workers) {
    try {
      worker.terminate();
    } catch {}
  }

  tracked.events.clear();
  tracked.intervals.clear();
  tracked.sockets.clear();
  tracked.workers.clear();
  document.getElementById("cmdp-root")?.remove();

  if (typeof window.define?.amd === "object") {
    try { delete window.define; } catch {}
  }
  if (typeof window.require === "function" && window.require.config) {
    try { delete window.require; } catch {}
  }
}

export function runWithoutPageTracking(fn) {
  const previous = pageTrackingEnabled;
  pageTrackingEnabled = false;
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        pageTrackingEnabled = previous;
      });
    }
    pageTrackingEnabled = previous;
    return result;
  } catch (err) {
    pageTrackingEnabled = previous;
    throw err;
  }
}

function installPageResourceTracker() {
  if (original.addEventListener) return;

  document.querySelectorAll("script[src]").forEach((script) => {
    const src = script.getAttribute("src");
    if (src && script.type !== "module") loadedClassicScripts.add(normalizeUrl(src));
  });

  original.addEventListener = EventTarget.prototype.addEventListener;
  original.removeEventListener = EventTarget.prototype.removeEventListener;
  original.setInterval = window.setInterval;
  original.clearInterval = window.clearInterval;
  original.WebSocket = window.WebSocket;
  original.Worker = window.Worker;

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (pageTrackingEnabled && listener) {
      tracked.events.add({ target: this, type, listener, options });
    }
    return original.addEventListener.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    for (const entry of tracked.events) {
      if (entry.target === this && entry.type === type && entry.listener === listener) {
        tracked.events.delete(entry);
      }
    }
    return original.removeEventListener.call(this, type, listener, options);
  };

  window.setInterval = function (...args) {
    const id = original.setInterval.apply(window, args);
    if (pageTrackingEnabled) tracked.intervals.add(id);
    return id;
  };

  window.clearInterval = function (id) {
    tracked.intervals.delete(id);
    return original.clearInterval.call(window, id);
  };

  if (typeof original.WebSocket === "function") {
    window.WebSocket = function (...args) {
      const socket = new original.WebSocket(...args);
      if (pageTrackingEnabled) tracked.sockets.add(socket);
      return socket;
    };
    window.WebSocket.prototype = original.WebSocket.prototype;
    Object.defineProperties(window.WebSocket, {
      CONNECTING: { value: original.WebSocket.CONNECTING },
      OPEN: { value: original.WebSocket.OPEN },
      CLOSING: { value: original.WebSocket.CLOSING },
      CLOSED: { value: original.WebSocket.CLOSED },
    });
  }

  if (typeof original.Worker === "function") {
    window.Worker = function (...args) {
      const worker = new original.Worker(...args);
      if (pageTrackingEnabled) tracked.workers.add(worker);
      return worker;
    };
    window.Worker.prototype = original.Worker.prototype;
  }
}

function preserveGlobalElements(newBody) {
  for (const id of persistentIds) {
    const current = document.getElementById(id);
    if (!current) continue;

    current.setAttribute("data-turbo-permanent", "");
    let incoming = newBody.querySelector(`#${CSS.escape(id)}`);
    if (!incoming) {
      incoming = document.createElement(current.tagName.toLowerCase());
      incoming.id = id;
      newBody.appendChild(incoming);
    }
    incoming.setAttribute("data-turbo-permanent", "");
  }
}

function preserveLayoutClasses(newBody) {
  for (const name of document.body.classList) {
    if (name.startsWith("sb-") || name === "nav-hidden") {
      newBody.classList.add(name);
    }
  }
}

function prepareIncomingScripts(newBody) {
  visitSequence += 1;

  for (const script of newBody.querySelectorAll("script")) {
    const src = script.getAttribute("src");
    if (!src) continue;

    const path = scriptPath(src);
    if (path === "/assets/nav.js" || path === "/assets/nav-prelude.js") {
      script.setAttribute("data-turbo-eval", "false");
      continue;
    }

    if (script.type === "module") {
      const url = new URL(src, pendingVisitUrl || window.location.href);
      if (url.origin === window.location.origin) {
        url.searchParams.set("turboVisit", String(visitSequence));
        script.src = url.href;
      }
      continue;
    }

    const normalized = normalizeUrl(src, pendingVisitUrl || window.location.href);
    if (loadedClassicScripts.has(normalized)) {
      script.setAttribute("data-turbo-eval", "false");
    } else {
      loadedClassicScripts.add(normalized);
    }
  }
}

function refreshGlobalEnhancements() {
  if (typeof window.addRippleEffect === "function") {
    document
      .querySelectorAll("button:not(.no-ripple), .button:not(.no-ripple)")
      .forEach((button) => window.addRippleEffect(button));
  }
}

export function setupTurboNavigation({ onPathChange } = {}) {
  if (installed) return;
  installed = true;

  installPageResourceTracker();
  config.drive.progressBarDelay = 150;
  // Existing forms keep their explicit fetch handlers. New Turbo Frames opt in per form.
  config.forms.mode = "optin";
  cache.exemptPageFromCache();

  document.getElementById("top-nav")?.setAttribute("data-turbo-permanent", "");

  document.addEventListener("turbo:before-visit", (event) => {
    pendingVisitUrl = event.detail.url || "";
  });

  document.addEventListener("turbo:before-render", (event) => {
    const newBody = event.detail.newBody;
    if (!newBody?.querySelector("#top-nav")) {
      event.preventDefault();
      window.location.assign(pendingVisitUrl || window.location.href);
      return;
    }

    cleanupPageResources();
    preserveGlobalElements(newBody);
    preserveLayoutClasses(newBody);
    prepareIncomingScripts(newBody);
    pageTrackingEnabled = true;
  });

  document.addEventListener("turbo:load", () => {
    cache.exemptPageFromCache();
    pendingVisitUrl = "";
    pageTrackingEnabled = true;
    onPathChange?.(window.location.pathname);
    refreshGlobalEnhancements();
    window.dispatchEvent(new CustomEvent("goylord:turbo-load", {
      detail: { path: window.location.pathname },
    }));
  });

  pageTrackingEnabled = true;
}

export function turboVisit(url, options) {
  visit(url, options);
}
