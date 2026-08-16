"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const script = fs.readFileSync(path.join(projectRoot, "script.js"), "utf8");
const siteScript = fs.readFileSync(path.join(projectRoot, "site.js"), "utf8");
const standaloneStyles = fs.readFileSync(path.join(projectRoot, "standalone.css"), "utf8");
const styles = [
  "model-workspace.css",
  "model-editorial-system.css",
  "final-quality-control.css",
].map((file) => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");

let assertionCount = 0;
const check = (condition, message) => {
  assertionCount += 1;
  assert.ok(condition, message);
};
const equal = (actual, expected, message) => {
  assertionCount += 1;
  assert.equal(actual, expected, message);
};

const ids = Array.from(indexHtml.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
equal(new Set(ids).size, ids.length, "all Model-page IDs are unique");
equal((indexHtml.match(/<h1\b/g) || []).length, 1, "the Model page has one h1");
check(
  /<h2\s+id="workspaceScenarioTitle"/.test(indexHtml),
  "the state-year workspace heading is an h2",
);
check(!/guidedEntryTitle/.test(indexHtml), "the redundant hidden workspace heading is removed");
check(
  /src="assets\/representation-model-hero-two-party-slider-v2\.png\?/.test(indexHtml) &&
    /district winners feed into one shared weight slider and emerge as/.test(indexHtml),
  "State hero uses the shared-slider illustration and descriptive alt text",
);
check(
  fs.existsSync(path.join(projectRoot, "assets/representation-model-hero-two-party-slider-v2.png")),
  "State shared-slider hero illustration is bundled",
);

const chartFrames = Array.from(
  indexHtml.matchAll(/<div\b[^>]*class="[^"]*paper-figure-chart[^"]*"[^>]*>/g),
  (match) => match[0],
);
equal(chartFrames.length, 4, "all four figures have chart frames");
chartFrames.forEach((frame, index) => {
  check(/\brole="region"/.test(frame), `Figure ${index + 1} frame is a region`);
  check(/\btabindex="0"/.test(frame), `Figure ${index + 1} frame is keyboard reachable`);
  check(/\baria-labelledby="[^"]+"/.test(frame), `Figure ${index + 1} frame is labelled`);
  check(/\baria-describedby="[^"]+"/.test(frame), `Figure ${index + 1} frame is described`);
});
equal(
  (indexHtml.match(/class="figure-scroll-cue"/g) || []).length,
  4,
  "all four figures include a mobile scroll cue",
);
check(/class="figure-method-note"/.test(indexHtml), "Figure 04 keeps its extended method note after the chart");

check(/id="mapViewLabel"/.test(indexHtml), "the map has a dynamic view label");
check(
  /class="map-status-row"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(indexHtml),
  "the visible mode-specific map result is a polite live status",
);
check(/id="workspaceResultLabel"/.test(indexHtml), "workspace result label can follow the displayed allocation mode");
[
  "mobileDistrictOverview",
  "mobileMapSummary",
  "mobileDistrictGrid",
  "mobileDistrictDetail",
].forEach((id) => {
  check(ids.includes(id), `mobile allocation view includes #${id}`);
});
check(
  /id="mobileDistrictOverview"[\s\S]*?aria-label="District allocation overview"/.test(
    indexHtml,
  ) &&
    /id="mobileDistrictDetail"[^>]*aria-live="polite"/.test(indexHtml),
  "mobile allocation view is labelled and announces selected district details",
);
equal(
  Array.from(indexHtml.matchAll(/<textarea[^>]+maxlength="256"/g)).length,
  5,
  "all five advanced formula fields enforce the permalink length limit",
);
check(
  siteScript.includes("hero-annotations-ready") && siteScript.includes("hero-annotations-revealed"),
  "hero annotations reveal once the visitor begins scrolling",
);
const exportTargets = Array.from(
  indexHtml.matchAll(/data-export-status-for="([^"]+)"/g),
  (match) => match[1],
);
equal(exportTargets.length, 5, "map and four figure exports have visible status targets");
exportTargets.forEach((target) => {
  check(ids.includes(target), `export status target ${target} resolves to a control`);
});

for (const match of indexHtml.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g)) {
  match[1].split(/\s+/).filter(Boolean).forEach((target) => {
    check(ids.includes(target), `ARIA/form reference #${target} resolves`);
  });
}

for (const match of indexHtml.matchAll(/\bhref="([^"]+)"/g)) {
  const href = match[1];
  if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
  const [fileWithQuery, fragment] = href.split("#");
  const filePart = fileWithQuery.split("?")[0];
  const localFile = filePart || "index.html";
  check(fs.existsSync(path.join(projectRoot, localFile)), `local link ${href} resolves to a file`);
  if (!filePart && fragment) check(ids.includes(fragment), `local anchor #${fragment} resolves`);
}

check(/--workspace-focus:\s*#18514c/i.test(styles), "focus indicator uses the high-contrast teal token");
check(/--editorial-gold-text:\s*#8b5f14/i.test(styles), "small gold text uses the accessible token");
check(!/extendedMetricsPanel|extended-diagnostics|extended-metric-grid|diagnostic-extension/.test(styles), "obsolete extended-diagnostics selectors are removed");
check(
  /@media \(max-width:\s*720px\)[\s\S]*?\.map-surface > :is\(\.map-wrap, \.map-pan-cue\)[\s\S]*?display:\s*none !important[\s\S]*?\.mobile-district-overview\s*\{[\s\S]*?display:\s*grid/.test(
    styles,
  ),
  "mobile replaces the crowded schematic map with the compact district overview",
);
check(
  /function renderMobileDistrictOverview\(/.test(script) &&
    /\.mobile-district-chip/.test(script) &&
    /"ArrowLeft"[\s\S]*?"ArrowRight"[\s\S]*?"Home"[\s\S]*?"End"/.test(script),
  "mobile district chips use one roving keyboard stop with arrow and edge navigation",
);
check(
  /district-switch-rigid-keyline/.test(script) &&
    /Gold \+ dark frame/.test(script) &&
    /\.district-switch-rigid-keyline\s*\{[\s\S]*?stroke:\s*var\(--editorial-ink\)/.test(
      styles,
    ) &&
    /\.district-switch-rigid-outline\s*\{[\s\S]*?stroke:\s*#f2be22/.test(styles),
  "changed districts use a high-contrast ink, yellow, and paper frame with a written legend",
);
check(
  /:is\(\.site-header \.header-inner, \.app-shell, \.house-main, \.footer-inner\)[\s\S]*?width:\s*min\(1400px, calc\(100% - 48px\)\)/.test(
    standaloneStyles,
  ),
  "State and House share one desktop frame width",
);

check(/function moveRovingSvgFocus\(/.test(script), "shared roving SVG focus behavior exists");
check(/moveRovingSvgFocus\(event, els\.mapShapes, "\.district-shape"\)/.test(script), "map districts use roving focus");
check(/moveRovingSvgFocus\(event, els\.paretoOverlay, "\.pareto-seat-point"\)/.test(script), "Pareto points use roving focus");
check(/moveRovingSvgFocus\(event, els\.isoLossChart, "\.iso-seat-point"\)/.test(script), "iso-loss points use roving focus");

console.log(`UI integrity audit passed ${assertionCount.toLocaleString("en-US")} assertions.`);
