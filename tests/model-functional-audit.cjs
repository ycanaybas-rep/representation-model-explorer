"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
require(path.join(projectRoot, "script.js"));

const engine = globalThis.__MODEL_EXPLORER__;
let assertionCount = 0;

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

check(engine, "shared model engine is exported");
equal(engine.FORMULA_VALIDATION_MAX_DISTRICTS, 53, "formula validation covers the dataset maximum");

const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
check(/id="mapViewLabel"/.test(indexHtml), "map view label can be updated with the active mode");
equal(
  Array.from(indexHtml.matchAll(/data-export-status-for="[^"]+"/g)).length,
  5,
  "map and all four figure downloads have visible local status regions",
);
check(
  !/id="analysisActionStatus"\s+class="sr-only"/.test(indexHtml),
  "the map export status is not screen-reader-only",
);

const defaultCompilation = engine.compileSpecification(engine.defaultFormulas);
equal(defaultCompilation.errors.length, 0, "default specification compiles");
engine.benchmarkSpecifications.forEach((benchmark) => {
  equal(
    engine.compileSpecification(benchmark.formulas).errors.length,
    0,
    `${benchmark.label} remains admissible through 53 seats`,
  );
});

const singularLargeDelegationLoss = engine.compileSpecification({
  ...engine.defaultFormulas,
  stateLoss: "z/(20-N)",
});
check(
  singularLargeDelegationLoss.errors.some(({ key }) => key === "stateLoss"),
  "a statewide loss that becomes singular at 20 seats is rejected",
);

const districts = engine.generateScenario("North Carolina", 2018);
const metrics = engine.computeMetrics(districts);
const exactShare = districts[0].demShare.toPrecision(17);
const exactOnlyDistrictLoss = `1/(p-${exactShare})^2`;
const exactInputFormulas = {
  ...engine.defaultFormulas,
  districtLossA: exactOnlyDistrictLoss,
  districtLossB: exactOnlyDistrictLoss,
};
equal(
  engine.compileSpecification(exactInputFormulas).errors.length,
  0,
  "the exact-input fixture deliberately passes the generic grid",
);
check(
  engine
    .compileSpecification(exactInputFormulas, { districts, weight: 0.37 })
    .errors.some(({ key }) => key === "districtLoss"),
  "a formula singular at an actual selected-election vote share is rejected before activation",
);

const spec = defaultCompilation.compiled;
const frontier = engine.computeRankedCandidateFrontier(districts, spec);
const election = engine.getElectionRecord("North Carolina", 2018);
const schedule = engine.applyBundledSwitchWeights(
  engine.computeSwitchSchedule(frontier, metrics, spec),
  election,
);
const weight = Number(election.switchWeights[0].toFixed(6));
const curve = engine.buildObjectiveCurve(frontier, metrics, weight, spec);
const best = engine.chooseScheduleCandidate(
  curve,
  schedule,
  weight,
  engine.chooseBestCandidate(curve, metrics),
);
const comparison = engine.buildOutcomeComparison(districts, metrics, frontier, best, spec);
const references = engine.buildReferenceOutcomes(districts, metrics, frontier, spec);
equal(comparison.model.demSeats, 4, "NC 2018 default model view has 4 Democratic seats");
equal(comparison.observed.demSeats, 3, "NC 2018 FPTP view has 3 Democratic seats");
equal(references.proportional.demSeats, 6, "NC 2018 proportional view has 6 Democratic seats");
equal(references.efficiency.demSeats, 6, "NC 2018 EG view has 6 Democratic seats");
equal(
  engine.formatAdaptiveWeight(weight, schedule, best.demSeats),
  "0.003250",
  "NC 2018 switch weight remains distinguishable in visible copy",
);
equal(
  engine.formatWeightWithPercent(weight, schedule, best.demSeats),
  "w = 0.003250 · 0.325%",
  "workspace weight pairs the exact NC 2018 value with its compact percentage",
);
equal(
  engine.formatWeightWithPercent(0.00753),
  "w = 0.007530 · 0.753%",
  "workspace weight preserves six-decimal precision while adding a percentage",
);
equal(
  engine.formatWeightWithPercent(0.000886),
  "w = 0.000886 · 0.089%",
  "workspace weight uses the diagnostics percentage precision for small weights",
);
const counterfactual = engine.scoreAllocationOutcome(
  districts,
  frontier.find((candidate) => candidate.demSeats !== best.demSeats).assignment,
  metrics,
  spec,
);

const cases = [
  ["model", comparison.model, "Model prediction"],
  ["inspection", counterfactual, "Selected counterfactual"],
  ["observed", comparison.observed, "FPTP baseline"],
  ["proportional", references.proportional, "Proportional benchmark"],
  ["efficiency", references.efficiency, "Efficiency-gap minimum"],
  ["meanMedian", comparison.observed, "Mean-median gap"],
];

cases.forEach(([mode, outcome, expectedEyebrow]) => {
  const presentation = engine.getMapPresentation({
    districts,
    metrics,
    outcome,
    mode,
    comparison,
    w: weight,
  });
  equal(presentation.eyebrow, expectedEyebrow, `${mode}: map eyebrow identifies the view`);
  equal(
    presentation.seatBadge,
    `${outcome.demSeats} D / ${outcome.repSeats} R`,
    `${mode}: map badge uses the displayed allocation`,
  );
  check(presentation.status.includes(expectedEyebrow), `${mode}: context line identifies the view`);
  check(presentation.takeaway.length > 20, `${mode}: view has a substantive explanation`);
});

console.log(`Model functional audit passed ${assertionCount.toLocaleString("en-US")} assertions.`);
