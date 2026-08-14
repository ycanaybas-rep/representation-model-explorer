"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

require(path.resolve(__dirname, "..", "script.js"));

const engine = globalThis.__MODEL_EXPLORER__;
const data = engine.bundledElectionData;
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

const expectedCoverage = {
  AZ: ["Arizona", "2002:8,2004:8,2006:8,2008:8,2010:8,2012:9,2014:9,2016:9,2018:9,2020:9,2022:9,2024:9"],
  CA: ["California", "2000:52,2002:53,2004:53,2006:53,2008:53,2010:53,2014:53,2016:53,2018:53,2020:53,2022:52,2024:52"],
  CO: ["Colorado", "2022:8,2024:8"],
  FL: ["Florida", "2000:23,2002:25,2004:25,2006:25,2008:25,2010:25,2012:27,2014:27,2016:27,2018:27,2020:27,2022:28,2024:28"],
  GA: ["Georgia", "2000:11,2002:13,2004:13,2006:13,2008:13,2010:13,2012:14,2014:14,2016:14,2018:14,2020:14,2022:14,2024:14"],
  IL: ["Illinois", "2000:20,2002:19,2004:19,2006:19,2008:19,2010:19,2012:18,2014:18,2016:18,2018:18,2020:18,2022:17,2024:17"],
  IN: ["Indiana", "2000:10,2002:9,2004:9,2006:9,2008:9,2010:9,2012:9,2014:9,2016:9,2018:9,2020:9,2022:9,2024:9"],
  MA: ["Massachusetts", "2000:10,2002:10,2004:10,2006:10,2008:10,2010:10,2012:9,2014:9,2016:9,2018:9,2020:9,2022:9,2024:9"],
  MD: ["Maryland", "2000:8,2002:8,2004:8,2006:8,2008:8,2010:8,2012:8,2014:8,2016:8,2018:8,2020:8,2022:8,2024:8"],
  MI: ["Michigan", "2000:16,2002:15,2004:15,2006:15,2008:15,2010:15,2012:14,2014:14,2016:14,2018:14,2020:14,2022:13,2024:13"],
  MN: ["Minnesota", "2000:8,2002:8,2004:8,2006:8,2008:8,2010:8,2012:8,2014:8,2016:8,2018:8,2020:8,2022:8,2024:8"],
  MO: ["Missouri", "2000:9,2002:9,2004:9,2006:9,2008:9,2010:9,2012:8,2014:8,2016:8,2018:8,2020:8,2022:8,2024:8"],
  NC: ["North Carolina", "2000:12,2002:13,2004:13,2006:13,2008:13,2010:13,2012:13,2014:13,2016:13,2018:13,2020:13,2022:14,2024:14"],
  NJ: ["New Jersey", "2000:13,2002:13,2004:13,2006:13,2008:13,2010:13,2012:12,2014:12,2016:12,2018:12,2020:12,2022:12,2024:12"],
  NY: ["New York", "2000:31,2002:29,2004:29,2006:29,2008:29,2010:29,2012:27,2014:27,2016:27,2018:27,2020:27,2024:26"],
  OH: ["Ohio", "2000:19,2002:18,2004:18,2006:18,2008:18,2010:18,2012:16,2014:16,2016:16,2018:16,2020:16,2022:15,2024:15"],
  PA: ["Pennsylvania", "2000:21,2002:19,2004:19,2006:19,2008:19,2010:19,2012:18,2014:18,2016:18,2018:18,2020:18,2022:17,2024:17"],
  TN: ["Tennessee", "2000:9,2002:9,2004:9,2006:9,2008:9,2010:9,2012:9,2014:9,2016:9,2018:9,2020:9,2022:9,2024:9"],
  TX: ["Texas", "2000:30,2004:32,2006:32,2008:32,2010:32,2012:36,2014:36,2016:36,2018:36,2020:36,2022:38,2024:38"],
  VA: ["Virginia", "2002:11,2004:11,2006:11,2008:11,2010:11,2012:11,2014:11,2016:11,2018:11,2020:11,2022:11,2024:11"],
  WA: ["Washington", "2000:9,2002:9,2004:9,2006:9,2008:9,2010:9,2012:10,2014:10,2016:10,2018:10,2020:10,2022:10,2024:10"],
  WI: ["Wisconsin", "2000:9,2002:8,2004:8,2006:8,2008:8,2010:8,2012:8,2014:8,2016:8,2018:8,2020:8,2022:8,2024:8"],
};

