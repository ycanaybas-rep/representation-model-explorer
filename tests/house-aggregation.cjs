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
const availableYears = house.getAvailableYears(engine);
deepEqual(
  availableYears,
  [2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024],
  "House year selector uses all available even-year elections",
);

const expectedOutsideAssignments = {
  2000: { demSeats: 42, repSeats: 71, otherSeats: 2 },
  2002: { demSeats: 53, repSeats: 75, otherSeats: 1 },
  2004: { demSeats: 37, repSeats: 59, otherSeats: 1 },
  2006: { demSeats: 47, repSeats: 50, otherSeats: 0 },
  2008: { demSeats: 53, repSeats: 44, otherSeats: 0 },
  2010: { demSeats: 36, repSeats: 61, otherSeats: 0 },
  2012: { demSeats: 73, repSeats: 78, otherSeats: 0 },
  2014: { demSeats: 30, repSeats: 68, otherSeats: 0 },
  2016: { demSeats: 32, repSeats: 66, otherSeats: 0 },
  2018: { demSeats: 41, repSeats: 57, otherSeats: 0 },
  2020: { demSeats: 35, repSeats: 63, otherSeats: 0 },
  2022: { demSeats: 47, repSeats: 71, otherSeats: 0 },
  2024: { demSeats: 34, repSeats: 58, otherSeats: 0 },
};
deepEqual(
  house.OUTSIDE_PANEL_SEATS_BY_YEAR,
  expectedOutsideAssignments,
  "fixed outside-panel election assignments cover every available year",
);

const model2024 = house.buildYearModel(engine, 2024);
equal(model2024.stateCount, 22, "2024 House panel has 22 covered states");
equal(model2024.totalSeats, 343, "2024 House panel has 343 covered seats");
equal(model2024.uncoveredSeats, 92, "2024 House panel visibly leaves 92 seats uncovered");
equal(model2024.outsideDemSeats, 34, "2024 fixes 34 outside-panel Democratic seats");
equal(model2024.outsideRepSeats, 58, "2024 fixes 58 outside-panel Republican seats");
equal(model2024.switchGroups.length, 53, "2024 House panel has 53 recorded switching points");
equal(model2024.proxyCount, 28, "2024 coverage reports the source proxy count");
check(
  model2024.states.every((state) => state.schedule?.source === "dataset"),
  "every 2024 state uses the authoritative bundled switch schedule",
);
check(
  house.formatCoverageDetail(model2024).includes("28 proxy-marked races"),
  "2024 coverage copy discloses proxy-marked races",
);
equal(
  house.formatWeight(0.08063, engine),
  "0.080630",
  "House weight copy retains a meaningful six-decimal switch value",
);
equal(
  house.formatWeightWithPercent(0.00753, engine),
  "w = 0.007530 · 0.753%",
  "House weight copy matches the State exact-plus-percent convention",
);
approx(model2024.demSupport + model2024.repSupport, 1, "2024 support shares sum to one");
equal(
  house.distributeSeats(model2024.totalSeats).reduce((total, count) => total + count, 0),
  model2024.totalSeats,
  "chamber rows contain every covered seat",
);

const expected2024Path = new Map([
  [0, [181, 162, 215, 220]],
  [0.25, [175, 168, 209, 226]],
  [0.5, [178, 165, 212, 223]],
  [0.75, [179, 164, 213, 222]],
  [1, [180, 163, 214, 221]],
]);

