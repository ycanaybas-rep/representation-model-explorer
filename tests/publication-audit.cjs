"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pageFiles = ["index.html", "house.html"];
const expectedNavigation = ["./", "house.html"];
const pages = Object.fromEntries(pageFiles.map((file) => [file, read(file)]));
const html = pages["index.html"];
const houseHtml = pages["house.html"];
const script = read("script.js");
const houseScript = read("house.js");
const sharedStyles = read("styles.css");
const standaloneStyles = read("standalone.css");
const editorialStyles = read("model-editorial-system.css");
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
  check(JSON.stringify(links) === JSON.stringify(expectedNavigation), `${pageFile}: State/House navigation is incomplete`);
  check(JSON.stringify(labels) === JSON.stringify(["State", "House"]), `${pageFile}: navigation labels are incorrect`);
  check((nav.match(/aria-current="page"/g) || []).length === 1, `${pageFile}: navigation needs one current page`);

  const mainSiteLinks = Array.from(
    pageHtml.matchAll(/<a class="main-site-link" href="https:\/\/yunusaybas\.com\/"([^>]*)>[\s\S]*?<\/a>/g),
  );
  check(mainSiteLinks.length === 1, `${pageFile}: needs exactly one visible main-site return button`);
  check(!/target=/.test(mainSiteLinks[0]?.[0] || ""), `${pageFile}: main-site return must stay in the same tab`);
  check(
    /aria-label="Main site — Back to yunusaybas\.com"/.test(mainSiteLinks[0]?.[0] || ""),
    `${pageFile}: main-site return accessible name must contain both visible labels`,
  );
  check(nav.indexOf("main-site-link") === -1, `${pageFile}: main-site return must remain outside the two-tab navigation`);

  const footer = pageHtml.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || "";
  const authorList = footer.match(/<ul class="footer-authors" aria-label="Paper authors">[\s\S]*?<\/ul>/)?.[0] || "";
  const authorNames = Array.from(authorList.matchAll(/<(?:a|li)(?:\s[^>]*)?>([^<]+)<\/(?:a|li)>/g), (match) =>
    match[1].trim(),
  ).filter((name) => name && !name.includes("\n"));
  check(authorList.length > 0, `${pageFile}: footer needs one labelled paper-author list`);
  check((footer.match(/class="footer-authors"/g) || []).length === 1, `${pageFile}: footer author list is duplicated`);
  check(
    JSON.stringify(authorNames) === JSON.stringify(["Yunus C. Aybas", "Oğuzhan Çelebi", "Surabhi Dutt"]),
    `${pageFile}: footer author names or order are incorrect`,
  );
  check(
    /href="https:\/\/www\.yunusaybas\.com\/" target="_blank" rel="noopener">Yunus C\. Aybas<\/a>/.test(authorList),
    `${pageFile}: Yunus C. Aybas needs his verified personal-site link`,
  );
  check(
    /href="https:\/\/www\.oguzhancelebi\.com\/" target="_blank" rel="noopener">Oğuzhan Çelebi<\/a>/.test(authorList),
    `${pageFile}: Oğuzhan Çelebi needs his verified personal-site link`,
  );
  check(!/<a[^>]*>Surabhi Dutt<\/a>/.test(authorList), `${pageFile}: Surabhi Dutt has no personal-site link`);
  check(
    !/Historical election profiles|Covered states follow the model/.test(footer),
    `${pageFile}: obsolete explanatory footer copy remains`,
  );
}

