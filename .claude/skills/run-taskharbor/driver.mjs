#!/usr/bin/env node
// Smoke driver for TaskHarbor (아르벤팩토리) — a full-stack web app
// (Express + Vite + tRPC + Drizzle/MySQL) served on a single port.
//
// It drives the *running* dev server over HTTP the same way the browser
// does: it fetches the SPA HTML, checks the wouter client routes resolve,
// hits a public tRPC query (proves the API + DB layer is alive), and —
// if credentials are supplied — runs a real login → authed-query flow.
//
// Usage:
//   node .claude/skills/run-taskharbor/driver.mjs
//   BASE=http://localhost:3000 node .claude/skills/run-taskharbor/driver.mjs
//   REVIEWER_ID=rv_test01 REVIEWER_PW=test123 node .claude/skills/run-taskharbor/driver.mjs
//
// Exit code 0 = all checks passed, 1 = something failed.

const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failures++; };

async function head(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  return res.status;
}

// tRPC v11 over httpBatchLink + superjson. Queries are GET with a
// url-encoded `input`; mutations are POST with a JSON body. The batch
// wrapper is always `{"0":{"json": <input>}}`.
async function trpcQuery(path, cookie) {
  const url = `${BASE}/api/trpc/${path}?batch=1&input=${encodeURIComponent('{"0":{"json":{}}}')}`;
  const res = await fetch(url, { headers: cookie ? { cookie } : {} });
  const body = await res.json();
  return { status: res.status, data: body?.[0]?.result?.data?.json, raw: body };
}
async function trpcMutate(path, input, cookie) {
  const res = await fetch(`${BASE}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ "0": { json: input } }),
  });
  const setCookie = res.headers.get("set-cookie");
  const body = await res.json();
  return { status: res.status, data: body?.[0]?.result?.data?.json, setCookie, raw: body };
}

console.log(`\nTaskHarbor smoke driver → ${BASE}\n`);

// 1. SPA is served at root.
console.log("[1] SPA shell + client routes");
try {
  const res = await fetch(BASE + "/");
  const html = await res.text();
  if (res.status === 200 && html.includes('<div id="root">')) ok("GET / serves SPA shell");
  else bad(`GET / unexpected (status=${res.status}, hasRoot=${html.includes('id="root"')})`);
} catch (e) {
  bad(`GET / threw — is the dev server up? (${e.message})`);
  console.log("\nStart it first:  pnpm dev   (serves on port 3000)\n");
  process.exit(1);
}
for (const p of ["/afreviewer/login", "/client/login", "/admin", "/home"]) {
  const s = await head(p);
  s === 200 ? ok(`route ${p} → 200`) : bad(`route ${p} → ${s}`);
}

// 2. Public tRPC query — proves API + DB are reachable.
console.log("\n[2] Public API (tRPC + DB)");
try {
  const r = await trpcQuery("campaign.listPreview");
  if (r.status === 200 && Array.isArray(r.data)) ok(`campaign.listPreview → ${r.data.length} campaign(s)`);
  else bad(`campaign.listPreview unexpected: ${JSON.stringify(r.raw).slice(0, 160)}`);
} catch (e) {
  bad(`campaign.listPreview threw (${e.message})`);
}

// 3. Auth round-trip — optional, only with credentials.
console.log("\n[3] Auth flow (optional — set REVIEWER_ID / REVIEWER_PW)");
const id = process.env.REVIEWER_ID, pw = process.env.REVIEWER_PW;
if (id && pw) {
  const login = await trpcMutate("auth.login", { loginId: id, password: pw });
  if (login.data?.success && login.setCookie) {
    ok(`auth.login (${id}) → session cookie issued`);
    const cookie = login.setCookie.split(";")[0];
    const me = await trpcQuery("auth.me", cookie);
    if (me.data?.loginId === id) ok(`auth.me → ${me.data.fullName} (role=${me.data.role})`);
    else bad(`auth.me did not return the logged-in user: ${JSON.stringify(me.raw).slice(0, 160)}`);
  } else {
    bad(`auth.login failed: ${JSON.stringify(login.raw).slice(0, 160)}`);
  }
} else {
  console.log("  skip  no credentials supplied");
}

console.log(`\n${failures === 0 ? "PASS — all checks green" : `FAIL — ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