check(engine, "shared model engine is exported");
equal(data.schema, "mme-election-data", "dataset schema");
equal(data.districtCount, 4270, "declared district-row count");
equal(data.electionCount, 270, "declared election count");
equal(data.stateCount, 22, "declared state count");
deepEqual(
  Object.keys(data.states).sort(),
  Object.keys(expectedCoverage).sort(),
  "dataset contains the expected states",
);

let districtCount = 0;
let electionCount = 0;
let proxyCount = 0;
let largeThirdPartyCount = 0;

for (const [stateCode, [expectedName, expectedElections]] of Object.entries(expectedCoverage)) {
  const state = data.states[stateCode];
  equal(state.name, expectedName, `${stateCode}: state name`);
  equal(
    Object.entries(state.elections)
      .map(([year, election]) => `${year}:${election.seats}`)
      .join(","),
    expectedElections,
    `${state.name}: exact year and district-count coverage`,
  );

  const config = engine.stateConfigs[state.name];
  deepEqual(
    config.years,
    Object.keys(state.elections).map(Number),
    `${state.name}: selector years come from the dataset`,
  );

  for (const [yearText, election] of Object.entries(state.elections)) {
    electionCount += 1;
    districtCount += election.districts.length;
    const year = Number(yearText);
    const label = `${state.name} ${year}`;
    const districts = engine.generateScenario(state.name, year);
    const metrics = engine.computeMetrics(districts);

    equal(districts.length, election.seats, `${label}: generated district count`);
    equal(election.districts.length, election.seats, `${label}: source district count`);
    districts.forEach((district, index) => {
      const [id, sourceDemShare, sourceRepShare, proxy, largeThirdParty] =
        election.districts[index];
      const twoPartyTotal = sourceDemShare + sourceRepShare;
      equal(district.id, id, `${label}, district ${id}: source id`);
      approx(
        district.demShare,
        sourceDemShare / twoPartyTotal,
        `${label}, district ${id}: normalized Democratic share`,
      );
      approx(
        district.repShare,
        sourceRepShare / twoPartyTotal,
        `${label}, district ${id}: normalized Republican share`,
      );
      approx(district.totalVotes, 1, `${label}, district ${id}: equal district weight`);
      approx(district.demVotes, district.demShare, `${label}, district ${id}: Democratic weight`);
      approx(district.repVotes, district.repShare, `${label}, district ${id}: Republican weight`);
      equal(
        district.winner,
        sourceDemShare > sourceRepShare ? "D" : "R",
        `${label}, district ${id}: FPTP outcome`,
      );
      equal(district.proxy, proxy === 1, `${label}, district ${id}: proxy flag`);
      equal(
        district.largeThirdParty,
        largeThirdParty === 1,
        `${label}, district ${id}: large-third-party flag`,
      );
      proxyCount += Number(district.proxy);
      largeThirdPartyCount += Number(district.largeThirdParty);
    });

    equal(metrics.repSeats, election.fptpRepSeats, `${label}: FPTP is Republican seats`);
    approx(
      election.proportionalRepTarget,
      election.seats - metrics.rho,
      `${label}: a is the Republican proportional target`,
      2e-6,
    );
    equal(
      election.proportionalRepSeats,
      Math.round(election.proportionalRepTarget),
      `${label}: SPR is the rounded Republican target`,
    );
    equal(
      election.seatGap,
      election.proportionalRepSeats - election.fptpRepSeats,
      `${label}: Seat_gap = SPR - FPTP`,
    );
    approx(
      election.efficiencyGap,
      -metrics.efficiencyGap,
      `${label}: source EG has the opposite sign from the D-oriented site metric`,
      2e-7,
    );

    const expectedSwitchCount = Math.abs(election.seatGap);
    equal(
      election.switchWeights.length,
      expectedSwitchCount,
      `${label}: normalized switch weights stop at the absolute seat gap`,
    );
    equal(
      Object.keys(election).filter((key) => /^w\d+$/.test(key)).length,
      0,
      `${label}: repeated source tail columns are absent from normalized data`,
    );
    election.switchWeights.forEach((weight, index) => {
      check(
        Number.isFinite(weight) && weight > 0 && weight < 1,
        `${label}: w${index + 1} is a valid interior weight`,
      );
      if (index > 0) {
        check(
          weight > election.switchWeights[index - 1],
          `${label}: valid switch weights are strictly increasing`,
        );
      }
    });
    equal(
      election.optimalWeight,
      election.switchWeights.at(-1) ?? null,
      `${label}: w_opt is the final valid switch weight`,
    );
  }
}

