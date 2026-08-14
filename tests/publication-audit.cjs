const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read("index.html");
const script = read("script.js");
const cname = read("CNAME").trim();
const rootHtmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html"));

require(path.join(root, "script.js"));
const engine = globalThis.__MODEL_EXPLORER__;

check(rootHtmlFiles.length === 1 && rootHtmlFiles[0] === "index.html", "publication root must contain only index.html");
check(cname === "representation.yunusaybas.com", "CNAME must contain the intended subdomain only");
check(/<link rel="canonical" href="https:\/\/representation\.yunusaybas\.com\/"/.test(html), "canonical URL is missing");
check(/<meta name="referrer" content="no-referrer"/.test(html), "portable custom-profile URLs need a no-referrer policy");
check(!/(?:paper|methodology|state-lab)\.html/.test(html), "standalone HTML links to a removed page");
check(!/(?:paper|methodology|state-lab)\.html/.test(script), "standalone script links to a removed page");
check(/href="#diagnostics"/.test(html) && /href="#paperFigures"/.test(html), "one-page navigation is incomplete");
check(/id="dataNotes"/.test(html) && /id="diagnosticDefinitions"/.test(html) && /id="methodSummary"/.test(html), "in-page supporting notes are incomplete");
check(html.indexOf("election-data.js") < html.indexOf("script.js"), "election data must load before the model script");

const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  check(ids.has(match[1]), `missing in-page anchor: #${match[1]}`);
}

const localReferences = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1].split("?")[0])
  .filter((reference) => reference && !reference.startsWith("#") && !/^(?:https?:|mailto:|tel:)/.test(reference));
for (const reference of new Set(localReferences)) {
  check(fs.existsSync(path.join(root, reference)), `missing local asset: ${reference}`);
}

const publicTextFiles = [
  "index.html",
  "script.js",
  "site.js",
  "election-data.js",
  "README.md",
  "DEPLOYMENT.md",
  "package.json",
].filter((name) => fs.existsSync(path.join(root, name)));
const combined = publicTextFiles.map(read).join("\n");
check(!/\/Users\/|[A-Za-z]:\\Users\\/.test(combined), "public files contain an absolute local user path");
check(!/(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(combined), "public files contain a credential-like value");
check(/\^\[\\t\\r \]\*\[=\+\\-@\]/.test(script), "CSV exports must neutralize spreadsheet formula prefixes");
check(engine.csvCell("=2+2") === "'=2+2", "equals-prefixed CSV input is neutralized");
check(engine.csvCell(" +SUM(A1:A2)") === "' +SUM(A1:A2)", "space-prefixed CSV formula is neutralized");
check(engine.csvCell("@SUM(A1:A2)") === "'@SUM(A1:A2)", "at-prefixed CSV input is neutralized");
check(engine.csvCell("-0.125000") === "-0.125000", "generated negative numbers remain numeric");
check(engine.csvCell("North Carolina") === "North Carolina", "ordinary CSV text is unchanged");

console.log(`Publication audit passed: ${rootHtmlFiles.length} HTML page, ${new Set(localReferences).size} local assets checked.`);
