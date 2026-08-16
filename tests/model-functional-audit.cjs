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
equal(engine.MAX_FORMULA_SOURCE_LENGTH, 256, "live and permalink formulas share one length limit");

[
  ["0", 0],
  ["1", 1],
  [".5", 0.5],
  ["0.003250", 0.00325],
  ["0.000886", 0.000886],
  ["0,003250", 0.00325],
].forEach(([source, expected]) => {
  equal(engine.parseWeightInput(source), expected, `manual weight accepts ${source}`);
});
[
  "",
  " ",
  "-0.1",
  "1.000001",
  "0.1234567",
  "1e-3",
  "0x1",
  "0.1.2",
  "0,1.2",
  "weight",
].forEach((source) => {
  equal(engine.parseWeightInput(source), null, `manual weight rejects ${JSON.stringify(source)}`);
});

const rememberedStateUrl =
  "https://representation.yunusaybas.com/?sv=1&state=ca&year=2024&plan=ca52-schematic-v2&data=for-website-2026-08-04-v1-ca-2024&method=1.0.0&w=0.000886&spec=baseline&target=proportional&map=model&allocation=optimal";
const housePageUrl = "https://representation.yunusaybas.com/house.html?year=2024&w=0.000886";
equal(
  engine.normalizeStatePageUrl(rememberedStateUrl, housePageUrl),
  rememberedStateUrl,
  "a same-origin State scenario is accepted as a return destination",
);
equal(
  engine.getRememberedStateScenarioUrl({ getItem: () => rememberedStateUrl }, housePageUrl),
  rememberedStateUrl,
  "House restores the complete remembered State scenario",
);
equal(
  engine.validateStateScenarioUrl(rememberedStateUrl, housePageUrl),
  rememberedStateUrl,
  "a House return parameter restores the complete State scenario without storage",
);
equal(
  engine.getRememberedStateScenarioUrl(
    { getItem: () => "https://attacker.example/?sv=1" },
    housePageUrl,
  ),
  null,
  "an external remembered destination is rejected",
);
equal(
  engine.getRememberedStateScenarioUrl(
    { getItem: () => "https://representation.yunusaybas.com/?sv=1&state=ca" },
    housePageUrl,
  ),
  null,
  "an incomplete remembered scenario is rejected",
);
equal(
  engine.getRememberedStateScenarioUrl(
    { getItem: () => { throw new Error("storage unavailable"); } },
    housePageUrl,
  ),
  null,
  "unavailable browser storage leaves the static State link usable",
);
equal(
  engine.rememberStateScenarioUrl(
    rememberedStateUrl,
    { setItem: () => { throw new Error("storage unavailable"); } },
    housePageUrl,
  ),
  rememberedStateUrl,
  "the current State tab keeps its canonical link when storage cannot write",
);

const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
check(/id="stateNavLink"[^>]*aria-current="page"/.test(indexHtml), "State nav has a live scenario link");
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
const stateScript = fs.readFileSync(path.join(projectRoot, "script.js"), "utf8");
check(
  /mapWeightEntry\.requestSubmit\(\)/.test(stateScript),
  "State exact-weight entry supports the mobile keyboard Enter action",
);
check(
  /els\.wSlider\.step = String\(WEIGHT_URL_STEP\)/.test(stateScript),
  "State exact-weight entry retains six-decimal precision in the model source",
);
check(
  /houseParams\.set\(\s*"stateScenario"/.test(stateScript),
  "the House link carries a validated State return fallback",
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

const californiaDistricts = engine.generateScenario("California", 2024);
const californiaExactShare = californiaDistricts[0].demShare.toPrecision(17);
const electionSpecificFormulas = {
  ...engine.defaultFormulas,
  districtLossA: `1/(p-${californiaExactShare})^2`,
  districtLossB: `1/(p-${californiaExactShare})^2`,
};
equal(
  engine.compileSpecification(electionSpecificFormulas, { districts, weight: 0.00325 }).errors.length,
  0,
  "the cross-election fixture is valid on NC 2018",
);
check(
  engine
    .compileSpecification(electionSpecificFormulas, { districts: californiaDistricts, weight: 0.000886 })
    .errors.some(({ key }) => key === "districtLoss"),
  "the same formula is rejected before a transition to its singular California profile",
);

const midrangeSingularity = {
  ...engine.defaultFormulas,
  aggregation: "y_1+y_2+0/(y_1-2.5682360394865231)",
};
equal(
  engine.compileSpecification(midrangeSingularity).errors.length,
  0,
  "the midrange aggregation fixture deliberately passes the generic formula grid",
);
check(
  engine
    .compileSpecification(midrangeSingularity, { districts, weight: 0.00325 })
    .errors.some(({ key }) => key === "aggregation"),
  "scenario validation samples the full weight range and rejects a midrange singularity",
);

check(
  engine
    .compileSpecification({
      ...engine.defaultFormulas,
      aggregation: "y_1+y_2+" + "0".repeat(engine.MAX_FORMULA_SOURCE_LENGTH),
    })
    .errors.some(({ key }) => key === "aggregation"),
  "formula sources longer than the permalink limit are rejected",
);

const tiedCustomProfile = engine.validateCustomStateDefinition({
  name: "Tie fixture",
  districts: [
    { demVotes: 50, repVotes: 50 },
    { demVotes: 55, repVotes: 45 },
    { demVotes: 45, repVotes: 55 },
  ],
});
check(!tiedCustomProfile.value && /tied/i.test(tiedCustomProfile.error), "custom tied districts require a defined local winner");

const newYorkNearTie = engine
  .generateScenario("New York", 2020)
  .find((district) => district.id === 22);
check(!engine.isExactDistrictTie(newYorkNearTie), "NY 2020 district 22 is preserved as a real plurality, not a tie");
equal(
  engine.formatDistrictWinningMargin(newYorkNearTie.margin),
  "0.035 pts",
  "sub-tenth-point plurality margins receive enough visible precision",
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
