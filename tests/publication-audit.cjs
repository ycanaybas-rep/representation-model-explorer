"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pageFiles = ["index.html", "house.html"];
const pages = Object.fromEntries(pageFiles.map((file) => [file, read(file)]));
const html = pages["index.html"];
const houseHtml = pages["house.html"];
const script = read("script.js");
const houseScript = read("house.js");
const cname = read("CNAME").trim();
const sitemap = read("sitemap.xml");
const rootHtmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html")).sort();

require(path.join(root, "script.js"));
const engine = globalThis.__MODEL_EXPLORER__;

check(
  JSON.stringify(rootHtmlFiles) === JSON.stringify(pageFiles.slice().sort()),
  "publication root must contain only index.html and house.html",
);
check(cname === "representation.yunusaybas.com", "CNAME must contain the intended subdomain only");
check(
  /<link rel="canonical" href="https:\/\/representation\.yunusaybas\.com\/"/.test(html),
  "State canonical URL is missing",
);
check(
  /<link rel="canonical" href="https:\/\/representation\.yunusaybas\.com\/house\.html"/.test(houseHtml),
  "House canonical URL is missing",
);

for (const [pageFile, pageHtml] of Object.entries(pages)) {
  check(
    /<meta name="referrer" content="no-referrer"/.test(pageHtml),
    `${pageFile}: no-referrer policy is missing`,
  );
  check(
    !/(?:paper|methodology|state-lab|allocation-lab|gerrymander-lab|comparison)\.html/.test(pageHtml),
    `${pageFile}: page links to a route excluded from the conference publication`,
  );
  const nav = pageHtml.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const links = Array.from(nav.matchAll(/href="([^"]+)"/g), (match) => match[1]);
  const labels = Array.from(nav.matchAll(/>(State|House)<\/a>/g), (match) => match[1]);
  check(JSON.stringify(links) === JSON.stringify(pageFiles), `${pageFile}: State/House navigation is incomplete`);
  check(JSON.stringify(labels) === JSON.stringify(["State", "House"]), `${pageFile}: navigation labels are incorrect`);
  check((nav.match(/aria-current="page"/g) || []).length === 1, `${pageFile}: navigation needs one current page`);
}

check(!/(?:paper|methodology|state-lab)\.html/.test(script), "State script links to a removed page");
check(!/(?:paper|methodology|state-lab)\.html/.test(houseScript), "House script links to a removed page");
check(
  /id="dataNotes"/.test(html) && /id="diagnosticDefinitions"/.test(html) && /id="methodSummary"/.test(html),
  "in-page supporting notes are incomplete",
);
check(html.indexOf("election-data.js") < html.indexOf("script.js"), "State page must load data before the model script");
check(
  houseHtml.indexOf("election-data.js") < houseHtml.indexOf("script.js") &&
    houseHtml.indexOf("script.js") < houseHtml.indexOf("house.js"),
  "House page must load data, the shared model engine, then House logic",
);

const pageIds = Object.fromEntries(
  Object.entries(pages).map(([file, pageHtml]) => [
    file,
    new Set([...pageHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])),
  ]),
);
for (const [pageFile, pageHtml] of Object.entries(pages)) {
  for (const match of pageHtml.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:)/.test(href) || !href.includes("#")) continue;
    const [targetFile, fragment] = href.split("#");
    const resolvedFile = targetFile || pageFile;
    check(pageIds[resolvedFile]?.has(fragment), `${pageFile}: missing local anchor ${href}`);
  }
}

const localReferences = Object.values(pages)
  .flatMap((pageHtml) => [...pageHtml.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]))
  .map((reference) => reference.split("#")[0].split("?")[0])
  .filter((reference) => reference && !/^(?:https?:|mailto:|tel:)/.test(reference));
for (const reference of new Set(localReferences)) {
  check(fs.existsSync(path.join(root, reference)), `missing local asset: ${reference}`);
}

const publicTextFiles = [
  ...pageFiles,
  "script.js",
  "house.js",
  "site.js",
  "election-data.js",
  "README.md",
  "DEPLOYMENT.md",
  "package.json",
].filter((name) => fs.existsSync(path.join(root, name)));
const combined = publicTextFiles.map(read).join("\n");
check(!/\/Users\/|[A-Za-z]:\\Users\\/.test(combined), "public files contain an absolute local user path");
check(
  !/(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(combined),
  "public files contain a credential-like value",
);
check(/\^\[\\t\\r \]\*\[=\+\\-@\]/.test(script), "CSV exports must neutralize spreadsheet formula prefixes");
check(engine.csvCell("=2+2") === "'=2+2", "equals-prefixed CSV input is neutralized");
check(engine.csvCell(" +SUM(A1:A2)") === "' +SUM(A1:A2)", "space-prefixed CSV formula is neutralized");
check(engine.csvCell("@SUM(A1:A2)") === "'@SUM(A1:A2)", "at-prefixed CSV input is neutralized");
check(engine.csvCell("-0.125000") === "-0.125000", "generated negative numbers remain numeric");
check(engine.csvCell("North Carolina") === "North Carolina", "ordinary CSV text is unchanged");
check(sitemap.includes("https://representation.yunusaybas.com/</loc>"), "sitemap omits the State page");
check(sitemap.includes("https://representation.yunusaybas.com/house.html</loc>"), "sitemap omits the House page");

console.log(
  `Publication audit passed: ${rootHtmlFiles.length} HTML pages, ${new Set(localReferences).size} local assets checked.`,
);