equal(districtCount, 4270, "computed district-row count");
equal(electionCount, 270, "computed election count");
equal(proxyCount, 520, "proxy-flagged district total");
equal(largeThirdPartyCount, 12, "large-third-party district total");

const defaultCompilation = engine.compileSpecification(engine.defaultFormulas);
equal(defaultCompilation.errors.length, 0, "default specification compiles");

for (const state of Object.values(data.states)) {
  for (const [yearText, election] of Object.entries(state.elections)) {
    const label = `${state.name} ${yearText}`;
    const districts = engine.generateScenario(state.name, Number(yearText));
    const metrics = engine.computeMetrics(districts);
    const frontier = engine.computeRankedCandidateFrontier(
      districts,
      defaultCompilation.compiled,
    );
    const calculated = engine.computeSwitchSchedule(
      frontier,
      metrics,
      defaultCompilation.compiled,
    );
    const schedule = engine.applyBundledSwitchWeights(calculated, election);
    equal(schedule.source, "dataset", `${label}: active linear schedule identifies dataset weights`);
    equal(
      schedule.switches.length,
      election.switchWeights.length,
      `${label}: displayed switch count matches the source path`,
    );
    schedule.switches.forEach((item, index) => {
      approx(
        item.weight,
        election.switchWeights[index],
        `${label}: displayed w${index + 1} uses the supplied value`,
      );
      approx(
        schedule.segments[index].end,
        election.switchWeights[index],
        `${label}: preceding regime ends at supplied w${index + 1}`,
      );
      approx(
        schedule.segments[index + 1].start,
        election.switchWeights[index],
        `${label}: following regime starts at supplied w${index + 1}`,
      );
      check(
        Number.isFinite(item.calculatedWeight),
        `${label}: independently calculated switch remains available for audit`,
      );
    });
    const weightSummary = engine.computeActiveWeightSummary(schedule, metrics);
    equal(
      weightSummary.alreadyAtTarget,
      election.switchWeights.length === 0,
      `${label}: zero-gap elections are identified as already at target`,
    );
    equal(
      weightSummary.firstSwitchWeight,
      election.switchWeights[0] ?? null,
      `${label}: first-switch summary preserves no-switch nulls`,
    );
    equal(
      weightSummary.targetSwitchWeight,
      election.switchWeights.at(-1) ?? null,
      `${label}: target-switch summary preserves no-switch nulls`,
    );
    const expectedStartingWeight = election.switchWeights.length
      ? Number(election.switchWeights[0].toFixed(6))
      : 0.5;
    const startingWeight = engine.getScenarioStartingWeight(schedule);
    equal(
      startingWeight,
      expectedStartingWeight,
      `${label}: starting weight uses the first switch or the neutral fallback`,
    );
    check(
      Math.abs(startingWeight * 1e6 - Math.round(startingWeight * 1e6)) < 1e-7,
      `${label}: starting weight stays on the six-decimal URL grid`,
    );

    const focusDomain = engine.getSwitchFocusDomain(
      schedule,
      startingWeight,
      null,
      0.000001,
    );
    const figureView = engine.getWeightFigureView(schedule, true, startingWeight);
    if (election.switchWeights.length) {
      approx(
        startingWeight,
        election.switchWeights[0],
        `${label}: rounded start remains at the supplied first switch`,
        5.0001e-7,
      );
      check(Boolean(focusDomain), `${label}: every switch election has a focused range`);
      equal(focusDomain.min, 0, `${label}: fine-tune range always starts at zero`);
      check(
        focusDomain.min <= startingWeight + 1e-10 &&
          focusDomain.max >= startingWeight - 1e-10,
        `${label}: focused control range contains the starting switch`,
      );
      check(
        figureView.focused &&
          figureView.xDomain[0] <= startingWeight + 1e-10 &&
          figureView.xDomain[1] >= startingWeight - 1e-10,
        `${label}: focused figure range contains the starting switch`,
      );
      deepEqual(
        figureView.xDomain,
        [focusDomain.min, focusDomain.max],
        `${label}: focused figures and controls use the identical range`,
      );
      equal(
        focusDomain.switchCount,
        election.switchWeights.filter((weight) => weight <= focusDomain.max + 1e-10).length,
        `${label}: focused switch count includes every visible switch`,
      );
      equal(
        focusDomain.totalSwitches,
        election.switchWeights.length,
        `${label}: focused range retains the total switch count`,
      );
      equal(figureView.xTicks[0], 0, `${label}: focused figure ticks begin at zero`);
      approx(
        figureView.xTicks.at(-1),
        focusDomain.max,
        `${label}: focused figure ticks end at the displayed maximum`,
      );
      equal(
        new Set(
          figureView.xTicks.map((tick) => tick.toFixed(figureView.xDigits)),
        ).size,
        figureView.xTicks.length,
        `${label}: focused figure tick labels are unique`,
      );
      const tickInterval = figureView.xTicks[1] - figureView.xTicks[0];
      check(
        figureView.xTicks.slice(2).every(
          (tick, index) =>
            Math.abs(tick - figureView.xTicks[index + 1] - tickInterval) <= 1e-10,
        ),
        `${label}: focused figure ticks are evenly spaced`,
      );
      equal(
        engine.formatAdaptiveWeight(startingWeight, schedule),
        startingWeight.toFixed(6),
        `${label}: first-switch labels preserve six-decimal precision`,
      );
    } else {
      equal(focusDomain, null, `${label}: no-switch election does not invent a zoom range`);
      deepEqual(
        figureView.xDomain,
        [0, 1],
        `${label}: no-switch election keeps the full figure range`,
      );
      equal(
        engine.formatAdaptiveWeight(startingWeight, schedule),
        "0.500",
        `${label}: no-switch fallback uses the standard three-decimal label`,
      );
    }
  }
}

