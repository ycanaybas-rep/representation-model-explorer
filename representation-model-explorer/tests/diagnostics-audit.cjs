"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
require(path.join(projectRoot, "script.js"));

const engine = globalThis.__MODEL_EXPLORER__;
let assertionCount = 0;
let allocationCount = 0;
let switchElectionCount = 0;
let noSwitchElectionCount = 0;

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function approx(actual, expected, message, tolerance = 1e-11) {
  assertionCount += 1;
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function nearestIntegerWithTiesDown(value) {
  const lower = Math.floor(value);
  const upper = Math.ceil(value);
  return value - lower <= upper - value ? lower : upper;
}

function independentFirstSwitchWeight(demShares, rho, observedDemSeats) {
  const targetDemSeats = nearestIntegerWithTiesDown(rho);
  if (targetDemSeats === observedDemSeats) return null;
  const direction = Math.sign(targetDemSeats - observedDemSeats);
  const sorted = [...demShares].sort((first, second) => second - first);
  const pivotalShare = direction > 0
    ? sorted[observedDemSeats]
    : sorted[observedDemSeats - 1];
  const districtChange = direction > 0
    ? 1 - 2 * pivotalShare
    : 2 * pivotalShare - 1;
  const statewideChange =
    Math.abs(observedDemSeats - rho) -
    Math.abs(observedDemSeats + direction - rho);
  return districtChange / (districtChange + statewideChange);
}

function independentDeclination(demShares, assignment) {
  const republicanAssignments = demShares.filter((_, index) => assignment[index] === 0);
  const democraticAssignments = demShares.filter((_, index) => assignment[index] === 1);
  if (!republicanAssignments.length || !democraticAssignments.length) return null;
  const totalDistricts = demShares.length;
  const theta = Math.atan(
    (1 - 2 * average(republicanAssignments)) *
      (totalDistricts / republicanAssignments.length),
  );
  const gamma = Math.atan(
    (2 * average(democraticAssignments) - 1) *
      (totalDistricts / democraticAssignments.length),
  );
  return (2 * (gamma - theta)) / Math.PI;
}

function compareNullable(actual, expected, message) {
  if (expected === null) {
    equal(actual, null, message);
  } else {
    approx(actual, expected, message);
  }
}

function chooseIndependentDiagnosticCandidate(frontier, demShares, mode) {
  const totalSeats = demShares.length;
  const score = (candidate) => {
    if (mode === "partisanBias" || mode === "seatVoteGap") {
      return Math.abs(candidate.demSeats / totalSeats - 0.5);
    }
    const declination = independentDeclination(demShares, candidate.assignment);
    return declination === null ? Number.POSITIVE_INFINITY : Math.abs(declination);
  };
  return frontier.reduce((winner, candidate) => {
    if (!winner) return candidate;
    const candidateScore = score(candidate);
    const winnerScore = score(winner);
    if (candidateScore < winnerScore - 1e-11) return candidate;
    if (candidateScore > winnerScore + 1e-11) return winner;
    if (candidate.districtLoss < winner.districtLoss - 1e-11) return candidate;
    if (candidate.districtLoss > winner.districtLoss + 1e-11) return winner;
    if (candidate.flips < winner.flips) return candidate;
    if (candidate.flips > winner.flips) return winner;
    return candidate.demSeats < winner.demSeats ? candidate : winner;
  }, null);
}

check(engine, "shared model engine is exported");

const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const diagnosticsSection = indexHtml.match(
  /<section id="diagnostics"[\s\S]*?<\/section>/,
)?.[0];
check(diagnosticsSection, "Election diagnostics section exists");
const visibleTargets = Array.from(
  diagnosticsSection.matchAll(/data-map-target="([^"]+)"/g),
  (match) => match[1],
);
assertionCount += 1;
assert.deepEqual(
  visibleTargets,
  ["efficiency", "partisanBias", "seatVoteGap", "declination", "meanMedian"],
  "the five requested Election diagnostic views are visible",
);
equal(
  (diagnosticsSection.match(/<(?:button|article)\b[^>]*class="diagnostic-card(?:\s|")/g) || []).length,
  6,
  "Election diagnostics contains five measures and one switch threshold",
);
const firstSwitchCard = diagnosticsSection.match(
  /<article\b[^>]*class="diagnostic-card metric-reference"[\s\S]*?<\/article>/,
)?.[0];
check(firstSwitchCard, "First switch weight is an informational card");
check(!/data-map-target|aria-pressed/.test(firstSwitchCard), "First switch weight is not a map target");
check(/<small>Of 0–1 weight scale<\/small>/.test(firstSwitchCard), "First switch card names the percentage scale");
check(/data-map-target="meanMedian"[\s\S]*?View on map/.test(diagnosticsSection), "Mean-median is a vote-profile map lens, not an allocation minimum");
check(!/Proportional seats|FPTP baseline/.test(diagnosticsSection), "allocation references are not duplicated in Election diagnostics");
check(!/extendedMetricsToggle|extendedMetricsPanel|Extended diagnostics/.test(indexHtml), "Extended diagnostics UI is absent");

