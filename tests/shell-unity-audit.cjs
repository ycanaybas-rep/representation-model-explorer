"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const indexHtml = read("index.html");
const houseHtml = read("house.html");
const standaloneStyles = read("standalone.css");

let assertionCount = 0;
const check = (condition, message) => {
  assertionCount += 1;
  assert.ok(condition, message);
};
const equal = (actual, expected, message) => {
  assertionCount += 1;
  assert.equal(actual, expected, message);
};

const compact = (value) => value.replace(/\s+/g, " ").trim();
const compactValue = (value) => compact(value).replace(/\s*([(),:/])\s*/g, "$1");

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = "";

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseDeclarations(block) {
  const declarations = new Map();
  for (const match of block.matchAll(/(^|;)\s*((?:--)?[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)(?=;|$)/g)) {
    declarations.set(match[2].toLowerCase(), compact(match[3]));
  }
  return declarations;
}

function parseRules(source, media = []) {
  const rules = [];
  let cursor = 0;

  while (cursor < source.length) {
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    const openIndex = source.indexOf("{", cursor);
    if (openIndex === -1) break;
    const semicolonIndex = source.indexOf(";", cursor);
    if (semicolonIndex !== -1 && semicolonIndex < openIndex) {
      cursor = semicolonIndex + 1;
      continue;
    }

    const header = compact(source.slice(cursor, openIndex));
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex === -1) throw new Error(`Unclosed CSS block beginning with: ${header}`);
    const block = source.slice(openIndex + 1, closeIndex);

    if (/^@media\b/i.test(header)) {
      rules.push(...parseRules(block, [...media, header]));
    } else if (!header.startsWith("@")) {
      rules.push({
        selector: compact(header),
        declarations: parseDeclarations(block),
        media,
      });
    }
    cursor = closeIndex + 1;
  }

  return rules;
}

const cssWithoutComments = standaloneStyles.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = parseRules(cssWithoutComments);
const baseRules = rules.filter((rule) => rule.media.length === 0);
const declaration = (rule, property) => rule?.declarations.get(property) || "";
const hasDeclaration = (rule, property, pattern) => pattern.test(compactValue(declaration(rule, property)));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const selectorContains = (selector, needle) => {
  const boundary = /[a-zA-Z0-9_-]$/.test(needle) ? "(?![\\w-])" : "";
  return new RegExp(`${escapeRegExp(needle)}${boundary}`).test(selector);
};
const containsBoth = (rule, first, second) =>
  selectorContains(rule.selector, first) && selectorContains(rule.selector, second);