function buildBundledSchedule(stateName, year) {
  const election = engine.getElectionRecord(stateName, year);
  const districts = engine.generateScenario(stateName, year);
  const metrics = engine.computeMetrics(districts);
  const frontier = engine.computeRankedCandidateFrontier(
    districts,
    defaultCompilation.compiled,
  );
  return engine.applyBundledSwitchWeights(
    engine.computeSwitchSchedule(frontier, metrics, defaultCompilation.compiled),
    election,
  );
}

for (const [stateName, year, expectedMaximum, expectedVisibleSwitches] of [
  ["North Carolina", 2018, 0.06476, 3],
  ["Arizona", 2008, 0.213798, 1],
  ["Washington", 2006, 0.82426, 1],
]) {
  const schedule = buildBundledSchedule(stateName, year);
  const anchor = schedule.switches[0].weight;
  const domain = engine.getSwitchFocusDomain(schedule, anchor, null, 0.000001);
  deepEqual(
    engine.getWeightFigureView(schedule, true),
    engine.getWeightFigureView(schedule, true, anchor),
    `${stateName} ${year}: omitted figure anchor defaults to the first switch`,
  );
  equal(domain.min, 0, `${stateName} ${year}: spot-check focus begins at zero`);
  approx(domain.max, expectedMaximum, `${stateName} ${year}: spot-check adaptive maximum`);
  equal(
    domain.switchCount,
    expectedVisibleSwitches,
    `${stateName} ${year}: spot-check visible switch count`,
  );
}