const compilation = engine.compileSpecification(engine.defaultFormulas);
equal(compilation.errors.length, 0, "default specification compiles");

for (const state of Object.values(engine.bundledElectionData.states)) {
  for (const [yearText, election] of Object.entries(state.elections)) {
    const label = `${state.name} ${yearText}`;
    const districts = engine.generateScenario(state.name, Number(yearText));
    const metrics = engine.computeMetrics(districts);
    const demShares = districts.map((district) => district.demShare);
    const frontier = engine.computeRankedCandidateFrontier(
      districts,
      compilation.compiled,
    );
    const calculatedSchedule = engine.computeSwitchSchedule(
      frontier,
      metrics,
      compilation.compiled,
    );
    const schedule = engine.applyBundledSwitchWeights(calculatedSchedule, election);
    const switchSummary = engine.computeActiveWeightSummary(schedule, metrics);
    const expectedFirstSwitch = election.switchWeights[0] ?? null;
    const independentlyCalculatedFirstSwitch = independentFirstSwitchWeight(
      demShares,
      metrics.rho,
      metrics.demSeats,
    );
    if (expectedFirstSwitch === null) {
      noSwitchElectionCount += 1;
      equal(switchSummary.firstSwitchWeight, null, `${label}: no switch remains null`);
      equal(
        independentlyCalculatedFirstSwitch,
        null,
        `${label}: independent calculation also finds no switch`,
      );
    } else {
      switchElectionCount += 1;
      approx(
        switchSummary.firstSwitchWeight,
        expectedFirstSwitch,
        `${label}: first-switch card uses source w1`,
      );
      approx(
        independentlyCalculatedFirstSwitch,
        expectedFirstSwitch,
        `${label}: source w1 agrees with an independent first-boundary calculation`,
        2.5e-7,
      );
      equal(
        engine.formatAdaptiveWeight(
          switchSummary.firstSwitchWeight,
          schedule,
          metrics.demSeats,
        ),
        expectedFirstSwitch.toFixed(6),
        `${label}: formal first switch retains six-decimal precision`,
      );
      const compactFirstSwitch = engine.formatCompactSwitchWeight(
        switchSummary.firstSwitchWeight,
      );
      check(
        /^(?:<0\.001|\d+(?:\.\d{1,3})?)%$/.test(compactFirstSwitch),
        `${label}: compact first switch is a concise percentage`,
      );
      if (compactFirstSwitch !== "<0.001%") {
        const displayedPercent = Number.parseFloat(compactFirstSwitch);
        const exactPercent = expectedFirstSwitch * 100;
        const tolerance = exactPercent >= 10 ? 0.0500000001 : exactPercent >= 1 ? 0.0050000001 : 0.0005000001;
        approx(
          displayedPercent,
          exactPercent,
          `${label}: compact percentage stays within its stated precision`,
          tolerance,
        );
      }
    }
    const observedAssignment = districts.map((district) =>
      district.winner === "D" ? 1 : 0,
    );
    const expectedMeanMedian = metrics.rho / metrics.totalSeats - median(demShares);
    check(Number.isFinite(expectedMeanMedian), `${label}: mean-median is defined`);

    for (const candidate of frontier) {
      allocationCount += 1;
      const assignment = candidate.assignment;
      const demSeats = assignment.reduce((total, value) => total + value, 0);
      const calculated = engine.computePublicMetrics(districts, metrics, assignment);
      const expectedEfficiencyGap =
        demSeats / metrics.totalSeats - 2 * metrics.rho / metrics.totalSeats + 0.5;
      const expectedSeatVoteGap =
        demSeats / metrics.totalSeats - metrics.rho / metrics.totalSeats;
      const expectedDeclination = independentDeclination(demShares, assignment);
      const parityShift = 0.5 - metrics.rho / metrics.totalSeats;
      const parityShares = demShares.map((share) => share + parityShift);
      const expectedPartisanBias = parityShares.some(
        (share) => share < -1e-12 || share > 1 + 1e-12,
      )
        ? null
        : parityShares.filter((share) => share > 0.5).length /
            metrics.totalSeats -
          0.5;

      approx(calculated.efficiencyGap, expectedEfficiencyGap, `${label}, ${demSeats} D seats: efficiency gap`);
      approx(calculated.seatVoteGap, expectedSeatVoteGap, `${label}, ${demSeats} D seats: seat-vote gap`);
      approx(calculated.meanMedianGap, expectedMeanMedian, `${label}, ${demSeats} D seats: authoritative mean-median gap`);
      compareNullable(calculated.declination, expectedDeclination, `${label}, ${demSeats} D seats: declination`);
      compareNullable(calculated.partisanBias, expectedPartisanBias, `${label}, ${demSeats} D seats: partisan bias`);
    }

    const parityDistricts = engine.createUniformShiftedDistricts(districts, 0.5);
    const partisanBiasOptions = [
      ["model", { w: 0.37, spec: compilation.compiled, useModelRule: true }],
      ["proportional", { allocationRule: "proportional" }],
      ["efficiency", { allocationRule: "efficiency" }],
      ["partisan-bias minimum", { diagnosticRule: "partisanBias", spec: compilation.compiled }],
      ["seat-vote-gap minimum", { diagnosticRule: "seatVoteGap", spec: compilation.compiled }],
      ["declination minimum", { diagnosticRule: "declination", spec: compilation.compiled }],
    ];
    if (!parityDistricts) {
      partisanBiasOptions.forEach(([ruleLabel, options]) => {
        compareNullable(
          engine.computePublicMetrics(districts, metrics, observedAssignment, options)
            .partisanBias,
          null,
          `${label}: ${ruleLabel} partisan bias is undefined outside the swing domain`,
        );
      });
    } else {
      const parityMetrics = engine.computeMetrics(parityDistricts);
      const parityFrontier = engine.computeRankedCandidateFrontier(
        parityDistricts,
        compilation.compiled,
      );
      const modelAtParity = engine.chooseBestCandidate(
        engine.buildObjectiveCurve(
          parityFrontier,
          parityMetrics,
          0.37,
          compilation.compiled,
        ),
        parityMetrics,
      );
      const expectedByRule = new Map([
        ["model", modelAtParity.demSeats / metrics.totalSeats - 0.5],
        ["proportional", Math.floor(metrics.totalSeats / 2) / metrics.totalSeats - 0.5],
        ["efficiency", Math.floor(metrics.totalSeats / 2) / metrics.totalSeats - 0.5],
      ]);
      for (const mode of ["partisanBias", "seatVoteGap", "declination"]) {
        const winner = chooseIndependentDiagnosticCandidate(
          parityFrontier,
          parityDistricts.map((district) => district.demShare),
          mode,
        );
        expectedByRule.set(
          mode === "partisanBias"
            ? "partisan-bias minimum"
            : mode === "seatVoteGap"
              ? "seat-vote-gap minimum"
              : "declination minimum",
          winner.demSeats / metrics.totalSeats - 0.5,
        );
      }
      partisanBiasOptions.forEach(([ruleLabel, options]) => {
        compareNullable(
          engine.computePublicMetrics(districts, metrics, observedAssignment, options)
            .partisanBias,
          expectedByRule.get(ruleLabel),
          `${label}: ${ruleLabel} partisan bias reapplies the selected rule at parity`,
        );
      });
    }

    for (const targetDemShare of [0.45, 0.5, 0.55]) {
      const currentDemShare = metrics.rho / metrics.totalSeats;
      const shiftedShares = demShares.map(
        (share) => share + targetDemShare - currentDemShare,
      );
      const expectedUnavailable = shiftedShares.some(
        (share) => share < -1e-12 || share > 1 + 1e-12,
      );
      const shiftedDistricts = engine.createUniformShiftedDistricts(
        districts,
        targetDemShare,
      );
      if (expectedUnavailable) {
        equal(shiftedDistricts, null, `${label}: ${targetDemShare} swing remains unclipped`);
      } else {
        check(shiftedDistricts, `${label}: ${targetDemShare} swing is available`);
        approx(
          shiftedDistricts.sourceRho,
          targetDemShare * metrics.totalSeats,
          `${label}: ${targetDemShare} swing preserves authoritative rho`,
          1e-12,
        );
        approx(
          engine.computeMetrics(shiftedDistricts).modelDemShare,
          targetDemShare,
          `${label}: ${targetDemShare} swing uses the requested statewide support`,
          1e-12,
        );
      }
    }
  }
}

