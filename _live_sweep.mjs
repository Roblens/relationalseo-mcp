// Local-only live sweep of all RelationalSEO endpoints. Not committed.
import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync("C:/Users/OmarKhalil/.claude.json", "utf8"));
let tok;
(function dig(o) {
  if (o && typeof o === "object") {
    if (typeof o.RELATIONALSEO_API_KEY === "string") tok = o.RELATIONALSEO_API_KEY;
    for (const k in o) dig(o[k]);
  }
})(cfg);

const BASE = "https://login.relationalseo.com/api/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1x1 PNG for the VisionOS multipart test.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function call(label, path, build) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let init = { method: "POST", headers: { Authorization: `Bearer ${tok}` } };
    if (build.json) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(build.json);
    } else if (build.form) {
      init.body = build.form();
    }
    let r, body, ct;
    try {
      r = await fetch(`${BASE}${path}`, init);
      ct = r.headers.get("content-type") || "";
      body = await r.text();
    } catch (e) {
      console.log(`${label.padEnd(16)} ERR ${e.message}`);
      return;
    }
    const edge = r.status === 429 && ct.includes("text/html");
    if (edge && attempt < 4) {
      console.log(`${label.padEnd(16)} edge-throttle, wait 30s (try ${attempt})`);
      await sleep(30000);
      continue;
    }
    let summary = body.slice(0, 200).replace(/\s+/g, " ");
    if (ct.includes("application/json")) {
      try {
        const j = JSON.parse(body);
        const keys = Object.keys(j).join(",");
        const analysisLen = typeof j.analysis === "string" ? j.analysis.length : "-";
        summary = `keys=[${keys}] status=${j.status} analysisLen=${analysisLen}`;
      } catch {}
    }
    console.log(`${label.padEnd(16)} HTTP ${r.status} ct=${ct.split(";")[0]} | ${summary}`);
    return;
  }
}

const biz = "Steamy Concepts";
const loc = "Tucson, AZ";

const tasks = [
  ["analyze", "/analyze", { json: { query: "Best carpet cleaning in Tucson AZ", businessName: biz, serpMode: false } }],
  ["diagnostic", "/diagnostic", { json: { businessName: biz, location: loc } }],
  ["drift", "/drift", { json: { entityName: biz, location: loc, services: "carpet cleaning" } }],
  ["page", "/page", { json: { url: "https://steamyconcepts.com" } }],
  ["backlink", "/backlink", { json: { sourceUrl: "https://www.yelp.com/biz/steamy-concepts-tucson", targetUrl: "https://steamyconcepts.com" } }],
  ["credential", "/credential", { json: { entityName: biz, location: loc, services: "carpet cleaning" } }],
  ["gbp", "/gbp", { json: { entityName: biz, location: loc } }],
  ["entity-report", "/entity-report", { json: { businessName: biz, location: loc } }],
  ["chatgpt(gated)", "/chatgpt", { json: { query: "Best carpet cleaning in Tucson AZ" } }],
  ["vision", "/vision", { form: () => { const f = new FormData(); f.append("image", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "test.png"); return f; } }],
  ["combined", "/combined", { json: { tools: [ { tool: "diagnostic", businessName: biz, location: loc }, { tool: "gbp", entityName: biz, location: loc } ] } }],
];

console.log(`Sweeping ${tasks.length} endpoints (token ${tok ? tok.slice(0, 8) + "…" : "MISSING"})\n`);
for (const [label, path, build] of tasks) {
  await call(label, path, build);
  await sleep(8000); // space calls to avoid re-tripping the edge throttle
}
console.log("\nSweep complete.");
