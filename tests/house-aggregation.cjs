"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
require(path.join(projectRoot, "election-data.js"));
require(path.join(projectRoot, "script.js"));
require(path.join(projectRoot, "house.js"));

const engine = globalThis.__MODEL_EXPLORER__;
const house = globalThis.__HOUSE_EXPLORER__;
let assertionCount = 0;

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function approx(actual, expected, message, tolerance = 1e-10) {
  assertionCount += 1;
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

check(engine, "shared model engine is exported");
check(house, "House aggregation helpers are exported");
deepEqual(
  house.getAvailableYears(engine),
  [2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024],
  "House year selector uses all available even-year elections",
);

const model2024 = house.buildYearModel(engine, 2024);
equal(model2024.stateCount, 22, "2024 House panel has 22 covered states");
equal(model2024.totalSeats, 343, "2024 House panel has 343 covered seats");
equal(model2024.uncoveredSeats, 92, "2024 House panel visibly leaves 92 seats uncovered");
equal(model2024.switchGroups.length, 53, "2024 House panel has 53 recorded switching points");
equal(model2024.proxyCount, 28, "2024 coverage reports the source proxy count");
approx(model2024.demSupport + model2024.repSupport, 1, "2024 support shares sum to one");
equal(house.formatSupportRatio(model2024.demSupport), "D:R 1.076:1", "2024 support ratio is cleanly formatted");
equal(
  house.distributeSeats(model2024.totalSeats).reduce((total, count) => total + count, 0),
  model2024.totalSeats,
  "chamber rows contain every covered seat",
);

const expected2024Path = new Map([
  [0, [181, 162]],
  [0.25, [175, 168]],
  [0.5, [178, 165]],
  [0.75, [179, 164]],
  [1, [180, 163]],
]);

for (const [weight, [expectedDem, expectedRep]] of expected2024Path) {
  const snapshot = house.computeHouseSnapshot(model2024, weight);
  equal(snapshot.demSeats, expectedDem, `2024 at w=${weight}: Democratic panel seats`);
  equal(snapshot.repSeats, expectedRep, `2024 at w=${weight}: Republican panel seats`);
  equal(
    snapshot.demSeats + snapshot.repSeats,
    model2024.totalSeats,
    `2024 at w=${weight}: modeled seats sum to panel coverage`,
  );
  approx(
    snapshot.demSupport,
    model2024.demSupport,
    `2024 at w=${weight}: support is fixed as weight changes`,
  );
  approx(
    snapshot.demSeatShare + snapshot.repSeatShare,
    1,
    `2024 at w=${weight}: seat shares sum to one`,
  );
}

const atZero = house.computeHouseSnapshot(model2024, 0);
equal(atZero.demSeats, model2024.fptpDemSeats, "w=0 aggregates state FPTP Democratic seats");
equal(atZero.repSeats, model2024.fptpRepSeats, "w=0 aggregates state FPTP Republican seats");
equal(atZero.flips, 0, "w=0 retains every local plurality winner");

const atOne = house.computeHouseSnapshot(model2024, 1);
equal(
  atOne.demSeats,
  model2024.proportionalDemSeats,
  "w=1 aggregates the state-by-state proportional Democratic targets",
);
equal(
  atOne.repSeats,
  model2024.proportionalRepSeats,
  "w=1 aggregates the state-by-state proportional Republican targets",
);

for (const year of [2000, 2012, 2018, 2024]) {
  const yearModel = house.buildYearModel(engine, year);
  for (const weight of [0, 0.137, 0.5, 0.863, 1]) {
    const snapshot = house.computeHouseSnapshot(yearModel, weight);
    equal(
      snapshot.stateResults.length,
      yearModel.stateCount,
      `${year} at w=${weight}: every covered state has a result`,
    );
    equal(
      snapshot.stateResults.reduce((total, state) => total + state.totalSeats, 0),
      yearModel.totalSeats,
      `${year} at w=${weight}: state rows sum to panel coverage`,
    );
    for (const stateResult of snapshot.stateResults) {
      const state = yearModel.states.find((candidate) => candidate.name === stateResult.name);
      const direct = engine.chooseBestCandidate(
        engine.buildObjectiveCurve(state.frontier, state.metrics, weight, yearModel.spec),
        state.metrics,
      );
      equal(
        stateResult.demSeats,
        direct.demSeats,
        `${year} ${stateResult.name} at w=${weight}: House page uses the direct state optimum`,
      );
    }
  }
}

for (let index = 1; index < model2024.switchGroups.length; index += 1) {
  check(
    model2024.switchGroups[index].weight > model2024.switchGroups[index - 1].weight,
    `2024 switch ${index + 1}: switching points are strictly ordered`,
  );
}

const nextCompositionWeight = house.getAdjacentCompositionWeight(
  model2024.switchGroups,
  0,
  1,
);
check(
  nextCompositionWeight > model2024.switchGroups[0].weight &&
    nextCompositionWeight < model2024.switchGroups[1].weight,
  "next-composition control lands inside the next stable interval",
);
const afterFirstSwitch = house.computeHouseSnapshot(model2024, nextCompositionWeight);
check(
  afterFirstSwitch.stateResults.some(
    (state, index) => state.demSeats !== atZero.stateResults[index].demSeats,
  ),
  "next-composition control crosses at least one state switching point",
);
const previousCompositionWeight = house.getAdjacentCompositionWeight(
  model2024.switchGroups,
  nextCompositionWeight,
  -1,
);
check(
  previousCompositionWeight >= 0 && previousCompositionWeight < model2024.switchGroups[0].weight,
  "previous-composition control returns to the opening interval",
);
equal(
  house.computeHouseSnapshot(model2024, previousCompositionWeight).demSeats,
  atZero.demSeats,
  "previous-composition control restores the opening House total",
);

const pageNames = ["index.html", "house.html"];
const expectedNavigation = ["index.html", "house.html"];

for (const pageName of pageNames) {
  const html = fs.readFileSync(path.join(projectRoot, pageName), "utf8");
  const nav = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const links = Array.from(nav.matchAll(/href="([^"]+)"/g), (match) => match[1]);
  deepEqual(links, expectedNavigation, `${pageName}: primary navigation order is consistent`);
  deepEqual(
    Array.from(nav.matchAll(/>(State|House)<\/a>/g), (match) => match[1]),
    ["State", "House"],
    `${pageName}: primary navigation uses the conference labels`,
  );
  equal(
    (nav.match(/aria-current="page"/g) || []).length,
    1,
    `${pageName}: primary navigation has one current-page marker`,
  );
}

const houseHtml = fs.readFileSync(path.join(projectRoot, "house.html"), "utf8");
const normalizedHouseHtml = houseHtml.replace(/\s+/g, " ");
check(
  normalizedHouseHtml.includes("Popular-vote proxy") &&
    normalizedHouseHtml.includes("not a turnout-weighted national popular vote"),
  "House page explicitly distinguishes the requested ratio from raw popular vote",
);
check(
  houseHtml.indexOf('src="election-data.js') < houseHtml.indexOf('src="script.js') &&
    houseHtml.indexOf('src="script.js') < houseHtml.indexOf('src="house.js'),
  "House page loads data, shared engine, then page logic",
);
check(
  /<link rel="canonical" href="https:\/\/representation\.yunusaybas\.com\/house\.html"/.test(houseHtml),
  "House page has the public canonical URL",
);
check(
  !/(?:paper|methodology|state-lab|allocation-lab|gerrymander-lab|comparison)\.html/.test(houseHtml),
  "House page does not link to pages excluded from the conference publication",
);

console.log(`House aggregation audit passed: ${assertionCount.toLocaleString()} assertions.`);