const quadraticCompilation = engine.compileSpecification({
  ...engine.defaultFormulas,
  stateLoss: "z^2",
});
equal(quadraticCompilation.errors.length, 0, "quadratic statewide penalty compiles");
const quadraticDistricts = engine.generateScenario("North Carolina", 2018);
const quadraticMetrics = engine.computeMetrics(quadraticDistricts);
const quadraticFrontier = engine.computeRankedCandidateFrontier(
  quadraticDistricts,
  quadraticCompilation.compiled,
);
const quadraticSchedule = engine.computeSwitchSchedule(
  quadraticFrontier,
  quadraticMetrics,
  quadraticCompilation.compiled,
);
const quadraticSummary = engine.computeActiveWeightSummary(
  quadraticSchedule,
  quadraticMetrics,
);
approx(
  quadraticSummary.firstSwitchWeight,
  0.0005437572919077593,
  "NC 2018 recomputes first switch under a quadratic statewide penalty",
  1e-12,
);
equal(
  engine.formatAdaptiveWeight(
    quadraticSummary.firstSwitchWeight,
    quadraticSchedule,
    quadraticMetrics.demSeats,
  ),
  "0.000544",
  "the active-specification switch keeps formal six-decimal precision",
);
equal(
  engine.formatCompactSwitchWeight(quadraticSummary.firstSwitchWeight),
  "0.054%",
  "the diagnostics card compacts a custom-specification switch",
);
equal(engine.formatCompactSwitchWeight(0.00324966013431549), "0.325%", "NC 2018 compact switch");
equal(engine.formatCompactSwitchWeight(0.000885774206835777), "0.089%", "CA 2024 compact switch");
equal(engine.formatCompactSwitchWeight(0.203797608613968), "20.4%", "AZ 2008 compact switch");
equal(engine.formatCompactSwitchWeight(0.814259111881256), "81.4%", "WA 2006 compact switch");
equal(engine.formatCompactSwitchWeight(0), "0%", "an endpoint switch remains distinct from no switch");
equal(engine.formatCompactSwitchWeight(0.000000001), "<0.001%", "tiny custom switches do not round to zero");
equal(engine.formatCompactSwitchWeight(null), "—", "missing switches stay unavailable to the formatter");

equal(allocationCount, 4540, "all ranked seat allocations were audited");
equal(switchElectionCount, 217, "all switch elections were audited");
equal(noSwitchElectionCount, 53, "all no-switch elections were audited");

console.log(
  `Diagnostics audit passed ${assertionCount.toLocaleString("en-US")} assertions across ${allocationCount.toLocaleString("en-US")} allocations.`,
);