for (const [weight, [expectedDem, expectedRep, expectedFullDem, expectedFullRep]] of expected2024Path) {
  const snapshot = house.computeHouseSnapshot(model2024, weight);
  equal(snapshot.demSeats, expectedDem, `2024 at w=${weight}: Democratic panel seats`);
  equal(snapshot.repSeats, expectedRep, `2024 at w=${weight}: Republican panel seats`);
  equal(
    snapshot.demSeats + snapshot.repSeats,
    model2024.totalSeats,
    `2024 at w=${weight}: modeled seats sum to panel coverage`,
  );
  equal(snapshot.fullDemSeats, expectedFullDem, `2024 at w=${weight}: full Democratic seats`);
  equal(snapshot.fullRepSeats, expectedFullRep, `2024 at w=${weight}: full Republican seats`);
  equal(snapshot.fullOtherSeats, 0, `2024 at w=${weight}: no Independent seats`);
  equal(
    snapshot.fullDemSeats + snapshot.fullRepSeats + snapshot.fullOtherSeats,
    house.FULL_HOUSE_SEATS,
    `2024 at w=${weight}: full composition sums to 435`,
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
equal(atZero.fullDemSeats, model2024.fullFptpDemSeats, "w=0 begins at the full Democratic result");
equal(atZero.fullRepSeats, model2024.fullFptpRepSeats, "w=0 begins at the full Republican result");

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
equal(
  atOne.fullDemSeats,
  model2024.fullProportionalDemSeats,
  "w=1 combines the covered Democratic targets with fixed outside seats",
);
equal(
  atOne.fullRepSeats,
  model2024.fullProportionalRepSeats,
  "w=1 combines the covered Republican targets with fixed outside seats",
);

const yearModels = new Map([[2024, model2024]]);
const getYearModel = (year) => {
  if (!yearModels.has(year)) yearModels.set(year, house.buildYearModel(engine, year));
  return yearModels.get(year);
};

for (const [year, expected] of [
  [2000, [212, 221, 2]],
  [2002, [205, 229, 1]],
  [2004, [202, 232, 1]],
  [2018, [235, 200, 0]],
  [2020, [222, 213, 0]],
]) {
  const opening = house.computeHouseSnapshot(getYearModel(year), 0);
  deepEqual(
    [opening.fullDemSeats, opening.fullRepSeats, opening.fullOtherSeats],
    expected,
    `${year}: opening full-House assignment matches the completed election result`,
  );
}

equal(
  house.formatOutsideAssignments(model2024),
  "92 seats are outside this year’s panel (34 Democratic, 58 Republican). Their assignments do not change with w.",
  "outside-panel copy reports the actual fixed 2024 assignments cleanly",
);
equal(
  house.formatComposition(212, 221, 2),
  "212 D / 221 R / 2 Independent",
  "composition copy includes Independent seats when present",
);

for (const year of availableYears) {
  const yearModel = getYearModel(year);
  const series = house.buildHouseSeatShareSeries(yearModel);
  const eventGroups = yearModel.switchGroups.filter(
    (group) => Number.isFinite(group.weight) && group.weight > 0 && group.weight < 1,
  );
  const opening = house.computeHouseSnapshot(yearModel, 0);
  const endpoint = house.computeHouseSnapshot(yearModel, 1);
  const expectedOutside = expectedOutsideAssignments[year];

  equal(series.totalSeats, house.FULL_HOUSE_SEATS, `${year}: curve uses all 435 House seats`);
  equal(series.coveredSeats, yearModel.totalSeats, `${year}: curve retains panel coverage metadata`);
  equal(
    yearModel.outsideDemSeats + yearModel.outsideRepSeats + yearModel.outsideOtherSeats,
    yearModel.uncoveredSeats,
    `${year}: fixed outside assignments fill every uncovered seat`,
  );
  deepEqual(
    {
      demSeats: yearModel.outsideDemSeats,
      repSeats: yearModel.outsideRepSeats,
      otherSeats: yearModel.outsideOtherSeats,
    },
    expectedOutside,
    `${year}: fixed outside assignments match the audited election results`,
  );
  equal(series.events.length, eventGroups.length, `${year}: curve includes every interior switch`);
  equal(
    series.regimes.length,
    eventGroups.length + 1,
    `${year}: switches partition the full range into stable regimes`,
  );
  equal(opening.demSeats, yearModel.fptpDemSeats, `${year}: curve begins at district plurality`);
  equal(endpoint.demSeats, yearModel.proportionalDemSeats, `${year}: curve ends at proportionality`);
  approx(series.regimes[0].start, 0, `${year}: first curve regime begins at zero`);
  approx(series.regimes.at(-1).end, 1, `${year}: final curve regime ends at one`);
  approx(series.vertices[0].weight, 0, `${year}: first chart vertex is at zero`);
  approx(series.vertices[0].demSeatShare, opening.fullDemSeatShare, `${year}: first chart vertex is the full FPTP result`);
  approx(series.vertices.at(-1).weight, 1, `${year}: final chart vertex is at one`);
  approx(
    series.vertices.at(-1).demSeatShare,
    endpoint.fullDemSeatShare,
    `${year}: final chart vertex is the proportional endpoint`,
  );
  equal(series.endpoint.demSeats, endpoint.fullDemSeats, `${year}: curve endpoint full seat count is direct`);
  approx(
    series.endpoint.demSeatShare,
    endpoint.fullDemSeatShare,
    `${year}: curve endpoint share is direct`,
  );

  series.regimes.forEach((regime, index) => {
    check(regime.start < regime.end, `${year} regime ${index + 1}: interval has positive width`);
    check(
      regime.sampleWeight >= regime.start - 1e-12 && regime.sampleWeight < regime.end,
      `${year} regime ${index + 1}: sample lies inside its interval`,
    );
    if (index > 0) {
      approx(
        series.regimes[index - 1].end,
        regime.start,
        `${year} regime ${index + 1}: intervals meet without a gap`,
      );
    }
    const direct = house.computeHouseSnapshot(yearModel, regime.sampleWeight);
    equal(
      regime.demSeats,
      direct.fullDemSeats,
      `${year} regime ${index + 1}: stored full Democratic seats match direct optimization`,
    );
    approx(
      regime.demSeatShare,
      direct.fullDemSeatShare,
      `${year} regime ${index + 1}: stored full Democratic share matches direct optimization`,
    );
  });

  series.events.forEach((event, index) => {
    const group = eventGroups[index];
    const exact = house.computeHouseSnapshot(yearModel, event.weight);
    const leftVertex = series.vertices[1 + index * 2];
    const rightVertex = series.vertices[2 + index * 2];
    approx(event.weight, group.weight, `${year} switch ${index + 1}: weight matches schedule`);
    deepEqual(
      event.states.map((state) => state.code),
      group.states.map((state) => state.code),
      `${year} switch ${index + 1}: affected states match schedule`,
    );
    equal(
      event.beforeDemSeats,
      series.regimes[index].demSeats,
      `${year} switch ${index + 1}: left step uses preceding regime`,
    );
    equal(
      event.afterDemSeats,
      series.regimes[index + 1].demSeats,
      `${year} switch ${index + 1}: right step uses following regime`,
    );
    equal(
      event.exactDemSeats,
      exact.fullDemSeats,
      `${year} switch ${index + 1}: event point uses exact tie-breaking result`,
    );
    approx(leftVertex.weight, event.weight, `${year} switch ${index + 1}: left vertex x`);
    approx(rightVertex.weight, event.weight, `${year} switch ${index + 1}: right vertex x`);
    approx(
      leftVertex.demSeatShare,
      event.beforeDemSeats / house.FULL_HOUSE_SEATS,
      `${year} switch ${index + 1}: left vertex y`,
    );
    approx(
      rightVertex.demSeatShare,
      event.afterDemSeats / house.FULL_HOUSE_SEATS,
      `${year} switch ${index + 1}: right vertex y`,
    );
  });

  for (let index = 1; index < series.vertices.length; index += 1) {
    check(
      series.vertices[index].weight >= series.vertices[index - 1].weight,
      `${year} vertex ${index + 1}: chart path never moves backward in w`,
    );
  }

  const allDemSeatCounts = [
    ...series.regimes.map((regime) => regime.demSeats),
    ...series.events.map((event) => event.exactDemSeats),
    endpoint.fullDemSeats,
  ];
  equal(series.minDemSeats, Math.min(...allDemSeatCounts), `${year}: minimum chart seat count is exact`);
  equal(series.maxDemSeats, Math.max(...allDemSeatCounts), `${year}: maximum chart seat count is exact`);
  approx(
    series.minDemSeatShare,
    series.minDemSeats / house.FULL_HOUSE_SEATS,
    `${year}: minimum chart share corresponds to an integer seat count`,
  );
  approx(
    series.maxDemSeatShare,
    series.maxDemSeats / house.FULL_HOUSE_SEATS,
    `${year}: maximum chart share corresponds to an integer seat count`,
  );

  const domain = house.getSeatShareChartDomain(series);
  check(domain.min >= 0 && domain.max <= 1, `${year}: focused chart domain stays within 0–100%`);
  check(domain.min < domain.max, `${year}: focused chart domain has positive height`);
  check(
    domain.min <= series.minDemSeatShare && domain.max >= series.maxDemSeatShare,
    `${year}: focused chart domain contains every curve value`,
  );

  const rowCounts = house.distributeSeats(house.FULL_HOUSE_SEATS);
  const chamberLayout = house.buildChamberSeatLayout(house.FULL_HOUSE_SEATS);
  equal(chamberLayout.length, house.FULL_HOUSE_SEATS, `${year}: chamber draws all 435 seats`);
  equal(
    rowCounts.reduce((sum, count) => sum + count, 0),
    house.FULL_HOUSE_SEATS,
    `${year}: chamber arc counts sum to the full House`,
  );
  const coordinateKeys = new Set();
  chamberLayout.forEach((seat, index) => {
    check(Number.isFinite(seat.x) && Number.isFinite(seat.y), `${year} chamber seat ${index + 1}: coordinates are finite`);
    check(seat.x >= 0 && seat.x <= 100, `${year} chamber seat ${index + 1}: x is inside the chamber`);
    check(seat.y >= 0 && seat.y <= 100, `${year} chamber seat ${index + 1}: y is inside the chamber`);
    check(Number.isInteger(seat.rowIndex), `${year} chamber seat ${index + 1}: row is integral`);
    check(Number.isInteger(seat.column), `${year} chamber seat ${index + 1}: column is integral`);
    coordinateKeys.add(`${seat.x.toFixed(10)}|${seat.y.toFixed(10)}`);
  });
  equal(coordinateKeys.size, chamberLayout.length, `${year}: chamber seat coordinates are unique`);
  rowCounts.forEach((expectedCount, rowIndex) => {
    const row = chamberLayout.filter((seat) => seat.rowIndex === rowIndex);
    equal(row.length, expectedCount, `${year} chamber row ${rowIndex + 1}: seat count is preserved`);
    row.forEach((seat, column) => {
      equal(seat.column, column, `${year} chamber row ${rowIndex + 1}: columns are ordered`);
      if (column > 0) {
        check(
          seat.x < row[column - 1].x,
          `${year} chamber row ${rowIndex + 1}: seats progress across the semicircle`,
        );
      }
    });
    approx(row[0].y, row.at(-1).y, `${year} chamber row ${rowIndex + 1}: arc endpoints are symmetric`);
    check(
      Math.min(...row.map((seat) => seat.y)) <= row[0].y,
      `${year} chamber row ${rowIndex + 1}: arc rises toward its center`,
    );
  });
}

for (const year of availableYears) {
  const yearModel = getYearModel(year);
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
    equal(
      snapshot.flips,
      snapshot.stateResults.reduce((total, state) => total + state.flips, 0),
      `${year} at w=${weight}: changed-district total sums the state optima`,
    );
    equal(
      snapshot.flips + snapshot.pluralityRetained,
      yearModel.totalSeats,
      `${year} at w=${weight}: changed and retained districts partition the panel`,
    );
    equal(
      snapshot.fullDemSeats,
      snapshot.demSeats + yearModel.outsideDemSeats,
      `${year} at w=${weight}: full Democratic total adds the fixed outside seats`,
    );
    equal(
      snapshot.fullRepSeats,
      snapshot.repSeats + yearModel.outsideRepSeats,
      `${year} at w=${weight}: full Republican total adds the fixed outside seats`,
    );
    equal(
      snapshot.fullOtherSeats,
      yearModel.outsideOtherSeats,
      `${year} at w=${weight}: Independent seats remain fixed`,
    );
    equal(
      snapshot.fullDemSeats + snapshot.fullRepSeats + snapshot.fullOtherSeats,
      house.FULL_HOUSE_SEATS,
      `${year} at w=${weight}: full party assignments partition all 435 seats`,
    );
    const chamberCategories = Array.from(
      { length: house.FULL_HOUSE_SEATS },
      (_, index) => house.getChamberSeatCategory(index, snapshot, yearModel),
    );
    const allowedCategories = new Set([
      "fixed-dem",
      "modeled-dem",
      "fixed-other",
      "modeled-rep",
      "fixed-rep",
    ]);
    check(
      chamberCategories.every((category) => allowedCategories.has(category)),
      `${year} at w=${weight}: every chamber position has exactly one recognized category`,
    );
    const chamberCategoryCounts = Object.fromEntries(
      Array.from(allowedCategories, (category) => [
        category,
        chamberCategories.filter((item) => item === category).length,
      ]),
    );
    deepEqual(
      chamberCategoryCounts,
      {
        "fixed-dem": yearModel.outsideDemSeats,
        "modeled-dem": snapshot.demSeats,
        "fixed-other": yearModel.outsideOtherSeats,
        "modeled-rep": snapshot.repSeats,
        "fixed-rep": yearModel.outsideRepSeats,
      },
      `${year} at w=${weight}: chamber colors distinguish exact modeled and fixed totals`,
    );
    deepEqual(
      chamberCategories.flatMap((category, index) =>
        category === "fixed-dem" ? [index] : [],
      ),
      Array.from({ length: yearModel.outsideDemSeats }, (_, index) => index),
      `${year} at w=${weight}: fixed Democratic positions stay anchored at the left edge`,
    );
    deepEqual(
      chamberCategories.flatMap((category, index) =>
        category === "fixed-rep" ? [index] : [],
      ),
      Array.from(
        { length: yearModel.outsideRepSeats },
        (_, index) => house.FULL_HOUSE_SEATS - yearModel.outsideRepSeats + index,
      ),
      `${year} at w=${weight}: fixed Republican positions stay anchored at the right edge`,
    );
    approx(
      snapshot.fullDemSeatShare,
      snapshot.fullDemSeats / house.FULL_HOUSE_SEATS,
      `${year} at w=${weight}: full Democratic share uses the 435-seat denominator`,
    );
    for (const stateResult of snapshot.stateResults) {
      const state = yearModel.states.find((candidate) => candidate.name === stateResult.name);
      const curve = engine.buildObjectiveCurve(
        state.frontier,
        state.metrics,
        weight,
        yearModel.spec,
      );
      const direct = engine.chooseScheduleCandidate(
        curve,
        state.schedule,
        weight,
        engine.chooseBestCandidate(curve, state.metrics),
      );
      equal(
        stateResult.demSeats,
        direct.demSeats,
        `${year} ${stateResult.name} at w=${weight}: House page uses the authoritative state schedule`,
      );
      equal(
        stateResult.flips,
        direct.flips,
        `${year} ${stateResult.name} at w=${weight}: changed districts use the direct optimum`,
      );
    }
  }
}

let authoritativeSwitchChecks = 0;
for (const year of availableYears) {
  const yearModel = getYearModel(year);
  for (const state of yearModel.states) {
    state.election.switchWeights.forEach((sourceWeight, index) => {
      approx(
        state.schedule.switches[index].weight,
        sourceWeight,
        `${year} ${state.code} switch ${index + 1}: House stores the source weight`,
        1e-12,
      );
      const publicWeight = Number(sourceWeight.toFixed(6));
      const snapshot = house.computeHouseSnapshot(yearModel, publicWeight);
      const stateResult = snapshot.stateResults.find((item) => item.name === state.name);
      const curve = engine.buildObjectiveCurve(
        state.frontier,
        state.metrics,
        publicWeight,
        yearModel.spec,
      );
      const expected = engine.chooseScheduleCandidate(
        curve,
        state.schedule,
        publicWeight,
        engine.chooseBestCandidate(curve, state.metrics),
      );
      equal(
        stateResult.demSeats,
        expected.demSeats,
        `${year} ${state.code} switch ${index + 1}: House and State agree at the six-decimal public weight`,
      );
      authoritativeSwitchChecks += 1;
    });
  }
}
equal(authoritativeSwitchChecks, 482, "every bundled switch receives a House/State parity check");

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
const expectedNavigation = ["./", "house.html"];

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
const houseCss = fs.readFileSync(path.join(projectRoot, "house.css"), "utf8");
const houseJs = fs.readFileSync(path.join(projectRoot, "house.js"), "utf8");
const siteJs = fs.readFileSync(path.join(projectRoot, "site.js"), "utf8");
const requiredHouseIds = [
  "housePageTitle",
  "houseHeroQuestion",
  "houseControls",
  "houseDemVoteShare",
  "houseRepVoteShare",
  "houseFptpSeats",
  "houseProportionalSeats",
  "houseDistrictsChanged",
  "houseSeatShareChart",
  "houseTrajectoryDescription",
  "houseTrajectoryReading",
  "houseChartScale",
  "houseOtherSeatSummary",
  "houseOtherSeats",
  "houseOtherLegend",
];
requiredHouseIds.forEach((id) => {
  equal(
    (houseHtml.match(new RegExp(`id=["']${id}["']`, "g")) || []).length,
    1,
    `House page contains one #${id}`,
  );
});
equal((houseHtml.match(/<h1\b/g) || []).length, 1, "House page contains exactly one h1");
check(
  /<section class="house-intro" aria-labelledby="housePageTitle" aria-describedby="houseHeroQuestion"\s*>/.test(
    normalizedHouseHtml,
  ),
  "House hero title and question are programmatically connected",
);
check(
  /id="houseHeroQuestion"[^>]*>[\s\S]*?\?\s*<\/p>/.test(houseHtml),
  "House hero follows its title with a direct question",
);
["One weight.", "Across the states.", "One House."].forEach((line) => {
  check(normalizedHouseHtml.includes(line), `House hero includes “${line}”`);
});
[
  {
    asset: "assets/hero-local-oval-blue-v1.png",
    className: "hero-local-oval",
    width: "1400",
    height: "440",
  },
  {
    asset: "assets/hero-statewide-underline-red-v1.png",
    className: "hero-statewide-underline",
    width: "1800",
    height: "240",
  },
].forEach(({ asset, className, width, height }) => {
  const image = houseHtml.match(
    new RegExp(`<img[\\s\\S]*?class="${className}"[\\s\\S]*?\\/>`),
  )?.[0] || "";
  check(image.includes(`src="${asset}`), `${className} uses the bundled hand-drawn asset`);
  check(image.includes(`width="${width}"`), `${className} declares its intrinsic width`);
  check(image.includes(`height="${height}"`), `${className} declares its intrinsic height`);
  check(/alt=""/.test(image) && /aria-hidden="true"/.test(image), `${className} is decorative`);
});
const houseIds = Array.from(houseHtml.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
equal(new Set(houseIds).size, houseIds.length, "House page IDs are unique");
for (const match of houseHtml.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g)) {
  for (const target of match[1].trim().split(/\s+/)) {
    check(houseIds.includes(target), `House accessibility reference resolves to #${target}`);
  }
}
const summaryMarkup = houseHtml.match(/<aside class="house-summary-cards"[\s\S]*?<\/aside>/)?.[0] || "";
equal(
  (summaryMarkup.match(/<article class="house-summary-card">/g) || []).length,
  3,
  "House page contains exactly the three requested summary cards",
);
[
  "Modeled Democratic",
  "Fixed Democratic",
  "Modeled Republican",
  "Fixed Republican",
  "Fixed Independent",
].forEach((legendLabel) => {
  check(normalizedHouseHtml.includes(legendLabel), `House legend includes “${legendLabel}”`);
});
[
  "Equal-district two-party ratio",
  "Popular-vote proxy",
  "Where the House total comes from",
  "What this page does—and does not—measure",
  "remain unassigned",
  "neutral positions",
  "Democratic share of covered House seats",
  "Data coverage",
  "Move one weight. Watch the House change.",
].forEach((removedText) => {
  check(!normalizedHouseHtml.includes(removedText), `House page removes “${removedText}”`);
});
[
  "houseSupportRatio",
  "houseSupportShares",
  "houseNetChange",
  "houseStatesChanged",
  "houseStateRows",
  "houseStateBreakdownNote",
  "houseSeatShare",
  "houseSeatVoteGap",
  "houseEfficiencyGap",
  "houseGallagher",
  "housePluralityRetained",
  "houseMajorityInversion",
].forEach((removedId) => {
  check(!new RegExp(`id=["']${removedId}["']`).test(houseHtml), `House page removes #${removedId}`);
});
check(
  /class="house-chart-scroll"[\s\S]*?tabindex="0"[\s\S]*?role="region"/.test(houseHtml),
  "House chart is a keyboard-focusable scroll region",
);
check(
  /id="houseSeatShareChart"[\s\S]*?aria-labelledby="houseTrajectorySvgTitle"[\s\S]*?aria-describedby="houseTrajectoryDescription"/.test(houseHtml),
  "House chart exposes its changing description without an overridden aria-label",
);
check(
  !/houseCoverageHeadline|house-scope-card/.test(`${houseHtml}\n${houseJs}\n${houseCss}`),
  "House hero removes the former coverage card and its script dependency",
);
check(
  /querySelector\("\.explorer-hero, \.house-intro"\)/.test(siteJs) &&
    /hero-annotations-revealed/.test(siteJs),
  "Shared scroll behavior reveals House and State hand-drawn annotations",
);
check(
  /body\[data-page="house"\]\.hero-annotations-ready\.hero-annotations-revealed/.test(houseCss) &&
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?clip-path:\s*none/.test(houseCss),
  "House annotations animate on scroll and remain visible with reduced motion",
);
check(
  /buildChamberSeatLayout\(FULL_HOUSE_SEATS\)/.test(houseJs) &&
    /seat\.classList\.toggle\(\s*"is-other"/.test(houseJs) &&
    /seat\.classList\.toggle\(\s*"is-fixed-dem"/.test(houseJs) &&
    /seat\.classList\.toggle\(\s*"is-fixed-rep"/.test(houseJs),
  "House chamber draws all 435 assignments and distinguishes fixed seats",
);
check(
  /218-seat majority/.test(houseJs) && /Democratic share of all 435/.test(houseJs),
  "House trajectory uses the full-House denominator and correct majority threshold",
);
check(
  /\.house-chamber\s*\{[\s\S]*?position:\s*relative/.test(houseCss) &&
    /\.house-seat\s*\{[\s\S]*?position:\s*absolute[\s\S]*?border-radius:\s*50%/.test(houseCss),
  "House chamber CSS renders visible seats on a positioned semicircular plan",
);
check(
  /--house-dem-fixed:\s*#[0-9a-f]{6}/i.test(houseCss) &&
    /--house-rep-fixed:\s*#[0-9a-f]{6}/i.test(houseCss) &&
    /\.house-seat\.is-dem\.is-fixed-dem\s*\{[\s\S]*?inset/.test(houseCss) &&
    /\.house-seat\.is-rep\.is-fixed-rep\s*\{[\s\S]*?inset/.test(houseCss),
  "Fixed Democratic and Republican seats have distinct outlined party colors",
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