const sharedPageRule = (rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', 'body[data-page="house"]');
const pairedRule = (collection, stateSelector, houseSelector) =>
  collection.find((rule) => containsBoth(rule, stateSelector, houseSelector));
const rulesAt = (width) =>
  rules.filter((rule) =>
    rule.media.some((condition) => new RegExp(`max-width\\s*:\\s*${width}px`, "i").test(condition)),
  );

function stylesheetHref(html, pageName) {
  const links = Array.from(html.matchAll(/<link\b[^>]*>/gi), (match) => match[0]);
  const tag = links.find((link) => /\bhref=["'][^"']*standalone\.css(?:\?[^"']*)?["']/i.test(link));
  check(Boolean(tag), `${pageName} must load standalone.css`);
  return tag?.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] || "";
}

function brandTag(html, pageName) {
  const images = Array.from(html.matchAll(/<img\b[^>]*>/gi), (match) => match[0]);
  const tag = images.find((image) => /\bclass=["'][^"']*\bbrand-mark\b[^"']*["']/i.test(image));
  check(Boolean(tag), `${pageName} must include the shared brand mark`);
  return tag || "";
}

function primaryNavigation(html, pageName) {
  const nav = html.match(/<nav\b[^>]*class=["'][^"']*\bprimary-nav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/i)?.[0] || "";
  check(Boolean(nav), `${pageName} must include the primary navigation`);
  const links = Array.from(nav.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi), (match) => ({
    href: attribute(match[0], "href"),
    label: compact(match[0].replace(/<[^>]+>/g, "")),
  }));
  equal(links.length, 2, `${pageName} primary navigation must expose exactly two destinations`);
  equal(
    JSON.stringify(links),
    JSON.stringify([
      { href: "./", label: "State" },
      { href: "house.html", label: "House" },
    ]),
    `${pageName} primary navigation must contain only State and House, in that order`,
  );
}

const stateStylesheet = stylesheetHref(indexHtml, "State");
const houseStylesheet = stylesheetHref(houseHtml, "House");
equal(stateStylesheet, houseStylesheet, "State and House must load the same standalone.css revision");
check(/standalone\.css\?v=[\w.-]+$/i.test(stateStylesheet), "standalone.css must use an explicit cache-busting version token");

for (const [pageName, html] of [["State", indexHtml], ["House", houseHtml]]) {
  const tag = brandTag(html, pageName);
  equal(attribute(tag, "width"), "34", `${pageName} brand mark must declare an intrinsic width of 34`);
  equal(attribute(tag, "height"), "34", `${pageName} brand mark must declare an intrinsic height of 34`);
  primaryNavigation(html, pageName);
}

const houseTitle = houseHtml.match(/<h1\b[^>]*id=["']housePageTitle["'][^>]*>[\s\S]*?<\/h1>/i)?.[0] || "";
check(Boolean(houseTitle), "House hero must retain its labelled h1");
const houseLineClasses = Array.from(
  houseTitle.matchAll(/<span\b[^>]*class=["']([^"']*\bhouse-hero-line\b[^"']*)["'][^>]*>/gi),
  (match) => match[1].split(/\s+/).find((name) => /^house-hero-line-(?:weight|states|shape|house)$/.test(name)),
).filter(Boolean);
equal(
  JSON.stringify(houseLineClasses),
  JSON.stringify([
    "house-hero-line-weight",
    "house-hero-line-states",
    "house-hero-line-shape",
    "house-hero-line-house",
  ]),
  "House hero must use the same four-line title rhythm as State",
);

const customProperties = baseRules.flatMap((rule) =>
  Array.from(rule.declarations.entries()).filter(([property]) => property.startsWith("--")),
);
const sansToken = customProperties.find(([property]) => /sans/i.test(property));
const displayToken = customProperties.find(([property]) => /display|serif/i.test(property));
check(Boolean(sansToken), "standalone.css must define a shared sans-serif font token");
check(Boolean(displayToken), "standalone.css must define a shared display/serif font token");
check(
  baseRules.some(
    (rule) =>
      sharedPageRule(rule) &&
      declaration(rule, "font-family").includes(`var(${sansToken?.[0]})`),
  ),
  "State and House must receive their body font from one shared selector",
);

const sharedCanvasRule = baseRules.find(
  (rule) => sharedPageRule(rule) && declaration(rule, "--conference-canvas"),
);
check(Boolean(sharedCanvasRule), "State and House must define their canvas in one shared selector");
check(
  hasDeclaration(sharedCanvasRule, "--conference-canvas", /^#f2eee9$/i),
  "the shared canvas must match the paper color baked into both hero illustrations",
);
check(
  hasDeclaration(sharedCanvasRule, "background", /^var\(--conference-canvas\)$/),
  "State and House bodies must paint the same shared canvas token",
);

const sharedHtmlCanvasRule = baseRules.find(
  (rule) =>
    containsBoth(
      rule,
      'html:has(body[data-page="explorer"])',
      'html:has(body[data-page="house"])',
    ),
);
check(Boolean(sharedHtmlCanvasRule), "State and House root canvases must be paired");
check(
  hasDeclaration(sharedHtmlCanvasRule, "background", /^#f2eee9$/i),
  "State and House root canvases must use the identical sampled paper color",
);

const frameRule = baseRules.find(
  (rule) =>
    sharedPageRule(rule) &&
    rule.selector.includes(".app-shell") &&
    rule.selector.includes(".house-main") &&
    hasDeclaration(rule, "width", /^min\(1400px,calc\(100%\s*-\s*48px\)\)$/),
);
check(Boolean(frameRule), "State and House must share the same 1400px desktop frame");

const headerGridRule = baseRules.find(
  (rule) =>
    sharedPageRule(rule) &&
    rule.selector.includes(".header-inner") &&
    hasDeclaration(
      rule,
      "grid-template-columns",
      /^minmax\(0,1fr\)\s*(?:auto|max-content)\s*minmax\(0,1fr\)$/,
    ),
);
check(Boolean(headerGridRule), "the shared header grid must use equal outer tracks so navigation is geometrically centered");
check(
  baseRules.some(
    (rule) =>
      sharedPageRule(rule) &&
      rule.selector.includes(".primary-nav") &&
      hasDeclaration(rule, "justify-self", /^center$/),
  ),
  "the shared primary navigation must be centered in the middle header track",
);

const activeLinkRule = baseRules.find(
  (rule) =>
    sharedPageRule(rule) &&
    rule.selector.includes('.primary-nav a[aria-current="page"]') &&
    !rule.selector.includes("::after"),
);
check(Boolean(activeLinkRule), "State and House must share one current-navigation-item rule");
check(hasDeclaration(activeLinkRule, "box-shadow", /^none$/), "the current navigation item must not draw a second inset underline");
const activeUnderlineRules = baseRules.filter(
  (rule) =>
    sharedPageRule(rule) &&
    rule.selector.includes('.primary-nav a[aria-current="page"]::after'),
);
equal(activeUnderlineRules.length, 1, "the shared shell must define one active-tab underline treatment");
check(
  ["transform", "width", "opacity", "background", "background-color"].some((property) =>
    declaration(activeUnderlineRules[0], property),
  ),
  "the single active-tab pseudo-element must visibly reveal its underline",
);

const mainPaddingRule = baseRules.find(
  (rule) =>
    containsBoth(rule, ".app-shell", ".house-main") &&
    (declaration(rule, "padding-top") || declaration(rule, "padding")),
);
check(Boolean(mainPaddingRule), "State and House main containers must share one spacing rule");
check(
  hasDeclaration(mainPaddingRule, "padding-top", /^0(?:px|rem|em|%)?$/) ||
    hasDeclaration(mainPaddingRule, "padding", /^0(?:px|rem|em|%)?(?:\s|$)/),
  "State and House main containers must begin at the same vertical position",
);

const heroRule = pairedRule(baseRules, ".explorer-hero", ".house-intro");
check(Boolean(heroRule), "State and House hero shells must share one base grid rule");
for (const [property, pattern] of [
  ["display", /^grid$/],
  ["grid-template-columns", /minmax\(/],
  ["gap", /\S/],
  ["align-items", /^center$/],
  ["padding", /\S/],
]) {
  check(hasDeclaration(heroRule, property, pattern), `shared hero grid must define ${property}`);
}

const heroHeadingRule =
  pairedRule(baseRules, ".explorer-hero h1", ".house-intro h1") ||
  pairedRule(baseRules, "#pageTitle", "#housePageTitle");
check(Boolean(heroHeadingRule), "State and House hero headings must share one typography rule");
for (const property of ["font-family", "font-size", "font-weight", "letter-spacing", "line-height"]) {
  check(Boolean(declaration(heroHeadingRule, property)), `shared hero heading must define ${property}`);
}
check(
  declaration(heroHeadingRule, "font-family").includes(`var(${displayToken?.[0]})`),
  "State and House hero headings must use the same shared display-font token",
);

const ledeRule = pairedRule(baseRules, ".hero-lede", ".house-hero-question");
check(Boolean(ledeRule), "State and House hero questions must share one text rule");
for (const property of ["max-width", "margin", "font-family", "font-size", "font-weight", "line-height"]) {
  check(Boolean(declaration(ledeRule, property)), `shared hero question must define ${property}`);
}

const actionsRule = pairedRule(baseRules, ".hero-actions", ".house-hero-actions");
check(Boolean(actionsRule), "State and House hero action rows must share one layout rule");
for (const property of ["display", "gap", "margin-top"]) {
  check(Boolean(declaration(actionsRule, property)), `shared hero actions must define ${property}`);
}

const buttonRule = pairedRule(baseRules, ".hero-action", ".house-hero-action");
check(Boolean(buttonRule), "State and House hero buttons must share one geometry and type rule");
for (const property of ["display", "min-width", "min-height", "padding", "border-radius", "font-size", "font-weight"]) {
  check(Boolean(declaration(buttonRule, property)), `shared hero buttons must define ${property}`);
}

const visualRule = pairedRule(baseRules, ".hero-visual", ".house-hero-visual");
check(Boolean(visualRule), "State and House hero illustrations must share one placement rule");
check(hasDeclaration(visualRule, "width", /550px/), "shared hero illustrations must use the same 550px desktop cap");
check(hasDeclaration(visualRule, "justify-self", /^end$/), "shared hero illustrations must align to the same grid edge");
check(hasDeclaration(visualRule, "margin", /^0$/), "shared hero illustrations must use the same zero margin");

const stateProfilePanelRule = baseRules.find((rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', ".guided-profile-panel"),
);
check(Boolean(stateProfilePanelRule), "State election controls must define their compact panel alignment");
check(
  hasDeclaration(stateProfilePanelRule, "align-content", /^start$/),
  "State election controls must start at the top instead of leaving an unexplained blank area above them",
);

const stateProfileFieldsRule = baseRules.find((rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', ".guided-profile-fields"),
);
check(Boolean(stateProfileFieldsRule), "State election fields must define compact geometry");
check(
  hasDeclaration(stateProfileFieldsRule, "height", /^auto$/) &&
    hasDeclaration(stateProfileFieldsRule, "grid-template-columns", /116px$/) &&
    hasDeclaration(stateProfileFieldsRule, "align-items", /^end$/),
  "State election fields must keep State and Year together in one compact row",
);

const stateProfileActionsRule = baseRules.find((rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', ".guided-profile-actions"),
);
check(Boolean(stateProfileActionsRule), "State election actions must define their own row");
check(
  hasDeclaration(stateProfileActionsRule, "grid-column", /^1\/-1$/),
  "State election actions must sit below the State and Year selectors",
);

const yearSelectRule = baseRules.find((rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', ".year-control select"),
);
check(Boolean(yearSelectRule), "State year selector must define an explicit safe width");
check(
  hasDeclaration(yearSelectRule, "width", /^100%$/) &&
    hasDeclaration(yearSelectRule, "min-width", /^116px$/),
  "State year selector must reserve enough room for every four-digit year",
);

const mobileYearGridRule = rulesAt(430).find((rule) =>
  containsBoth(rule, 'body[data-page="explorer"]', ".guided-profile-fields"),
);
check(Boolean(mobileYearGridRule), "430px State layout must define a protected year column");
check(
  hasDeclaration(mobileYearGridRule, "grid-template-columns", /116px$/),
  "430px State layout must keep the full four-digit year visible",
);

for (const width of [1120, 900, 720, 430, 390, 340]) {
  const breakpointRules = rulesAt(width);
  check(breakpointRules.length > 0, `standalone.css must define the ${width}px responsive breakpoint`);
  check(
    breakpointRules.some(
      (rule) =>
        sharedPageRule(rule) ||
        containsBoth(rule, ".explorer-hero", ".house-intro") ||
        containsBoth(rule, ".hero-action", ".house-hero-action") ||
        containsBoth(rule, ".hero-visual", ".house-hero-visual"),
    ),
    `${width}px responsive rules must apply to State and House together`,
  );
}

for (const [width, pairs] of [
  [
    720,
    [
      [".explorer-hero", ".house-intro"],
      ["#pageTitle", "#housePageTitle"],
      [".hero-lede", ".house-hero-question"],
      [".hero-actions", ".house-hero-actions"],
      [".hero-action", ".house-hero-action"],
    ],
  ],
  [430, [["#pageTitle", "#housePageTitle"]]],
  [390, [[".explorer-hero", ".house-intro"]]],
  [
    340,
    [
      [".explorer-hero", ".house-intro"],
      ["#pageTitle", "#housePageTitle"],
    ],
  ],
]) {
  for (const [stateSelector, houseSelector] of pairs) {
    check(
      Boolean(pairedRule(rulesAt(width), stateSelector, houseSelector)),
      `${width}px breakpoint must keep ${stateSelector} and ${houseSelector} synchronized`,
    );
  }
}

const mediumHeroRule = pairedRule(rulesAt(1120), ".explorer-hero", ".house-intro");
const mediumVisualRule = pairedRule(rulesAt(1120), ".hero-visual", ".house-hero-visual");
check(
  Boolean(mediumHeroRule) && Boolean(declaration(mediumHeroRule, "grid-template-columns")),
  "the 1120px breakpoint must resize the shared hero grid",
);
check(
  Boolean(mediumVisualRule) && Boolean(declaration(mediumVisualRule, "width")),
  "the 1120px breakpoint must resize both hero illustrations together",
);

const stackedHeroRule = pairedRule(rulesAt(900), ".explorer-hero", ".house-intro");
const hiddenVisualRule = pairedRule(rulesAt(900), ".hero-visual", ".house-hero-visual");
check(
  Boolean(stackedHeroRule) && hasDeclaration(stackedHeroRule, "grid-template-columns", /1fr/),
  "the 900px breakpoint must stack both hero grids together",
);
check(
  Boolean(hiddenVisualRule) && hasDeclaration(hiddenVisualRule, "display", /^none$/),
  "the 900px breakpoint must remove both hero illustrations together",
);

console.log(`Shell unity audit passed ${assertionCount.toLocaleString("en-US")} assertions.`);