{
  const schedule = buildBundledSchedule("Arizona", 2002);
  const firstView = engine.getWeightFigureView(schedule, true, schedule.switches[0].weight);
  const secondView = engine.getWeightFigureView(schedule, true, schedule.switches[1].weight);
  deepEqual(
    firstView.xDomain,
    [0, 0.046276],
    "Arizona 2002: first separated switch uses the early zero-anchored cluster",
  );
  deepEqual(
    secondView.xDomain,
    [0, 0.786815],
    "Arizona 2002: second separated switch expands through its zero-anchored cluster",
  );
  equal(
    engine.getSwitchFocusDomain(schedule, schedule.switches[1].weight, null, 0.000001)
      .switchCount,
    2,
    "Arizona 2002: second focus reports both switches visible from zero",
  );
  deepEqual(
    engine.getWeightFigureView(schedule, true, 0.9).xDomain,
    [0, 1],
    "Arizona 2002: an out-of-range restored weight keeps the full plot without snapping",
  );

  const bounds = { left: 0, width: 920 };
  approx(
    engine.getPaperChartWeightAtClientX(76, bounds, firstView.xDomain),
    firstView.xDomain[0],
    "focused chart click: left plot edge maps to zero",
  );
  approx(
    engine.getPaperChartWeightAtClientX(484, bounds, firstView.xDomain),
    firstView.xDomain[1] / 2,
    "focused chart click: plot midpoint maps to half the displayed range",
  );
  approx(
    engine.getPaperChartWeightAtClientX(892, bounds, firstView.xDomain),
    firstView.xDomain[1],
    "focused chart click: right plot edge maps to the displayed maximum",
  );
}

{
  const nearOneSchedule = {
    switches: [{ weight: 0.975, fromDemSeats: 1, toDemSeats: 2 }],
    segments: [
      { start: 0, end: 0.975, demSeats: 1, repSeats: 1 },
      { start: 0.975, end: 1, demSeats: 2, repSeats: 0 },
    ],
  };
  equal(
    engine.getSwitchFocusDomain(nearOneSchedule, 0.975, null, 0.000001),
    null,
    "near-one switch: fine-tune yields to the full range",
  );
  deepEqual(
    engine.getWeightFigureView(nearOneSchedule, true, 0.975).xDomain,
    [0, 1],
    "near-one switch: figure remains on the full range",
  );
}

equal(
  engine.formatAdaptiveWeight(0.00325, null),
  "0.003250",
  "adaptive formatting: a small standalone weight retains export precision",
);
equal(
  engine.formatAdaptiveWeight(0.000886, null),
  "0.000886",
  "adaptive formatting: California-scale standalone weight retains six decimals",
);
equal(
  engine.formatAdaptiveWeight(0.5, null),
  "0.500",
  "adaptive formatting: ordinary standalone weight remains concise",
);

{
  const metadata = engine.getScenarioMetadata("North Carolina", 2018);
  const restored = engine.parseScenarioUrl(
    `https://example.test/index.html?sv=1&state=nc&year=2018&plan=${metadata.planId}&data=${metadata.dataVersion}&method=1.0.0&w=0.731234&spec=baseline&target=proportional&map=model&allocation=optimal`,
  );
  equal(restored.found, true, "explicit permalink: valid scenario is restored");
  equal(restored.weight, 0.731234, "explicit permalink: supplied weight is preserved exactly");
}