check(/\.footer-authors\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(sharedStyles), "footer author names must wrap safely");
check(/\.footer-authors a:focus-visible\s*\{[\s\S]*?outline:\s*3px solid/.test(sharedStyles), "footer author links need a solid visible focus ring");
check(
  /@media \(max-width:\s*560px\)[\s\S]*?\.footer-authors\s*\{[\s\S]*?justify-content:\s*flex-start/.test(sharedStyles),
  "footer author names need left-aligned mobile wrapping",
);
check(!/\.footer-inner\s*>\s*p/.test(editorialStyles), "removed footer paragraph still has a State-only style override");

check(/\.main-site-link\s*\{[\s\S]*?min-height:\s*40px/.test(standaloneStyles), "main-site button needs a desktop target size");
check(
  /@media \(max-width:\s*1040px\)[\s\S]*?\.main-site-link\s*\{[\s\S]*?min-height:\s*44px/.test(standaloneStyles),
  "main-site button needs a 44px compact target size",
);
check(/@media \(max-width:\s*420px\)[\s\S]*?\.main-site-link-short\s*\{[\s\S]*?display:\s*inline/.test(standaloneStyles), "main-site button needs compact mobile copy");
check(
  /@media \(max-width:\s*1040px\)[\s\S]*?\.site-header \.primary-nav[\s\S]*?grid-column:\s*1;[\s\S]*?\.main-site-link\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*2;/.test(standaloneStyles),
  "compact header must keep visual focus order aligned with State, House, then Main site",
);

check(!/(?:paper|methodology|state-lab)\.html/.test(script), "State script links to a removed page");
check(!/(?:paper|methodology|state-lab)\.html/.test(houseScript), "House script links to a removed page");
const cleanScenario = engine.parseScenarioUrl("https://representation.yunusaybas.com/");
check(!cleanScenario.found && cleanScenario.warning === "", "clean State URL loads defaults without a restore warning");
const initializeAppStart = script.indexOf("function initializeApp()");
const cleanLandingAssignment = script.slice(
  script.indexOf("preserveCleanLandingUrl =", initializeAppStart),
  script.indexOf("scenarioRestoreNotice =", initializeAppStart),
);
check(
  cleanLandingAssignment.includes("!window.location.search"),
  "State explorer recognizes a query-free landing URL",
);
const scenarioSyncBlock = script.slice(
  script.indexOf("function syncScenarioUrl()"),
  script.indexOf("function getDisplayedResultLabel", script.indexOf("function syncScenarioUrl()")),
);
check(
  scenarioSyncBlock.includes("preserveCleanLandingUrl") && scenarioSyncBlock.includes("return;"),
  "State explorer preserves the clean root URL instead of replacing it with a default permalink",
);
check(
  houseScript.includes("const preserveCleanPageUrl = !window.location.search") &&
    /if \(preserveCleanPageUrl \|\| !window\.history\?\.replaceState\) return;/.test(houseScript),
  "House explorer preserves a clean house.html URL while retaining explicit permalink queries",
);
check(
  !/<meta[^>]+http-equiv=["']refresh["']/i.test(html) &&
    !/window\.location\.(?:assign|replace)\s*\(/.test(script),
  "State landing page contains no client-side redirect",
);
check(
  !/id="(?:modelNotes|dataNotes|diagnosticDefinitions|methodSummary)"/.test(html) &&
    !/#(?:modelNotes|dataNotes|diagnosticDefinitions|methodSummary)/.test(`${html}\n${script}`),
  "removed data-and-methodology panel or one of its stale anchors is still present",
);
check(
  !/\.standalone-(?:notes|note-card|definition-list|research-note)/.test(standaloneStyles),
  "removed data-and-methodology panel still has visitor-facing CSS",
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

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const publicTextFiles = trackedFiles.filter(
  (name) =>
    [".gitignore", ".nojekyll", "CNAME"].includes(name) ||
    /\.(?:cjs|mjs|js|html|css|md|json|ya?ml|xml|txt|svg|csv|tsv|toml|ini|conf|properties|sh)$/i.test(name),
);
const combined = publicTextFiles.map(read).join("\n");
const forbiddenTrackedFiles = trackedFiles.filter((name) => {
  const basename = path.basename(name).toLowerCase();
  return (
    (/^\.env(?:\.|$)/.test(basename) && basename !== ".env.example") ||
    [".envrc", ".npmrc", ".pypirc", ".netrc"].includes(basename) ||
    /^(?:credentials?|secrets?)(?:\.|$)/.test(basename) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(basename)
  );
});
check(
  forbiddenTrackedFiles.length === 0,
  `credential or private-key files are tracked: ${forbiddenTrackedFiles.join(", ")}`,
);
check(
  !/(?:\/Users\/|\/var\/folders\/|[A-Za-z]:\\Users\\|file:\/\/)/.test(combined),
  "public files contain an absolute local user or temporary path",
);
const credentialPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["OpenAI-style key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Stripe live key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{20,}\b/],
];
for (const [label, pattern] of credentialPatterns) {
  check(!pattern.test(combined), `public files contain a ${label}`);
}
const trackedSymlinks = trackedFiles.filter((name) => fs.lstatSync(path.join(root, name)).isSymbolicLink());
check(trackedSymlinks.length === 0, `tracked symbolic links are not allowed: ${trackedSymlinks.join(", ")}`);
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
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pageFiles = ["index.html", "house.html"];
const expectedNavigation = ["./", "house.html"];
const pages = Object.fromEntries(pageFiles.map((file) => [file, read(file)]));
const html = pages["index.html"];
const houseHtml = pages["house.html"];
const script = read("script.js");
const houseScript = read("house.js");
const sharedStyles = read("styles.css");
const standaloneStyles = read("standalone.css");
const editorialStyles = read("model-editorial-system.css");
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
  check(JSON.stringify(links) === JSON.stringify(expectedNavigation), `${pageFile}: State/House navigation is incomplete`);
  check(JSON.stringify(labels) === JSON.stringify(["State", "House"]), `${pageFile}: navigation labels are incorrect`);
  check((nav.match(/aria-current="page"/g) || []).length === 1, `${pageFile}: navigation needs one current page`);

  const mainSiteLinks = Array.from(
    pageHtml.matchAll(/<a class="main-site-link" href="https:\/\/yunusaybas\.com\/"([^>]*)>[\s\S]*?<\/a>/g),
  );
  check(mainSiteLinks.length === 1, `${pageFile}: needs exactly one visible main-site return button`);
  check(!/target=/.test(mainSiteLinks[0]?.[0] || ""), `${pageFile}: main-site return must stay in the same tab`);
  check(
    /aria-label="Main site — Back to yunusaybas\.com"/.test(mainSiteLinks[0]?.[0] || ""),
    `${pageFile}: main-site return accessible name must contain both visible labels`,
  );
  check(nav.indexOf("main-site-link") === -1, `${pageFile}: main-site return must remain outside the two-tab navigation`);

  const footer = pageHtml.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || "";
  const authorList = footer.match(/<ul class="footer-authors" aria-label="Paper authors">[\s\S]*?<\/ul>/)?.[0] || "";
  const authorNames = Array.from(authorList.matchAll(/<(?:a|li)(?:\s[^>]*)?>([^<]+)<\/(?:a|li)>/g), (match) =>
    match[1].trim(),
  ).filter((name) => name && !name.includes("\n"));
  check(authorList.length > 0, `${pageFile}: footer needs one labelled paper-author list`);
  check((footer.match(/class="footer-authors"/g) || []).length === 1, `${pageFile}: footer author list is duplicated`);
  check(
    JSON.stringify(authorNames) === JSON.stringify(["Yunus C. Aybas", "Oğuzhan Çelebi", "Surabhi Dutt"]),
    `${pageFile}: footer author names or order are incorrect`,
  );
  check(
    /href="https:\/\/www\.yunusaybas\.com\/" target="_blank" rel="noopener">Yunus C\. Aybas<\/a>/.test(authorList),
    `${pageFile}: Yunus C. Aybas needs his verified personal-site link`,
  );
  check(
    /href="https:\/\/www\.oguzhancelebi\.com\/" target="_blank" rel="noopener">Oğuzhan Çelebi<\/a>/.test(authorList),
    `${pageFile}: Oğuzhan Çelebi needs his verified personal-site link`,
  );
  check(!/<a[^>]*>Surabhi Dutt<\/a>/.test(authorList), `${pageFile}: Surabhi Dutt has no personal-site link`);
  check(
    !/Historical election profiles|Covered states follow the model/.test(footer),
    `${pageFile}: obsolete explanatory footer copy remains`,
  );
}

check(/\.footer-authors\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(sharedStyles), "footer author names must wrap safely");
check(/\.footer-authors a:focus-visible\s*\{[\s\S]*?outline:\s*3px solid/.test(sharedStyles), "footer author links need a solid visible focus ring");
check(
  /@media \(max-width:\s*560px\)[\s\S]*?\.footer-authors\s*\{[\s\S]*?justify-content:\s*flex-start/.test(sharedStyles),
  "footer author names need left-aligned mobile wrapping",
);
check(!/\.footer-inner\s*>\s*p/.test(editorialStyles), "removed footer paragraph still has a State-only style override");

check(/\.main-site-link\s*\{[\s\S]*?min-height:\s*40px/.test(standaloneStyles), "main-site button needs a desktop target size");
check(
  /@media \(max-width:\s*1040px\)[\s\S]*?\.main-site-link\s*\{[\s\S]*?min-height:\s*44px/.test(standaloneStyles),
  "main-site button needs a 44px compact target size",
);
check(/@media \(max-width:\s*420px\)[\s\S]*?\.main-site-link-short\s*\{[\s\S]*?display:\s*inline/.test(standaloneStyles), "main-site button needs compact mobile copy");
check(
  /@media \(max-width:\s*1040px\)[\s\S]*?\.site-header \.primary-nav[\s\S]*?grid-column:\s*1;[\s\S]*?\.main-site-link\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*2;/.test(standaloneStyles),
  "compact header must keep visual focus order aligned with State, House, then Main site",
);

check(!/(?:paper|methodology|state-lab)\.html/.test(script), "State script links to a removed page");
check(!/(?:paper|methodology|state-lab)\.html/.test(houseScript), "House script links to a removed page");
const cleanScenario = engine.parseScenarioUrl("https://representation.yunusaybas.com/");
check(!cleanScenario.found && cleanScenario.warning === "", "clean State URL loads defaults without a restore warning");
const initializeAppStart = script.indexOf("function initializeApp()");
const cleanLandingAssignment = script.slice(
  script.indexOf("preserveCleanLandingUrl =", initializeAppStart),
  script.indexOf("scenarioRestoreNotice =", initializeAppStart),
);
check(
  cleanLandingAssignment.includes("!window.location.search"),
  "State explorer recognizes a query-free landing URL",
);
const scenarioSyncBlock = script.slice(
  script.indexOf("function syncScenarioUrl()"),
  script.indexOf("function getDisplayedResultLabel", script.indexOf("function syncScenarioUrl()")),
);
check(
  scenarioSyncBlock.includes("preserveCleanLandingUrl") && scenarioSyncBlock.includes("return;"),
  "State explorer preserves the clean root URL instead of replacing it with a default permalink",
);
check(
  houseScript.includes("const preserveCleanPageUrl = !window.location.search") &&
    /if \(preserveCleanPageUrl \|\| !window\.history\?\.replaceState\) return;/.test(houseScript),
  "House explorer preserves a clean house.html URL while retaining explicit permalink queries",
);
check(
  !/<meta[^>]+http-equiv=["']refresh["']/i.test(html) &&
    !/window\.location\.(?:assign|replace)\s*\(/.test(script),
  "State landing page contains no client-side redirect",
);
check(
  !/id="(?:modelNotes|dataNotes|diagnosticDefinitions|methodSummary)"/.test(html) &&
    !/#(?:modelNotes|dataNotes|diagnosticDefinitions|methodSummary)/.test(`${html}\n${script}`),
  "removed data-and-methodology panel or one of its stale anchors is still present",
);
check(
  !/\.standalone-(?:notes|note-card|definition-list|research-note)/.test(standaloneStyles),
  "removed data-and-methodology panel still has visitor-facing CSS",
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