{
  const election = engine.getElectionRecord("Illinois", 2020);
  const districts = engine.generateScenario("Illinois", 2020);
  const metrics = engine.computeMetrics(districts);
  const frontier = engine.computeRankedCandidateFrontier(
    districts,
    defaultCompilation.compiled,
  );
  const calculated = engine.computeSwitchSchedule(
    frontier,
    metrics,
    defaultCompilation.compiled,
  );
  const schedule = engine.applyBundledSwitchWeights(calculated, election);
  const finalSwitch = schedule.switches.at(-1);
  const midpoint = (finalSwitch.weight + finalSwitch.calculatedWeight) / 2;
  const curve = engine.buildObjectiveCurve(
    frontier,
    metrics,
    midpoint,
    defaultCompilation.compiled,
  );
  const calculatedBest = engine.chooseBestCandidate(curve, metrics);
  const datasetBest = engine.chooseScheduleCandidate(
    curve,
    schedule,
    midpoint,
    calculatedBest,
  );
  equal(calculatedBest.demSeats, 10, "Illinois 2020: recomputed sub-micro boundary side");
  equal(datasetBest.demSeats, 11, "Illinois 2020: supplied schedule controls the displayed side");
}

for (const [stateName, year] of [
  ["Colorado", 2022],
  ["North Carolina", 2024],
  ["Illinois", 2024],
]) {
  const districts = engine.generateScenario(stateName, year);
  const ranked = engine.computeRankedCandidateFrontier(
    districts,
    defaultCompilation.compiled,
  );
  const candidate = engine.computeCandidateFrontier(
    districts,
    defaultCompilation.compiled,
  );
  deepEqual(candidate, ranked, `${stateName} ${year}: candidate frontier equals ranked results`);
}

{
  const compactLossView = engine.getAdaptiveNonnegativeAxisView([10.01, 10.03, 10.08]);
  check(
    compactLossView.domain[0] <= 10.01 && compactLossView.domain[1] >= 10.08,
    "adaptive loss axis contains every displayed value",
  );
  check(
    compactLossView.domain[1] - compactLossView.domain[0] < 1,
    "adaptive loss axis does not force a one-unit span around close values",
  );
  equal(
    new Set(
      compactLossView.ticks.map((tick) => tick.toFixed(compactLossView.digits)),
    ).size,
    compactLossView.ticks.length,
    "adaptive loss axis tick labels are unique",
  );
}

for (const [stateName, year, expectedSeats] of [
  ["California", 2000, 52],
  ["California", 2002, 53],
  ["Texas", 2024, 38],
]) {
  const districts = engine.generateScenario(stateName, year);
  const metrics = engine.computeMetrics(districts);
  const feasible = engine.computeFeasibleLossPairs(
    districts,
    metrics,
    defaultCompilation.compiled,
  );
  equal(districts.length, expectedSeats, `${stateName} ${year}: large delegation size`);
  equal(feasible.isSampled, true, `${stateName} ${year}: Figure 2 uses bounded sampling`);
  equal(feasible.allocationCount, 32768, `${stateName} ${year}: bounded sample count`);
  equal(
    feasible.totalAllocationCount,
    2 ** expectedSeats,
    `${stateName} ${year}: full allocation space is reported without enumeration`,
  );
  check(
    feasible.allocationCount < feasible.totalAllocationCount,
    `${stateName} ${year}: sampled allocations are fewer than exhaustive allocations`,
  );
  equal(feasible.districtLosses.length, 32768, `${stateName} ${year}: district sample length`);
  equal(feasible.statewideLosses.length, 32768, `${stateName} ${year}: statewide sample length`);
  equal(feasible.seatTotals.length, 32768, `${stateName} ${year}: seat-total sample length`);
  equal(feasible.seatTotals[0], 0, `${stateName} ${year}: all-R anchor is sampled`);
  equal(feasible.seatTotals[1], expectedSeats, `${stateName} ${year}: all-D anchor is sampled`);
  equal(feasible.seatTotals[2], metrics.demSeats, `${stateName} ${year}: FPTP anchor is sampled`);
}

console.log(`Election dataset audit passed ${assertionCount.toLocaleString()} assertions.`);
