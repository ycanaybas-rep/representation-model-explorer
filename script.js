"use strict";

if (
  typeof globalThis !== "undefined" &&
  !globalThis.__MISREPRESENTATION_ELECTION_DATA__ &&
  typeof require === "function"
) {
  require("./election-data.js");
}

const bundledElectionData = globalThis.__MISREPRESENTATION_ELECTION_DATA__;
if (!bundledElectionData || bundledElectionData.schema !== "mme-election-data") {
  throw new Error("The bundled election dataset is missing or incompatible.");
}

const stateConfigs = Object.fromEntries(
  Object.entries(bundledElectionData.states)
    .sort(([, first], [, second]) => first.name.localeCompare(second.name))
    .map(([code, state]) => [
      state.name,
      {
        code,
        years: Object.keys(state.elections)
          .map(Number)
          .sort((first, second) => first - second),
      },
    ]),
);

const CUSTOM_STATE_KEY = "__custom_state__";
const CUSTOM_YEAR_LABEL = "Entered votes";
const CUSTOM_STATE_STORAGE_KEY = "misrepresentationCustomStateV1";
const CUSTOM_DISTRICT_MIN = 3;
const CUSTOM_DISTRICT_MAX = 18;
const MAX_FORMULA_SOURCE_LENGTH = 256;
const FORMULA_SCENARIO_WEIGHT_SAMPLES = 100;
const FORMULA_VALIDATION_MAX_DISTRICTS = Math.max(
  CUSTOM_DISTRICT_MAX,
  ...Object.values(bundledElectionData.states).flatMap((state) =>
    Object.values(state.elections).map((election) => Number(election.seats) || 0),
  ),
);
const FORMULA_VALIDATION_DELEGATION_SIZES = Object.freeze(
  Array.from(
    { length: FORMULA_VALIDATION_MAX_DISTRICTS - CUSTOM_DISTRICT_MIN + 1 },
    (_, index) => CUSTOM_DISTRICT_MIN + index,
  ),
);
const CUSTOM_NORMALIZED_DISTRICT_TOTAL = 100000;
const SCENARIO_URL_VERSION = "1";
const SCENARIO_JSON_SCHEMA = "mme-scenario";
const SCENARIO_JSON_VERSION = 1;
const METHODOLOGY_VERSION = "1.0.0";
const METHODOLOGY_LAST_UPDATED = "2026-08-04";
const WEIGHT_STEP = 0.001;
const WEIGHT_URL_STEP = 0.000001;
const DENSE_WEIGHT_REGIME_WIDTH = 0.01;
const SWITCH_FOCUS_MAX_ENVELOPE = 0.25;
const SWITCH_FOCUS_MIN_WIDTH = 0.02;
const SWITCH_FOCUS_MIN_PADDING = 0.005;
const SWITCH_FOCUS_PADDING_RATIO = 0.12;
const MAX_EXHAUSTIVE_ALLOCATION_SEATS = 18;
const SAMPLED_ALLOCATION_COUNT = 32768;
const PAPER_CITATION =
  "Yunus C. Aybas, Oguzhan Celebi, and Surabhi Dutt, Representation in District-Based Elections, working paper, July 26, 2026.";
const ELECTION_DATA_SOURCE =
  "Author-supplied for_website.xls district-level two-party vote-share dataset";
const PUBLICATION_CAVEAT =
  "Model allocations are analytical outputs from the selected inputs and specification. They are not official election results, certified returns, legal district maps, enacted-plan determinations, or legal findings, and no single diagnostic establishes electoral fairness.";
const STATE_URL_KEYS = Object.freeze(
  Object.fromEntries(
    Object.entries(stateConfigs).map(([name, config]) => [name, config.code.toLowerCase()]),
  ),
);
const URL_STATE_KEYS = Object.freeze(
  Object.fromEntries(Object.entries(STATE_URL_KEYS).map(([name, key]) => [key, name])),
);
const paperLinearSpecification = Object.freeze({
  districtLossA: "1-p",
  districtLossB: "p",
  stateTarget: "\\rho",
  stateLoss: "z",
  aggregation: "y_1+y_2",
  districtPrimitiveDisplay:
    "\\delta(1,p)=1-p,\\qquad \\delta(0,p)=p",
  districtTotalDisplay:
    "\\mathrm{Dist}(\\mathbf x,\\mathbf p)=\\sum_{d=1}^{N}\\left[x_d(1-p_d)+(1-x_d)p_d\\right]",
  statewideDisplay:
    "\\mathrm{State}(\\mathbf x,\\mathbf p)=\\left|S(\\mathbf x)-\\rho\\right|",
  objectiveDisplay:
    "M(\\mathbf x,\\mathbf p;w)=(1-w)\\mathrm{Dist}(\\mathbf x,\\mathbf p)+w\\left|S(\\mathbf x)-\\rho\\right|",
});

const formulaPresets = {
  districtLoss: [
    {
      id: "linear",
      label: "Voter loss (paper)",
      texA: paperLinearSpecification.districtLossA,
      texB: paperLinearSpecification.districtLossB,
      description: "Counts voters represented by their nonpreferred party; its switch margin is 1-2p.",
    },
    {
      id: "quadratic",
      label: "Quadratic voter loss",
      texA: "(1-p)^2",
      texB: "p^2",
      description: "Penalizes large local mismatches more strongly while preserving district responsiveness.",
    },
    {
      id: "pluralityMargin",
      label: "Plurality-reversal margin",
      texA: "\\max(0,1-2p)",
      texB: "\\max(0,2p-1)",
      description: "Charges only for assigning a district against its local plurality; the switch margin remains decreasing.",
    },
    {
      id: "cubic",
      label: "Cubic voter loss",
      texA: "(1-p)^3",
      texB: "p^3",
      description: "A more convex voter-mismatch sensitivity check with a decreasing district switch margin.",
    },
  ],
  stateTarget: [
    {
      id: "proportional",
      label: "Proportional target",
      tex: paperLinearSpecification.stateTarget,
      description: "The paper's linear benchmark target: statewide support measured directly in seat units.",
    },
    {
      id: "efficiency",
      label: "Feasible efficiency-gap target",
      tex: "\\min(N,\\max(0,2\\rho-\\frac{N}{2}))",
      description: "Matches the paper's efficiency-gap target on its interior range and clips only at the feasible seat boundaries.",
    },
    {
      id: "squareLaw",
      label: "Square-law target",
      tex: "N\\frac{(\\rho/N)^2}{(\\rho/N)^2+(1-\\rho/N)^2}",
      description: "A symmetric winner's-bonus target that always remains between zero and N seats.",
    },
    {
      id: "cubeLaw",
      label: "Cube-law target",
      tex: "N\\frac{(\\rho/N)^3}{(\\rho/N)^3+(1-\\rho/N)^3}",
      description: "The paper's cube-law benchmark: symmetric, monotone, and bounded by the feasible seat range.",
    },
  ],
  stateLoss: [
    {
      id: "linear",
      label: "Linear seat gap (paper)",
      tex: paperLinearSpecification.stateLoss,
      description: "The paper's benchmark Q(z)=z on the same seat-unit scale as district loss.",
    },
    {
      id: "quadratic",
      label: "Quadratic seat gap",
      tex: "\\frac{z^2}{N}",
      description: "A strictly increasing convex penalty with growing marginal cost of target distance.",
    },
    {
      id: "gallagher",
      label: "Gallagher / Loosemore-Hanby",
      tex: "\\frac{z}{N}",
      description: "The paper's two-party Gallagher/Loosemore-Hanby normalization of the proportional seat gap.",
    },
    {
      id: "gallagherSquared",
      label: "Squared Gallagher",
      tex: "(\\frac{z}{N})^2",
      description: "The squared least-squares normalization before taking the Gallagher square root.",
    },
  ],
  aggregation: [
    {
      id: "linear",
      label: "Linear sum (paper)",
      tex: paperLinearSpecification.aggregation,
      description: "Adds the two weighted components; the marginal rate of substitution is constant at one.",
    },
    {
      id: "minimax",
      label: "Minimax (paper appendix)",
      tex: "\\max(y_1,y_2)",
      description: "A finite, continuous, convex nonsmooth aggregator that minimizes the worse weighted component.",
    },
    {
      id: "shiftedEuclidean",
      label: "Shifted Euclidean",
      tex: "\\sqrt{(1+y_1)^2+(1+y_2)^2}",
      description: "A smooth convex aggregator with positive marginal weight on each component, including at the origin.",
    },
    {
      id: "quadraticBlend",
      label: "Convex quadratic blend",
      tex: "y_1+y_2+\\frac{y_1^2+y_2^2}{2}",
      description: "A convex sensitivity check that retains positive linear marginal weight on both components.",
    },
  ],
};

const specMeta = {
  districtLoss: {
    fields: {
      districtLossA: "formulaDistrictLossA",
      districtLossB: "formulaDistrictLossB",
    },
    preset: "districtLossPreset",
    note: "districtLossPresetNote",
    preview: "previewDistrictLoss",
    error: "errorDistrictLoss",
    label: "District loss primitive",
  },
  stateTarget: {
    field: "formulaStateTarget",
    preset: "stateTargetPreset",
    note: "stateTargetPresetNote",
    preview: "previewStateTarget",
    error: "errorStateTarget",
    label: "Statewide target",
    prefix: "T(\\rho)=",
  },
  stateLoss: {
    field: "formulaStateLoss",
    preset: "stateLossPreset",
    note: "stateLossPresetNote",
    preview: "previewStateLoss",
    error: "errorStateLoss",
    label: "Statewide penalty",
    prefix: "Q(z)=",
  },
  aggregation: {
    field: "formulaAggregation",
    preset: "aggregationPreset",
    note: "aggregationPresetNote",
    preview: "previewAggregation",
    error: "errorAggregation",
    label: "Total aggregation function",
    prefix: "F(y_1,y_2)=",
  },
};

const defaultFormulas = {
  districtLossA: formulaPresets.districtLoss[0].texA,
  districtLossB: formulaPresets.districtLoss[0].texB,
  stateTarget: formulaPresets.stateTarget[0].tex,
  stateLoss: formulaPresets.stateLoss[0].tex,
  aggregation: formulaPresets.aggregation[0].tex,
};

const benchmarkSpecifications = [
  {
    id: "baseline",
    label: "Paper linear benchmark",
    description: "The exact Section 4 specification: voter loss, proportional target, and linear F.",
    formulas: { ...defaultFormulas },
  },
  {
    id: "quadraticState",
    label: "Quadratic statewide loss",
    description: "A convex Q(z)=z²/N on the paper's [0,N] seat-unit scale.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "proportional").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "quadratic").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "quadraticDistrict",
    label: "Quadratic district loss",
    description: "An admissible exploratory delta with squared voter mismatch.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "quadratic").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "quadratic").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "proportional").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "linear").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "minimax",
    label: "Minimax aggregator",
    description: "The paper appendix benchmark F(y₁,y₂)=max{y₁,y₂}.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "proportional").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "linear").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "minimax").tex,
    },
  },
  {
    id: "gallagher",
    label: "Gallagher proportionality",
    description: "The paper's two-party Gallagher/Loosemore-Hanby normalization Q(z)=z/N.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "proportional").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "gallagher").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "gallagherSquared",
    label: "Squared Gallagher loss",
    description: "The paper's squared least-squares normalization Q(z)=(z/N)².",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "proportional").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "gallagherSquared").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "efficiency",
    label: "Feasible efficiency-gap target",
    description: "The Section 6.2 target on its interior range, clipped only to keep T(ρ) in [0,N].",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "efficiency").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "linear").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "squareLaw",
    label: "Square-law target",
    description: "An admissible symmetric winner's-bonus target with power exponent 2.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "squareLaw").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "linear").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
  {
    id: "cubeLaw",
    label: "Cube-law target",
    description: "The paper appendix power-law target with exponent γ=3.",
    formulas: {
      districtLossA: formulaPresets.districtLoss.find((item) => item.id === "linear").texA,
      districtLossB: formulaPresets.districtLoss.find((item) => item.id === "linear").texB,
      stateTarget: formulaPresets.stateTarget.find((item) => item.id === "cubeLaw").tex,
      stateLoss: formulaPresets.stateLoss.find((item) => item.id === "linear").tex,
      aggregation: formulaPresets.aggregation.find((item) => item.id === "linear").tex,
    },
  },
];

const els = {};
const frontierCache = new Map();
const scheduleCache = new Map();
const feasibleLossCache = new Map();
const thresholdSeriesCache = new Map();
const PAPER_CHART = Object.freeze({
  width: 920,
  height: 430,
  left: 76,
  right: 28,
  top: 30,
  bottom: 62,
});
const PNG_EXPORT_PALETTE = Object.freeze({
  canvas: "#f5f3ed",
  paper: "#ffffff",
  ink: "#17231f",
  muted: "#66716d",
  line: "#d5dbd8",
  accent: "#276f69",
  accentSoft: "#e8f1ef",
  gold: "#d49b12",
  dem: "#5f8fc5",
  demStrong: "#2368ad",
  rep: "#d87975",
  repStrong: "#c43e3a",
});
const PAPER_FIGURE_EXPORTS = Object.freeze({
  pareto: {
    number: "01",
    slug: "pareto-frontier",
    titleId: "figure2Title",
    svgId: "paretoOverlay",
    canvasId: "paretoCanvas",
    legend: [
      ["dot", "#5f8fc5", "All allocations"],
      ["dot", "#d87975", "Lowest district loss at each seat total"],
      ["square", "#276f69", "Pareto frontier"],
      ["ring", "#d49b12", "Shown on map"],
    ],
  },
  threshold: {
    number: "02",
    slug: "threshold-rule",
    titleId: "figure3Title",
    svgId: "thresholdChart",
    legend: [
      ["line", "#17231f", "Optimal threshold"],
      ["dash", "#9a6c18", "District-majority reference"],
      ["ring", "#d49b12", "Current weight"],
    ],
  },
  "seat-path": {
    number: "03",
    slug: "seat-path",
    titleId: "figure4Title",
    svgId: "seatPathChart",
    legend: [
      ["line", "#17231f", "Optimal seat path"],
      ["dash", "#d87975", "Statewide target"],
      ["dot", "#276f69", "Switching weights"],
      ["ring", "#d49b12", "Current weight"],
    ],
  },
  "iso-loss": {
    number: "04",
    slug: "objective-geometry",
    titleId: "figure1Title",
    svgId: "isoLossChart",
    legend: [
      ["dash", "#276f69", "Equal total misrepresentation"],
      ["line", "#c45252", "Pareto frontier"],
      ["dot", "#9aa4a0", "Dominated allocation"],
      ["ring", "#d49b12", "Current optimum"],
    ],
  },
});
const SVG_EXPORT_STYLE_PROPERTIES = Object.freeze([
  "color",
  "display",
  "visibility",
  "opacity",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "paint-order",
  "vector-effect",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "shape-rendering",
  "text-rendering",
]);
const DIAGNOSTIC_MAP_TARGETS = Object.freeze({
  efficiency: { label: "Efficiency-gap minimum", kind: "allocation" },
  partisanBias: { label: "Partisan-bias minimum", kind: "allocation" },
  proportional: { label: "Proportional benchmark", kind: "allocation" },
  observed: { label: "FPTP baseline", kind: "allocation" },
  seatVoteGap: { label: "Seat-vote-gap minimum", kind: "allocation" },
  declination: { label: "Declination minimum", kind: "allocation" },
  gallagher: { label: "Gallagher minimum", kind: "allocation" },
  meanMedian: { label: "Mean-median vote lens", kind: "profile" },
  competitive: { label: "Competitive-district lens", kind: "profile" },
  responsiveness: { label: "Responsiveness vote lens", kind: "profile" },
  lopsidedMargins: { label: "Lopsided-margin minimum", kind: "allocation" },
  majorityInversion: { label: "Majority-inversion safeguard", kind: "allocation" },
});
const VALID_MAP_MODES = new Set(["model", ...Object.keys(DIAGNOSTIC_MAP_TARGETS)]);
let activeState = "North Carolina";
let activeYear = 2018;
let activeMapMode = "model";
let customState = null;
let activeFormulas = { ...defaultFormulas };
let compiledSpec = null;
let activeDistricts = [];
let activeModel = null;
let inspectedDemSeats = null;
let resultsCueTimer = null;
let isEmbedMode = false;
let explorerInitialized = false;
let preserveCleanLandingUrl = false;
let scenarioRestoreNotice = "";
let guidedProgressStep = 1;
let newsroomReturnFocus = null;
let newsroomScrollPosition = { left: 0, top: 0 };
let customStateDialogReturnFocus = null;
let customStateDialogShouldRestoreFocus = true;
let mapWeightFocused = false;
let mapWeightDomain = { min: 0, max: 1, digits: 3 };
let floatingWeightFocused = false;
let floatingWeightDomain = { min: 0, max: 1, digits: 3 };

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body?.dataset.page === "explorer") initializeApp();
  });
}

function encodeBase64Url(value) {
  const text = String(value);
  let base64;
  if (typeof TextEncoder !== "undefined" && typeof btoa === "function") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    base64 = btoa(binary);
  } else if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(text, "utf8").toString("base64");
  } else {
    throw new Error("This browser cannot encode a portable scenario.");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value, maxLength = 16384) {
  const encoded = String(value || "");
  if (!encoded || encoded.length > maxLength * 2) {
    throw new Error("The portable scenario payload is missing or too large.");
  }
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(encoded.length / 4) * 4,
    "=",
  );
  let decoded;
  if (typeof atob === "function" && typeof TextDecoder !== "undefined") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } else if (typeof Buffer !== "undefined") {
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } else {
    throw new Error("This browser cannot decode a portable scenario.");
  }
  if (decoded.length > maxLength) throw new Error("The portable scenario payload is too large.");
  return decoded;
}

function getCustomDataVersion(definition) {
  const compact = JSON.stringify({
    name: definition.name,
    votes: definition.districts.map(({ demVotes, repVotes }) => [demVotes, repVotes]),
  });
  return `custom-${hashString(compact).toString(36)}-v1`;
}

function canonicalizeFormulas(formulas) {
  return Object.fromEntries(
    Object.keys(defaultFormulas).map((key) => [key, String(formulas[key]).trim()]),
  );
}

function serializeCustomState(definition) {
  return {
    name: definition.name,
    votes: definition.districts.map(({ demVotes, repVotes }) => [demVotes, repVotes]),
    updatedAt: definition.updatedAt,
  };
}

function deserializeCustomState(payload) {
  const candidate = {
    name: payload?.name,
    districts: Array.isArray(payload?.votes)
      ? payload.votes.map((votes) => ({ demVotes: votes?.[0], repVotes: votes?.[1] }))
      : [],
    updatedAt: payload?.updatedAt,
  };
  const validation = validateCustomStateDefinition(candidate);
  if (!validation.value) throw new Error(validation.error);
  return validation.value;
}

function getElectionRecord(stateName, year) {
  const stateCode = stateConfigs[stateName]?.code;
  return stateCode
    ? bundledElectionData.states[stateCode]?.elections?.[String(Number(year))] || null
    : null;
}

function getScenarioStartingWeight(schedule, fallback = 0.5) {
  const firstSwitch = Number(schedule?.switches?.[0]?.weight);
  const startingWeight = Number.isFinite(firstSwitch)
    ? clamp(firstSwitch, 0, 1)
    : clamp(Number(fallback) || 0, 0, 1);
  return Number(startingWeight.toFixed(6));
}

function setDefaultFocusedWeightViews() {
  mapWeightFocused = true;
  floatingWeightFocused = true;
  document.querySelectorAll("[data-shared-weight-control]").forEach((control) => {
    control.dataset.rangeMode = "focused";
  });
}

function setActiveScenarioStartingWeight() {
  const districts =
    activeState === CUSTOM_STATE_KEY
      ? createCustomScenario(customState)
      : generateScenario(activeState, activeYear);
  const metrics = computeMetrics(districts);
  const frontier = getCandidateFrontier(districts);
  const schedule = getSwitchSchedule(frontier, metrics);
  const startingWeight = getScenarioStartingWeight(schedule);
  // Avoid inheriting the previous election's coarser slider step, which can
  // snap a small first-switch value before the new scenario is rendered.
  els.wSlider.step = String(WEIGHT_URL_STEP);
  els.wSlider.value = startingWeight.toFixed(6);
  setDefaultFocusedWeightViews();
  return startingWeight;
}

function getScenarioDistricts(stateName, year, customDefinition = customState) {
  return stateName === CUSTOM_STATE_KEY
    ? createCustomScenario(customDefinition)
    : generateScenario(stateName, year);
}

function validateScenarioActivation(stateName, year, customDefinition = customState) {
  try {
    const districts = getScenarioDistricts(stateName, year, customDefinition);
    const errors = compiledSpec
      ? validateCompiledSpecificationForScenario(
          compiledSpec,
          districts,
          Number(els?.wSlider?.value ?? 0.5),
        )
      : [];
    return { districts, errors };
  } catch (error) {
    return {
      districts: null,
      errors: [
        {
          key: "districtLoss",
          message: error instanceof Error ? error.message : "The election could not be evaluated.",
        },
      ],
    };
  }
}

function reportScenarioActivationFailure(stateName, year, errors) {
  clearAllFormulaErrors();
  errors.forEach(({ key, message }) => setFormulaError(key, message));
  const label =
    stateName === CUSTOM_STATE_KEY
      ? "the custom profile"
      : `${stateName} ${year}`;
  const message = `The active formulas are not valid for ${label}. The current election was kept.`;
  setFormulaStatus(message, true);
  setAnalysisActionStatus(message, true);
}

function getElectionQualityCounts(election) {
  return (election?.districts || []).reduce(
    (counts, district) => ({
      proxy: counts.proxy + (Number(district[3]) === 1 ? 1 : 0),
      largeThirdParty: counts.largeThirdParty + (Number(district[4]) === 1 ? 1 : 0),
    }),
    { proxy: 0, largeThirdParty: 0 },
  );
}

function getScenarioSeatCount(stateName, year, customDefinition = null) {
  if (stateName === CUSTOM_STATE_KEY) return customDefinition?.districts?.length || 0;
  return getElectionRecord(stateName, year)?.seats || 0;
}

function parseScenarioUrl(urlLike) {
  let url;
  try {
    url = new URL(urlLike, "https://example.invalid/index.html");
  } catch {
    return { found: false, warning: "The scenario URL could not be read; defaults were loaded." };
  }
  const params = url.searchParams;
  const hasScenario = params.has("sv");
  if (!hasScenario) {
    return {
      found: false,
      legacyCustom: params.get("state") === "custom",
      embed: params.get("embed") === "1",
      warning: "",
    };
  }
  if (params.get("sv") !== SCENARIO_URL_VERSION) {
    return {
      found: false,
      embed: params.get("embed") === "1",
      warning: `Scenario URL version ${params.get("sv") || "(missing)"} is not supported; defaults were loaded.`,
    };
  }
  const requiredKeys = [
    "state",
    "year",
    "plan",
    "data",
    "method",
    "w",
    "spec",
    "target",
    "map",
    "allocation",
  ];
  const missingKeys = requiredKeys.filter((key) => !params.has(key));
  if (missingKeys.length) {
    return {
      found: false,
      embed: params.get("embed") === "1",
      warning: `The scenario link is missing ${missingKeys.join(", ")}; defaults were loaded.`,
    };
  }
  if (params.get("method") !== METHODOLOGY_VERSION) {
    return {
      found: false,
      embed: params.get("embed") === "1",
      warning: `Methodology version ${params.get("method")} is unavailable; defaults were loaded rather than silently reinterpreting the link.`,
    };
  }

  try {
    const stateKey = params.get("state") || "";
    const stateName =
      stateKey === "custom"
        ? CUSTOM_STATE_KEY
        : URL_STATE_KEYS[stateKey] || (stateConfigs[stateKey] ? stateKey : null);
    if (!stateName) throw new Error("The linked state is unavailable.");

    let customDefinition = null;
    let year;
    if (stateName === CUSTOM_STATE_KEY) {
      if (!params.get("custom")) {
        throw new Error("This custom-state link does not contain its district votes.");
      }
      customDefinition = deserializeCustomState(
        JSON.parse(decodeBase64Url(params.get("custom"))),
      );
      year = CUSTOM_YEAR_LABEL;
    } else {
      year = Number(params.get("year"));
      if (!Number.isInteger(year) || !stateConfigs[stateName].years.includes(year)) {
        throw new Error("The linked election year is unavailable for this state.");
      }
    }

    const metadata =
      stateName === CUSTOM_STATE_KEY
        ? getCustomScenarioMetadata(customDefinition)
        : getScenarioMetadata(stateName, year);
    if (params.get("plan") !== metadata.planId || params.get("data") !== metadata.dataVersion) {
      throw new Error(
        "The linked plan or data version is unavailable; defaults were loaded rather than substituting different data.",
      );
    }

    const weight = Number(params.get("w"));
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error("The linked statewide weight must be between 0 and 1.");
    }
    if (
      Math.abs(weight / WEIGHT_URL_STEP - Math.round(weight / WEIGHT_URL_STEP)) > 1e-7
    ) {
      throw new Error("The linked statewide weight is unavailable at the six-decimal control resolution.");
    }

    const specificationId = params.get("spec") || "baseline";
    let formulas;
    if (specificationId === "custom") {
      const decodedFormulas = JSON.parse(decodeBase64Url(params.get("formulas"), 4096));
      formulas = Object.fromEntries(
        Object.keys(defaultFormulas).map((key) => {
          const value = decodedFormulas?.[key];
          if (typeof value !== "string" || !value.trim() || value.length > 256) {
            throw new Error("The linked custom specification is incomplete or too large.");
          }
          return [key, value.trim()];
        }),
      );
    } else {
      const benchmark = benchmarkSpecifications.find((item) => item.id === specificationId);
      if (!benchmark) throw new Error("The linked model specification is unavailable.");
      formulas = { ...benchmark.formulas };
    }
    const validationDistricts =
      stateName === CUSTOM_STATE_KEY
        ? createCustomScenario(customDefinition)
        : generateScenario(stateName, year);
    const compiled = compileSpecification(formulas, {
      districts: validationDistricts,
      weight,
    });
    if (compiled.errors.length) throw new Error("The linked model specification is not admissible.");
    const targetId = getTargetContext(formulas).id;
    if (params.get("target") !== targetId) {
      throw new Error("The linked statewide target does not match its specification.");
    }

    const mapMode = params.get("map") || "model";
    if (!VALID_MAP_MODES.has(mapMode)) throw new Error("The linked map mode is unavailable.");
    const allocationValue = params.get("allocation") || "optimal";
    const seatCount = getScenarioSeatCount(stateName, year, customDefinition);
    const selectedDemSeats =
      allocationValue === "optimal" ? null : Number(allocationValue.replace(/d$/i, ""));
    if (
      selectedDemSeats !== null &&
      (!Number.isInteger(selectedDemSeats) || selectedDemSeats < 0 || selectedDemSeats > seatCount)
    ) {
      throw new Error("The linked selected allocation is unavailable.");
    }

    return {
      found: true,
      stateName,
      year,
      customDefinition,
      weight,
      specificationId,
      formulas,
      compiledSpec: compiled.compiled,
      targetId,
      mapMode,
      selectedDemSeats,
      embed: params.get("embed") === "1",
      warning: "",
    };
  } catch (error) {
    return {
      found: false,
      embed: params.get("embed") === "1",
      warning: error instanceof Error ? error.message : "The scenario link is invalid.",
    };
  }
}

function initializeApp() {
  cacheElements();
  positionGeneralModelDrawer();
  customState = loadCustomState();
  const restored =
    typeof window === "undefined" ? { found: false } : parseScenarioUrl(window.location.href);
  preserveCleanLandingUrl =
    typeof window !== "undefined" &&
    !window.location.search &&
    !new URLSearchParams(window.location.search).has("sv");
  scenarioRestoreNotice = restored.warning || "";
  isEmbedMode = Boolean(restored.embed);
  document.body.classList.toggle("embed-view", isEmbedMode);
  if (restored.found) {
    activeState = restored.stateName;
    activeYear = restored.year;
    if (restored.customDefinition) customState = restored.customDefinition;
    activeMapMode = restored.mapMode;
    inspectedDemSeats = restored.selectedDemSeats;
  } else if (restored.legacyCustom && customState) {
    activeState = CUSTOM_STATE_KEY;
    activeYear = CUSTOM_YEAR_LABEL;
    scenarioRestoreNotice =
      "This legacy custom-state link used votes saved in this browser. Copy a new permanent link for portable restoration.";
  }
  populateScenarioControls();
  if (els.customStatePanel) populateCustomStateBuilder();
  populatePresetControls();
  populateBenchmarkControls();
  const initialFormulas = restored.found ? restored.formulas : defaultFormulas;
  setFormulaFields(initialFormulas);
  bindControls();
  previewAllFormulas();

  compiledSpec = restored.found
    ? restored.compiledSpec
    : compileSpecification(defaultFormulas).compiled;
  activeFormulas = { ...initialFormulas };
  setDefaultFocusedWeightViews();
  if (restored.found) els.wSlider.value = restored.weight.toFixed(6);
  else setActiveScenarioStartingWeight();
  selectMapMode(activeMapMode);

  syncAllPresetSelections();
  syncBenchmarkSelection();
  syncTopSpecificationStatus();
  renderActiveSpec();
  explorerInitialized = true;
  render();
  setGuidedProgress(1);
  if (scenarioRestoreNotice) setAnalysisActionStatus(scenarioRestoreNotice, true);
}

function positionGeneralModelDrawer() {
  const drawer = document.getElementById("advanced");
  const outcomeComparison = document.querySelector("#allocation > .outcome-comparison");
  if (drawer && outcomeComparison && drawer.previousElementSibling !== outcomeComparison) {
    outcomeComparison.after(drawer);
  }
}

function cacheElements() {
  [
    "houseNavLink",
    "stateSelect",
    "yearSelect",
    "customStateLaunch",
    "customStatePanel",
    "customStateForm",
    "customStateClose",
    "customStateCancel",
    "customStateName",
    "customDistrictCount",
    "customExampleVotes",
    "customCsvFile",
    "downloadCsvTemplate",
    "customImportStatus",
    "customVoteRows",
    "customStateStatus",
    "analyzeCustomState",
    "wSlider",
    "wValue",
    "mapWeightControl",
    "mapWeightTrack",
    "mapWSlider",
    "mapWValue",
    "mapWeightMarkers",
    "mapWeightLower",
    "mapWeightMidpoint",
    "mapWeightFocus",
    "mapWeightSwitchStatus",
    "floatingWeightControl",
    "floatingWSlider",
    "floatingWValue",
    "floatingWeightMarkers",
    "floatingWeightStatus",
    "floatingWeightLower",
    "floatingWeightUpper",
    "floatingWeightFocus",
    "floatingPreviousSwitch",
    "floatingNextSwitch",
    "mapWeightGoal",
    "mapWeightEndpoint",
    "weightControlLabel",
    "weightTargetBadge",
    "restoreProportionalTarget",
    "weightTargetLabel",
    "regimeSummary",
    "weightPlainLanguage",
    "entryScenarioLabel",
    "entryDataStatus",
    "entrySource",
    "entryLastUpdated",
    "entryProfileLabel",
    "entryProfileDescription",
    "entryWeightSummary",
    "workspaceScenarioTitle",
    "workspaceWeightValue",
    "workspaceResultLabel",
    "workspaceDemSeats",
    "workspaceRepSeats",
    "guidedProgressStatus",
    "guidedModelSeats",
    "guidedModelNote",
    "guidedFptpSeats",
    "guidedProportionalSeats",
    "guidedEfficiencySeats",
    "guidedCompareStatus",
    "wInterpretation",
    "lossFormula",
    "objectiveEyebrow",
    "topSpecControl",
    "topSpecLabel",
    "topSpecBadge",
    "topSpecNote",
    "topSpecAction",
    "modelOutputEyebrow",
    "modelOutputTitle",
    "modelOutputDescription",
    "primaryResultBadge",
    "mapTitle",
    "mapSubtitle",
    "mapTargetLabel",
    "mapTargetValue",
    "mapViewLabel",
    "mapSeatBadge",
    "mapFlipCount",
    "mapPredictionTakeaway",
    "mapLegendDem",
    "mapLegendRep",
    "mapLegendFocus",
    "modelMapModeLabel",
    "mapWrap",
    "mapPanCue",
    "mapShapes",
    "districtTooltip",
    "demVoteLabel",
    "repVoteLabel",
    "voteShareLabel",
    "demVoteBar",
    "repVoteBar",
    "voteStrip",
    "predictionEyebrow",
    "predictionStatus",
    "restoreOptimum",
    "optimalSeats",
    "optimalDistrictLoss",
    "optimalDistrictLossNote",
    "optimalStateLoss",
    "optimalStateLossNote",
    "optimalLoss",
    "optimalLossNote",
    "objectiveValueLabel",
    "headlineMetricsEyebrow",
    "diagnosticPickerStatus",
    "efficiencyGap",
    "efficiencyGapNote",
    "partisanBias",
    "partisanBiasNote",
    "seatVoteGap",
    "seatVoteGapNote",
    "declination",
    "declinationNote",
    "diagnosticFirstSwitchCard",
    "diagnosticFirstSwitchWeight",
    "diagnosticFirstSwitchNote",
    "diagnosticFirstSwitchContext",
    "meanMedianGap",
    "meanMedianGapNote",
    "paperSupport",
    "paperSupportNote",
    "rawVoteSupportLabel",
    "rawVoteSupport",
    "rawVoteSupportNote",
    "firstSwitchWeight",
    "firstSwitchNote",
    "targetSwitchLabel",
    "proportionalSwitchWeight",
    "proportionalSwitchNote",
    "outcomeComparisonTable",
    "exportCitedPage",
    "exportSelectionSummary",
    "exportStampContext",
    "exportStampGenerated",
    "analysisActionStatus",
    "calculationTrace",
    "lossBars",
    "lossDetail",
    "lossChartDescription",
    "chartLegend",
    "showWinningPrediction",
    "showCurrentRegime",
    "switchCount",
    "switchSchedule",
    "districtAssignmentsEyebrow",
    "districtAssignmentsTitle",
    "districtModelColumn",
    "districtRows",
    "advancedToggle",
    "advancedPanel",
    "advancedSpecLabel",
    "advancedToggleAction",
    "closeAdvancedSettings",
    "benchmarkSelect",
    "benchmarkDescription",
    "aggregationPreset",
    "districtLossPreset",
    "stateTargetPreset",
    "stateLossPreset",
    "aggregationPresetNote",
    "districtLossPresetNote",
    "stateTargetPresetNote",
    "stateLossPresetNote",
    "formulaAggregation",
    "formulaDistrictLossA",
    "formulaDistrictLossB",
    "formulaStateTarget",
    "formulaStateLoss",
    "previewAggregation",
    "previewDistrictLoss",
    "previewStateTarget",
    "previewStateLoss",
    "errorAggregation",
    "errorDistrictLoss",
    "errorStateTarget",
    "errorStateLoss",
    "resetFormulas",
    "applyFormulas",
    "formulaStatus",
    "resultsReturnCue",
    "resultsCueTitle",
    "resultsCueDescription",
    "resultsCueButtonLabel",
    "viewUpdatedResults",
    "activeSpec",
    "figure1Mode",
    "figure1Current",
    "figure1Objective",
    "figure1Comparison",
    "isoLossChart",
    "figure1Detail",
    "figure2Count",
    "figure2ParetoCount",
    "figure2Current",
    "paretoChartFrame",
    "paretoCanvas",
    "paretoOverlay",
    "figure2Detail",
    "figure3Mode",
    "figure3AxisNote",
    "figure3Description",
    "thresholdChart",
    "figure3Detail",
    "figure4Mode",
    "figure4SwitchCount",
    "seatPathChart",
    "figure4Detail",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function populateScenarioControls() {
  Object.keys(stateConfigs).forEach((state) => {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    els.stateSelect.append(option);
  });
  syncCustomStateOption();
  els.stateSelect.value = activeState;
  syncYearOptions();
}

function syncCustomStateOption() {
  let option = Array.from(els.stateSelect.options).find(
    (candidate) => candidate.value === CUSTOM_STATE_KEY,
  );
  if (!customState) {
    if (els.customStateLaunch) els.customStateLaunch.textContent = "Create custom state";
    if (option) option.remove();
    return;
  }
  if (els.customStateLaunch) els.customStateLaunch.textContent = "Edit custom state";
  if (activeState !== CUSTOM_STATE_KEY) {
    if (option) option.remove();
    return;
  }
  if (!option) {
    option = document.createElement("option");
    option.value = CUSTOM_STATE_KEY;
    els.stateSelect.insertBefore(option, els.stateSelect.firstChild);
  }
  option.textContent = `${customState.name} (custom)`;
}

function populateCustomStateBuilder() {
  const initialDistricts = customState?.districts || makeExampleCustomVotes(8);
  els.customStateName.value = customState?.name || "My State";
  els.customDistrictCount.value = String(initialDistricts.length);
  renderCustomVoteRows(initialDistricts.length, initialDistricts);
  els.customStateName.removeAttribute("aria-invalid");
  els.customDistrictCount.removeAttribute("aria-invalid");
  setCustomStateStatus("");
  setCustomImportStatus("");
}

function openCustomStateDialog(trigger = els.customStateLaunch || els.stateSelect) {
  if (!els.customStatePanel || typeof els.customStatePanel.showModal !== "function") return;
  customStateDialogReturnFocus = trigger instanceof HTMLElement ? trigger : els.stateSelect;
  customStateDialogShouldRestoreFocus = true;
  populateCustomStateBuilder();
  if (!els.customStatePanel.open) els.customStatePanel.showModal();
  document.body.classList.add("custom-profile-modal-open");
  requestAnimationFrame(() => els.customStateName.focus({ preventScroll: true }));
}

function closeCustomStateDialog({ restoreFocus = true } = {}) {
  if (!els.customStatePanel?.open) return;
  customStateDialogShouldRestoreFocus = restoreFocus;
  els.customStatePanel.close();
}

function renderCustomVoteRows(count, suppliedVotes = []) {
  const safeCount = clamp(
    Math.round(Number(count) || 8),
    CUSTOM_DISTRICT_MIN,
    CUSTOM_DISTRICT_MAX,
  );
  const examples = makeExampleCustomVotes(safeCount);
  els.customVoteRows.replaceChildren();

  for (let index = 0; index < safeCount; index += 1) {
    const supplied = suppliedVotes[index] || examples[index];
    const sharePercent = getCustomSharePercent(supplied, examples[index]);
    const row = document.createElement("div");
    row.className = "custom-vote-row";
    row.setAttribute("role", "row");
    row.dataset.districtIndex = String(index);

    const district = document.createElement("span");
    district.className = "custom-district-label";
    district.setAttribute("role", "cell");
    district.textContent = `District ${index + 1}`;
    const partyCue = document.createElement("small");
    partyCue.className = "custom-party-cue";
    partyCue.setAttribute("aria-hidden", "true");
    district.append(partyCue);

    row.append(district, createCustomShareInput(sharePercent, index));
    els.customVoteRows.append(row);
    updateCustomVoteRowShare(row);
  }
}

function createCustomShareInput(value, districtIndex) {
  const label = document.createElement("label");
  label.className = "custom-share-input";
  label.setAttribute("role", "cell");
  const input = document.createElement("input");
  input.className = "custom-dem-share-input";
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.step = "0.1";
  input.inputMode = "decimal";
  input.value = Number(value).toFixed(1);
  input.setAttribute(
    "aria-label",
    `Democratic two-party vote share for district ${districtIndex + 1}, percent`,
  );
  input.setAttribute("aria-describedby", "customStateStatus");
  const suffix = document.createElement("span");
  suffix.className = "custom-share-suffix";
  suffix.setAttribute("aria-hidden", "true");
  suffix.textContent = "% D";
  label.append(input, suffix);
  return label;
}

function collectCustomShareValues() {
  return Array.from(els.customVoteRows.querySelectorAll(".custom-dem-share-input")).map(
    (input) => input.value,
  );
}

function collectCustomVoteEntries() {
  return Array.from(els.customVoteRows.querySelectorAll(".custom-vote-row")).map((row) => {
    const sharePercent = Number(row.querySelector(".custom-dem-share-input").value);
    if (!Number.isFinite(sharePercent) || sharePercent < 0 || sharePercent > 100) {
      return { demVotes: Number.NaN, repVotes: Number.NaN };
    }
    const demVotes = Math.round(
      (sharePercent / 100) * CUSTOM_NORMALIZED_DISTRICT_TOTAL,
    );
    return {
      demVotes,
      repVotes: CUSTOM_NORMALIZED_DISTRICT_TOTAL - demVotes,
    };
  });
}

function updateCustomVoteRowShare(row) {
  const input = row.querySelector(".custom-dem-share-input");
  const sharePercent = Number(input.value);
  const isValid = Number.isFinite(sharePercent) && sharePercent >= 0 && sharePercent <= 100;
  row.classList.toggle("is-invalid", !isValid);
  input.setAttribute("aria-invalid", String(!isValid));
  const partyCue = row.querySelector(".custom-party-cue");
  if (!isValid) {
    partyCue.textContent = "0–100 required";
  } else if (Math.abs(sharePercent - 50) <= 1e-12) {
    partyCue.textContent = "Tie needs a winner";
  } else if (Math.abs(sharePercent - 50) < 0.05) {
    partyCue.textContent = "Near tie";
  } else {
    const leadingParty = sharePercent > 50 ? "D" : "R";
    partyCue.textContent = `${leadingParty} +${Math.abs(sharePercent - 50).toFixed(1)}`;
  }
}

function getCustomSharePercent(supplied, fallback) {
  if (typeof supplied !== "object") {
    const suppliedNumber = Number(String(supplied ?? "").trim());
    if (Number.isFinite(suppliedNumber)) return clamp(suppliedNumber, 0, 100);
  }
  const demVotes = Number(supplied?.demVotes);
  const repVotes = Number(supplied?.repVotes);
  if (Number.isFinite(demVotes) && Number.isFinite(repVotes) && demVotes + repVotes > 0) {
    return (demVotes / (demVotes + repVotes)) * 100;
  }
  const fallbackDemVotes = Number(fallback?.demVotes);
  const fallbackRepVotes = Number(fallback?.repVotes);
  const fallbackTotal = fallbackDemVotes + fallbackRepVotes;
  return fallbackTotal > 0 ? (fallbackDemVotes / fallbackTotal) * 100 : 50;
}

function analyzeCustomState() {
  const requestedCount = Number(els.customDistrictCount.value);
  if (
    !Number.isInteger(requestedCount) ||
    requestedCount < CUSTOM_DISTRICT_MIN ||
    requestedCount > CUSTOM_DISTRICT_MAX
  ) {
    els.customDistrictCount.setAttribute("aria-invalid", "true");
    setCustomStateStatus(
      `Choose a whole number from ${CUSTOM_DISTRICT_MIN} to ${CUSTOM_DISTRICT_MAX} districts.`,
      true,
    );
    els.customDistrictCount.focus();
    return;
  }
  els.customDistrictCount.removeAttribute("aria-invalid");

  let entries = collectCustomVoteEntries();
  if (entries.length !== requestedCount) {
    renderCustomVoteRows(requestedCount, collectCustomShareValues());
    entries = collectCustomVoteEntries();
  }

  const invalidShareInput = Array.from(
    els.customVoteRows.querySelectorAll(".custom-dem-share-input"),
  ).find((input) => {
    const value = Number(input.value);
    return !Number.isFinite(value) || value < 0 || value > 100;
  });
  if (invalidShareInput) {
    const districtNumber =
      Array.from(els.customVoteRows.querySelectorAll(".custom-dem-share-input")).indexOf(
        invalidShareInput,
      ) + 1;
    setCustomStateStatus(
      `District ${districtNumber} needs a percentage from 0 to 100.`,
      true,
    );
    invalidShareInput.focus();
    return;
  }

  const validation = validateCustomStateDefinition({
    name: els.customStateName.value,
    districts: entries,
    updatedAt: Date.now(),
  });
  if (!validation.value) {
    setCustomStateStatus(validation.error, true);
    if (!els.customStateName.value.trim()) {
      els.customStateName.setAttribute("aria-invalid", "true");
      els.customStateName.focus();
    }
    return;
  }
  els.customStateName.removeAttribute("aria-invalid");

  const activation = validateScenarioActivation(
    CUSTOM_STATE_KEY,
    CUSTOM_YEAR_LABEL,
    validation.value,
  );
  if (activation.errors.length) {
    reportScenarioActivationFailure(
      CUSTOM_STATE_KEY,
      CUSTOM_YEAR_LABEL,
      activation.errors,
    );
    setCustomStateStatus(
      "This profile cannot be analyzed with the active formulas. The current election was kept.",
      true,
    );
    return;
  }

  customState = validation.value;
  saveCustomState(customState);
  activeState = CUSTOM_STATE_KEY;
  activeYear = CUSTOM_YEAR_LABEL;
  syncCustomStateOption();
  clearCandidateInspection();
  selectMapMode("model");
  els.stateSelect.value = CUSTOM_STATE_KEY;
  syncYearOptions();
  frontierCache.clear();
  scheduleCache.clear();
  feasibleLossCache.clear();
  thresholdSeriesCache.clear();
  setActiveScenarioStartingWeight();
  setGuidedProgress(1);
  setCustomStateStatus(
    `${customState.name} is ready for analysis. ${describeVoteDataQuality(
      customState.districts,
    )}`,
  );
  render();
  setAnalysisActionStatus(`${customState.name} custom profile is selected and ready to analyze.`);
  closeCustomStateDialog({ restoreFocus: false });
  scrollToModelOutput();
  requestAnimationFrame(() => {
    els.mapTitle.setAttribute("tabindex", "-1");
    els.mapTitle.focus({ preventScroll: true });
  });
}

function setCustomStateStatus(message, isError = false) {
  els.customStateStatus.textContent = message;
  els.customStateStatus.classList.toggle("is-error", isError);
}

function setCustomImportStatus(message, isError = false) {
  els.customImportStatus.textContent = message;
  els.customImportStatus.classList.toggle("is-error", isError);
}

async function importCustomCsvFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const districts = parseCustomVoteCsv(await file.text());
    els.customDistrictCount.value = String(districts.length);
    renderCustomVoteRows(districts.length, districts);
    if (!els.customStateName.value.trim() || els.customStateName.value.trim() === "My State") {
      els.customStateName.value = file.name
        .replace(/\.csv$/i, "")
        .replace(/[_-]+/g, " ")
        .trim()
        .slice(0, 50) || "My State";
    }
    setCustomStateStatus("");
    setCustomImportStatus(
      `${districts.length} districts imported. ${describeVoteDataQuality(
        districts,
      )} Review the rows, then analyze the state.`,
    );
  } catch (error) {
    setCustomImportStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    event.target.value = "";
  }
}

function parseCustomVoteCsv(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((value) => value.trim()));
  if (!rows.length) throw new Error("The CSV file is empty.");

  const header = rows[0].map(normalizeCsvHeader);
  const demHeaders = new Set([
    "democraticvotes",
    "democratvotes",
    "demvotes",
    "democratic",
    "dem",
    "dvotes",
    "partya",
    "partyavotes",
  ]);
  const repHeaders = new Set([
    "republicanvotes",
    "repvotes",
    "republican",
    "rep",
    "rvotes",
    "partyb",
    "partybvotes",
  ]);
  let demIndex = header.findIndex((value) => demHeaders.has(value));
  let repIndex = header.findIndex((value) => repHeaders.has(value));
  let startRow = 1;

  if (demIndex < 0 && repIndex < 0) {
    const first = rows[0].map(parseCsvVoteNumber);
    const hasDistrictColumn =
      first.length >= 3 && Number.isSafeInteger(first[0]) && first[0] >= 1;
    demIndex = hasDistrictColumn ? 1 : 0;
    repIndex = hasDistrictColumn ? 2 : 1;
    startRow = 0;
  } else if (demIndex < 0 || repIndex < 0) {
    throw new Error(
      "The CSV header needs both Democratic votes and Republican votes columns.",
    );
  }

  const districts = [];
  for (let index = startRow; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((value) => value.trim())) continue;
    const demVotes = parseCsvVoteNumber(row[demIndex]);
    const repVotes = parseCsvVoteNumber(row[repIndex]);
    if (
      !Number.isSafeInteger(demVotes) ||
      !Number.isSafeInteger(repVotes) ||
      demVotes < 0 ||
      repVotes < 0
    ) {
      throw new Error(`CSV row ${index + 1} needs nonnegative whole-number vote totals.`);
    }
    if (demVotes + repVotes <= 0 || !Number.isSafeInteger(demVotes + repVotes)) {
      throw new Error(`CSV row ${index + 1} must contain at least one valid two-party vote.`);
    }
    districts.push({ demVotes, repVotes });
  }

  if (districts.length < CUSTOM_DISTRICT_MIN || districts.length > CUSTOM_DISTRICT_MAX) {
    throw new Error(
      `The CSV must contain ${CUSTOM_DISTRICT_MIN} to ${CUSTOM_DISTRICT_MAX} district rows.`,
    );
  }
  return districts;
}

function parseCsvRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeCsvHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsvVoteNumber(value) {
  const normalized = String(value ?? "").replace(/[,_\s]/g, "");
  return normalized ? Number(normalized) : Number.NaN;
}

function describeVoteDataQuality(districts) {
  const totals = districts.map(
    (district) => Number(district.demVotes) + Number(district.repVotes),
  );
  const onePartyDistricts = districts.filter(
    (district) => Number(district.demVotes) === 0 || Number(district.repVotes) === 0,
  ).length;
  const minimumTurnout = Math.min(...totals);
  const maximumTurnout = Math.max(...totals);
  const turnoutRatio = minimumTurnout > 0 ? maximumTurnout / minimumTurnout : Number.NaN;
  const contestNote = onePartyDistricts
    ? `${onePartyDistricts} ${onePartyDistricts === 1 ? "district has" : "districts have"} a zero vote total for one party.`
    : "No district has a zero vote total for either party.";
  return `${contestNote} Max/min district turnout is ${
    Number.isFinite(turnoutRatio) ? turnoutRatio.toFixed(2) : "undefined"
  }x.`;
}

function downloadCustomCsvTemplate() {
  const rows = collectCustomVoteEntries();
  const csv = [
    ["District", "Democratic votes", "Republican votes"],
    ...rows.map((district, index) => [index + 1, district.demVotes, district.repVotes]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  downloadTextFile(csv, "district-vote-template.csv", "text/csv;charset=utf-8");
  setCustomImportStatus(`CSV template downloaded with ${rows.length} district rows.`);
}

function makeExampleCustomVotes(count) {
  const safeCount = clamp(
    Math.round(Number(count) || 8),
    CUSTOM_DISTRICT_MIN,
    CUSTOM_DISTRICT_MAX,
  );
  const rng = mulberry32(hashString(`custom-example-${safeCount}`));
  const democraticPluralities = Math.min(
    safeCount - 1,
    Math.max(2, Math.ceil(safeCount * 0.68)),
  );
  const shares = Array.from({ length: safeCount }, (_, index) => {
    if (index < democraticPluralities) {
      return 0.56 + (index % 5) * 0.015;
    }
    return 0.34 + ((index - democraticPluralities) % 4) * 0.02;
  });

  for (let index = shares.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shares[index], shares[swapIndex]] = [shares[swapIndex], shares[index]];
  }

  return shares.map((demShare) => {
    const totalVotes = 100000;
    const demVotes = Math.round(totalVotes * demShare);
    return { demVotes, repVotes: totalVotes - demVotes };
  });
}

function makeRandomCustomVotes(count, random = Math.random) {
  const safeCount = clamp(
    Math.round(Number(count) || 8),
    CUSTOM_DISTRICT_MIN,
    CUSTOM_DISTRICT_MAX,
  );
  const rng = typeof random === "function" ? random : Math.random;
  const draw = () => {
    const value = Number(rng());
    return Number.isFinite(value)
      ? clamp(value, 0, 1 - Number.EPSILON)
      : Math.random();
  };
  const centerWeightedDraw = () => (draw() + draw()) / 2;

  // Build every district around one plausible statewide environment instead of
  // drawing unrelated shares anywhere on [0, 1]. The ordered spread guarantees
  // meaningful district variation; the jitter and shuffle keep profiles fresh.
  const statewideDemShare = 0.44 + centerWeightedDraw() * 0.12;
  const districtSpread = 0.075 + draw() * 0.035;
  const midpoint = (safeCount - 1) / 2;
  const scale = Math.max(1, midpoint);
  const deviations = Array.from({ length: safeCount }, (_, index) => {
    const position = (index - midpoint) / scale;
    const jitter = (centerWeightedDraw() - 0.5) * 0.035;
    return position * districtSpread + jitter;
  });
  const meanDeviation = deviations.reduce((sum, value) => sum + value, 0) / safeCount;
  const shares = deviations.map((value) =>
    clamp(statewideDemShare + value - meanDeviation, 0.33, 0.67),
  );

  for (let index = shares.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(draw() * (index + 1));
    [shares[index], shares[swapIndex]] = [shares[swapIndex], shares[index]];
  }

  const baseTurnout = 95000 + Math.round(draw() * 35000);
  return shares.map((demShare) => {
    const turnoutFactor = 0.92 + centerWeightedDraw() * 0.16;
    const totalVotes = Math.round((baseTurnout * turnoutFactor) / 100) * 100;
    const demVotes = Math.round(totalVotes * demShare);
    return { demVotes, repVotes: totalVotes - demVotes };
  });
}

function validateCustomStateDefinition(candidate) {
  const name = String(candidate?.name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50);
  if (!name) return { value: null, error: "Enter a name for the custom state." };

  const districts = Array.isArray(candidate?.districts) ? candidate.districts : [];
  if (districts.length < CUSTOM_DISTRICT_MIN || districts.length > CUSTOM_DISTRICT_MAX) {
    return {
      value: null,
      error: `A custom state must contain ${CUSTOM_DISTRICT_MIN} to ${CUSTOM_DISTRICT_MAX} districts.`,
    };
  }

  const normalizedDistricts = [];
  for (let index = 0; index < districts.length; index += 1) {
    const demVotes = Number(districts[index]?.demVotes);
    const repVotes = Number(districts[index]?.repVotes);
    if (
      !Number.isSafeInteger(demVotes) ||
      !Number.isSafeInteger(repVotes) ||
      demVotes < 0 ||
      repVotes < 0
    ) {
      return {
        value: null,
        error: `District ${index + 1} needs nonnegative whole-number vote totals.`,
      };
    }
    if (demVotes + repVotes <= 0 || !Number.isSafeInteger(demVotes + repVotes)) {
      return {
        value: null,
        error: `District ${index + 1} must contain at least one valid two-party vote.`,
      };
    }
    if (demVotes === repVotes) {
      return {
        value: null,
        error: `District ${index + 1} is tied. Enter a Democratic share above or below 50% so its local winner is defined.`,
      };
    }
    normalizedDistricts.push({ demVotes, repVotes });
  }

  return {
    value: {
      name,
      districts: normalizedDistricts,
      updatedAt: Number(candidate.updatedAt) || Date.now(),
    },
    error: "",
  };
}

function loadCustomState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_STATE_STORAGE_KEY) || "null");
    return validateCustomStateDefinition(saved).value;
  } catch {
    return null;
  }
}

function saveCustomState(value) {
  try {
    localStorage.setItem(CUSTOM_STATE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Custom analysis still works when browser storage is unavailable.
  }
}

function populatePresetControls() {
  Object.entries(specMeta).forEach(([key, meta]) => {
    const select = els[meta.preset];
    formulaPresets[key].forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.append(option);
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Custom TeX";
    select.append(custom);
  });
}

function populateBenchmarkControls() {
  benchmarkSpecifications.forEach((benchmark) => {
    const option = document.createElement("option");
    option.value = benchmark.id;
    option.textContent = benchmark.label;
    els.benchmarkSelect.append(option);
  });

  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom combination";
  custom.disabled = true;
  els.benchmarkSelect.append(custom);
}

function bindControls() {
  els.stateSelect.addEventListener("change", () => {
    const selectedState = els.stateSelect.value;
    const selectedYear =
      selectedState === CUSTOM_STATE_KEY
        ? CUSTOM_YEAR_LABEL
        : stateConfigs[selectedState].years.includes(Number(activeYear))
          ? Number(activeYear)
          : stateConfigs[selectedState].years.at(-1);
    const activation = validateScenarioActivation(selectedState, selectedYear);
    if (activation.errors.length) {
      els.stateSelect.value = activeState;
      syncYearOptions();
      reportScenarioActivationFailure(selectedState, selectedYear, activation.errors);
      return;
    }
    clearCandidateInspection();
    activeState = selectedState;
    activeYear = selectedYear;
    syncCustomStateOption();
    syncYearOptions();
    setActiveScenarioStartingWeight();
    setGuidedProgress(1);
    render();
  });

  els.yearSelect.addEventListener("change", () => {
    if (activeState === CUSTOM_STATE_KEY) return;
    const selectedYear = Number(els.yearSelect.value);
    const activation = validateScenarioActivation(activeState, selectedYear);
    if (activation.errors.length) {
      els.yearSelect.value = String(activeYear);
      reportScenarioActivationFailure(activeState, selectedYear, activation.errors);
      return;
    }
    clearCandidateInspection();
    activeYear = selectedYear;
    setActiveScenarioStartingWeight();
    setGuidedProgress(1);
    render();
  });

  els.mapWrap.addEventListener("scroll", syncMapPanCue, { passive: true });
  els.mapPanCue.addEventListener("click", panDistrictMap);
  window.addEventListener(
    "resize",
    () => window.requestAnimationFrame(syncMapPanCue),
    { passive: true },
  );

  els.customStateLaunch.addEventListener("click", () => {
    openCustomStateDialog(els.customStateLaunch);
  });

  els.wSlider.addEventListener("input", () => {
    clearCandidateInspection();
    selectModelMapMode();
    setGuidedProgress(2);
    render();
  });

  els.mapWSlider.addEventListener("input", () => {
    els.wSlider.value = els.mapWSlider.value;
    els.wSlider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  els.mapWeightFocus.addEventListener("click", toggleMapWeightFocus);

  els.floatingWSlider.addEventListener("input", () => {
    els.wSlider.value = els.floatingWSlider.value;
    els.wSlider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  els.floatingWeightFocus.addEventListener("click", toggleFloatingWeightFocus);
  els.floatingPreviousSwitch.addEventListener("click", () => moveFloatingWeightRegime(-1));
  els.floatingNextSwitch.addEventListener("click", () => moveFloatingWeightRegime(1));

  bindSharedWeightControls();

  [els.thresholdChart, els.seatPathChart].forEach((chart) => {
    chart.addEventListener("click", (event) => setWeightFromPaperChart(event, chart));
  });

  if (els.customStatePanel) {
    els.customStateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      analyzeCustomState();
    });
    els.customStateClose.addEventListener("click", () => closeCustomStateDialog());
    els.customStateCancel.addEventListener("click", () => closeCustomStateDialog());
    els.customStatePanel.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeCustomStateDialog();
    });
    els.customStatePanel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCustomStateDialog();
    });
    els.customStatePanel.addEventListener("click", (event) => {
      if (event.target === els.customStatePanel) closeCustomStateDialog();
    });
    els.customStatePanel.addEventListener("close", () => {
      document.body.classList.remove("custom-profile-modal-open");
      const returnFocus = customStateDialogReturnFocus;
      const shouldRestoreFocus = customStateDialogShouldRestoreFocus;
      customStateDialogReturnFocus = null;
      customStateDialogShouldRestoreFocus = true;
      if (shouldRestoreFocus && returnFocus?.isConnected) {
        requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
      }
    });
    els.customStateName.addEventListener("input", () => {
      els.customStateName.removeAttribute("aria-invalid");
      setCustomStateStatus("");
    });

    els.customDistrictCount.addEventListener("change", () => {
      const requestedCount = Number(els.customDistrictCount.value);
      if (!Number.isInteger(requestedCount)) return;
      const count = clamp(requestedCount, CUSTOM_DISTRICT_MIN, CUSTOM_DISTRICT_MAX);
      els.customDistrictCount.value = String(count);
      els.customDistrictCount.removeAttribute("aria-invalid");
      renderCustomVoteRows(count, collectCustomShareValues());
      setCustomStateStatus("");
      setCustomImportStatus("");
    });

    els.customVoteRows.addEventListener("input", (event) => {
      const row = event.target.closest(".custom-vote-row");
      if (row) updateCustomVoteRowShare(row);
      setCustomStateStatus("");
      setCustomImportStatus("");
    });

    els.customExampleVotes.addEventListener("click", () => {
      const count = clamp(
        Math.round(Number(els.customDistrictCount.value) || 8),
        CUSTOM_DISTRICT_MIN,
        CUSTOM_DISTRICT_MAX,
      );
      els.customDistrictCount.value = String(count);
      renderCustomVoteRows(count, makeExampleCustomVotes(count));
      setCustomStateStatus("Example shares loaded. Edit any district, then analyze the profile.");
      setCustomImportStatus("");
    });

    els.customCsvFile.addEventListener("change", importCustomCsvFile);
    els.downloadCsvTemplate.addEventListener("click", downloadCustomCsvTemplate);
  }
  els.exportCitedPage.addEventListener("click", exportCitedPage);
  document.querySelectorAll("[data-figure-png]").forEach((button) => {
    button.addEventListener("click", () =>
      downloadPaperFigurePng(button.dataset.figurePng, button),
    );
  });
  window.addEventListener("afterprint", () => {
    setAnalysisActionStatus("Print dialog closed.");
  });

  document.querySelectorAll("input[name='mapMode']").forEach((input) => {
    input.addEventListener("change", (event) => {
      selectMapMode(event.target.value);
      render();
    });
  });

  document.querySelectorAll("[data-guide-map-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      clearCandidateInspection();
      selectMapMode(button.dataset.guideMapMode);
      setGuidedProgress(3);
      render();
    });
  });

  document.querySelectorAll(".diagnostic-card[data-map-target]").forEach((button) => {
    button.addEventListener("click", () => {
      selectDiagnosticMapTarget(button.dataset.mapTarget);
    });
  });

  els.restoreProportionalTarget.addEventListener(
    "click",
    restoreProportionalStatewideTarget,
  );

  els.benchmarkSelect.addEventListener("change", (event) => {
    const benchmark = benchmarkSpecifications.find((item) => item.id === event.target.value);
    if (!benchmark) return;
    setFormulaFields(benchmark.formulas);
    previewAllFormulas();
    applySpecification(false);
  });

  els.advancedToggle.addEventListener("click", () => {
    const isExpanded = els.advancedToggle.getAttribute("aria-expanded") === "true";
    setAdvancedPanelExpanded(!isExpanded);
  });
  els.topSpecControl.addEventListener("click", () => {
    setAdvancedPanelExpanded(true, { scrollToToggle: true, focusToggle: true });
  });
  els.closeAdvancedSettings.addEventListener("click", () => {
    setAdvancedPanelExpanded(false, { scrollToToggle: true, focusToggle: true });
  });

  Object.entries(specMeta).forEach(([key, meta]) => {
    const fieldIds = meta.fields ? Object.values(meta.fields) : [meta.field];
    fieldIds.forEach((fieldId) => {
      els[fieldId].addEventListener("input", () => {
        renderFormulaPreview(key);
        syncPresetSelection(key);
        clearFormulaError(key);
        setFormulaStatus("");
        hideResultsReturnCue();
      });
    });

    els[meta.preset].addEventListener("change", (event) => {
      if (event.target.value === "custom") {
        els[meta.note].textContent =
          "This custom formula will be checked against the model assumptions before it is applied.";
        els[fieldIds[0]].focus();
        return;
      }
      const preset = findPresetById(key, event.target.value);
      if (!preset) return;
      if (key === "districtLoss") {
        els.formulaDistrictLossA.value = preset.texA;
        els.formulaDistrictLossB.value = preset.texB;
      } else {
        els[meta.field].value = preset.tex;
      }
      renderFormulaPreview(key);
      applySpecification(false);
    });
  });

  els.applyFormulas.addEventListener("click", () => applySpecification(true));
  els.resetFormulas.addEventListener("click", () => {
    setFormulaFields(defaultFormulas);
    previewAllFormulas();
    applySpecification(true, "Paper linear benchmark restored.");
  });

  els.restoreOptimum.addEventListener("click", showWinningPredictionOnMap);
  els.showWinningPrediction.addEventListener("click", showWinningPredictionOnMap);
  els.showCurrentRegime.addEventListener("click", showWinningPredictionOnMap);
  els.viewUpdatedResults.addEventListener("click", () => {
    hideResultsReturnCue();
    setAdvancedPanelExpanded(false);
    showWinningPredictionOnMap();
  });
}

function setupFloatingWeightControl() {
  let frameRequested = false;
  const interactiveControls = [
    els.floatingWSlider,
    els.floatingWeightFocus,
    els.floatingPreviousSwitch,
    els.floatingNextSwitch,
  ];

  els.floatingWeightControl.hidden = false;

  const updateVisibility = () => {
    frameRequested = false;
    const primaryBounds = els.mapWeightControl.getBoundingClientRect();
    const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
    const footerBounds = document.querySelector(".site-footer")?.getBoundingClientRect();
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));
    const pageOverlayOpen = document.body.classList.contains("newsroom-modal-open");
    const footerInView = Boolean(footerBounds && footerBounds.top < window.innerHeight - 24);
    const shouldShow =
      primaryBounds.bottom < headerBottom + 8 &&
      !dialogOpen &&
      !pageOverlayOpen &&
      !footerInView;
    const floatingHadFocus = els.floatingWeightControl.contains(document.activeElement);

    els.floatingWeightControl.classList.toggle("is-visible", shouldShow);
    els.floatingWeightControl.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    els.floatingWeightControl.inert = !shouldShow;
    els.floatingWSlider.setAttribute(
      "aria-orientation",
      window.innerWidth >= 1180 ? "vertical" : "horizontal",
    );
    interactiveControls.forEach((control) => {
      control.tabIndex = shouldShow && !control.hidden && !control.disabled ? 0 : -1;
    });

    if (!shouldShow && floatingHadFocus) {
      const primaryVisible =
        primaryBounds.top >= headerBottom && primaryBounds.bottom <= window.innerHeight;
      const focusTarget = primaryVisible
        ? els.mapWSlider
        : document.querySelector('.primary-nav [aria-current="page"], .brand-lockup');
      focusTarget?.focus({ preventScroll: true });
    }
  };

  const requestVisibilityUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(updateVisibility);
  };

  window.addEventListener("scroll", requestVisibilityUpdate, { passive: true });
  window.addEventListener("resize", requestVisibilityUpdate, { passive: true });
  new MutationObserver(requestVisibilityUpdate).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    new MutationObserver(requestVisibilityUpdate).observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    });
  });
  requestVisibilityUpdate();
}

function bindSharedWeightControls() {
  document.querySelectorAll("[data-shared-weight-control]").forEach((control) => {
    const slider = control.querySelector("[data-weight-slider]");
    const focusButton = control.querySelector("[data-weight-focus]");
    slider?.addEventListener("input", () => {
      els.wSlider.value = slider.value;
      els.wSlider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    focusButton?.addEventListener("click", () => toggleSharedWeightFocus(control));
  });
}

function toggleSharedWeightFocus(control) {
  if (control.dataset.rangeMode === "focused") {
    control.dataset.rangeMode = "full";
    render();
    return;
  }
  const w = activeModel?.w ?? Number(els.wSlider.value);
  const preferredDemSeats = activeModel?.best?.demSeats ?? null;
  const precision = getAdaptiveWeightPrecision(activeModel?.schedule, w, preferredDemSeats);
  const focusDomain = getSwitchFocusDomain(
    activeModel?.schedule,
    w,
    preferredDemSeats,
    precision.step,
  );
  if (!isWeightWithinFocusDomain(focusDomain, w)) return;
  control.dataset.rangeMode = "focused";
  render();
}

function syncFloatingWeightTabStops() {
  const isAvailable =
    els.floatingWeightControl?.classList.contains("is-visible") &&
    els.floatingWeightControl.getAttribute("aria-hidden") === "false" &&
    !els.floatingWeightControl.inert;
  els.floatingWSlider.tabIndex = isAvailable ? 0 : -1;
  [
    els.floatingWeightFocus,
    els.floatingPreviousSwitch,
    els.floatingNextSwitch,
  ].forEach((button) => {
    button.tabIndex = isAvailable && !button.hidden ? 0 : -1;
  });
}

function getSwitchFocusDomain(
  schedule,
  w = 0,
  preferredDemSeats = null,
  canonicalStep = 0,
) {
  const weights = (schedule?.switches || [])
    .map((entry) => Number(entry.weight))
    .filter(Number.isFinite)
    .sort((first, second) => first - second)
    .filter(
      (weight, index, sorted) =>
        index === 0 || Math.abs(weight - sorted[index - 1]) > 1e-10,
    );
  if (!weights.length) return null;

  let focusedWeights = weights;
  if (weights.at(-1) - weights[0] > SWITCH_FOCUS_MAX_ENVELOPE) {
    const clusters = weights.reduce((groups, weight) => {
      const previous = groups.at(-1);
      if (previous && weight - previous.at(-1) <= DENSE_WEIGHT_REGIME_WIDTH) {
        previous.push(weight);
      } else {
        groups.push([weight]);
      }
      return groups;
    }, []);
    const candidates = clusters;
    const distanceToCluster = (cluster) => {
      if (w < cluster[0]) return cluster[0] - w;
      if (w > cluster.at(-1)) return w - cluster.at(-1);
      return 0;
    };
    candidates.sort(
      (first, second) =>
        distanceToCluster(first) - distanceToCluster(second) ||
        second.length - first.length ||
        first[0] - second[0],
    );
    focusedWeights = candidates[0];
  }

  const first = focusedWeights[0];
  const last = focusedWeights.at(-1);
  const switchSpan = last - first;
  const padding = Math.max(
    SWITCH_FOCUS_MIN_PADDING,
    switchSpan * SWITCH_FOCUS_PADDING_RATIO,
  );
  let localMinimum = first - padding;
  let maximum = last + padding;
  if (maximum - localMinimum < SWITCH_FOCUS_MIN_WIDTH) {
    const center = (first + last) / 2;
    localMinimum = center - SWITCH_FOCUS_MIN_WIDTH / 2;
    maximum = center + SWITCH_FOCUS_MIN_WIDTH / 2;
  }
  maximum = clamp(maximum, 0, 1);
  maximum = Math.ceil(maximum * 1e6) / 1e6;
  const safeStep = Number(canonicalStep);
  if (Number.isFinite(safeStep) && safeStep > 0) {
    maximum = Math.min(1, Math.ceil((maximum - 1e-12) / safeStep) * safeStep);
    maximum = Number(maximum.toFixed(6));
  }
  const minimum = 0;
  if (!(maximum > minimum) || maximum - minimum >= 0.98) return null;

  const width = maximum - minimum;
  const visibleSwitchCount = weights.filter(
    (weight) => weight >= minimum - 1e-10 && weight <= maximum + 1e-10,
  ).length;
  return {
    min: minimum,
    max: maximum,
    digits: clamp(Math.ceil(-Math.log10(width)) + 2, 3, 6),
    switchCount: visibleSwitchCount,
    totalSwitches: weights.length,
  };
}

function getAdaptiveWeightPrecision(schedule, w, preferredDemSeats = null) {
  const segments = schedule?.segments || [];
  const current = findCurrentRegime(segments, w, preferredDemSeats);
  const index = Math.max(0, segments.indexOf(current));
  const nearby = segments.slice(Math.max(0, index - 1), Math.min(segments.length, index + 2));
  const narrowestWidth = nearby.length
    ? Math.min(...nearby.map((segment) => Math.max(segment.end - segment.start, 1e-9)))
    : 1;
  const isAtSwitch = (schedule?.switches || []).some(
    (entry) =>
      Number.isFinite(Number(entry.weight)) &&
      Math.abs(Number(entry.weight) - w) <= WEIGHT_URL_STEP / 2 + 1e-12,
  );
  const digits = isAtSwitch
    ? 6
    : clamp(Math.ceil(-Math.log10(narrowestWidth)) + 1, 3, 6);
  return {
    current,
    index,
    digits,
    step: isAtSwitch ? WEIGHT_URL_STEP : digits === 3 ? WEIGHT_STEP : 10 ** -digits,
    isDense: narrowestWidth < DENSE_WEIGHT_REGIME_WIDTH,
  };
}

function isWeightWithinFocusDomain(domain, weight) {
  return Boolean(
    domain &&
      Number.isFinite(Number(weight)) &&
      Number(weight) >= domain.min - 1e-9 &&
      Number(weight) <= domain.max + 1e-9,
  );
}

function formatAdaptiveWeight(
  value,
  schedule = null,
  preferredDemSeats = null,
  minimumDigits = 3,
) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  const resolvedSchedule = schedule || activeModel?.schedule || null;
  const resolvedPreferredSeats =
    preferredDemSeats ?? activeModel?.best?.demSeats ?? null;
  const precisionDigits = resolvedSchedule
    ? getAdaptiveWeightPrecision(
        resolvedSchedule,
        numericValue,
        resolvedPreferredSeats,
      ).digits
    : Math.abs(numericValue - Number(numericValue.toFixed(3))) <= 5e-7
      ? 3
      : 6;
  const digits = clamp(
    Math.max(Number(minimumDigits) || 0, precisionDigits),
    3,
    6,
  );
  return clamp(numericValue, 0, 1).toFixed(digits);
}

function formatCompactSwitchWeight(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  const boundedValue = clamp(numericValue, 0, 1);
  if (boundedValue === 0) return "0%";
  const percent = boundedValue * 100;
  if (percent < 0.001) return "<0.001%";
  const digits = percent >= 10 ? 1 : percent >= 1 ? 2 : 3;
  return `${percent.toFixed(digits).replace(/\.?0+$/, "")}%`;
}

function formatWeightWithPercent(
  value,
  schedule = null,
  preferredDemSeats = null,
) {
  const exactWeight = formatAdaptiveWeight(
    value,
    schedule,
    preferredDemSeats,
  );
  const compactPercent = formatCompactSwitchWeight(value);
  if (exactWeight === "—" || compactPercent === "—") return "w = —";
  return `w = ${exactWeight} · ${compactPercent}`;
}

function groupHorizontalSwitches(switches, domain, markerContainer) {
  const trackLength = markerContainer?.getBoundingClientRect().width || 360;
  const domainWidth = Math.max(domain.max - domain.min, 1e-9);
  const threshold = (9 / Math.max(trackLength, 1)) * domainWidth;
  return [...(switches || [])]
    .sort((first, second) => first.weight - second.weight)
    .reduce((groups, entry) => {
      const previous = groups.at(-1);
      const previousEntry = previous?.entries.at(-1);
      if (previousEntry && entry.weight - previousEntry.weight <= threshold) {
        previous.entries.push(entry);
        previous.weight =
          previous.entries.reduce((total, item) => total + item.weight, 0) /
          previous.entries.length;
        return groups;
      }
      groups.push({ weight: entry.weight, entries: [entry] });
      return groups;
    }, []);
}

function renderSharedWeightControls(
  schedule,
  w,
  preferredDemSeats,
  precision,
  target,
  accessibleWeightDescription,
) {
  const switches = schedule?.switches || [];
  const exact = isLinearAggregationAst(compiledSpec.aggregation);
  const accuracyMode = schedule?.source === "dataset" ? "dataset" : exact ? "exact" : "estimated";
  const focusDomain = getSwitchFocusDomain(
    schedule,
    w,
    preferredDemSeats,
    precision.step,
  );
  const current = precision.current;
  const currentSeatText = current
    ? formatSeatCount(current.demSeats, current.demSeats + current.repSeats)
    : "Current allocation";
  const weightText = formatAdaptiveWeight(w, schedule, preferredDemSeats);
  const focusAvailable = isWeightWithinFocusDomain(focusDomain, w);

  document.querySelectorAll("[data-shared-weight-control]").forEach((control) => {
    const slider = control.querySelector("[data-weight-slider]");
    const output = control.querySelector("[data-weight-output]");
    const track = control.querySelector("[data-weight-track]");
    const markers = control.querySelector("[data-weight-markers]");
    const lower = control.querySelector("[data-weight-lower]");
    const midpoint = control.querySelector("[data-weight-midpoint]");
    const upper = control.querySelector("[data-weight-upper]");
    const focusButton = control.querySelector("[data-weight-focus]");
    const status = control.querySelector("[data-weight-status]");
    let focused = control.dataset.rangeMode === "focused";
    if (
      focused &&
      !focusAvailable
    ) {
      focused = false;
    }
    const domain = focused ? focusDomain : { min: 0, max: 1, digits: 3 };
    const domainWidth = Math.max(domain.max - domain.min, 1e-9);
    const progress = `${(
      (clamp(w, domain.min, domain.max) - domain.min) /
      domainWidth *
      100
    ).toFixed(1)}%`;
    control.dataset.rangeMode = focused ? "focused" : "full";
    track.dataset.rangeMode = focused ? "focused" : "full";
    slider.min = domain.min.toFixed(6);
    slider.max = domain.max.toFixed(6);
    slider.step = String(precision.step);
    slider.value = weightText;
    slider.style.setProperty("--weight-progress", progress);
    output.value = `w = ${weightText}`;

    focusButton.hidden = !focusAvailable;
    focusButton.setAttribute("aria-pressed", String(focused));
    focusButton.textContent = focused ? "Show full 0–1" : "Fine-tune switches";
    focusButton.setAttribute(
      "aria-label",
      focused
        ? "Show the full statewide weight range from 0 to 1"
        : focusAvailable
          ? `Fine-tune ${focusDomain.switchCount} seat switching points between w = ${focusDomain.min.toFixed(
              focusDomain.digits,
            )} and ${focusDomain.max.toFixed(focusDomain.digits)}`
          : "Fine-tune seat switching points",
    );

    if (focused) {
      lower.textContent = `w · ${domain.min.toFixed(domain.digits)}`;
      midpoint.textContent = `${focusDomain.switchCount} seat switches`;
      upper.textContent = `w · ${domain.max.toFixed(domain.digits)}`;
    } else {
      lower.textContent = "Local · 0";
      midpoint.textContent = "Equal weight";
      upper.textContent = `${target.shortLabel} · 1`;
    }

    const visibleSwitches = switches.filter(
      (entry) => entry.weight >= domain.min - 1e-9 && entry.weight <= domain.max + 1e-9,
    );
    markers.replaceChildren(
      ...groupHorizontalSwitches(visibleSwitches, domain, markers).map((group) => {
        const marker = document.createElement("span");
        marker.classList.toggle("is-cluster", group.entries.length > 1);
        marker.style.setProperty(
          "--switch-position",
          `${clamp((group.weight - domain.min) / domainWidth, 0, 1) * 100}%`,
        );
        const first = group.entries[0];
        const last = group.entries.at(-1);
        marker.title =
          group.entries.length === 1
            ? `${accuracyMode === "dataset" ? "Dataset" : exact ? "Exact" : "Numerically estimated"} seat switch at w = ${first.weight.toFixed(
                6,
              )}: ${first.fromDemSeats} D to ${first.toDemSeats} D.`
            : `${group.entries.length} ${accuracyMode === "dataset" ? "dataset" : exact ? "exact" : "numerically estimated"} seat switches from w = ${first.weight.toFixed(
                6,
              )} to ${last.weight.toFixed(6)}.`;
        return marker;
      }),
    );

    const switchText = switches.length
      ? `${visibleSwitches.length}${
          focused && visibleSwitches.length !== switches.length ? ` of ${switches.length}` : ""
        } ${visibleSwitches.length === 1 ? "switch" : "switches"}`
      : "0 switches";
    const visibleStatus = focused
      ? `${currentSeatText} · focused w ${domain.min.toFixed(domain.digits)}–${domain.max.toFixed(
          domain.digits,
        )} · ${switchText} · step ${precision.step.toFixed(precision.digits)}`
      : `${currentSeatText} · ${switchText} across w 0–1 · step ${precision.step.toFixed(
          precision.digits,
        )}`;
    setSwitchCountStatus(status, visibleStatus, switches.length ? accuracyMode : null);
    slider.setAttribute(
      "aria-valuetext",
      `${accessibleWeightDescription}${
        focused
          ? ` Focused range ${domain.min.toFixed(domain.digits)} to ${domain.max.toFixed(
              domain.digits,
            )}.`
          : " Full range 0 to 1."
      }`,
    );
  });
}

function renderMapWeightSchedule(schedule, w, preferredDemSeats, step, target) {
  const switches = schedule?.switches || [];
  const focusDomain = getSwitchFocusDomain(schedule, w, preferredDemSeats, step);
  const focusAvailable = isWeightWithinFocusDomain(focusDomain, w);
  const exact = isLinearAggregationAst(compiledSpec.aggregation);
  const accuracyMode = schedule?.source === "dataset" ? "dataset" : exact ? "exact" : "estimated";
  if (
    mapWeightFocused &&
    !focusAvailable
  ) {
    mapWeightFocused = false;
  }
  mapWeightDomain = mapWeightFocused
    ? focusDomain
    : { min: 0, max: 1, digits: 3 };
  els.mapWeightTrack.dataset.rangeMode = mapWeightFocused ? "focused" : "full";
  els.mapWSlider.min = mapWeightDomain.min.toFixed(6);
  els.mapWSlider.max = mapWeightDomain.max.toFixed(6);
  els.mapWeightFocus.hidden = !focusAvailable;
  els.mapWeightFocus.setAttribute("aria-pressed", String(mapWeightFocused));
  els.mapWeightFocus.textContent = mapWeightFocused ? "Show full 0–1" : "Fine-tune switches";
  els.mapWeightFocus.setAttribute(
    "aria-label",
    mapWeightFocused
      ? "Show the full statewide weight range from 0 to 1"
      : focusAvailable
        ? `Fine-tune ${focusDomain.switchCount} seat switching points between w = ${focusDomain.min.toFixed(
            focusDomain.digits,
          )} and ${focusDomain.max.toFixed(focusDomain.digits)}`
        : "Fine-tune seat switching points",
  );

  if (mapWeightFocused) {
    setMapWeightScaleLabel(
      els.mapWeightLower,
      `w = ${mapWeightDomain.min.toFixed(mapWeightDomain.digits)}`,
      "Focused range start",
    );
    setMapWeightScaleLabel(
      els.mapWeightMidpoint,
      `${focusDomain.switchCount} ${focusDomain.switchCount === 1 ? "switch" : "switches"}`,
      "Switching range",
    );
    setMapWeightScaleLabel(
      els.mapWeightEndpoint,
      `w = ${mapWeightDomain.max.toFixed(mapWeightDomain.digits)}`,
      "Focused range end",
    );
  } else {
    setMapWeightScaleLabel(els.mapWeightLower, "w = 0", "Local district results");
    setMapWeightScaleLabel(els.mapWeightMidpoint, "w = 0.5", "Equal weight");
    setMapWeightScaleLabel(
      els.mapWeightEndpoint,
      "w = 1",
      target.endpointLabel,
    );
  }

  const visibleSwitches = switches.filter(
    (entry) =>
      entry.weight >= mapWeightDomain.min - 1e-9 &&
      entry.weight <= mapWeightDomain.max + 1e-9,
  );
  const domainWidth = Math.max(mapWeightDomain.max - mapWeightDomain.min, 1e-9);
  els.mapWeightMarkers.replaceChildren(
    ...groupHorizontalSwitches(visibleSwitches, mapWeightDomain, els.mapWeightMarkers).map(
      (group) => {
        const marker = document.createElement("span");
        marker.classList.toggle("is-cluster", group.entries.length > 1);
        marker.style.setProperty(
          "--switch-position",
          `${clamp((group.weight - mapWeightDomain.min) / domainWidth, 0, 1) * 100}%`,
        );
        const first = group.entries[0];
        const last = group.entries.at(-1);
        marker.title =
          group.entries.length === 1
            ? `${accuracyMode === "dataset" ? "Dataset" : exact ? "Exact" : "Numerically estimated"} seat switch at w = ${first.weight.toFixed(
                6,
              )}: ${first.fromDemSeats} D to ${first.toDemSeats} D.`
            : `${group.entries.length} ${accuracyMode === "dataset" ? "dataset" : exact ? "exact" : "numerically estimated"} seat switches from w = ${first.weight.toFixed(
                6,
              )} to ${last.weight.toFixed(6)}.`;
        return marker;
      },
    ),
  );
  const visibleSwitchCount = mapWeightFocused ? visibleSwitches.length : switches.length;
  setSwitchCountStatus(
    els.mapWeightSwitchStatus,
    `${visibleSwitchCount} ${visibleSwitchCount === 1 ? "switch" : "switches"}`,
    switches.length ? accuracyMode : null,
  );
  return mapWeightDomain;
}

function setSwitchCountStatus(element, visibleText, accuracyMode) {
  const nodes = [document.createTextNode(visibleText)];
  if (accuracyMode) {
    const accuracy = document.createElement("span");
    accuracy.className = "sr-only";
    accuracy.textContent =
      accuracyMode === "dataset"
        ? " Switch points use the weights supplied for this election in the dataset."
        : accuracyMode === "exact"
          ? " Switch points are computed exactly for the linear objective."
          : " Switch points are numerically estimated for the nonlinear objective.";
    nodes.push(accuracy);
  }
  element.replaceChildren(...nodes);
}

function setMapWeightScaleLabel(element, primary, secondary) {
  const heading = document.createElement("strong");
  heading.textContent = primary;
  const detail = document.createElement("small");
  detail.textContent = secondary;
  element.replaceChildren(heading, detail);
}

function toggleMapWeightFocus() {
  if (mapWeightFocused) {
    mapWeightFocused = false;
    render();
    return;
  }
  const w = activeModel?.w ?? Number(els.wSlider.value);
  const precision = getAdaptiveWeightPrecision(
    activeModel?.schedule,
    w,
    activeModel?.best?.demSeats ?? null,
  );
  const focusDomain = getSwitchFocusDomain(
    activeModel?.schedule,
    w,
    activeModel?.best?.demSeats ?? null,
    precision.step,
  );
  if (!isWeightWithinFocusDomain(focusDomain, w)) return;
  mapWeightFocused = true;
  render();
}

function groupFloatingSwitches(switches, domain) {
  const trackLength =
    els.floatingWeightMarkers.parentElement?.getBoundingClientRect().height || 250;
  const domainWidth = Math.max(domain.max - domain.min, 1e-9);
  const threshold = (10 / Math.max(trackLength, 1)) * domainWidth;
  return (switches || []).reduce((groups, item) => {
    const previous = groups.at(-1);
    if (previous && item.weight - previous.weights.at(-1) <= threshold) {
      previous.weights.push(item.weight);
      previous.weight =
        previous.weights.reduce((total, weight) => total + weight, 0) /
        previous.weights.length;
      return groups;
    }
    groups.push({ weight: item.weight, weights: [item.weight] });
    return groups;
  }, []);
}

function configureFloatingWeightDomain(schedule, w, preferredDemSeats, step) {
  const focusDomain = getSwitchFocusDomain(schedule, w, preferredDemSeats, step);
  const focusAvailable = isWeightWithinFocusDomain(focusDomain, w);
  if (
    floatingWeightFocused &&
    !focusAvailable
  ) {
    floatingWeightFocused = false;
  }
  floatingWeightDomain = floatingWeightFocused
    ? focusDomain
    : { min: 0, max: 1, digits: 3 };
  els.floatingWSlider.min = floatingWeightDomain.min.toFixed(6);
  els.floatingWSlider.max = floatingWeightDomain.max.toFixed(6);
  els.floatingWeightControl.dataset.rangeMode = floatingWeightFocused ? "focused" : "full";
  els.floatingWeightFocus.hidden = !focusAvailable;
  els.floatingWeightFocus.setAttribute("aria-pressed", String(floatingWeightFocused));
  els.floatingWeightFocus.textContent = floatingWeightFocused
    ? "Full"
    : "Zoom";
  els.floatingWeightFocus.setAttribute(
    "aria-label",
    floatingWeightFocused
      ? "Show the full statewide weight range from 0 to 1"
      : focusAvailable
        ? `Fine-tune ${focusDomain.switchCount} switching points between w = ${focusDomain.min.toFixed(
            focusDomain.digits,
          )} and ${focusDomain.max.toFixed(focusDomain.digits)}`
        : "Fine-tune switching points",
  );
  if (floatingWeightFocused) {
    els.floatingWeightLower.textContent = `w · ${floatingWeightDomain.min.toFixed(
      floatingWeightDomain.digits,
    )}`;
    els.floatingWeightUpper.textContent = `w · ${floatingWeightDomain.max.toFixed(
      floatingWeightDomain.digits,
    )}`;
  } else {
    els.floatingWeightLower.textContent = "Local · 0";
    els.floatingWeightUpper.textContent = "State · 1";
  }
  return { domain: floatingWeightDomain, focusDomain };
}

function configureFloatingWeightJump(button, segment, direction, digits) {
  const heldFocus = document.activeElement === button;
  button.hidden = !segment;
  if (!segment) {
    button.removeAttribute("aria-label");
    delete button.dataset.weight;
    if (
      heldFocus &&
      els.floatingWeightControl.getAttribute("aria-hidden") === "false"
    ) {
      els.floatingWSlider.focus({ preventScroll: true });
    }
    return;
  }
  const midpoint = clamp((segment.start + segment.end) / 2, 0, 1);
  button.dataset.weight = midpoint.toFixed(6);
  button.textContent = direction < 0 ? "Prev" : "Next";
  button.setAttribute(
    "aria-label",
    `${direction < 0 ? "Previous" : "Next"} allocation, ${formatSeatCount(
      segment.demSeats,
      segment.demSeats + segment.repSeats,
    )}, at w = ${midpoint.toFixed(digits)}.`,
  );
}

function renderFloatingWeightSchedule(schedule, w, preferredDemSeats) {
  const precision = getAdaptiveWeightPrecision(schedule, w, preferredDemSeats);
  const switches = schedule?.switches || [];
  const isExact = isLinearAggregationAst(compiledSpec.aggregation);
  const { domain } = configureFloatingWeightDomain(
    schedule,
    w,
    preferredDemSeats,
    precision.step,
  );
  const visibleSwitches = switches.filter(
    (entry) => entry.weight >= domain.min - 1e-9 && entry.weight <= domain.max + 1e-9,
  );
  const markerGroups = groupFloatingSwitches(visibleSwitches, domain);
  const domainWidth = Math.max(domain.max - domain.min, 1e-9);
  els.floatingWeightMarkers.replaceChildren(
    ...markerGroups.map((group) => {
      const marker = document.createElement("span");
      marker.className = `floating-weight-marker${
        group.weights.length > 1 ? " is-cluster" : ""
      }`;
      marker.style.setProperty(
        "--switch-position",
        `${clamp((group.weight - domain.min) / domainWidth, 0, 1) * 100}%`,
      );
      marker.dataset.count = String(group.weights.length);
      return marker;
    }),
  );

  const segments = schedule?.segments || [];
  const previous = precision.index > 0 ? segments[precision.index - 1] : null;
  const next = precision.index < segments.length - 1 ? segments[precision.index + 1] : null;
  configureFloatingWeightJump(els.floatingPreviousSwitch, previous, -1, precision.digits);
  configureFloatingWeightJump(els.floatingNextSwitch, next, 1, precision.digits);

  const switchLabel = floatingWeightFocused
    ? `${visibleSwitches.length}${
        visibleSwitches.length === switches.length ? "" : ` of ${switches.length}`
      } ${isExact ? "exact" : "numerically estimated"} ${
        visibleSwitches.length === 1 ? "switch" : "switches"
      } on the focused scale ${domain.min.toFixed(domain.digits)}–${domain.max.toFixed(
        domain.digits,
      )}`
    : `${switches.length} ${isExact ? "exact" : "numerically estimated"} ${
        switches.length === 1 ? "switch" : "switches"
      }`;
  const current = precision.current;
  const intervalLabel = current
    ? `${formatSeatCount(current.demSeats, current.demSeats + current.repSeats)} holds for w ${current.start.toFixed(
        precision.digits,
      )}–${current.end.toFixed(precision.digits)}`
    : "one allocation across the full range";
  els.floatingWeightStatus.textContent = `${switchLabel}. ${intervalLabel}. ${
    precision.isDense
      ? `Fine step: ${precision.step.toFixed(precision.digits)}.`
      : `Step: ${precision.step.toFixed(precision.digits)}.`
  }`;
  syncFloatingWeightTabStops();
  return { ...precision, domain };
}

function toggleFloatingWeightFocus() {
  if (floatingWeightFocused) {
    floatingWeightFocused = false;
    render();
    return;
  }
  const precision = getAdaptiveWeightPrecision(
    activeModel?.schedule,
    activeModel?.w ?? Number(els.wSlider.value),
    activeModel?.best?.demSeats ?? null,
  );
  const focusDomain = getSwitchFocusDomain(
    activeModel?.schedule,
    activeModel?.w ?? Number(els.wSlider.value),
    activeModel?.best?.demSeats ?? null,
    precision.step,
  );
  const currentWeight = activeModel?.w ?? Number(els.wSlider.value);
  if (!isWeightWithinFocusDomain(focusDomain, currentWeight)) return;
  floatingWeightFocused = true;
  render();
}

function moveFloatingWeightRegime(direction) {
  const schedule = activeModel?.schedule;
  if (!schedule?.segments?.length) return;
  const precision = getAdaptiveWeightPrecision(
    schedule,
    activeModel.w,
    activeModel.best?.demSeats ?? null,
  );
  const target = schedule.segments[precision.index + direction];
  if (!target) return;
  const midpoint = clamp((target.start + target.end) / 2, 0, 1);
  els.wSlider.value = midpoint.toFixed(6);
  els.wSlider.dispatchEvent(new Event("input", { bubbles: true }));
}

function setAdvancedPanelExpanded(
  isExpanded,
  { scrollToToggle = false, focusToggle = false } = {},
) {
  els.advancedToggle.setAttribute("aria-expanded", String(isExpanded));
  els.topSpecControl.setAttribute("aria-expanded", String(isExpanded));
  els.advancedPanel.hidden = !isExpanded;
  els.advancedToggleAction.textContent = isExpanded ? "Close settings" : "Open settings";
  els.topSpecAction.textContent = isExpanded
    ? "Model settings are open below"
    : "Open model settings";
  els.advancedToggle
    .closest(".advanced-shell")
    ?.classList.toggle("is-expanded", isExpanded);

  if (!scrollToToggle && !focusToggle) return;
  window.requestAnimationFrame(() => {
    if (focusToggle) els.advancedToggle.focus({ preventScroll: true });
    if (scrollToToggle) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      els.advancedToggle.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }
  });
}

function clearCandidateInspection() {
  inspectedDemSeats = null;
}

function selectMapMode(mode) {
  activeMapMode = mode;
  document.querySelectorAll("input[name='mapMode']").forEach((input) => {
    input.checked = input.value === mode;
  });
}

function selectModelMapMode() {
  selectMapMode("model");
}

function selectDiagnosticMapTarget(mode) {
  if (!DIAGNOSTIC_MAP_TARGETS[mode]) return;
  clearCandidateInspection();
  selectMapMode(mode);
  render();
  if (!window.matchMedia("(max-width: 1120px)").matches) return;
  window.requestAnimationFrame(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    els.mapTargetLabel.closest(".map-surface")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  });
}

function showWinningPredictionOnMap() {
  clearCandidateInspection();
  selectModelMapMode();
  render();
  scrollToModelOutput();
}

function inspectCandidateOnMap(demSeats) {
  if (!activeModel) return;
  inspectedDemSeats = demSeats === activeModel.best.demSeats ? null : demSeats;
  selectModelMapMode();
  render();
  scrollToModelOutput();
}

function inspectCandidateFromFigure(demSeats) {
  if (!activeModel) return;
  inspectedDemSeats = demSeats === activeModel.best.demSeats ? null : demSeats;
  selectModelMapMode();
  render();
}

function setWeightFromPaperFigure(value) {
  clearCandidateInspection();
  selectModelMapMode();
  els.wSlider.value = clamp(value, 0, 1).toFixed(6);
  render();
}

function getPaperChartWeightAtClientX(clientX, bounds, xDomain = [0, 1]) {
  const width = Number(bounds?.width);
  const left = Number(bounds?.left);
  if (!(width > 0) || !Number.isFinite(left)) return null;
  const xMinimum = Number.isFinite(Number(xDomain?.[0])) ? Number(xDomain[0]) : 0;
  const xMaximum = Number.isFinite(Number(xDomain?.[1])) ? Number(xDomain[1]) : 1;
  const chartX = ((Number(clientX) - left) / width) * PAPER_CHART.width;
  const plotWidth = PAPER_CHART.width - PAPER_CHART.left - PAPER_CHART.right;
  const plotShare = clamp((chartX - PAPER_CHART.left) / plotWidth, 0, 1);
  return xMinimum + plotShare * (xMaximum - xMinimum);
}

function setWeightFromPaperChart(event, chart) {
  const bounds = chart.getBoundingClientRect();
  const storedMinimum = Number(chart.dataset.xMinimum);
  const storedMaximum = Number(chart.dataset.xMaximum);
  const xMinimum = Number.isFinite(storedMinimum) ? storedMinimum : 0;
  const xMaximum = Number.isFinite(storedMaximum) ? storedMaximum : 1;
  const value = getPaperChartWeightAtClientX(event.clientX, bounds, [xMinimum, xMaximum]);
  if (value === null) return;
  setWeightFromPaperFigure(value);
}

function selectWeightRegime(segment) {
  const representativeWeight = clamp((segment.start + segment.end) / 2, 0, 1);
  clearCandidateInspection();
  selectModelMapMode();
  els.wSlider.value = representativeWeight.toFixed(6);
  render();
  scrollToModelOutput();
}

function scrollToModelOutput() {
  requestAnimationFrame(() => {
    document.getElementById("allocation").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  });
}

function showResultsReturnCue() {
  const target = getTargetContext();
  els.resultsCueTitle.textContent = `${target.shortLabel} prediction ready`;
  els.resultsCueDescription.textContent = `The main slider now balances local results against ${target.goalPhrase}; the map, optimum, losses, and switching regimes have been recalculated.`;
  els.resultsCueButtonLabel.textContent = `View ${target.shortLabel.toLowerCase()} result`;
  window.clearTimeout(resultsCueTimer);
  els.resultsReturnCue.hidden = false;
  els.resultsReturnCue.classList.remove("is-alerting");
  void els.resultsReturnCue.offsetWidth;
  els.resultsReturnCue.classList.add("is-alerting");
  resultsCueTimer = window.setTimeout(() => {
    els.resultsReturnCue.classList.remove("is-alerting");
  }, 3600);
}

function hideResultsReturnCue() {
  window.clearTimeout(resultsCueTimer);
  els.resultsReturnCue.classList.remove("is-alerting");
  els.resultsReturnCue.hidden = true;
}

function syncYearOptions() {
  els.yearSelect.replaceChildren();
  if (activeState === CUSTOM_STATE_KEY) {
    const option = document.createElement("option");
    option.value = CUSTOM_YEAR_LABEL;
    option.textContent = CUSTOM_YEAR_LABEL;
    els.yearSelect.append(option);
    els.yearSelect.value = CUSTOM_YEAR_LABEL;
    els.yearSelect.disabled = true;
    return;
  }

  els.yearSelect.disabled = false;
  stateConfigs[activeState].years.forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    els.yearSelect.append(option);
  });
  els.yearSelect.value = String(activeYear);
}

function render() {
  if (!compiledSpec) return false;
  const fallbackModel = activeModel;
  try {
    renderUnsafe();
    return true;
  } catch (error) {
    if (!fallbackModel || !Number.isFinite(Number(fallbackModel.w))) throw error;
    els.wSlider.value = Number(fallbackModel.w).toFixed(6);
    try {
      renderUnsafe();
    } catch {
      throw error;
    }
    const detail = humanizeFormulaError(error).replace(/[.\s]+$/, "");
    const message = `That weight could not be evaluated with the active formulas (${detail}). The last valid result was restored.`;
    setFormulaStatus(message, true);
    setAnalysisActionStatus(message, true);
    return false;
  }
}

function renderUnsafe() {
  if (!compiledSpec) return;
  setAnalysisActionStatus("");
  const w = Number(els.wSlider.value);
  activeDistricts =
    activeState === CUSTOM_STATE_KEY
      ? createCustomScenario(customState)
      : generateScenario(activeState, activeYear);
  const metrics = computeMetrics(activeDistricts);
  const paperSummary = computePaperBenchmarkSummary(activeDistricts, metrics);
  const frontier = getCandidateFrontier(activeDistricts);
  const curve = buildObjectiveCurve(frontier, metrics, w, compiledSpec);
  const schedule = getSwitchSchedule(frontier, metrics);
  const calculatedBest = chooseBestCandidate(curve, metrics);
  const best = chooseScheduleCandidate(curve, schedule, w, calculatedBest);
  els.wValue.value = formatAdaptiveWeight(w, schedule, best.demSeats);
  const comparison = buildOutcomeComparison(
    activeDistricts,
    metrics,
    frontier,
    best,
    compiledSpec,
  );
  const referenceOutcomes = buildReferenceOutcomes(
    activeDistricts,
    metrics,
    frontier,
    compiledSpec,
  );
  const inspected =
    inspectedDemSeats === null
      ? null
      : curve.find((candidate) => candidate.demSeats === inspectedDemSeats) || null;
  const isInspection = Boolean(inspected && inspected.demSeats !== best.demSeats);
  const selected = isInspection ? inspected : best;
  if (!isInspection) inspectedDemSeats = null;
  const diagnosticMode =
    activeMapMode === "model" ? (isInspection ? "inspection" : "model") : activeMapMode;
  const modelDisplayedOutcome = scoreAllocationOutcome(
    activeDistricts,
    selected.assignment,
    metrics,
    compiledSpec,
  );
  const displayedOutcome = resolveDisplayedOutcome({
    mode: diagnosticMode,
    districts: activeDistricts,
    metrics,
    frontier,
    spec: compiledSpec,
    modelOutcome: modelDisplayedOutcome,
    comparison,
    referenceOutcomes,
  });
  const diagnosticAssignment = displayedOutcome.assignment;
  const publicMetrics = computePublicMetrics(
    activeDistricts,
    metrics,
    diagnosticAssignment,
    {
      w,
      spec: compiledSpec,
      useModelRule: diagnosticMode === "model" || diagnosticMode === "inspection",
      allocationRule: ["proportional", "efficiency"].includes(diagnosticMode)
        ? diagnosticMode
        : null,
      diagnosticRule: isAllocationDiagnosticMode(diagnosticMode)
        ? diagnosticMode
        : null,
    },
  );

  activeModel = {
    w,
    metrics,
    frontier,
    curve,
    best,
    selected,
    isInspection,
    schedule,
    paperSummary,
    publicMetrics,
    displayedOutcome,
    referenceOutcomes,
    diagnosticAssignment,
    diagnosticMode,
    comparison,
  };

  renderInterpretation(w, schedule, best);
  renderPredictionContext(selected, best, isInspection);
  renderDiagnosticTargetState(diagnosticMode);
  renderMap(activeDistricts, metrics, displayedOutcome, diagnosticMode, comparison, w);
  renderMetrics(metrics, publicMetrics, selected, best, w, isInspection, diagnosticMode);
  renderPublicMetrics(publicMetrics, metrics, w, diagnosticMode);
  renderRepresentationSummary(metrics, selected, schedule, w, isInspection);
  renderFirstRunGuide({
    metrics,
    best,
    selected,
    comparison,
    referenceOutcomes,
    displayedOutcome,
    diagnosticMode,
    w,
  });
  renderOutcomeComparison(comparison);
  renderLossChart(curve, best, selected);
  renderSwitchSchedule(
    schedule,
    w,
    metrics.totalSeats,
    best.demSeats,
    frontier,
    activeDistricts,
  );
  renderDistrictRows(activeDistricts, displayedOutcome, diagnosticMode, w);
  renderActiveSpec();
  renderPaperFigures(activeDistricts, metrics, frontier, best, selected, schedule, w);
  renderNewsroomPanel();
  if (explorerInitialized) syncScenarioUrl();
}

function generateScenario(stateName, year) {
  const election = getElectionRecord(stateName, year);
  if (!election) throw new Error(`Election data is unavailable for ${stateName} ${year}.`);
  const displayLayout = createDisplayLayout(election.seats);
  const shapeRng = mulberry32(hashString(`${stateName}-${year}`));
  const stateCode = stateConfigs[stateName].code;
  const districts = election.districts.map((sourceDistrict, index) => {
    const [id, sourceDemShare, sourceRepShare, proxy, largeThirdParty] = sourceDistrict;
    const twoPartyTotal = sourceDemShare + sourceRepShare;
    const demShare = sourceDemShare / twoPartyTotal;
    const repShare = sourceRepShare / twoPartyTotal;
    const cell = displayLayout.cells[index];
    const shape = buildShape(displayLayout, displayLayout.cells[index], index, shapeRng);

    return {
      id,
      raceId: `${year}${stateCode}${String(id).padStart(2, "0")}`,
      cell,
      demShare,
      repShare,
      totalVotes: 1,
      demVotes: demShare,
      repVotes: repShare,
      voteCountsAvailable: false,
      proxy: Boolean(proxy),
      largeThirdParty: Boolean(largeThirdParty),
      winner: demShare > repShare ? "D" : "R",
      margin: Math.abs(demShare - repShare),
      points: shape.points,
      center: shape.center,
      bounds: shape.bounds,
    };
  });
  districts.sourceRho = election.seats - election.proportionalRepTarget;
  return districts;
}

function getScenarioMetadata(stateName, year) {
  const election = getElectionRecord(stateName, year);
  if (!election) throw new Error(`Election metadata is unavailable for ${stateName} ${year}.`);
  const stateKey = STATE_URL_KEYS[stateName] || slugifyFilename(stateName) || "state";
  const quality = getElectionQualityCounts(election);
  const qualityNotes = [];
  if (quality.proxy) {
    qualityNotes.push(`${quality.proxy} ${quality.proxy === 1 ? "race uses" : "races use"} a proxy`);
  }
  if (quality.largeThirdParty) {
    qualityNotes.push(
      `${quality.largeThirdParty} ${
        quality.largeThirdParty === 1 ? "race has" : "races have"
      } the large-third-party flag`,
    );
  }
  const qualityDescription = qualityNotes.length
    ? ` ${qualityNotes.join("; ")}.`
    : " No proxy or large-third-party flags are present for this election.";
  return {
    kind: "historical-election",
    label: "Historical district vote-share profile",
    description: `Author-supplied normalized two-party district vote shares; district geometry is schematic.${qualityDescription}`,
    planId: `${stateKey}${election.seats}-schematic-v2`,
    planLabel: `${election.seats}-district schematic layout`,
    dataVersion: `${bundledElectionData.dataVersion}-${stateKey}-${year}`,
    dataStatus: "Author-supplied election data",
    sourceLabel: ELECTION_DATA_SOURCE,
    sourceHref: "references/representation-in-district-based-elections.pdf",
    lastUpdated: bundledElectionData.lastUpdated,
    proxyCount: quality.proxy,
    largeThirdPartyCount: quality.largeThirdParty,
  };
}

function getCustomScenarioMetadata(definition) {
  const districtCount = definition?.districts?.length || 0;
  const updatedAt = Number(definition?.updatedAt);
  const lastUpdated = Number.isFinite(updatedAt)
    ? new Date(updatedAt).toISOString().slice(0, 10)
    : METHODOLOGY_LAST_UPDATED;
  return {
    kind: "visitor-entered",
    label: "User-entered vote profile",
    description: "User-entered two-party district votes displayed on a schematic layout.",
    planId: `custom${districtCount}-schematic-v1`,
    planLabel: `${districtCount}-district schematic layout`,
    dataVersion: getCustomDataVersion(definition),
    dataStatus: "User-entered data",
    sourceLabel: "Normalized user-entered two-party district profile embedded in this scenario",
    sourceHref: "references/representation-in-district-based-elections.pdf",
    lastUpdated,
  };
}

function createCustomScenario(definition) {
  const validation = validateCustomStateDefinition(definition);
  if (!validation.value) throw new Error(validation.error);
  const normalized = validation.value;
  const layout = createCustomLayout(normalized.districts.length);
  const cfg = {
    cols: layout.cols,
    rows: layout.rows,
    cells: layout.cells,
  };
  const shapeRng = mulberry32(
    hashString(`custom-shape-${normalized.name}-${normalized.districts.length}`),
  );

  return normalized.districts.map((district, index) => {
    const totalVotes = district.demVotes + district.repVotes;
    const demShare = district.demVotes / totalVotes;
    const cell = layout.cells[index];
    const shape = buildShape(cfg, cell, index, shapeRng);
    return {
      id: index + 1,
      cell,
      demShare,
      repShare: 1 - demShare,
      totalVotes,
      demVotes: district.demVotes,
      repVotes: district.repVotes,
      voteCountsAvailable: true,
      proxy: false,
      largeThirdParty: false,
      winner: district.demVotes > district.repVotes ? "D" : "R",
      margin: Math.abs(demShare - 0.5) * 2,
      points: shape.points,
      center: shape.center,
      bounds: shape.bounds,
    };
  });
}

function createCustomLayout(districtCount) {
  return createDisplayLayout(districtCount);
}

function createDisplayLayout(districtCount) {
  const rows =
    districtCount <= 7
      ? 1
      : districtCount <= 14
        ? 2
        : districtCount <= 18
          ? 3
          : Math.max(4, Math.round(Math.sqrt(districtCount / 2)));
  const cols = Math.ceil(districtCount / rows);
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    const rowCount = Math.min(cols, districtCount - row * cols);
    const offset = (cols - rowCount) / 2;
    for (let col = 0; col < rowCount; col += 1) {
      cells.push([offset + col, row]);
    }
  }
  return { cols, rows, cells };
}

function buildShape(cfg, cell, index, rng) {
  const padX = 5;
  const padY = 10;
  const usableW = 630;
  const usableH = 310;
  const cellW = usableW / cfg.cols;
  const cellH = usableH / cfg.rows;
  const [col, row] = cell;
  const baseX = padX + col * cellW;
  const baseY = padY + row * cellH;
  const insetX = 6.5;
  const insetY = clamp(Math.min(cellW, cellH) * 0.105, 9.5, 10.5);
  const x = baseX + insetX;
  const y = baseY + insetY;
  const width = cellW - insetX * 2;
  const height = cellH - insetY * 2;
  const corner = clamp(Math.min(width, height) * 0.09, 5, 8);
  const points = [
    [x + corner, y],
    [x + width - corner, y],
    [x + width, y + corner],
    [x + width, y + height - corner],
    [x + width - corner, y + height],
    [x + corner, y + height],
    [x, y + height - corner],
    [x, y + corner],
  ].map(([px, py]) => {
    let jitterY = 0;
    if (typeof rng === "function") {
      rng(); // Preserve the seeded sequence while keeping every district equally wide.
      jitterY = (rng() - 0.5) * 1.2;
    }
    return [clamp(px, 8, 632), clamp(py + jitterY, 8, 322)];
  });

  return {
    points,
    center: centroid(points),
    bounds: { x, y, width, height },
  };
}

function computeMetrics(districts) {
  const totalVotes = sum(districts, "totalVotes");
  const demVotes = sum(districts, "demVotes");
  const repVotes = sum(districts, "repVotes");
  const demSeats = districts.filter((district) => district.winner === "D").length;
  const totalSeats = districts.length;
  const calculatedRho = districts.reduce((total, district) => total + district.demShare, 0);
  const rho = Number.isFinite(districts.sourceRho) ? districts.sourceRho : calculatedRho;
  const modelDemShare = rho / totalSeats;
  const voteCountsAvailable = districts.every(
    (district) => district.voteCountsAvailable !== false,
  );
  const demVoteShare = voteCountsAvailable ? demVotes / totalVotes : modelDemShare;
  const proportionalDemSeats = clamp(nearestIntegerWithTiesDown(rho), 0, totalSeats);

  return {
    totalVotes,
    demVotes,
    repVotes,
    demVoteShare,
    repVoteShare: 1 - demVoteShare,
    rho,
    modelDemShare,
    demSeats,
    repSeats: totalSeats - demSeats,
    totalSeats,
    proportionalDemSeats,
    proportionalRepSeats: totalSeats - proportionalDemSeats,
    voteCountsAvailable,
    efficiencyGap: computeEfficiencyGap(districts),
    partisanBias: computePartisanBias(districts, modelDemShare),
  };
}

function computeEfficiencyGap(districts) {
  const n = districts.length;
  const democraticSeats = districts.filter((district) => district.winner === "D").length;
  const rho = Number.isFinite(districts.sourceRho)
    ? districts.sourceRho
    : districts.reduce((total, district) => total + district.demShare, 0);
  return democraticSeats / n - (2 * rho) / n + 0.5;
}

function computePartisanBias(districts, statewideDemShare) {
  const uniformShift = 0.5 - statewideDemShare;
  const shiftedShares = districts.map((district) => district.demShare + uniformShift);
  if (shiftedShares.some((share) => share < -1e-12 || share > 1 + 1e-12)) return null;
  const demSeatsAtFifty = shiftedShares.filter((share) => share > 0.5).length;
  return demSeatsAtFifty / districts.length - 0.5;
}

function computeLopsidedMarginDifference(districts, assignment) {
  const demWinningMargins = districts
    .filter((_, index) => assignment[index] === 1)
    .map((district) => 2 * (district.demShare - 0.5));
  const repWinningMargins = districts
    .filter((_, index) => assignment[index] === 0)
    .map((district) => 2 * (0.5 - district.demShare));
  return demWinningMargins.length && repWinningMargins.length
    ? averageValues(demWinningMargins) - averageValues(repWinningMargins)
    : null;
}

function getStatewideVoteWinner(metrics) {
  if (metrics.modelDemShare > 0.5 + 1e-12) return "D";
  if (metrics.modelDemShare < 0.5 - 1e-12) return "R";
  return null;
}

function computeMajorityInversionForSeats(metrics, demSeats) {
  const statewideVoteWinner = getStatewideVoteWinner(metrics);
  if (statewideVoteWinner === null) return null;
  const demSeatShare = demSeats / metrics.totalSeats;
  return (
    (statewideVoteWinner === "D" && demSeatShare <= 0.5) ||
    (statewideVoteWinner === "R" && demSeatShare >= 0.5)
  );
}

function computePublicMetrics(districts, metrics, assignment = null, options = {}) {
  const districtShares = districts.map((district) => district.demShare);
  const observedAssignment = districts.map((district) => (district.winner === "D" ? 1 : 0));
  const normalizedAssignment = assignment
    ? assignment.map((value) => (Number(value) === 1 ? 1 : 0))
    : observedAssignment;
  if (normalizedAssignment.length !== districts.length) {
    throw new Error("Diagnostic allocation length must match the number of districts.");
  }
  const districtMedian = medianValue(districtShares);
  const demSeats = normalizedAssignment.reduce((total, value) => total + value, 0);
  const demSeatShare = demSeats / metrics.totalSeats;
  const seatVoteGap = demSeatShare - metrics.modelDemShare;
  const repSeatShare = 1 - demSeatShare;
  const modelRepShare = 1 - metrics.modelDemShare;
  const gallagherIndex = Math.sqrt(
    0.5 *
      ((demSeatShare - metrics.modelDemShare) ** 2 +
        (repSeatShare - modelRepShare) ** 2),
  );
  const competitiveDistricts = districts.filter((district) => district.margin <= 0.1).length;
  const tossupDistricts = districts.filter((district) => district.margin <= 0.05).length;
  const lopsidedMargins = computeLopsidedMarginDifference(
    districts,
    normalizedAssignment,
  );
  const statewideVoteWinner = getStatewideVoteWinner(metrics);
  const majorityInversion = computeMajorityInversionForSeats(metrics, demSeats);
  const useModelRule = Boolean(
    options.useModelRule &&
      options.spec &&
      Number.isFinite(Number(options.w)),
  );
  const allocationRule = ["proportional", "efficiency"].includes(options.allocationRule)
    ? options.allocationRule
    : null;
  const diagnosticRule = isAllocationDiagnosticMode(options.diagnosticRule)
    ? options.diagnosticRule
    : null;
  const partisanBias = diagnosticRule
    ? computeDiagnosticRulePartisanBias(districts, diagnosticRule, options.spec)
    : allocationRule
    ? computeAllocationRulePartisanBias(districts, allocationRule)
    : useModelRule
      ? computeModelPartisanBias(districts, Number(options.w), options.spec)
      : computePartisanBias(districts, metrics.modelDemShare);
  const responsiveness = diagnosticRule
    ? computeDiagnosticRuleResponsiveness(districts, diagnosticRule, options.spec)
    : allocationRule
    ? computeAllocationRuleResponsiveness(districts, allocationRule)
    : useModelRule
      ? computeModelResponsiveness(districts, Number(options.w), options.spec)
      : computeResponsiveness(districts, metrics.modelDemShare);

  return {
    demSeats,
    repSeats: metrics.totalSeats - demSeats,
    isObserved: normalizedAssignment.every(
      (value, index) => value === observedAssignment[index],
    ),
    efficiencyGap: demSeatShare - 2 * metrics.modelDemShare + 0.5,
    partisanBias,
    seatVoteGap,
    gallagherIndex,
    meanMedianGap: metrics.modelDemShare - districtMedian,
    declination: computeDeclination(districtShares, normalizedAssignment),
    competitiveDistricts,
    tossupDistricts,
    responsiveness,
    lopsidedMargins,
    majorityInversion,
    inversionWinner: statewideVoteWinner,
  };
}

function computeDeclination(demShares, assignment = null) {
  const normalizedAssignment = assignment
    ? assignment.map((value) => (Number(value) === 1 ? 1 : 0))
    : demShares.map((share) => (share > 0.5 ? 1 : 0));
  if (normalizedAssignment.length !== demShares.length) {
    throw new Error("Declination allocation length must match the vote-share profile.");
  }
  const republicanWins = demShares.filter((_, index) => normalizedAssignment[index] === 0);
  const democraticWins = demShares.filter((_, index) => normalizedAssignment[index] === 1);
  if (!republicanWins.length || !democraticWins.length) return null;
  const totalDistricts = demShares.length;
  const theta = Math.atan(
    (1 - 2 * averageValues(republicanWins)) * (totalDistricts / republicanWins.length),
  );
  const gamma = Math.atan(
    (2 * averageValues(democraticWins) - 1) * (totalDistricts / democraticWins.length),
  );
  return (2 * (gamma - theta)) / Math.PI;
}

function computeResponsiveness(districts, statewideDemShare) {
  const seatShareAt = (targetVoteShare) => {
    const uniformShift = targetVoteShare - statewideDemShare;
    const shiftedShares = districts.map((district) => district.demShare + uniformShift);
    if (shiftedShares.some((share) => share < -1e-12 || share > 1 + 1e-12)) return null;
    const democraticSeats = shiftedShares.filter((share) => share > 0.5).length;
    return democraticSeats / districts.length;
  };
  const lowSeatShare = seatShareAt(0.45);
  const highSeatShare = seatShareAt(0.55);
  if (lowSeatShare === null || highSeatShare === null) return null;
  return (highSeatShare - lowSeatShare) / 0.1;
}

function computeAllocationRuleSeatShareAtSupport(districts, targetDemShare, rule) {
  const shiftedDistricts = createUniformShiftedDistricts(districts, targetDemShare);
  if (!shiftedDistricts) return null;
  const shiftedMetrics = computeMetrics(shiftedDistricts);
  return getReferenceSeatCount(shiftedMetrics, rule) / shiftedMetrics.totalSeats;
}

function computeAllocationRulePartisanBias(districts, rule) {
  const seatShareAtParity = computeAllocationRuleSeatShareAtSupport(districts, 0.5, rule);
  return seatShareAtParity === null ? null : seatShareAtParity - 0.5;
}

function computeAllocationRuleResponsiveness(districts, rule) {
  const lowSeatShare = computeAllocationRuleSeatShareAtSupport(districts, 0.45, rule);
  const highSeatShare = computeAllocationRuleSeatShareAtSupport(districts, 0.55, rule);
  if (lowSeatShare === null || highSeatShare === null) return null;
  return (highSeatShare - lowSeatShare) / 0.1;
}

function createUniformShiftedDistricts(districts, targetDemShare) {
  const currentDemShare = Number.isFinite(districts.sourceRho)
    ? districts.sourceRho / districts.length
    : averageValues(districts.map((district) => district.demShare));
  const shift = targetDemShare - currentDemShare;
  const shiftedShares = districts.map((district) => district.demShare + shift);
  if (shiftedShares.some((share) => share < -1e-12 || share > 1 + 1e-12)) return null;

  const shiftedDistricts = districts.map((district, index) => {
    const demShare = clamp(shiftedShares[index], 0, 1);
    const demVotes = demShare * district.totalVotes;
    return {
      ...district,
      demShare,
      repShare: 1 - demShare,
      demVotes,
      repVotes: district.totalVotes - demVotes,
      winner: demShare > 0.5 ? "D" : "R",
      margin: Math.abs(demShare - 0.5) * 2,
    };
  });
  shiftedDistricts.sourceRho = targetDemShare * shiftedDistricts.length;
  return shiftedDistricts;
}

function computeRankedCandidateFrontier(districts, spec) {
  const observed = districts.map((district) => (district.winner === "D" ? 1 : 0));
  const alternatives = districts
    .map((district, index) => {
      const costD = asNonnegativeScalar(
        evaluateAst(spec.districtLossA, { p: district.demShare }),
        "district loss",
      );
      const costR = asNonnegativeScalar(
        evaluateAst(spec.districtLossB, { p: district.demShare }),
        "district loss",
      );
      return {
        index,
        costD,
        costR,
        incrementalLoss: costD - costR,
        incrementalFlips: observed[index] ? -1 : 1,
      };
    })
    .sort((first, second) => {
      const lossDifference = first.incrementalLoss - second.incrementalLoss;
      if (Math.abs(lossDifference) > 1e-11) return lossDifference;
      if (first.incrementalFlips !== second.incrementalFlips) {
        return first.incrementalFlips - second.incrementalFlips;
      }
      return first.index - second.index;
    });

  return Array.from({ length: districts.length + 1 }, (_, demSeats) => {
    const democratic = new Set(
      alternatives.slice(0, demSeats).map((alternative) => alternative.index),
    );
    const assignment = districts.map((_, index) => (democratic.has(index) ? 1 : 0));
    const districtLosses = districts.map((_, index) => {
      const alternative = alternatives.find((item) => item.index === index);
      return assignment[index] ? alternative.costD : alternative.costR;
    });
    const flips = assignment.reduce(
      (total, value, index) => total + (value !== observed[index] ? 1 : 0),
      0,
    );
    return {
      demSeats,
      repSeats: districts.length - demSeats,
      assignment,
      districtLosses,
      districtLoss: districtLosses.reduce((total, value) => total + value, 0),
      flips,
    };
  });
}

function computeModelSeatShareAtSupport(districts, targetDemShare, w, spec) {
  const shiftedDistricts = createUniformShiftedDistricts(districts, targetDemShare);
  if (!shiftedDistricts) return null;
  const shiftedMetrics = computeMetrics(shiftedDistricts);
  const frontier = computeRankedCandidateFrontier(shiftedDistricts, spec);
  const best = chooseBestCandidate(buildObjectiveCurve(frontier, shiftedMetrics, w, spec));
  return best.demSeats / shiftedMetrics.totalSeats;
}

function computeModelPartisanBias(districts, w, spec) {
  const seatShareAtParity = computeModelSeatShareAtSupport(districts, 0.5, w, spec);
  return seatShareAtParity === null ? null : seatShareAtParity - 0.5;
}

function computeModelResponsiveness(districts, w, spec) {
  const lowSeatShare = computeModelSeatShareAtSupport(districts, 0.45, w, spec);
  const highSeatShare = computeModelSeatShareAtSupport(districts, 0.55, w, spec);
  if (lowSeatShare === null || highSeatShare === null) return null;
  return (highSeatShare - lowSeatShare) / 0.1;
}

function computePaperBenchmarkSummary(districts, metrics) {
  const rankedDistricts = districts
    .map((district, index) => ({ index, demShare: district.demShare }))
    .sort((first, second) => second.demShare - first.demShare || first.index - second.index);
  const rankByIndex = new Map(
    rankedDistricts.map((district, rank) => [district.index, rank]),
  );
  const candidates = Array.from({ length: metrics.totalSeats + 1 }, (_, demSeats) => {
    const assignment = districts.map((_, index) =>
      rankByIndex.get(index) < demSeats ? 1 : 0,
    );
    const districtLosses = districts.map((district, index) =>
      assignment[index] ? 1 - district.demShare : district.demShare,
    );
    return {
      demSeats,
      repSeats: metrics.totalSeats - demSeats,
      assignment,
      districtLosses,
      districtLoss: districtLosses.reduce((total, value) => total + value, 0),
      statewideLoss: Math.abs(demSeats - metrics.rho),
    };
  });

  const fptpCandidate = candidates[metrics.demSeats];
  const proportionalCandidate = candidates[metrics.proportionalDemSeats];
  const fptpSupport = computeLinearSupportInterval(candidates, fptpCandidate);
  const proportionalSupport = computeLinearSupportInterval(
    candidates,
    proportionalCandidate,
  );

  return {
    fptpSeats: metrics.demSeats,
    proportionalSeats: metrics.proportionalDemSeats,
    seatGap: metrics.demSeats - metrics.proportionalDemSeats,
    firstSwitchWeight:
      metrics.demSeats === metrics.proportionalDemSeats ? null : fptpSupport?.end ?? null,
    proportionalSwitchWeight: proportionalSupport?.start ?? null,
    fptpSupport,
    proportionalSupport,
    candidates,
  };
}

function computeActiveWeightSummary(schedule, metrics) {
  const segments = Array.isArray(schedule?.segments) ? schedule.segments : [];
  if (!segments.length) {
    return {
      firstSwitchWeight: null,
      targetSwitchWeight: null,
      targetDemSeats: null,
      alreadyAtTarget: false,
    };
  }

  const firstDifferent = segments.find(
    (segment) => segment.demSeats !== metrics.demSeats,
  );
  const targetDemSeats = segments.at(-1).demSeats;
  const firstTargetSegment = segments.find(
    (segment) => segment.demSeats === targetDemSeats,
  );
  const alreadyAtTarget = !firstDifferent && targetDemSeats === metrics.demSeats;

  return {
    firstSwitchWeight: firstDifferent?.start ?? null,
    targetSwitchWeight: alreadyAtTarget ? null : firstTargetSegment?.start ?? null,
    targetDemSeats,
    alreadyAtTarget,
  };
}

function computeLinearSupportInterval(candidates, candidate) {
  const candidateSlope = candidate.statewideLoss - candidate.districtLoss;
  let start = 0;
  let end = 1;

  for (const alternative of candidates) {
    if (alternative === candidate) continue;
    const interceptDifference = candidate.districtLoss - alternative.districtLoss;
    const slopeDifference =
      candidateSlope - (alternative.statewideLoss - alternative.districtLoss);

    if (Math.abs(slopeDifference) <= 1e-12) {
      if (interceptDifference > 1e-10) return null;
      continue;
    }

    const crossing = -interceptDifference / slopeDifference;
    if (slopeDifference > 0) {
      end = Math.min(end, crossing);
    } else {
      start = Math.max(start, crossing);
    }
    if (start > end + 1e-10) return null;
  }

  return {
    start: clamp(start, 0, 1),
    end: clamp(end, 0, 1),
  };
}

function getCandidateFrontier(districts) {
  const key = [
    getActiveScenarioCacheKey(),
    activeFormulas.districtLossA,
    activeFormulas.districtLossB,
  ].join("||");
  if (!frontierCache.has(key)) {
    frontierCache.set(key, computeRankedCandidateFrontier(districts, compiledSpec));
  }
  return frontierCache.get(key);
}

function getSwitchSchedule(frontier, metrics) {
  const key = [
    getActiveScenarioCacheKey(),
    ...Object.keys(defaultFormulas).map((name) => activeFormulas[name]),
  ].join("||");
  if (!scheduleCache.has(key)) {
    const calculated = computeSwitchSchedule(frontier, metrics, compiledSpec);
    const election =
      activeState === CUSTOM_STATE_KEY ? null : getElectionRecord(activeState, activeYear);
    scheduleCache.set(
      key,
      isPaperLinearSpecification()
        ? applyBundledSwitchWeights(calculated, election)
        : calculated,
    );
  }
  return scheduleCache.get(key);
}

function applyBundledSwitchWeights(schedule, election) {
  const weights = election?.switchWeights || [];
  if (weights.length !== schedule.switches.length) return schedule;
  if (!weights.length) return { ...schedule, source: "dataset" };
  const segments = schedule.segments.map((segment, index) => ({
    ...segment,
    start: index === 0 ? 0 : weights[index - 1],
    end: index === schedule.segments.length - 1 ? 1 : weights[index],
  }));
  const switches = schedule.switches.map((item, index) => ({
    ...item,
    calculatedWeight: item.weight,
    weight: weights[index],
  }));
  return { segments, switches, source: "dataset" };
}

function getActiveScenarioCacheKey() {
  return activeState === CUSTOM_STATE_KEY
    ? `${CUSTOM_STATE_KEY}|${customState?.updatedAt || 0}`
    : `${activeState}|${activeYear}`;
}

function computeCandidateFrontier(districts, spec) {
  return computeRankedCandidateFrontier(districts, spec);
}

function buildObjectiveCurve(frontier, metrics, w, spec) {
  return frontier.map((candidate) => {
    const targetSeatCount = asFiniteScalar(
      evaluateAst(spec.stateTarget, { rho: metrics.rho, N: metrics.totalSeats }),
      "statewide target",
    );
    const targetGap = candidate.demSeats - targetSeatCount;
    const targetDistance = Math.abs(targetGap);
    const statewideLoss = asNonnegativeScalar(
      evaluateAst(spec.stateLoss, { z: targetDistance, N: metrics.totalSeats }),
      "statewide loss",
    );
    const districtComponent = (1 - w) * candidate.districtLoss;
    const statewideComponent = w * statewideLoss;
    const totalLoss = asNonnegativeScalar(
      evaluateAst(spec.aggregation, {
        y1: districtComponent,
        y2: statewideComponent,
      }),
      "aggregation function",
    );

    return {
      ...candidate,
      seatShare: candidate.demSeats / metrics.totalSeats,
      targetSeatCount,
      targetGap,
      targetDistance,
      statewideLoss,
      districtComponent,
      statewideComponent,
      totalLoss,
    };
  });
}

function chooseBestCandidate(curve, _metrics) {
  return curve.reduce((winner, candidate) => {
    if (!winner) return candidate;
    if (candidate.totalLoss < winner.totalLoss - 1e-10) return candidate;
    if (Math.abs(candidate.totalLoss - winner.totalLoss) > 1e-10) return winner;
    return candidate.demSeats < winner.demSeats ? candidate : winner;
  }, null);
}

function chooseScheduleCandidate(curve, schedule, w, calculatedBest) {
  if (schedule?.source !== "dataset") return calculatedBest;
  const regime = findCurrentRegime(
    schedule.segments || [],
    w,
    calculatedBest?.demSeats ?? null,
  );
  return (
    curve.find((candidate) => candidate.demSeats === regime?.demSeats) || calculatedBest
  );
}

function scoreAllocationOutcome(districts, assignment, metrics, spec) {
  if (!Array.isArray(assignment) || assignment.length !== districts.length) {
    throw new Error("Allocation length must match the number of districts.");
  }

  const normalizedAssignment = assignment.map((value) => (Number(value) === 1 ? 1 : 0));
  const districtLosses = districts.map((district, index) =>
    asNonnegativeScalar(
      evaluateAst(
        normalizedAssignment[index] ? spec.districtLossA : spec.districtLossB,
        { p: district.demShare },
      ),
      "district loss",
    ),
  );
  const demSeats = normalizedAssignment.reduce((total, value) => total + value, 0);
  const targetSeatCount = asFiniteScalar(
    evaluateAst(spec.stateTarget, { rho: metrics.rho, N: metrics.totalSeats }),
    "statewide target",
  );
  const targetGap = demSeats - targetSeatCount;
  const targetDistance = Math.abs(targetGap);
  const statewideLoss = asNonnegativeScalar(
    evaluateAst(spec.stateLoss, { z: targetDistance, N: metrics.totalSeats }),
    "statewide loss",
  );
  const localMatches = normalizedAssignment.reduce(
    (total, value, index) =>
      total + (value === (districts[index].winner === "D" ? 1 : 0) ? 1 : 0),
    0,
  );
  const seatVoteGap = demSeats / metrics.totalSeats - metrics.modelDemShare;

  return {
    assignment: normalizedAssignment,
    demSeats,
    repSeats: metrics.totalSeats - demSeats,
    districtLosses,
    districtLoss: districtLosses.reduce((total, value) => total + value, 0),
    localMatches,
    flips: metrics.totalSeats - localMatches,
    targetSeatCount,
    targetGap,
    targetDistance,
    statewideLoss,
    seatVoteGap,
    efficiencyGap: demSeats / metrics.totalSeats - 2 * metrics.modelDemShare + 0.5,
    gallagherIndex: Math.abs(seatVoteGap),
  };
}

function getReferenceSeatCount(metrics, rule) {
  if (rule === "proportional") return metrics.proportionalDemSeats;
  if (rule === "efficiency") {
    const zeroGapTarget = 2 * metrics.rho - metrics.totalSeats / 2;
    return clamp(
      nearestIntegerWithTiesDown(zeroGapTarget),
      0,
      metrics.totalSeats,
    );
  }
  throw new Error(`Unknown allocation reference rule: ${rule}`);
}

function chooseReferenceCandidate(frontier, metrics, rule) {
  const candidate = frontier[getReferenceSeatCount(metrics, rule)];
  if (!candidate) throw new Error(`No feasible ${rule} allocation was found.`);
  return candidate;
}

function buildReferenceOutcomes(districts, metrics, frontier, spec) {
  return {
    proportional: scoreAllocationOutcome(
      districts,
      chooseReferenceCandidate(frontier, metrics, "proportional").assignment,
      metrics,
      spec,
    ),
    efficiency: scoreAllocationOutcome(
      districts,
      chooseReferenceCandidate(frontier, metrics, "efficiency").assignment,
      metrics,
      spec,
    ),
  };
}

function isProfileDiagnosticMode(mode) {
  return DIAGNOSTIC_MAP_TARGETS[mode]?.kind === "profile";
}

function isAllocationDiagnosticMode(mode) {
  return [
    "partisanBias",
    "seatVoteGap",
    "declination",
    "gallagher",
    "lopsidedMargins",
    "majorityInversion",
  ].includes(mode);
}

function getDiagnosticCandidateScore(candidate, districts, metrics, mode) {
  if (mode === "partisanBias") {
    return Math.abs(candidate.demSeats / metrics.totalSeats - 0.5);
  }
  if (mode === "seatVoteGap" || mode === "gallagher") {
    return Math.abs(candidate.demSeats / metrics.totalSeats - metrics.modelDemShare);
  }
  if (mode === "declination") {
    const value = computeDeclination(
      districts.map((district) => district.demShare),
      candidate.assignment,
    );
    return value === null ? Number.POSITIVE_INFINITY : Math.abs(value);
  }
  if (mode === "lopsidedMargins") {
    const value = computeLopsidedMarginDifference(districts, candidate.assignment);
    return value === null ? Number.POSITIVE_INFINITY : Math.abs(value);
  }
  if (mode === "majorityInversion") {
    return computeMajorityInversionForSeats(metrics, candidate.demSeats) ? 1 : 0;
  }
  return Number.POSITIVE_INFINITY;
}

function chooseDiagnosticCandidate(frontier, districts, metrics, mode) {
  if (!isAllocationDiagnosticMode(mode)) return null;
  return frontier.reduce((winner, candidate) => {
    if (!winner) return candidate;
    const candidateScore = getDiagnosticCandidateScore(candidate, districts, metrics, mode);
    const winnerScore = getDiagnosticCandidateScore(winner, districts, metrics, mode);
    if (candidateScore < winnerScore - 1e-11) return candidate;
    if (candidateScore > winnerScore + 1e-11) return winner;
    if (candidate.districtLoss < winner.districtLoss - 1e-11) return candidate;
    if (candidate.districtLoss > winner.districtLoss + 1e-11) return winner;
    if (candidate.flips < winner.flips) return candidate;
    if (candidate.flips > winner.flips) return winner;
    return candidate.demSeats < winner.demSeats ? candidate : winner;
  }, null);
}

function buildDiagnosticOutcome(districts, metrics, frontier, spec, mode) {
  const candidate = chooseDiagnosticCandidate(frontier, districts, metrics, mode);
  return candidate
    ? scoreAllocationOutcome(districts, candidate.assignment, metrics, spec)
    : null;
}

function resolveDisplayedOutcome({
  mode,
  districts,
  metrics,
  frontier,
  spec,
  modelOutcome,
  comparison,
  referenceOutcomes,
}) {
  if (mode === "model" || mode === "inspection") return modelOutcome;
  if (mode === "observed") return comparison.observed;
  if (mode === "proportional") return referenceOutcomes.proportional;
  if (mode === "efficiency") return referenceOutcomes.efficiency;
  if (isProfileDiagnosticMode(mode)) return comparison.observed;
  return (
    buildDiagnosticOutcome(districts, metrics, frontier, spec, mode) || modelOutcome
  );
}

function computeDiagnosticRuleSeatShareAtSupport(districts, targetDemShare, mode, spec) {
  if (!spec || !isAllocationDiagnosticMode(mode)) return null;
  const shiftedDistricts = createUniformShiftedDistricts(districts, targetDemShare);
  if (!shiftedDistricts) return null;
  const shiftedMetrics = computeMetrics(shiftedDistricts);
  const shiftedFrontier = computeRankedCandidateFrontier(shiftedDistricts, spec);
  const candidate = chooseDiagnosticCandidate(
    shiftedFrontier,
    shiftedDistricts,
    shiftedMetrics,
    mode,
  );
  return candidate ? candidate.demSeats / shiftedMetrics.totalSeats : null;
}

function computeDiagnosticRulePartisanBias(districts, mode, spec) {
  const seatShareAtParity = computeDiagnosticRuleSeatShareAtSupport(
    districts,
    0.5,
    mode,
    spec,
  );
  return seatShareAtParity === null ? null : seatShareAtParity - 0.5;
}

function computeDiagnosticRuleResponsiveness(districts, mode, spec) {
  const lowSeatShare = computeDiagnosticRuleSeatShareAtSupport(
    districts,
    0.45,
    mode,
    spec,
  );
  const highSeatShare = computeDiagnosticRuleSeatShareAtSupport(
    districts,
    0.55,
    mode,
    spec,
  );
  if (lowSeatShare === null || highSeatShare === null) return null;
  return (highSeatShare - lowSeatShare) / 0.1;
}

function buildOutcomeComparison(districts, metrics, frontier, best, spec) {
  const observedAssignment = districts.map((district) => (district.winner === "D" ? 1 : 0));
  const targetBest = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, 1, spec), metrics);
  return {
    observed: scoreAllocationOutcome(districts, observedAssignment, metrics, spec),
    model: scoreAllocationOutcome(districts, best.assignment, metrics, spec),
    target: scoreAllocationOutcome(districts, targetBest.assignment, metrics, spec),
  };
}

function computeSwitchSchedule(frontier, metrics, spec) {
  const candidates = buildObjectiveCurve(frontier, metrics, 0, spec).map((candidate) => ({
    ...candidate,
    districtComponent: undefined,
    statewideComponent: undefined,
    totalLoss: undefined,
  }));

  return isLinearAggregationAst(spec.aggregation)
    ? computeLinearSwitchSchedule(candidates, metrics)
    : computeNumericSwitchSchedule(candidates, metrics, spec);
}

function computeLinearSwitchSchedule(candidates, metrics) {
  const lines = candidates.map((candidate) => ({
    ...candidate,
    intercept: candidate.districtLoss,
    slope: candidate.statewideLoss - candidate.districtLoss,
  }));

  const boundaries = [0, 1];
  for (let first = 0; first < lines.length; first += 1) {
    for (let second = first + 1; second < lines.length; second += 1) {
      const slopeDifference = lines[first].slope - lines[second].slope;
      if (Math.abs(slopeDifference) < 1e-12) continue;
      const crossing =
        (lines[second].intercept - lines[first].intercept) / slopeDifference;
      if (crossing > 1e-9 && crossing < 1 - 1e-9) boundaries.push(crossing);
    }
  }

  boundaries.sort((a, b) => a - b);
  const uniqueBoundaries = boundaries.filter(
    (value, index) => index === 0 || Math.abs(value - boundaries[index - 1]) > 1e-9,
  );
  const segments = [];

  for (let index = 0; index < uniqueBoundaries.length - 1; index += 1) {
    const start = uniqueBoundaries[index];
    const end = uniqueBoundaries[index + 1];
    if (end - start < 1e-10) continue;
    const midpoint = (start + end) / 2;
    const curve = lines.map((line) => ({
      ...line,
      totalLoss: line.intercept + midpoint * line.slope,
    }));
    const best = chooseBestCandidate(curve, metrics);
    const previous = segments.at(-1);

    if (previous && previous.demSeats === best.demSeats) {
      previous.end = end;
    } else {
      segments.push({
        start,
        end,
        demSeats: best.demSeats,
        repSeats: metrics.totalSeats - best.demSeats,
      });
    }
  }

  if (!segments.length) {
    const curve = lines.map((line) => ({ ...line, totalLoss: line.intercept }));
    const best = chooseBestCandidate(curve, metrics);
    segments.push({
      start: 0,
      end: 1,
      demSeats: best.demSeats,
      repSeats: metrics.totalSeats - best.demSeats,
    });
  }

  const switches = segments.slice(1).map((segment, index) => ({
    weight: segment.start,
    fromDemSeats: segments[index].demSeats,
    toDemSeats: segment.demSeats,
  }));

  return { segments, switches };
}

function computeNumericSwitchSchedule(candidates, metrics, spec) {
  const sampleCount = 4096;
  const weights = Array.from(
    { length: sampleCount + 1 },
    (_, index) => index / sampleCount,
  );
  const values = candidates.map((candidate) =>
    weights.map((weight) => scorePreparedCandidate(candidate, weight, spec).totalLoss),
  );
  const boundaries = [0, 1];

  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      let previousDifference = values[first][0] - values[second][0];
      for (let index = 1; index <= sampleCount; index += 1) {
        const difference = values[first][index] - values[second][index];
        if (Math.abs(previousDifference) <= 1e-11) boundaries.push(weights[index - 1]);
        if (previousDifference * difference < 0) {
          boundaries.push(
            bisectObjectiveCrossing(
              candidates[first],
              candidates[second],
              weights[index - 1],
              weights[index],
              spec,
            ),
          );
        }
        previousDifference = difference;
      }
    }
  }

  boundaries.sort((first, second) => first - second);
  const uniqueBoundaries = boundaries.filter(
    (value, index) =>
      value >= 0 &&
      value <= 1 &&
      (index === 0 || Math.abs(value - boundaries[index - 1]) > 1e-8),
  );
  const segments = [];

  for (let index = 0; index < uniqueBoundaries.length - 1; index += 1) {
    const start = uniqueBoundaries[index];
    const end = uniqueBoundaries[index + 1];
    if (end - start < 1e-9) continue;
    const midpoint = (start + end) / 2;
    const curve = candidates.map((candidate) => scorePreparedCandidate(candidate, midpoint, spec));
    const best = chooseBestCandidate(curve, metrics);
    const previous = segments.at(-1);

    if (previous && previous.demSeats === best.demSeats) {
      previous.end = end;
    } else {
      segments.push({
        start,
        end,
        demSeats: best.demSeats,
        repSeats: metrics.totalSeats - best.demSeats,
      });
    }
  }

  if (!segments.length) {
    const best = chooseBestCandidate(
      candidates.map((candidate) => scorePreparedCandidate(candidate, 0.5, spec)),
      metrics,
    );
    segments.push({
      start: 0,
      end: 1,
      demSeats: best.demSeats,
      repSeats: metrics.totalSeats - best.demSeats,
    });
  }

  const switches = segments.slice(1).map((segment, index) => ({
    weight: segment.start,
    fromDemSeats: segments[index].demSeats,
    toDemSeats: segment.demSeats,
  }));

  return { segments, switches };
}

function scorePreparedCandidate(candidate, w, spec) {
  const districtComponent = (1 - w) * candidate.districtLoss;
  const statewideComponent = w * candidate.statewideLoss;
  const totalLoss = asNonnegativeScalar(
    evaluateAst(spec.aggregation, { y1: districtComponent, y2: statewideComponent }),
    "aggregation function",
  );
  return {
    ...candidate,
    districtComponent,
    statewideComponent,
    totalLoss,
  };
}

function bisectObjectiveCrossing(first, second, left, right, spec) {
  let leftDifference =
    scorePreparedCandidate(first, left, spec).totalLoss -
    scorePreparedCandidate(second, left, spec).totalLoss;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const midpoint = (left + right) / 2;
    const midpointDifference =
      scorePreparedCandidate(first, midpoint, spec).totalLoss -
      scorePreparedCandidate(second, midpoint, spec).totalLoss;
    if (Math.abs(midpointDifference) < 1e-12 || right - left < 1e-10) return midpoint;
    if (leftDifference * midpointDifference <= 0) {
      right = midpoint;
    } else {
      left = midpoint;
      leftDifference = midpointDifference;
    }
  }

  return (left + right) / 2;
}

function isLinearAggregationAst(ast) {
  if (!ast || ast.type !== "binary" || ast.operator !== "+") return false;
  const variables = [ast.left, ast.right]
    .filter((node) => node.type === "variable")
    .map((node) => node.name)
    .sort();
  return variables.length === 2 && variables[0] === "y1" && variables[1] === "y2";
}

function isPaperLinearSpecification(formulas = activeFormulas) {
  return Object.keys(defaultFormulas).every(
    (key) =>
      normalizeFormulaForComparison(formulas[key]) ===
      normalizeFormulaForComparison(paperLinearSpecification[key]),
  );
}

function renderInterpretation(w, schedule, best) {
  const districtWeight = 1 - w;
  const target = getTargetContext();
  const precision = renderFloatingWeightSchedule(schedule, w, best.demSeats);
  const primaryDomain = renderMapWeightSchedule(
    schedule,
    w,
    best.demSeats,
    precision.step,
    target,
  );
  const canonicalWeightText = clamp(w, 0, 1).toFixed(6);
  const weightText = formatAdaptiveWeight(w, schedule, best.demSeats);
  const progress = `${(w * 100).toFixed(1)}%`;
  const primaryProgress = `${(
    (clamp(w, primaryDomain.min, primaryDomain.max) - primaryDomain.min) /
    Math.max(primaryDomain.max - primaryDomain.min, 1e-9) *
    100
  ).toFixed(1)}%`;
  const floatingProgress = `${(
    (clamp(w, precision.domain.min, precision.domain.max) - precision.domain.min) /
    Math.max(precision.domain.max - precision.domain.min, 1e-9) *
    100
  ).toFixed(1)}%`;
  els.wSlider.step = String(precision.step);
  els.wSlider.value = canonicalWeightText;
  els.wValue.value = weightText;
  els.wSlider.style.setProperty("--weight-progress", progress);
  els.mapWSlider.step = String(precision.step);
  els.mapWSlider.value = canonicalWeightText;
  els.mapWSlider.style.setProperty("--weight-progress", primaryProgress);
  els.mapWValue.value = `w = ${weightText}`;
  els.floatingWSlider.step = String(precision.step);
  els.floatingWSlider.value = canonicalWeightText;
  els.floatingWSlider.style.setProperty("--weight-progress", floatingProgress);
  els.floatingWValue.value = `w = ${weightText}`;
  els.mapWeightControl.dataset.target = target.id;
  els.mapWeightGoal.textContent = `Move left for local results and right for ${target.goalPhrase}.`;
  const isLinear = isLinearAggregationAst(compiledSpec.aggregation);
  const isPaperLinear = isPaperLinearSpecification();
  els.weightControlLabel.closest(".weight-control").dataset.target = target.id;
  els.weightControlLabel.textContent = "Statewide weight";
  els.weightTargetBadge.textContent = `Goal: ${target.shortLabel}`;
  els.restoreProportionalTarget.hidden = target.id === "proportional";
  els.weightTargetLabel.textContent = target.endpointLabel;
  if (!floatingWeightFocused) {
    els.floatingWeightUpper.textContent = "State · 1";
  }
  let ratioText;
  if (w <= 1e-12) {
    ratioText = "The relative weight is φ = 0; the statewide input is inactive.";
  } else if (w >= 1 - 1e-12) {
    ratioText = "The relative weight φ diverges; the district input is inactive.";
  } else if (isLinear) {
    ratioText = `${
      isPaperLinear ? "The paper's relative weight" : "The relative input weight"
    } is φ = ${formatNumber(
      w / districtWeight,
      3,
    )}: one unit less active statewide loss offsets ${formatNumber(
      w / districtWeight,
      3,
    )} units of additional district loss.`;
  } else {
    ratioText = `The relative input scale is φ = ${formatNumber(
      w / districtWeight,
      3,
    )}; the active F determines the full marginal rate of substitution.`;
  }

  els.objectiveEyebrow.textContent = isPaperLinear
    ? "Paper linear benchmark · exact specification"
    : isLinear
      ? "Linear aggregation"
      : "General aggregation";
  els.wInterpretation.textContent = `The model scales Dist by ${districtWeight.toFixed(
    precision.digits,
  )} and State under ${target.goalPhrase} by ${weightText}. ${ratioText}`;
  els.weightPlainLanguage.textContent =
    w <= 1e-12
      ? "Linear model: w sets φ = w / (1 − w), the marginal substitution rate. Here φ = 0, so statewide loss cannot offset local loss."
      : w >= 1 - 1e-12
        ? "Linear model: w sets φ = w / (1 − w), the marginal substitution rate. Here φ grows without bound, so local loss is inactive."
        : isLinear
          ? `Linear model: w sets φ = w / (1 − w), the extra local loss accepted for one unit less statewide loss. Here φ = ${formatNumber(
              w / districtWeight,
              3,
            )}.`
          : `Weight scale: φ = w / (1 − w) = ${formatNumber(
              w / districtWeight,
              3,
            )}. With this aggregation rule, the full substitution rate also depends on F₂ / F₁.`;

  const formula = isPaperLinear
    ? `\\begin{aligned}
        ${paperLinearSpecification.districtPrimitiveDisplay}\\\\
        ${paperLinearSpecification.districtTotalDisplay}\\\\
        ${paperLinearSpecification.statewideDisplay}\\\\
        ${paperLinearSpecification.objectiveDisplay}
      \\end{aligned}`
    : isLinear
      ? "M(\\mathbf x,\\mathbf p;w)=(1-w)\\mathrm{Dist}(\\mathbf x,\\mathbf p)+w\\mathrm{State}(\\mathbf x,\\mathbf p)"
      : "M(\\mathbf x,\\mathbf p;w)=F\\!\\left((1-w)\\mathrm{Dist}(\\mathbf x,\\mathbf p),\\ w\\mathrm{State}(\\mathbf x,\\mathbf p)\\right)";
  els.lossFormula.classList.toggle("is-expanded", isPaperLinear);
  renderMath(formula, els.lossFormula, true);

  const regime = precision.current;
  const seatText = formatSeatCount(
    regime.demSeats,
    regime.demSeats + regime.repSeats,
  );
  els.regimeSummary.textContent = `Predicts ${seatText} under ${target.shortLabel.toLowerCase()}`;
  const accessibleWeightDescription = `Weight ${weightText}, balancing local results and ${target.goalPhrase}. The model predicts ${seatText}.`;
  els.wSlider.setAttribute("aria-valuetext", accessibleWeightDescription);
  els.mapWSlider.setAttribute(
    "aria-valuetext",
    `${accessibleWeightDescription}${
      mapWeightFocused
        ? ` Focused range ${primaryDomain.min.toFixed(primaryDomain.digits)} to ${primaryDomain.max.toFixed(
            primaryDomain.digits,
          )}.`
        : " Full range 0 to 1."
    }`,
  );
  els.floatingWSlider.setAttribute(
    "aria-valuetext",
    `${accessibleWeightDescription}${
      floatingWeightFocused
        ? ` Focused range ${precision.domain.min.toFixed(
            precision.domain.digits,
          )} to ${precision.domain.max.toFixed(precision.domain.digits)}.`
        : " Full range 0 to 1."
      }`,
  );
  renderSharedWeightControls(
    schedule,
    w,
    best.demSeats,
    precision,
    target,
    accessibleWeightDescription,
  );
}

function setGuidedProgress(nextStep) {
  const previousStep = guidedProgressStep;
  guidedProgressStep = clamp(Number(nextStep) || 1, 1, 3);
  const currentStep = Math.min(guidedProgressStep, 2);

  document.querySelectorAll(".guided-step[data-guide-step]").forEach((step) => {
    const stepNumber = Number(step.dataset.guideStep);
    const isComplete = guidedProgressStep > stepNumber;
    const isCurrent = guidedProgressStep <= 2 && stepNumber === currentStep;
    step.classList.toggle("is-complete", isComplete);
    step.classList.toggle("is-current", isCurrent);
    if (isCurrent) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });

  if (!els.guidedProgressStatus || previousStep === guidedProgressStep) return;
  const labels = ["Choose an election and set the weight", "Compare allocations"];
  els.guidedProgressStatus.textContent =
    guidedProgressStep > 2
      ? "Two-step guide complete · continue comparing allocations"
      : `Step ${currentStep} of 2 · ${labels[currentStep - 1]}`;
}

function renderFirstRunGuide({
  metrics,
  best,
  selected,
  comparison,
  referenceOutcomes,
  displayedOutcome,
  diagnosticMode,
  w,
}) {
  const metadata = getActiveScenarioMetadata();
  const scenarioLabel = getActiveScenarioLabel().replace(", ", " · ");
  const totalSeats = metrics.totalSeats;
  const weightText = formatAdaptiveWeight(w, activeModel?.schedule, best.demSeats);
  const sourceText =
    metadata.kind === "visitor-entered" ? "Entered-vote source" : "Dataset notes";

  els.workspaceScenarioTitle.textContent = getActiveScenarioLabel();
  const compactWeightText = formatCompactSwitchWeight(w);
  els.workspaceWeightValue.textContent = formatWeightWithPercent(
    w,
    activeModel?.schedule,
    best.demSeats,
  );
  els.workspaceWeightValue.setAttribute(
    "aria-label",
    `Statewide model weight: ${compactWeightText} of the zero-to-one scale; exact w equals ${weightText}.`,
  );
  const resultLabels = {
    model: "Model result",
    inspection: "Selected allocation",
    observed: "FPTP result",
    proportional: "Proportional target",
    efficiency: "EG minimum",
  };
  const displayedDemSeats = displayedOutcome.demSeats;
  els.workspaceResultLabel.textContent =
    resultLabels[diagnosticMode] || getDiagnosticModeLabel(diagnosticMode, w);
  els.workspaceDemSeats.textContent = `${displayedDemSeats} Democratic ${displayedDemSeats === 1 ? "seat" : "seats"}`;
  const republicanSeats = totalSeats - displayedDemSeats;
  els.workspaceRepSeats.textContent = `${republicanSeats} Republican ${republicanSeats === 1 ? "seat" : "seats"}`;
  if (els.houseNavLink) {
    const houseParams = new URLSearchParams();
    if (activeState !== CUSTOM_STATE_KEY && Number.isInteger(Number(activeYear))) {
      houseParams.set("year", String(activeYear));
    }
    houseParams.set("w", Number(w).toFixed(6));
    els.houseNavLink.href = `house.html?${houseParams.toString()}`;
  }

  els.entryScenarioLabel.textContent = scenarioLabel;
  els.entryDataStatus.textContent = metadata.dataStatus;
  els.entrySource.textContent = sourceText;
  els.entrySource.href = metadata.sourceHref;
  els.entrySource.setAttribute("aria-label", `Source: ${metadata.sourceLabel}`);
  els.entrySource.title = metadata.sourceLabel;
  els.entryLastUpdated.textContent = `Updated ${metadata.lastUpdated}`;
  els.entryProfileLabel.textContent = metadata.label;
  els.entryProfileDescription.textContent = metadata.description;
  els.entryWeightSummary.textContent = `w = ${weightText} · ${Math.round(
    (1 - w) * 100,
  )}% local · ${Math.round(w * 100)}% statewide`;

  setPartySeatCount(els.guidedModelSeats, best.demSeats, totalSeats);
  els.guidedModelNote.textContent = `Selected at w = ${weightText}`;
  setPartySeatCount(
    els.guidedFptpSeats,
    comparison.observed.demSeats,
    totalSeats,
  );
  setPartySeatCount(
    els.guidedProportionalSeats,
    referenceOutcomes.proportional.demSeats,
    totalSeats,
  );
  setPartySeatCount(
    els.guidedEfficiencySeats,
    referenceOutcomes.efficiency.demSeats,
    totalSeats,
  );

  const guidedAllocationLabels = {
    model: `Model optimum at w = ${weightText}: ${formatNamedSeatCount(
      best.demSeats,
      totalSeats,
    )}.`,
    observed: `FPTP local plurality winners: ${formatNamedSeatCount(
      comparison.observed.demSeats,
      totalSeats,
    )}.`,
    proportional: `Proportional seat benchmark: ${formatNamedSeatCount(
      referenceOutcomes.proportional.demSeats,
      totalSeats,
    )}.`,
    efficiency: `Efficiency-gap benchmark: ${formatNamedSeatCount(
      referenceOutcomes.efficiency.demSeats,
      totalSeats,
    )}.`,
  };
  document.querySelectorAll("[data-guide-map-mode]").forEach((button) => {
    const isPressed = button.dataset.guideMapMode === diagnosticMode;
    button.setAttribute("aria-pressed", String(isPressed));
    button.setAttribute("aria-label", guidedAllocationLabels[button.dataset.guideMapMode]);
  });

  const selectedViewLabels = {
    model: "Model",
    observed: "FPTP",
    proportional: "Proportional",
    efficiency: "EG minimum",
  };
  const selectedView = selectedViewLabels[diagnosticMode];
  const displayedSeats = formatSeatCount(displayedOutcome.demSeats, totalSeats);
  els.guidedCompareStatus.textContent = selectedView
    ? `${selectedView} selected for the map · ${displayedSeats}.`
    : diagnosticMode === "inspection"
      ? `A counterfactual is shown on the map · ${formatSeatCount(selected.demSeats, totalSeats)}.`
      : `${getDiagnosticModeLabel(diagnosticMode, w)} is shown on the map · ${displayedSeats}.`;
}

function renderPredictionContext(selected, best, isInspection) {
  const target = getTargetContext();
  if (isInspection) {
    els.modelOutputEyebrow.textContent = "Alternative allocation";
    els.modelOutputTitle.textContent = "Counterfactual seat allocation";
    els.modelOutputDescription.textContent = `${formatSeatCount(
      selected.demSeats,
      selected.demSeats + selected.repSeats,
    )} was selected from the objective chart. The model optimum at the current w is ${formatSeatCount(
      best.demSeats,
      best.demSeats + best.repSeats,
    )}. The statewide target is ${target.goalPhrase}.`;
    els.primaryResultBadge.textContent = "Alternative allocation";
    els.predictionEyebrow.textContent = `Selected alternative · ${target.shortLabel}`;
    els.predictionStatus.textContent = "Counterfactual";
    els.restoreOptimum.hidden = false;
    els.objectiveValueLabel.textContent = "Objective value";
    els.modelMapModeLabel.textContent = "Selected allocation";
    els.districtAssignmentsEyebrow.textContent = "Counterfactual detail";
    els.districtAssignmentsTitle.textContent = "Selected assignments by district";
    els.districtModelColumn.textContent = "Selected";
    return;
  }

  els.modelOutputEyebrow.textContent = "Model result";
  els.modelOutputTitle.textContent = "Model-predicted seat allocation";
  els.modelOutputDescription.textContent = `The model balances local results against ${target.goalPhrase}. Move the weight to see when the predicted delegation changes.`;
  els.primaryResultBadge.textContent = "Model prediction";
  els.predictionEyebrow.textContent = `Model prediction · ${target.shortLabel}`;
  els.predictionStatus.textContent = "Selected";
  els.restoreOptimum.hidden = true;
  els.objectiveValueLabel.textContent = "Minimum objective value";
  els.modelMapModeLabel.textContent = "Model optimum";
  els.districtAssignmentsEyebrow.textContent = "Prediction detail";
  els.districtAssignmentsTitle.textContent = "Model assignments by district";
  els.districtModelColumn.textContent = "Model";
}

function renderOutcomeComparison(comparison) {
  const totalSeats = comparison.model.demSeats + comparison.model.repSeats;
  const target = getTargetContext();
  const columns = [
    { label: "Measure", note: "Same vote profile" },
    { label: "FPTP baseline", note: "District plurality winners" },
    {
      label: "Model optimum",
      note: `Selected at w = ${formatAdaptiveWeight(Number(els.wSlider.value))}`,
      isModel: true,
    },
    {
      label: `${target.shortLabel} optimum`,
      note: `${target.valueLead}: T(rho) = ${formatNumber(
        comparison.target.targetSeatCount,
        2,
      )}`,
    },
  ];
  const rows = [
    {
      label: "Seat allocation",
      note: "Democratic / Republican seats",
      values: [
        formatSeatCount(comparison.observed.demSeats, totalSeats),
        formatSeatCount(comparison.model.demSeats, totalSeats),
        formatSeatCount(comparison.target.demSeats, totalSeats),
      ],
    },
    {
      label: "Local pluralities honored",
      note: "Districts assigned to their vote winner",
      values: [comparison.observed, comparison.model, comparison.target].map(
        (outcome) => `${outcome.localMatches} of ${totalSeats}`,
      ),
    },
    {
      label: "Gap from statewide target",
      note: "D seats minus T(rho)",
      values: [comparison.observed, comparison.model, comparison.target].map((outcome) =>
        formatSignedSeatGap(outcome.targetGap, 2),
      ),
    },
    {
      label: "Seat-vote gap",
      note: "D seat share minus equal-district D support",
      values: [comparison.observed, comparison.model, comparison.target].map((outcome) =>
        formatDirectionalPoints(outcome.seatVoteGap, "D"),
      ),
    },
    {
      label: "Efficiency gap",
      note: "Positive values favor Democrats",
      values: [comparison.observed, comparison.model, comparison.target].map((outcome) =>
        formatDirectionalPoints(outcome.efficiencyGap, "D"),
      ),
    },
  ];

  els.outcomeComparisonTable.replaceChildren();
  appendOutcomeComparisonRow(columns, true);
  rows.forEach((row) =>
    appendOutcomeComparisonRow([
      { label: row.label, note: row.note },
      { label: row.values[0] },
      { label: row.values[1], isModel: true },
      { label: row.values[2] },
    ]),
  );
}

function appendOutcomeComparisonRow(cells, isHeader = false) {
  const row = document.createElement("div");
  row.className = `outcome-comparison-row${isHeader ? " outcome-comparison-header" : ""}`;
  row.setAttribute("role", "row");

  cells.forEach((cell, index) => {
    const element = document.createElement("span");
    element.className = `outcome-comparison-cell${cell.isModel ? " is-model" : ""}`;
    element.setAttribute("role", isHeader ? "columnheader" : index === 0 ? "rowheader" : "cell");
    const value = document.createElement("strong");
    value.textContent = cell.label;
    element.append(value);
    if (cell.note) {
      const note = document.createElement("small");
      note.textContent = cell.note;
      element.append(note);
    }
    row.append(element);
  });

  els.outcomeComparisonTable.append(row);
}

function setAnalysisActionStatus(message, isError = false, source = null) {
  const statuses = Array.from(document.querySelectorAll("[data-export-status-for]"));
  statuses.forEach((status) => {
    status.textContent = "";
    status.classList.remove("is-error");
    status.hidden = true;
  });
  if (!message) return;

  const localStatus = source?.id
    ? statuses.find((status) => status.dataset.exportStatusFor === source.id)
    : null;
  const status = localStatus || els.analysisActionStatus;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.hidden = false;
}

function getActiveScenarioLabel() {
  return activeState === CUSTOM_STATE_KEY
    ? `${customState?.name || "Custom state"} (custom)`
    : `${activeState}, ${activeYear}`;
}

function getActiveSourceDescription() {
  if (activeState === CUSTOM_STATE_KEY) {
    return "Normalized visitor-entered two-party district profile on a schematic map.";
  }
  return getScenarioMetadata(activeState, activeYear).description;
}

function getActiveScenarioMetadata() {
  return activeState === CUSTOM_STATE_KEY
    ? getCustomScenarioMetadata(customState)
    : getScenarioMetadata(activeState, activeYear);
}

function getAbsoluteResourceUrl(resource) {
  if (typeof window === "undefined") return resource;
  try {
    return new URL(resource, window.location.href).href;
  } catch {
    return resource;
  }
}

function buildScenarioUrl({ embed = false, hash = null, baseUrl = null } = {}) {
  const fallbackBase = "https://example.invalid/index.html";
  const currentBase =
    baseUrl || (typeof window !== "undefined" ? window.location.href : fallbackBase);
  const url = new URL(currentBase, fallbackBase);
  url.search = "";
  const metadata = getActiveScenarioMetadata();
  const benchmark = findMatchingBenchmark(activeFormulas);
  const target = getTargetContext(activeFormulas);
  const params = url.searchParams;
  params.set("sv", SCENARIO_URL_VERSION);
  params.set(
    "state",
    activeState === CUSTOM_STATE_KEY ? "custom" : STATE_URL_KEYS[activeState] || activeState,
  );
  params.set("year", activeState === CUSTOM_STATE_KEY ? "entered" : String(activeYear));
  params.set("plan", metadata.planId);
  params.set("data", metadata.dataVersion);
  params.set("method", METHODOLOGY_VERSION);
  params.set("w", Number(activeModel?.w ?? els.wSlider?.value ?? 0.5).toFixed(6));
  params.set("spec", benchmark?.id || "custom");
  params.set("target", target.id);
  params.set("map", activeMapMode);
  params.set(
    "allocation",
    inspectedDemSeats === null ? "optimal" : `${Number(inspectedDemSeats)}d`,
  );
  if (activeState === CUSTOM_STATE_KEY && customState) {
    params.set("custom", encodeBase64Url(JSON.stringify(serializeCustomState(customState))));
  }
  if (!benchmark) {
    params.set(
      "formulas",
      encodeBase64Url(JSON.stringify(canonicalizeFormulas(activeFormulas))),
    );
  }
  if (embed) params.set("embed", "1");
  if (hash !== null) url.hash = hash;
  return url.href;
}

function syncScenarioUrl() {
  if (
    typeof window === "undefined" ||
    preserveCleanLandingUrl ||
    !window.history?.replaceState ||
    !activeModel
  ) return;
  try {
    const canonical = buildScenarioUrl({ embed: isEmbedMode, hash: window.location.hash });
    if (canonical !== window.location.href) window.history.replaceState(null, "", canonical);
  } catch {
    // Analysis remains usable when a browser blocks file-URL history updates.
  }
}

function getDisplayedResultLabel(mode) {
  if (mode === "observed") return "District-plurality (FPTP) baseline";
  if (mode === "proportional") return "Proportional benchmark allocation";
  if (mode === "efficiency") return "Efficiency-gap-minimum benchmark allocation";
  if (mode === "inspection") return "Selected counterfactual allocation";
  if (DIAGNOSTIC_MAP_TARGETS[mode]) return `${DIAGNOSTIC_MAP_TARGETS[mode].label} view`;
  return "Model allocation";
}

function partyAssignmentLabels(assignment) {
  return assignment.map((isDemocratic) => (isDemocratic ? "D" : "R"));
}

function buildPublicationRecord() {
  if (!activeModel) return null;
  const {
    metrics,
    publicMetrics,
    comparison,
    referenceOutcomes,
    best,
    selected,
    displayedOutcome,
    diagnosticMode,
    w,
  } = activeModel;
  const metadata = getActiveScenarioMetadata();
  const benchmark = findMatchingBenchmark(activeFormulas);
  const target = getTargetContext(activeFormulas);
  const permanentUrl = buildScenarioUrl({ embed: false, hash: "#allocation" });
  const embedUrl = buildScenarioUrl({ embed: true, hash: "#allocation" });
  const viewLabel = getDisplayedResultLabel(diagnosticMode);
  const weightLabel = formatAdaptiveWeight(w, activeModel.schedule, best.demSeats);
  const scenarioLabel =
    activeState === CUSTOM_STATE_KEY
      ? `${customState?.name || "Custom state"}, ${CUSTOM_YEAR_LABEL}`
      : getActiveScenarioLabel();
  const selectionContext = `${scenarioLabel} · ${viewLabel} · w = ${weightLabel}`;
  const captionContext = `${scenarioLabel}. Selected map view: ${viewLabel}. Selected statewide weight: w = ${weightLabel}.`;
  const resultText = `${viewLabel}: ${formatSeatCount(
    publicMetrics.demSeats,
    metrics.totalSeats,
  )}`;
  const baselineText = `District-plurality (FPTP) baseline: ${formatSeatCount(
    comparison.observed.demSeats,
    metrics.totalSeats,
  )}`;
  const modelText = `Model allocation at w = ${weightLabel}: ${formatSeatCount(
    best.demSeats,
    metrics.totalSeats,
  )}`;
  const sourceUrl = getAbsoluteResourceUrl(metadata.sourceHref);
  const captionSource = metadata.sourceLabel.replace(/[.\s]+$/, "");
  const specificationLabel = els.topSpecLabel?.textContent || benchmark?.label || "Custom specification";
  const captionLead =
    diagnosticMode === "model"
      ? `${captionContext} Under the ${specificationLabel} at this weight, the model allocates ${formatSeatCount(
          best.demSeats,
          metrics.totalSeats,
        )}, compared with ${formatSeatCount(
          comparison.observed.demSeats,
          metrics.totalSeats,
        )} under the district-plurality (FPTP) baseline using the same vote profile.`
      : diagnosticMode === "inspection"
        ? `${captionContext} The selected counterfactual allocation assigns ${formatSeatCount(
            selected.demSeats,
            metrics.totalSeats,
          )}; the ${specificationLabel} model optimum at this weight is ${formatSeatCount(
            best.demSeats,
            metrics.totalSeats,
          )}, and the district-plurality (FPTP) baseline is ${formatSeatCount(
            comparison.observed.demSeats,
            metrics.totalSeats,
          )}.`
        : isProfileDiagnosticMode(diagnosticMode)
          ? `${captionContext} This diagnostic lens shows the district-plurality (FPTP) assignment, ${formatSeatCount(
              publicMetrics.demSeats,
              metrics.totalSeats,
            )}. The ${specificationLabel} model optimum at the selected weight is ${formatSeatCount(
              best.demSeats,
              metrics.totalSeats,
            )}.`
          : `${captionContext} This selected map view shows ${formatSeatCount(
              publicMetrics.demSeats,
              metrics.totalSeats,
            )}, compared with ${formatSeatCount(
              comparison.observed.demSeats,
              metrics.totalSeats,
            )} under the district-plurality (FPTP) baseline using the same vote profile. The ${specificationLabel} model optimum at the selected weight is ${formatSeatCount(
              best.demSeats,
              metrics.totalSeats,
            )}.`;
  const caption = `${captionLead} Data status: ${metadata.dataStatus}. Source: ${captionSource}. Last updated: ${metadata.lastUpdated}. Methodology version: ${METHODOLOGY_VERSION}. ${PUBLICATION_CAVEAT}`;
  const neutralFactBox = [
    "Districts to Delegations — neutral fact box",
    `Scenario: ${scenarioLabel}`,
    `Map view: ${viewLabel}`,
    `Selected statewide weight: w = ${weightLabel}`,
    `Result: ${resultText}`,
    `Comparison baseline: ${baselineText}`,
    `Model result: ${modelText}`,
    `Plan: ${metadata.planLabel} (${metadata.planId})`,
    `Data version: ${metadata.dataVersion}`,
    `Data status: ${metadata.dataStatus}`,
    `Source: ${metadata.sourceLabel}`,
    `Source link: ${sourceUrl}`,
    `Last updated: ${metadata.lastUpdated}`,
    `Methodology version: ${METHODOLOGY_VERSION}`,
    `Specification: ${specificationLabel}`,
    `Target: ${target.mapLabel}`,
    `Permanent link: ${permanentUrl}`,
    `Caveat: ${PUBLICATION_CAVEAT}`,
  ].join("\n");
  const citationNote = [
    `Source note for ${scenarioLabel}`,
    `Map view: ${viewLabel}`,
    `Selected statewide weight: w = ${weightLabel}`,
    `Result: ${resultText}`,
    `Comparison baseline: ${baselineText}`,
    `Data status: ${metadata.dataStatus}`,
    `Source: ${metadata.sourceLabel}`,
    `Source link: ${sourceUrl}`,
    `Data version: ${metadata.dataVersion}`,
    `Last updated: ${metadata.lastUpdated}`,
    `Methodology version: ${METHODOLOGY_VERSION}`,
    `Caveat: ${PUBLICATION_CAVEAT}`,
    `Permanent analysis: ${permanentUrl}`,
  ].join("\n");

  const resultObject = {
    kind: diagnosticMode,
    label: viewLabel,
    demSeats: publicMetrics.demSeats,
    repSeats: metrics.totalSeats - publicMetrics.demSeats,
    assignment: partyAssignmentLabels(displayedOutcome.assignment),
  };
  const baselineObject = {
    kind: "district-plurality-fptp",
    label: "District-plurality (FPTP) baseline",
    demSeats: comparison.observed.demSeats,
    repSeats: comparison.observed.repSeats,
    assignment: partyAssignmentLabels(comparison.observed.assignment),
  };

  return {
    schema: SCENARIO_JSON_SCHEMA,
    schemaVersion: SCENARIO_JSON_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    permanentUrl,
    embedUrl,
    scenario: {
      label: scenarioLabel,
      stateKey: activeState === CUSTOM_STATE_KEY ? "custom" : STATE_URL_KEYS[activeState],
      state: activeState === CUSTOM_STATE_KEY ? customState.name : activeState,
      year: activeState === CUSTOM_STATE_KEY ? CUSTOM_YEAR_LABEL : activeYear,
      plan: {
        id: metadata.planId,
        label: metadata.planLabel,
        geometryStatus: "schematic",
      },
      dataVersion: metadata.dataVersion,
      customState:
        activeState === CUSTOM_STATE_KEY ? serializeCustomState(customState) : null,
    },
    model: {
      weight: w,
      specification: {
        id: benchmark?.id || "custom",
        label: specificationLabel,
        summary: getSpecificationSummary(activeFormulas),
        formulas: canonicalizeFormulas(activeFormulas),
      },
      target: {
        id: target.id,
        label: target.mapLabel,
        formula: activeFormulas.stateTarget,
      },
    },
    view: {
      label: viewLabel,
      mapMode: activeMapMode,
      diagnosticMode,
      selectedModelAllocation: {
        kind: activeModel.isInspection ? "counterfactual" : "optimum",
        demSeats: selected.demSeats,
        repSeats: selected.repSeats,
        assignment: partyAssignmentLabels(selected.assignment),
      },
    },
    results: {
      displayed: resultObject,
      comparisonBaseline: baselineObject,
      modelOptimum: {
        label: "Model optimum",
        demSeats: best.demSeats,
        repSeats: best.repSeats,
        assignment: partyAssignmentLabels(best.assignment),
      },
      proportionalBenchmark: {
        demSeats: referenceOutcomes.proportional.demSeats,
        repSeats: referenceOutcomes.proportional.repSeats,
        assignment: partyAssignmentLabels(referenceOutcomes.proportional.assignment),
      },
      efficiencyGapMinimum: {
        demSeats: referenceOutcomes.efficiency.demSeats,
        repSeats: referenceOutcomes.efficiency.repSeats,
        assignment: partyAssignmentLabels(referenceOutcomes.efficiency.assignment),
      },
    },
    metrics: {
      equalDistrictDemSupport: metrics.modelDemShare,
      rawTwoPartyDemVoteShare: metrics.voteCountsAvailable ? metrics.demVoteShare : null,
      sourceProvidesVoteCounts: metrics.voteCountsAvailable,
      displayedEfficiencyGap: publicMetrics.efficiencyGap,
      displayedSeatVoteGap: publicMetrics.seatVoteGap,
      displayedGallagherIndex: publicMetrics.gallagherIndex,
    },
    publication: {
      context: selectionContext,
      result: resultText,
      comparisonBaseline: baselineText,
      dataStatus: metadata.dataStatus,
      source: { label: metadata.sourceLabel, url: sourceUrl },
      lastUpdated: metadata.lastUpdated,
      methodologyVersion: METHODOLOGY_VERSION,
      caveat: PUBLICATION_CAVEAT,
      caption,
      neutralFactBox,
      citationNote,
    },
    districts: activeDistricts.map((district, index) => ({
      id: district.id,
      raceId: district.raceId || null,
      democraticVotes: district.voteCountsAvailable ? district.demVotes : null,
      republicanVotes: district.voteCountsAvailable ? district.repVotes : null,
      democraticShare: district.demShare,
      republicanShare: district.repShare,
      proxy: Boolean(district.proxy),
      largeThirdParty: Boolean(district.largeThirdParty),
      districtPlurality: comparison.observed.assignment[index] ? "D" : "R",
      modelOptimum: best.assignment[index] ? "D" : "R",
      selectedModelAllocation: selected.assignment[index] ? "D" : "R",
      displayedAllocation: displayedOutcome.assignment[index] ? "D" : "R",
      proportionalBenchmark: referenceOutcomes.proportional.assignment[index] ? "D" : "R",
      efficiencyGapMinimum: referenceOutcomes.efficiency.assignment[index] ? "D" : "R",
    })),
  };
}

function buildResponsiveEmbedCode(record = buildPublicationRecord()) {
  if (!record) return "";
  const title = `Election representation export: ${record.publication.context}`;
  return `<div style="position:relative;width:100%;padding-top:66.667%;overflow:hidden"><iframe src="${escapeHtmlAttribute(
    record.embedUrl,
  )}" title="${escapeHtmlAttribute(
    title,
  )}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="clipboard-write"></iframe></div>`;
}

function setNewsroomLauncherExpanded(isExpanded) {
  document.querySelectorAll("[data-open-newsroom]").forEach((control) => {
    control.setAttribute("aria-expanded", String(isExpanded));
  });
}

function replaceNewsroomHash(hash = "") {
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(null, "", url.href);
}

function openNewsroomDialog(trigger = null, { updateHash = true } = {}) {
  const dialog = els.newsroomPanel;
  if (!dialog) return;

  if (isEmbedMode) {
    if (!dialog.open) dialog.show();
    return;
  }

  if (!dialog.open) {
    newsroomReturnFocus = trigger instanceof HTMLElement ? trigger : els.openNewsroomPanel;
    newsroomScrollPosition = { left: window.scrollX, top: window.scrollY };
    dialog.showModal();
    document.body.classList.add("newsroom-modal-open");
    setNewsroomLauncherExpanded(true);
    window.scrollTo({ ...newsroomScrollPosition, behavior: "auto" });
  }

  if (updateHash && window.location.hash !== "#newsroomPanel") {
    replaceNewsroomHash("#newsroomPanel");
  }

  window.requestAnimationFrame(() => {
    els.closeNewsroomPanel?.focus({ preventScroll: true });
    window.scrollTo({ ...newsroomScrollPosition, behavior: "auto" });
  });
}

function closeNewsroomDialog() {
  if (!isEmbedMode && els.newsroomPanel?.open) els.newsroomPanel.close();
}

function handleNewsroomBackdropClick(event) {
  if (event.target === els.newsroomPanel) closeNewsroomDialog();
}

function handleNewsroomDialogCancel(event) {
  event.preventDefault();
  closeNewsroomDialog();
}

function handleNewsroomDialogClose() {
  if (isEmbedMode) return;
  const returnFocus = newsroomReturnFocus?.isConnected ? newsroomReturnFocus : els.openNewsroomPanel;
  const scrollPosition = { ...newsroomScrollPosition };
  newsroomReturnFocus = null;
  document.body.classList.remove("newsroom-modal-open");
  setNewsroomLauncherExpanded(false);
  if (window.location.hash === "#newsroomPanel") replaceNewsroomHash();

  window.requestAnimationFrame(() => {
    returnFocus?.focus({ preventScroll: true });
    window.scrollTo({ ...scrollPosition, behavior: "auto" });
  });
}

function syncNewsroomDialogFromLocation() {
  const dialog = els.newsroomPanel;
  if (!dialog) return;
  if (isEmbedMode) {
    if (!dialog.open) dialog.show();
    return;
  }
  if (window.location.hash === "#newsroomPanel") {
    const launcher = document.querySelector("[data-open-newsroom]") || els.openNewsroomPanel;
    openNewsroomDialog(launcher, { updateHash: false });
  } else if (dialog.open) {
    closeNewsroomDialog();
  }
}

function renderNewsroomPanel() {
  const record = buildPublicationRecord();
  if (!record) return;
  const weightText = `w = ${formatAdaptiveWeight(record.model.weight)}`;
  els.exportSelectionSummary.textContent = `${record.scenario.label}; ${record.view.label}; ${weightText}; downloads the current map and election diagnostics as a high-resolution PNG`;
  els.exportStampContext.textContent = `${record.scenario.label} · ${record.view.label} · ${weightText} · ${record.publication.result}`;
  els.exportStampGenerated.textContent = `Prepared ${new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(new Date())} for PNG export`;
}

async function exportCitedPage(event) {
  renderNewsroomPanel();
  await runPngExport(
    event?.currentTarget || els.exportCitedPage,
    "map and metrics",
    buildMapMetricsPng,
  );
}

function buildAnalysisSummaryText() {
  return buildPublicationRecord()?.publication.neutralFactBox || "";
}

async function copyAnalysisSummary() {
  const summary = buildAnalysisSummaryText();
  if (!summary) return;
  await copyTextForNewsroom(summary, "Neutral fact box copied.");
}

async function copyPermanentLink() {
  const record = buildPublicationRecord();
  if (!record) return;
  await copyTextForNewsroom(
    record.permanentUrl,
    "Permanent link copied. It includes the exact data, model, map mode, and allocation.",
  );
}

async function copyCitationSourceNote() {
  const note = buildPublicationRecord()?.publication.citationNote;
  if (note) await copyTextForNewsroom(note, "Citation and source note copied.");
}

async function copyPublicationCaption() {
  const caption = buildPublicationRecord()?.publication.caption;
  if (caption) await copyTextForNewsroom(caption, "Caption copied.");
}

async function copyResponsiveEmbed() {
  const embedCode = buildResponsiveEmbedCode();
  if (embedCode) await copyTextForNewsroom(embedCode, "Responsive embed code copied.");
}

async function copyTextForNewsroom(value, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else if (!fallbackCopyText(value)) {
      throw new Error("Copy is unavailable in this browser.");
    }
    setAnalysisActionStatus(successMessage);
  } catch (error) {
    setAnalysisActionStatus(
      error instanceof Error ? error.message : "The requested text could not be copied.",
      true,
    );
  }
}

function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function downloadAnalysisCsv() {
  const record = buildPublicationRecord();
  if (!record) return;
  const headers = [
    "scenario",
    "state_key",
    "year",
    "plan_id",
    "data_version",
    "statewide_weight",
    "specification_id",
    "specification_label",
    "target_id",
    "map_mode",
    "map_view_label",
    "selected_model_allocation",
    "result",
    "displayed_dem_seats",
    "displayed_rep_seats",
    "comparison_baseline",
    "baseline_dem_seats",
    "baseline_rep_seats",
    "data_status",
    "source",
    "source_url",
    "last_updated",
    "methodology_version",
    "caveat",
    "caption",
    "permanent_url",
    "equal_district_dem_support",
    "raw_dem_vote_share",
    "source_provides_vote_counts",
    "model_dem_seats",
    "proportional_dem_seats",
    "eg_min_dem_seats",
    "displayed_efficiency_gap",
    "displayed_seat_vote_gap",
    "displayed_gallagher_index",
    "district",
    "race_id",
    "democratic_votes",
    "republican_votes",
    "democratic_share",
    "republican_share",
    "proxy",
    "large_thirdparty",
    "district_plurality_fptp",
    "model_optimum_assignment",
    "selected_model_assignment",
    "proportional_assignment",
    "eg_min_assignment",
    "displayed_assignment",
    "model_reverses_plurality",
  ];
  const rows = record.districts.map((district) => [
    record.scenario.label,
    record.scenario.stateKey,
    record.scenario.year,
    record.scenario.plan.id,
    record.scenario.dataVersion,
    record.model.weight.toFixed(6),
    record.model.specification.id,
    record.model.specification.label,
    record.model.target.id,
    record.view.mapMode,
    record.view.label,
    record.view.selectedModelAllocation.kind,
    record.publication.result,
    record.results.displayed.demSeats,
    record.results.displayed.repSeats,
    record.publication.comparisonBaseline,
    record.results.comparisonBaseline.demSeats,
    record.results.comparisonBaseline.repSeats,
    record.publication.dataStatus,
    record.publication.source.label,
    record.publication.source.url,
    record.publication.lastUpdated,
    record.publication.methodologyVersion,
    record.publication.caveat,
    record.publication.caption,
    record.permanentUrl,
    record.metrics.equalDistrictDemSupport.toFixed(8),
    record.metrics.rawTwoPartyDemVoteShare === null
      ? ""
      : record.metrics.rawTwoPartyDemVoteShare.toFixed(8),
    record.metrics.sourceProvidesVoteCounts ? "yes" : "no",
    record.results.modelOptimum.demSeats,
    record.results.proportionalBenchmark.demSeats,
    record.results.efficiencyGapMinimum.demSeats,
    record.metrics.displayedEfficiencyGap.toFixed(8),
    record.metrics.displayedSeatVoteGap.toFixed(8),
    record.metrics.displayedGallagherIndex.toFixed(8),
    district.id,
    district.raceId,
    district.democraticVotes,
    district.republicanVotes,
    district.democraticShare.toFixed(8),
    district.republicanShare.toFixed(8),
    district.proxy ? 1 : 0,
    district.largeThirdParty ? 1 : 0,
    district.districtPlurality,
    district.modelOptimum,
    district.selectedModelAllocation,
    district.proportionalBenchmark,
    district.efficiencyGapMinimum,
    district.displayedAllocation,
    district.districtPlurality === district.modelOptimum ? "no" : "yes",
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const filename = `${slugifyFilename(record.scenario.label) || "election"}-analysis.csv`;
  downloadTextFile(csv, filename, "text/csv;charset=utf-8");
  setAnalysisActionStatus(
    `CSV downloaded as ${filename}; all ${record.districts.length} rows include the selected export context.`,
  );
}

function downloadScenarioJson() {
  const record = buildPublicationRecord();
  if (!record) return;
  const filename = `${slugifyFilename(record.scenario.label) || "election"}-scenario.json`;
  downloadTextFile(`${JSON.stringify(record, null, 2)}\n`, filename, "application/json;charset=utf-8");
  setAnalysisActionStatus(`Restorable scenario JSON downloaded as ${filename}.`);
}

function csvCell(value) {
  const text = String(value ?? "");
  const isPlainNumber = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  const safeText = !isPlainNumber && /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText)
    ? `"${safeText.replace(/"/g, '""')}"`
    : safeText;
}

function slugifyFilename(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function downloadTextFile(content, filename, type) {
  downloadBlob(new Blob([content], { type }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function runPngExport(button, label, buildArtifact) {
  if (!activeModel || button?.dataset.exportBusy === "true") return;
  const wasDisabled = Boolean(button?.disabled);
  if (button) {
    button.dataset.exportBusy = "true";
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  }
  setAnalysisActionStatus(`Preparing ${label} PNG…`, false, button);
  try {
    const artifact = await buildArtifact();
    downloadBlob(artifact.blob, artifact.filename);
    setAnalysisActionStatus(`Download started: ${artifact.filename}.`, false, button);
  } catch (error) {
    setAnalysisActionStatus(
      error instanceof Error ? error.message : `The ${label} PNG could not be created.`,
      true,
      button,
    );
  } finally {
    if (button) {
      delete button.dataset.exportBusy;
      button.removeAttribute("aria-busy");
      button.disabled = wasDisabled;
    }
  }
}

async function downloadPaperFigurePng(key, button) {
  const config = PAPER_FIGURE_EXPORTS[key];
  if (!config) {
    setAnalysisActionStatus("That figure export is unavailable.", true, button);
    return;
  }
  await runPngExport(button, `Figure ${Number(config.number)}`, () =>
    buildPaperFigurePng(config),
  );
}

function createPngExportCanvas(width = 2400, height = 1600) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is unavailable in this browser.");
  context.fillStyle = PNG_EXPORT_PALETTE.canvas;
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export could not be created."))),
      "image/png",
    );
  });
}

function setPngExportFont(context, size, weight = 500) {
  context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function traceRoundedRect(context, x, y, width, height, radius = 18) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawPngExportCard(context, x, y, width, height, radius = 20) {
  traceRoundedRect(context, x, y, width, height, radius);
  context.fillStyle = PNG_EXPORT_PALETTE.paper;
  context.fill();
  context.strokeStyle = PNG_EXPORT_PALETTE.line;
  context.lineWidth = 2;
  context.stroke();
}

function drawFittedPngText(
  context,
  value,
  x,
  y,
  maxWidth,
  {
    size = 48,
    minimumSize = 24,
    weight = 700,
    color = PNG_EXPORT_PALETTE.ink,
    align = "left",
  } = {},
) {
  const text = String(value || "");
  let fontSize = size;
  setPngExportFont(context, fontSize, weight);
  while (fontSize > minimumSize && context.measureText(text).width > maxWidth) {
    fontSize -= 1;
    setPngExportFont(context, fontSize, weight);
  }
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(text, x, y);
  context.textAlign = "left";
  return fontSize;
}

function drawWrappedPngText(
  context,
  value,
  x,
  y,
  maxWidth,
  {
    size = 24,
    weight = 500,
    color = PNG_EXPORT_PALETTE.muted,
    lineHeight = Math.round(size * 1.35),
    maxLines = 3,
  } = {},
) {
  setPngExportFont(context, size, weight);
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length) {
    let finalLine = visibleLines.at(-1);
    while (
      finalLine &&
      context.measureText(`${finalLine}…`).width > maxWidth
    ) {
      finalLine = finalLine.replace(/\s+\S+$/, "");
    }
    visibleLines[visibleLines.length - 1] = `${finalLine}…`;
  }
  visibleLines.forEach((item, index) => {
    context.fillText(item, x, y + index * lineHeight);
  });
  return y + Math.max(0, visibleLines.length - 1) * lineHeight;
}

function drawPngExportHeader(context, { kicker, title, subtitle }) {
  context.fillStyle = PNG_EXPORT_PALETTE.accent;
  context.fillRect(0, 0, 2400, 12);
  setPngExportFont(context, 24, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.accent;
  context.fillText(kicker.toUpperCase(), 96, 78);
  drawFittedPngText(context, title, 96, 156, 2208, {
    size: 64,
    minimumSize: 40,
    weight: 720,
  });
  drawFittedPngText(context, subtitle, 96, 214, 2208, {
    size: 28,
    minimumSize: 21,
    weight: 540,
    color: PNG_EXPORT_PALETTE.muted,
  });
  context.strokeStyle = PNG_EXPORT_PALETTE.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(96, 250);
  context.lineTo(2304, 250);
  context.stroke();
}

function drawPngExportFooter(context, height = 1600) {
  const metadata = getActiveScenarioMetadata();
  const provenance = `${metadata.sourceLabel} · Method: ${PAPER_CITATION}`;
  const lineY = height - 112;
  context.strokeStyle = PNG_EXPORT_PALETTE.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(96, lineY);
  context.lineTo(2304, lineY);
  context.stroke();
  setPngExportFont(context, 18, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.accent;
  context.fillText("DATA + METHOD", 96, lineY + 42);
  drawFittedPngText(context, provenance, 300, lineY + 42, 2004, {
    size: 21,
    minimumSize: 17,
    weight: 520,
    color: PNG_EXPORT_PALETTE.muted,
  });
}

function cloneSvgWithComputedStyles(svg) {
  const clone = svg.cloneNode(true);
  const sourceNodes = [svg, ...svg.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!(sourceNode instanceof Element) || !(cloneNode instanceof Element)) return;
    const computed = window.getComputedStyle(sourceNode);
    SVG_EXPORT_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) cloneNode.style.setProperty(property, value);
    });
    cloneNode.removeAttribute("tabindex");
  });
  const viewBox = svg.viewBox?.baseVal;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(viewBox?.width || PAPER_CHART.width));
  clone.setAttribute("height", String(viewBox?.height || PAPER_CHART.height));
  return clone;
}

async function drawSvgSnapshot(context, svg, x, y, width, height) {
  if (!(svg instanceof SVGElement)) throw new Error("The requested graphic is not ready.");
  const serialized = new XMLSerializer().serializeToString(cloneSvgWithComputedStyles(svg));
  const url = URL.createObjectURL(
    new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }),
  );
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The requested graphic could not be rendered."));
      image.src = url;
    });
    context.drawImage(image, x, y, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawPngChartFrame(context, x, y, width, height) {
  drawPngExportCard(context, x, y, width, height, 18);
  context.save();
  traceRoundedRect(context, x + 2, y + 2, width - 4, height - 4, 16);
  context.clip();
  context.strokeStyle = "rgba(38, 54, 49, 0.055)";
  context.lineWidth = 2;
  const gridStep = 84;
  for (let gridX = x + gridStep; gridX < x + width; gridX += gridStep) {
    context.beginPath();
    context.moveTo(gridX, y);
    context.lineTo(gridX, y + height);
    context.stroke();
  }
  for (let gridY = y + gridStep; gridY < y + height; gridY += gridStep) {
    context.beginPath();
    context.moveTo(x, gridY);
    context.lineTo(x + width, gridY);
    context.stroke();
  }
  context.restore();
}

function drawPngFigureLegend(context, items, y) {
  let x = 116;
  let rowY = y;
  setPngExportFont(context, 22, 590);
  items.forEach(([kind, color, label]) => {
    const itemWidth = 54 + context.measureText(label).width + 42;
    if (x + itemWidth > 2284) {
      x = 116;
      rowY += 46;
    }
    const iconX = x + 15;
    const iconY = rowY - 7;
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = kind === "line" ? 5 : 4;
    if (kind === "dot") {
      context.beginPath();
      context.arc(iconX, iconY, 8, 0, Math.PI * 2);
      context.fill();
    } else if (kind === "square") {
      context.fillRect(iconX - 8, iconY - 8, 16, 16);
    } else if (kind === "ring") {
      context.beginPath();
      context.arc(iconX, iconY, 10, 0, Math.PI * 2);
      context.stroke();
    } else {
      if (kind === "dash") context.setLineDash([11, 8]);
      context.beginPath();
      context.moveTo(iconX - 16, iconY);
      context.lineTo(iconX + 16, iconY);
      context.stroke();
    }
    context.restore();
    context.fillStyle = PNG_EXPORT_PALETTE.muted;
    context.fillText(label, x + 48, rowY);
    x += itemWidth;
  });
}

function getPngExportContext(record) {
  const scenario = `${record.scenario.state} · ${record.scenario.year}`;
  const weight = `w = ${formatAdaptiveWeight(record.model.weight)}`;
  const specification = record.model.specification.label;
  return { scenario, weight, specification };
}

async function buildPaperFigurePng(config) {
  const record = buildPublicationRecord();
  if (!record) throw new Error("The model result is not ready.");
  const svg = document.getElementById(config.svgId);
  const title = document.getElementById(config.titleId)?.textContent?.trim();
  if (!title) throw new Error(`Figure ${Number(config.number)} is not ready.`);
  const { scenario, weight, specification } = getPngExportContext(record);
  const { canvas, context } = createPngExportCanvas();
  drawPngExportHeader(context, {
    kicker: `Districts to Delegations · Figure ${config.number}`,
    title,
    subtitle: `${scenario} · ${weight} · ${specification}`,
  });

  const chart = { x: 115, y: 292, width: 2170, height: 1015 };
  drawPngChartFrame(context, chart.x, chart.y, chart.width, chart.height);
  context.save();
  traceRoundedRect(context, chart.x + 2, chart.y + 2, chart.width - 4, chart.height - 4, 16);
  context.clip();
  if (config.canvasId) {
    const sourceCanvas = document.getElementById(config.canvasId);
    if (!(sourceCanvas instanceof HTMLCanvasElement)) {
      throw new Error(`Figure ${Number(config.number)} is not ready.`);
    }
    context.drawImage(sourceCanvas, chart.x, chart.y, chart.width, chart.height);
  }
  await drawSvgSnapshot(context, svg, chart.x, chart.y, chart.width, chart.height);
  context.restore();

  drawPngFigureLegend(context, config.legend, 1387);
  drawPngExportFooter(context);
  const scenarioSlug = slugifyFilename(`${record.scenario.state}-${record.scenario.year}`) || "election";
  const weightSlug = record.model.weight.toFixed(6).replace(".", "-");
  return {
    blob: await canvasToPngBlob(canvas),
    filename: `${scenarioSlug}-figure-${config.number}-${config.slug}-w-${weightSlug}.png`,
  };
}

function drawPngSeatRows(context, rows, x, y, width) {
  rows.forEach(([label, allocation], index) => {
    const rowY = y + index * 72;
    setPngExportFont(context, 24, 590);
    context.fillStyle = PNG_EXPORT_PALETTE.muted;
    context.fillText(label, x, rowY);
    drawFittedPngText(
      context,
      `${allocation.demSeats} D / ${allocation.repSeats} R`,
      x + width,
      rowY,
      width * 0.46,
      {
        size: 28,
        minimumSize: 22,
        weight: 720,
        align: "right",
      },
    );
    if (index < rows.length - 1) {
      context.strokeStyle = PNG_EXPORT_PALETTE.line;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, rowY + 27);
      context.lineTo(x + width, rowY + 27);
      context.stroke();
    }
  });
}

function getPngDiagnosticPairs() {
  return Array.from(document.querySelectorAll("#diagnostics .diagnostic-card"))
    .slice(0, 6)
    .map((card) => ({
      label:
        card.querySelector(".diagnostic-card-heading > span")?.textContent?.trim() ||
        "Diagnostic",
      value: card.querySelector(".diagnostic-card-value")?.textContent?.trim() || "—",
    }));
}

function drawPngDiagnostics(context, pairs, x, y, width) {
  const gap = 28;
  const columnWidth = (width - gap) / 2;
  const rowHeight = 186;
  pairs.forEach((pair, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + column * (columnWidth + gap);
    const cellY = y + row * rowHeight;
    traceRoundedRect(context, cellX, cellY, columnWidth, 152, 14);
    context.fillStyle = "#f8faf8";
    context.fill();
    context.strokeStyle = PNG_EXPORT_PALETTE.line;
    context.lineWidth = 1.5;
    context.stroke();
    drawWrappedPngText(context, pair.label, cellX + 22, cellY + 38, columnWidth - 44, {
      size: 20,
      weight: 650,
      color: PNG_EXPORT_PALETTE.muted,
      lineHeight: 24,
      maxLines: 2,
    });
    drawFittedPngText(context, pair.value, cellX + 22, cellY + 116, columnWidth - 44, {
      size: 34,
      minimumSize: 23,
      weight: 740,
    });
  });
}

function drawPngVoteShare(context, record, x, y, width) {
  const demShare = clamp(
    record.metrics.sourceProvidesVoteCounts
      ? record.metrics.rawTwoPartyDemVoteShare
      : record.metrics.equalDistrictDemSupport,
    0,
    1,
  );
  const repShare = 1 - demShare;
  setPngExportFont(context, 23, 650);
  context.fillStyle = PNG_EXPORT_PALETTE.muted;
  context.fillText(`Democratic ${(demShare * 100).toFixed(1)}%`, x, y);
  context.textAlign = "right";
  context.fillText(`Republican ${(repShare * 100).toFixed(1)}%`, x + width, y);
  context.textAlign = "left";
  const barY = y + 26;
  const barHeight = 42;
  context.save();
  traceRoundedRect(context, x, barY, width, barHeight, 21);
  context.clip();
  context.fillStyle = PNG_EXPORT_PALETTE.demStrong;
  context.fillRect(x, barY, width * demShare, barHeight);
  context.fillStyle = PNG_EXPORT_PALETTE.repStrong;
  context.fillRect(x + width * demShare, barY, width * repShare, barHeight);
  context.restore();
}

async function buildMapMetricsPng() {
  const record = buildPublicationRecord();
  if (!record) throw new Error("The model result is not ready.");
  const { weight, specification } = getPngExportContext(record);
  const { canvas, context } = createPngExportCanvas();
  drawPngExportHeader(context, {
    kicker: "Districts to Delegations · Map and metrics",
    title: record.scenario.label,
    subtitle: `${record.view.label} · ${weight} · ${specification}`,
  });

  const left = { x: 96, y: 290, width: 1370, height: 900 };
  drawPngExportCard(context, left.x, left.y, left.width, left.height);
  setPngExportFont(context, 21, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.accent;
  context.fillText("CURRENT MAP", left.x + 38, left.y + 52);
  drawFittedPngText(context, record.view.label, left.x + 38, left.y + 103, 860, {
    size: 36,
    minimumSize: 26,
    weight: 720,
  });
  drawFittedPngText(
    context,
    `${record.results.displayed.demSeats} D / ${record.results.displayed.repSeats} R`,
    left.x + left.width - 38,
    left.y + 103,
    360,
    {
      size: 38,
      minimumSize: 28,
      weight: 760,
      align: "right",
    },
  );
  await drawSvgSnapshot(
    context,
    els.mapShapes?.ownerSVGElement,
    left.x + 40,
    left.y + 138,
    left.width - 80,
    ((left.width - 80) * 330) / 640,
  );
  setPngExportFont(context, 20, 650);
  context.fillStyle = PNG_EXPORT_PALETTE.muted;
  context.fillText("STATEWIDE TARGET", left.x + 40, left.y + left.height - 66);
  drawFittedPngText(
    context,
    els.mapTargetLabel?.textContent || record.model.target.label,
    left.x + 280,
    left.y + left.height - 66,
    left.width - 320,
    {
      size: 24,
      minimumSize: 19,
      weight: 700,
    },
  );

  const voteCard = { x: 96, y: 1220, width: 1370, height: 210 };
  drawPngExportCard(context, voteCard.x, voteCard.y, voteCard.width, voteCard.height);
  setPngExportFont(context, 22, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.ink;
  context.fillText(
    record.metrics.sourceProvidesVoteCounts
      ? "STATEWIDE TWO-PARTY VOTE"
      : "EQUAL-DISTRICT TWO-PARTY SUPPORT",
    voteCard.x + 38,
    voteCard.y + 54,
  );
  drawPngVoteShare(
    context,
    record,
    voteCard.x + 38,
    voteCard.y + 103,
    voteCard.width - 76,
  );

  const right = { x: 1510, width: 794 };
  drawPngExportCard(context, right.x, 290, right.width, 360);
  setPngExportFont(context, 22, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.ink;
  context.fillText("COMPARE ALLOCATIONS", right.x + 34, 346);
  drawPngSeatRows(
    context,
    [
      ["Model optimum", record.results.modelOptimum],
      ["FPTP", record.results.comparisonBaseline],
      ["Proportional", record.results.proportionalBenchmark],
      ["EG minimum", record.results.efficiencyGapMinimum],
    ],
    right.x + 34,
    408,
    right.width - 68,
  );

  drawPngExportCard(context, right.x, 680, right.width, 750);
  setPngExportFont(context, 22, 760);
  context.fillStyle = PNG_EXPORT_PALETTE.ink;
  context.fillText("ELECTION DIAGNOSTICS", right.x + 34, 738);
  drawPngDiagnostics(
    context,
    getPngDiagnosticPairs(),
    right.x + 34,
    780,
    right.width - 68,
  );

  drawPngExportFooter(context);
  const scenarioSlug = slugifyFilename(`${record.scenario.state}-${record.scenario.year}`) || "election";
  const weightSlug = record.model.weight.toFixed(6).replace(".", "-");
  return {
    blob: await canvasToPngBlob(canvas),
    filename: `${scenarioSlug}-map-and-metrics-w-${weightSlug}.png`,
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtmlAttribute(value) {
  return escapeXml(value);
}

function wrapPublicationText(value, maxCharacters) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function buildSvgTextLines(lines, x, y, className, lineHeight = 22) {
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" class="${className}">${tspans}</text>`;
}

function buildSeatBarSvg(label, allocation, y, totalSeats) {
  const barX = 330;
  const barWidth = 790;
  const demWidth = (barWidth * allocation.demSeats) / totalSeats;
  const repWidth = barWidth - demWidth;
  const demLabel = allocation.demSeats
    ? `<text x="${barX + demWidth / 2}" y="${y + 10}" class="bar-inside" text-anchor="middle">${allocation.demSeats} D</text>`
    : "";
  const repLabel = allocation.repSeats
    ? `<text x="${barX + demWidth + repWidth / 2}" y="${y + 10}" class="bar-inside" text-anchor="middle">${allocation.repSeats} R</text>`
    : "";
  return `
    <text x="72" y="${y - 9}" class="bar-label">${escapeXml(label)}</text>
    <text x="72" y="${y + 20}" class="bar-value">${escapeXml(
      `${allocation.demSeats} D / ${allocation.repSeats} R`,
    )}</text>
    <rect x="${barX}" y="${y - 23}" width="${barWidth}" height="54" rx="4" fill="#eef1f0"/>
    <rect x="${barX}" y="${y - 23}" width="${demWidth}" height="54" rx="4" fill="#557fae"/>
    <rect x="${barX + demWidth}" y="${y - 23}" width="${repWidth}" height="54" rx="4" fill="#c96868"/>
    ${demLabel}
    ${repLabel}`;
}

function buildPublicationSvg(record = buildPublicationRecord()) {
  if (!record) return "";
  const totalSeats =
    record.results.displayed.demSeats + record.results.displayed.repSeats;
  const thirdAllocation =
    record.results.displayed.kind === "model"
      ? record.results.proportionalBenchmark
      : record.results.modelOptimum;
  const thirdLabel =
    record.results.displayed.kind === "model"
      ? "Proportional benchmark"
      : `Model optimum at w = ${formatAdaptiveWeight(record.model.weight)}`;
  const graphicCaption = record.publication.caption.split(" Data status:")[0];
  const captionLines = wrapPublicationText(graphicCaption, 122).slice(0, 4);
  const sourceLines = wrapPublicationText(
    `Source: ${record.publication.source.label}`,
    132,
  ).slice(0, 2);
  const caveatLines = wrapPublicationText(
    `Caveat: ${record.publication.caveat}`,
    132,
  ).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-labelledby="publicationSvgTitle publicationSvgDescription">
  <title id="publicationSvgTitle">${escapeXml(
    `${record.scenario.label} election representation export`,
  )}</title>
  <desc id="publicationSvgDescription">${escapeXml(record.publication.caption)}</desc>
  <style>
    text{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#17231f}
    .kicker{font-size:14px;font-weight:800;letter-spacing:1.7px;fill:#26766f}
    .title{font-family:Georgia,"Times New Roman",serif;font-size:38px;font-weight:700}
    .subtitle{font-size:17px;fill:#52615d}
    .legend{font-size:14px;font-weight:750;fill:#52615d}
    .bar-label{font-size:15px;font-weight:800;fill:#33433f}
    .bar-value{font-size:22px;font-weight:850}
    .bar-inside{font-size:16px;font-weight:850;fill:#fff}
    .meta-label{font-size:12px;font-weight:800;letter-spacing:1px;fill:#69736f}
    .meta-value{font-size:15px;font-weight:750}
    .section-label{font-size:13px;font-weight:850;letter-spacing:1.3px;fill:#26766f}
    .caption{font-family:Georgia,"Times New Roman",serif;font-size:17px;fill:#263833}
    .source{font-size:14px;fill:#52615d}
    .caveat{font-size:13px;font-weight:650;fill:#52615d}
  </style>
  <rect width="1200" height="900" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="10" fill="#26766f"/>
  <text x="72" y="55" class="kicker">DISTRICTS TO DELEGATIONS · EXPORTED RESULT</text>
  <text x="72" y="102" class="title">${escapeXml(record.scenario.label)}</text>
  <text x="72" y="132" class="subtitle">${escapeXml(
    `${record.view.label} · w = ${formatAdaptiveWeight(record.model.weight)}`,
  )}</text>
  <g transform="translate(870 112)">
    <circle cx="0" cy="0" r="7" fill="#557fae"/><text x="14" y="5" class="legend">Democratic seats</text>
    <circle cx="165" cy="0" r="7" fill="#c96868"/><text x="179" y="5" class="legend">Republican seats</text>
  </g>
  <line x1="72" y1="153" x2="1128" y2="153" stroke="#b8c5c1"/>
  ${buildSeatBarSvg(`SELECTED MAP VIEW · w = ${formatAdaptiveWeight(record.model.weight)}`, record.results.displayed, 211, totalSeats)}
  ${buildSeatBarSvg("COMPARISON BASELINE", record.results.comparisonBaseline, 307, totalSeats)}
  ${buildSeatBarSvg(thirdLabel.toUpperCase(), thirdAllocation, 403, totalSeats)}
  <rect x="72" y="467" width="1056" height="92" rx="5" fill="#f3f6f4" stroke="#d6dedb"/>
  <text x="92" y="494" class="meta-label">PLAN</text>
  <text x="92" y="520" class="meta-value">${escapeXml(record.scenario.plan.id)}</text>
  <text x="356" y="494" class="meta-label">DATA VERSION</text>
  <text x="356" y="520" class="meta-value">${escapeXml(record.scenario.dataVersion)}</text>
  <text x="676" y="494" class="meta-label">DATA STATUS</text>
  <text x="676" y="520" class="meta-value">${escapeXml(record.publication.dataStatus)}</text>
  <text x="932" y="494" class="meta-label">LAST UPDATED</text>
  <text x="932" y="520" class="meta-value">${escapeXml(record.publication.lastUpdated)}</text>
  <text x="92" y="544" class="source">Methodology version ${escapeXml(
    record.publication.methodologyVersion,
  )} · Schematic geometry</text>
  <text x="72" y="600" class="section-label">CAPTION</text>
  ${buildSvgTextLines(captionLines, 72, 630, "caption", 24)}
  <line x1="72" y1="735" x2="1128" y2="735" stroke="#d6dedb"/>
  ${buildSvgTextLines(sourceLines, 72, 765, "source", 20)}
  ${buildSvgTextLines(caveatLines, 72, 824, "caveat", 19)}
</svg>`;
}

function downloadPublicationSvg() {
  const record = buildPublicationRecord();
  if (!record) return;
  const weightSlug = record.model.weight.toFixed(6).replace(".", "-");
  const filename = `${slugifyFilename(record.scenario.label) || "election"}-w-${weightSlug}-export.svg`;
  downloadTextFile(buildPublicationSvg(record), filename, "image/svg+xml;charset=utf-8");
  setAnalysisActionStatus(`Export SVG downloaded as ${filename}.`);
}

async function downloadPublicationPng() {
  const record = buildPublicationRecord();
  if (!record) return;
  const weightSlug = record.model.weight.toFixed(6).replace(".", "-");
  const filename = `${slugifyFilename(record.scenario.label) || "election"}-w-${weightSlug}-export.png`;
  const svgBlob = new Blob([buildPublicationSvg(record)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The export graphic could not be rendered."));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG export could not be created."))),
        "image/png",
      );
    });
    downloadBlob(pngBlob, filename);
    setAnalysisActionStatus(`High-resolution PNG downloaded as ${filename}.`);
  } catch (error) {
    setAnalysisActionStatus(
      error instanceof Error ? error.message : "The PNG could not be downloaded.",
      true,
    );
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function renderDiagnosticTargetState(mode) {
  const activeTarget = DIAGNOSTIC_MAP_TARGETS[mode] || null;
  document.querySelectorAll(".diagnostic-card[data-map-target]").forEach((button) => {
    const isActive = button.dataset.mapTarget === mode;
    button.setAttribute("aria-pressed", String(isActive));
    button.classList.toggle("is-active", isActive);
    const action = button.querySelector(".diagnostic-card-action");
    if (action) {
      action.dataset.defaultLabel ||= action.textContent;
      action.textContent = isActive ? "Active on map" : action.dataset.defaultLabel;
    }
  });
  els.diagnosticPickerStatus.textContent = activeTarget
    ? `Map: ${getDiagnosticModeLabel(mode)}`
    : mode === "inspection"
      ? "Map: selected counterfactual"
      : "Map: model prediction";
}

function getDiagnosticModeLabel(mode, w = Number(els.wSlider?.value || 0)) {
  if (mode === "observed") return "District-plurality (FPTP) baseline";
  if (mode === "proportional") return "Proportional benchmark";
  if (mode === "efficiency") return "Efficiency-gap minimum";
  if (mode === "inspection") return "Selected counterfactual";
  if (mode === "meanMedian") return "Mean-median gap";
  if (mode === "competitive") return "Competitive districts";
  if (mode === "responsiveness") return "Responsiveness to party support";
  if (DIAGNOSTIC_MAP_TARGETS[mode]) return DIAGNOSTIC_MAP_TARGETS[mode].label;
  return `Model allocation at w = ${formatAdaptiveWeight(Number(w))}`;
}

function describeDiagnosticMapTarget(mode, districts, metrics, outcome) {
  if (mode === "partisanBias") {
    const residual = Math.abs(outcome.demSeats / metrics.totalSeats - 0.5);
    return `Closest feasible parity allocation: ${formatSeatCount(
      outcome.demSeats,
      metrics.totalSeats,
    )}; residual |bias| ${formatPercent(residual, 1)}`;
  }
  if (mode === "seatVoteGap") {
    return `Minimum feasible |seat-vote gap| ${formatPercent(
      Math.abs(outcome.seatVoteGap),
      1,
    )} at ${outcome.demSeats} D seats`;
  }
  if (mode === "gallagher") {
    return `Minimum feasible Gallagher index ${formatPercent(
      outcome.gallagherIndex,
      1,
    )} at ${outcome.demSeats} D seats`;
  }
  if (mode === "declination") {
    const value = computeDeclination(
      districts.map((district) => district.demShare),
      outcome.assignment,
    );
    return value === null
      ? "Declination is undefined when one party receives every district"
      : `Minimum |declination| ${formatNumber(Math.abs(value), 3)} on the district-loss frontier`;
  }
  if (mode === "lopsidedMargins") {
    const value = computeLopsidedMarginDifference(districts, outcome.assignment);
    return value === null
      ? "Lopsided margins require at least one district for each party"
      : `Minimum |winning-margin difference| ${formatPercent(Math.abs(value), 1)}`;
  }
  if (mode === "majorityInversion") {
    const inversion = computeMajorityInversionForSeats(metrics, outcome.demSeats);
    return inversion
      ? "No non-inverting allocation is available on the evaluated frontier"
      : "Avoids a majority inversion with the smallest available district loss";
  }
  if (mode === "meanMedian") {
    const shares = districts.map((district) => district.demShare);
    const gap = metrics.modelDemShare - medianValue(shares);
    return `Vote-profile gap ${formatDirectionalPoints(gap, "R")}; observed seat assignment is unchanged`;
  }
  if (mode === "competitive") {
    const competitive = districts.filter((district) => district.margin <= 0.1).length;
    return `${competitive} of ${metrics.totalSeats} districts are within 10 percentage points`;
  }
  if (mode === "responsiveness") {
    const value = computeResponsiveness(districts, metrics.modelDemShare);
    return value === null
      ? "The 45%-55% uniform swing leaves the feasible vote-share range"
      : `${value.toFixed(2)}x FPTP seat response; pivotal districts are highlighted`;
  }
  return "";
}

function getProfileDistrictFocus(mode, district, metrics) {
  if (mode === "competitive") return district.margin <= 0.1;
  if (mode === "responsiveness") {
    const lowShare = district.demShare + (0.45 - metrics.modelDemShare);
    const highShare = district.demShare + (0.55 - metrics.modelDemShare);
    return lowShare <= 0.5 && highShare > 0.5;
  }
  return null;
}

function renderMapLegend(mode) {
  const profileMode = isProfileDiagnosticMode(mode);
  els.mapLegendDem.lastChild.textContent = profileMode
    ? " Democratic plurality"
    : " Democratic allocation";
  els.mapLegendRep.lastChild.textContent = profileMode
    ? " Republican plurality"
    : " Republican allocation";
  const focusSwatch = els.mapLegendFocus.querySelector("i");
  focusSwatch.className = `legend-swatch ${profileMode ? "profile" : "flip"}`;
  els.mapLegendFocus.lastChild.textContent =
    mode === "competitive"
      ? " Highlighted: within 10 points"
      : mode === "responsiveness"
        ? " Highlighted: pivotal under 45%-55% swing"
        : mode === "meanMedian"
          ? " Color intensity follows district vote share"
          : " Reverses local plurality";
}

function syncMapPanCue() {
  if (!els.mapWrap || !els.mapPanCue) return;
  const maxScroll = Math.max(0, els.mapWrap.scrollWidth - els.mapWrap.clientWidth);
  const canScroll = maxScroll > 4;
  const atStart = els.mapWrap.scrollLeft <= 4;
  const atEnd = els.mapWrap.scrollLeft >= maxScroll - 4;
  const districtCount = Number(els.mapWrap.dataset.districtCount) || 0;

  els.mapPanCue.hidden = !canScroll;
  els.mapWrap.classList.toggle("has-horizontal-overflow", canScroll);
  els.mapWrap.classList.toggle("is-at-start", !canScroll || atStart);
  els.mapWrap.classList.toggle("is-at-end", !canScroll || atEnd);
  if (canScroll) {
    els.mapWrap.tabIndex = 0;
    els.mapWrap.setAttribute(
      "aria-label",
      `${districtCount}-district allocation map. Scroll horizontally to inspect every district.`,
    );
    els.mapPanCue.textContent = atEnd
      ? "Back to the first districts ←"
      : `Continue through all ${districtCount} districts →`;
  } else {
    els.mapWrap.removeAttribute("tabindex");
    els.mapWrap.setAttribute("aria-label", `${districtCount}-district allocation map.`);
  }
}

function panDistrictMap() {
  const maxScroll = Math.max(0, els.mapWrap.scrollWidth - els.mapWrap.clientWidth);
  if (maxScroll <= 4) return;
  const atEnd = els.mapWrap.scrollLeft >= maxScroll - 4;
  const destination = atEnd
    ? 0
    : Math.min(maxScroll, els.mapWrap.scrollLeft + els.mapWrap.clientWidth);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  els.mapWrap.scrollTo({
    left: destination,
    behavior: reducedMotion ? "auto" : "smooth",
  });
}

function moveRovingSvgFocus(event, container, selector) {
  const navigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!navigationKeys.includes(event.key)) return false;

  const items = Array.from(container.querySelectorAll(selector));
  if (!items.length) return false;
  const currentIndex = Math.max(0, items.indexOf(event.currentTarget));
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = items.length - 1;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  } else {
    nextIndex = (currentIndex + 1) % items.length;
  }

  event.preventDefault();
  items.forEach((item, index) => item.setAttribute("tabindex", index === nextIndex ? "0" : "-1"));
  items[nextIndex].focus({ preventScroll: true });
  return true;
}

function describeSeatDifference(outcome, baseline, baselineLabel) {
  const difference = outcome.demSeats - baseline.demSeats;
  if (difference === 0) return `the same Democratic seat total as ${baselineLabel}`;
  const magnitude = Math.abs(difference);
  return `${magnitude} ${difference > 0 ? "more" : "fewer"} Democratic ${
    magnitude === 1 ? "seat" : "seats"
  } than ${baselineLabel}`;
}

function getMapPresentation({ districts, metrics, outcome, mode, comparison, w }) {
  const seatBadge = formatSeatCount(outcome.demSeats, metrics.totalSeats);
  const weightText = formatAdaptiveWeight(w, activeModel?.schedule, comparison.model.demSeats);
  const changedDistricts = outcome.flips;
  const changedText = `${changedDistricts} ${
    changedDistricts === 1 ? "district" : "districts"
  } changed from local plurality`;
  const keptText = `${outcome.localMatches} of ${metrics.totalSeats} local plurality winners`;

  if (mode === "model") {
    return {
      eyebrow: "Model prediction",
      seatBadge,
      status: `Model prediction · ${changedText}`,
      takeaway: `At w = ${weightText}, the model assigns ${describeSeatDifference(
        outcome,
        comparison.observed,
        "FPTP",
      )} while keeping ${keptText}.`,
    };
  }

  if (mode === "inspection") {
    return {
      eyebrow: "Selected counterfactual",
      seatBadge,
      status: `Selected counterfactual · ${changedText}`,
      takeaway: `The selected allocation has ${describeSeatDifference(
        outcome,
        comparison.model,
        "the model optimum",
      )} at w = ${weightText} and keeps ${keptText}.`,
    };
  }

  if (mode === "observed") {
    return {
      eyebrow: "FPTP baseline",
      seatBadge,
      status: `FPTP baseline · all ${metrics.totalSeats} local pluralities shown`,
      takeaway: `Each district is assigned to its local two-party plurality winner, producing ${seatBadge}.`,
    };
  }

  if (mode === "proportional") {
    return {
      eyebrow: "Proportional benchmark",
      seatBadge,
      status: `Proportional benchmark · ${seatBadge}`,
      takeaway: `The closest feasible whole-seat allocation to statewide support ρ = ${formatNumber(
        metrics.rho,
        2,
      )} is shown; it has ${describeSeatDifference(
        outcome,
        comparison.observed,
        "FPTP",
      )}.`,
    };
  }

  if (mode === "efficiency") {
    const zeroGapTarget = 2 * metrics.rho - metrics.totalSeats / 2;
    return {
      eyebrow: "Efficiency-gap minimum",
      seatBadge,
      status: `Efficiency-gap minimum · ${seatBadge}`,
      takeaway: `The closest feasible allocation to the zero-gap target S = ${formatNumber(
        zeroGapTarget,
        2,
      )} is shown, with |EG| ${formatPercent(Math.abs(outcome.efficiencyGap), 1)}.`,
    };
  }

  const label = getDiagnosticModeLabel(mode, w);
  const diagnosticDetail = describeDiagnosticMapTarget(mode, districts, metrics, outcome);
  return {
    eyebrow: label,
    seatBadge,
    status: `${label} · ${seatBadge}`,
    takeaway: diagnosticDetail || `The ${label.toLowerCase()} is shown on the map.`,
  };
}

function renderMap(districts, metrics, outcome, diagnosticMode, comparison, w) {
  hideTooltip();
  const mapScenarioKey = `${activeState}|${activeYear}`;
  const previousMapScenario = els.mapWrap.dataset.scenario;
  const priorRovingDistrict = els.mapShapes.querySelector(
    '.district-shape[tabindex="0"]',
  );
  const focusedMapElement = document.activeElement;
  const focusedDistrictId = focusedMapElement?.classList?.contains("district-shape")
    ? focusedMapElement.dataset.districtId
    : null;
  const preserveDistrictId =
    previousMapScenario === mapScenarioKey
      ? focusedDistrictId || priorRovingDistrict?.dataset.districtId || null
      : null;
  const restoreDistrictFocus = Boolean(
    previousMapScenario === mapScenarioKey && focusedDistrictId,
  );
  if (previousMapScenario !== mapScenarioKey) {
    els.mapWrap.scrollLeft = 0;
    els.mapWrap.dataset.scenario = mapScenarioKey;
  }
  els.mapWrap.dataset.districtCount = String(metrics.totalSeats);
  els.mapWrap.classList.toggle("is-dense-delegation", metrics.totalSeats > 24);
  const assignment = outcome.assignment;
  const profileMode = isProfileDiagnosticMode(diagnosticMode);
  const modeLabel = profileMode
    ? `the ${getDiagnosticModeLabel(diagnosticMode).toLowerCase()}`
    : diagnosticMode === "inspection"
      ? "the selected counterfactual allocation"
      : diagnosticMode === "model"
        ? "the model-optimal allocation"
        : `the ${getDiagnosticModeLabel(diagnosticMode).toLowerCase()}`;
  const assignmentLabel = getDiagnosticModeLabel(diagnosticMode, w);
  const seatRoleLabel =
    diagnosticMode === "model"
      ? "Model seat"
      : diagnosticMode === "inspection"
        ? "Selected seat"
        : diagnosticMode === "observed"
          ? "FPTP seat"
          : "Map seat";
  const target = getTargetContext();

  const isCustom = activeState === CUSTOM_STATE_KEY;
  els.mapTitle.textContent = isCustom ? customState.name : `${activeState}, ${activeYear}`;
  const sourceDescription = isCustom
    ? `${metrics.totalSeats} user-entered districts on a schematic map`
    : `${metrics.totalSeats} author-supplied district vote shares on a schematic map`;
  const activeGoalSuffix = ["model", "inspection"].includes(diagnosticMode)
    ? `; active model goal: ${target.mapLabel.toLowerCase()}`
    : "";
  els.mapSubtitle.textContent = `${sourceDescription} colored by ${modeLabel}${activeGoalSuffix}`;

  const targetBanner = els.mapTargetLabel.closest(".map-target-banner");
  if (diagnosticMode === "observed") {
    els.mapTargetLabel.textContent = "Local plurality rule";
    els.mapTargetValue.textContent = "One seat to each district's two-party plurality winner";
    targetBanner.dataset.target = "observed";
  } else if (diagnosticMode === "proportional") {
    els.mapTargetLabel.textContent = "Statewide proportionality";
    els.mapTargetValue.textContent = `ρ = ${formatNumber(metrics.rho, 2)}; closest feasible S = ${outcome.demSeats} D seats`;
    targetBanner.dataset.target = "proportional";
  } else if (diagnosticMode === "efficiency") {
    const zeroGapTarget = 2 * metrics.rho - metrics.totalSeats / 2;
    els.mapTargetLabel.textContent = "Efficiency-gap minimum";
    els.mapTargetValue.textContent = `Zero-gap target S = ${formatNumber(
      zeroGapTarget,
      2,
    )}; feasible minimum at ${outcome.demSeats} D seats (|EG| ${formatPercent(
      Math.abs(outcome.efficiencyGap),
      1,
    )})`;
    targetBanner.dataset.target = "efficiency";
  } else if (DIAGNOSTIC_MAP_TARGETS[diagnosticMode]) {
    els.mapTargetLabel.textContent = getDiagnosticModeLabel(diagnosticMode);
    els.mapTargetValue.textContent = describeDiagnosticMapTarget(
      diagnosticMode,
      districts,
      metrics,
      outcome,
    );
    targetBanner.dataset.target = "diagnostic";
  } else {
    els.mapTargetLabel.textContent = target.mapLabel;
    els.mapTargetValue.textContent = `${target.valueLead}: T(ρ) = ${formatNumber(
      outcome.targetSeatCount,
      2,
    )} D seats`;
    targetBanner.dataset.target = target.id;
  }

  const mapPresentation = getMapPresentation({
    districts,
    metrics,
    outcome,
    mode: diagnosticMode,
    comparison,
    w,
  });
  els.mapViewLabel.textContent = mapPresentation.eyebrow;
  els.mapSeatBadge.textContent = mapPresentation.seatBadge;
  els.mapFlipCount.textContent = mapPresentation.status;
  els.mapPredictionTakeaway.textContent = mapPresentation.takeaway;
  renderMapLegend(diagnosticMode);
  const priorDistrictShapes = Array.from(
    els.mapShapes.querySelectorAll(".district-shape"),
  );
  const hadPriorMap = priorDistrictShapes.length > 0;
  const priorSwitchedDistrictIds = new Set(
    priorDistrictShapes
      .filter((shape) => shape.dataset.status === "switched")
      .map((shape) => shape.dataset.districtId),
  );
  els.mapShapes.replaceChildren();
  const labelClipDefinitions = makeSvgElement("defs", { "aria-hidden": "true" });
  els.mapShapes.append(labelClipDefinitions);

  districts.forEach((district, index) => {
    const assignedParty = assignment[index] ? "D" : "R";
    const assignedPartyName = assignedParty === "D" ? "Democratic" : "Republican";
    const observedParty = district.winner;
    const observedPartyName = observedParty === "D" ? "Democratic" : "Republican";
    const isFlipped =
      !profileMode && diagnosticMode !== "observed" && assignedParty !== observedParty;
    const profileFocus = getProfileDistrictFocus(diagnosticMode, district, metrics);
    const assignedLoss = outcome.districtLosses[index];
    const polygonPoints = district.points.map((point) => point.join(",")).join(" ");
    const tiedDistrict = isExactDistrictTie(district);
    const localWinnerVisible = tiedDistrict
      ? `${observedPartyName} · tie rule`
      : observedPartyName;
    const localWinnerAccessible = tiedDistrict
      ? `${observedPartyName} under the displayed tie rule`
      : `${observedPartyName} by ${formatDistrictWinningMargin(district.margin)}`;
    const qualityFlags = [
      district.proxy ? "proxied race" : "",
      district.largeThirdParty ? "third-party representation above 15 percent" : "",
    ].filter(Boolean);
    const qualityAccessible = qualityFlags.length
      ? ` Data flags: ${qualityFlags.join("; ")}.`
      : "";
    const fallbackBounds = (() => {
      const xs = district.points.map(([x]) => x);
      const ys = district.points.map(([, y]) => y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      };
    })();
    const bounds = district.bounds || fallbackBounds;
    const roomy = bounds.height >= 120;
    const dense = bounds.width < 70 || bounds.height < 70;

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", polygonPoints);
    if (diagnosticMode === "meanMedian") {
      polygon.style.fill = partyFill(assignedParty, district.demShare);
    }
    polygon.setAttribute(
      "tabindex",
      preserveDistrictId
        ? String(district.id) === preserveDistrictId
          ? "0"
          : "-1"
        : index === 0
          ? "0"
          : "-1",
    );
    polygon.setAttribute(
      "aria-label",
      `District ${district.id}. Democratic vote ${formatPercent(
        district.demShare,
        1,
      )}. District winner: ${localWinnerAccessible}. ${seatRoleLabel}: ${assignedPartyName}.${
        isFlipped
          ? ` Switched from ${observedPartyName} to ${assignedPartyName}.`
          : " The assigned seat matches the district winner."
      }${qualityAccessible}`,
    );
    polygon.setAttribute("data-local-winner", observedParty.toLowerCase());
    polygon.setAttribute("data-assigned-party", assignedParty.toLowerCase());
    polygon.setAttribute("data-status", isFlipped ? "switched" : "matches");
    polygon.setAttribute("data-district-id", String(district.id));
    polygon.setAttribute("class", [
      "district-shape",
      `assigned-${assignedParty.toLowerCase()}`,
      isFlipped ? "is-flipped" : "",
      profileFocus === true ? "is-profile-focus" : "",
      profileFocus === false ? "is-profile-muted" : "",
    ].filter(Boolean).join(" "));
    polygon.addEventListener("pointerenter", (event) =>
      showTooltip(event, district, assignedParty, assignedLoss, assignmentLabel),
    );
    polygon.addEventListener("pointermove", moveTooltip);
    polygon.addEventListener("pointerleave", hideTooltip);
    polygon.addEventListener("focus", () =>
      showTooltip(null, district, assignedParty, assignedLoss, assignmentLabel),
    );
    polygon.addEventListener("blur", hideTooltip);
    polygon.addEventListener("keydown", (event) => {
      moveRovingSvgFocus(event, els.mapShapes, ".district-shape");
    });

    if (isFlipped) {
      const districtId = String(district.id);
      const isEntering =
        hadPriorMap && !priorSwitchedDistrictIds.has(districtId);
      els.mapShapes.append(
        makeSvgElement("polygon", {
          points: polygonPoints,
          class: [
            "district-switch-rigid-outline",
            dense ? "is-dense" : "",
            isEntering ? "is-entering" : "",
          ].filter(Boolean).join(" "),
          "data-district-id": districtId,
          "aria-hidden": "true",
          focusable: "false",
        }),
        makeSvgElement("polygon", {
          points: polygonPoints,
          class: `district-switch-rigid-gap${dense ? " is-dense" : ""}`,
          "data-district-id": districtId,
          "aria-hidden": "true",
          focusable: "false",
        }),
      );
    }

    // Paint the interactive district above the switch frame so the paper moat,
    // party border, and fill remain crisp inside the gold perimeter.
    els.mapShapes.append(polygon);

    const labelClipId = `explorer-district-label-${index}`;
    const labelClip = makeSvgElement("clipPath", {
      id: labelClipId,
      clipPathUnits: "userSpaceOnUse",
    });
    labelClip.append(makeSvgElement("polygon", { points: polygonPoints }));
    labelClipDefinitions.append(labelClip);

    const labelGroup = makeSvgElement("g", {
      class: [
        "district-map-label-group",
        isFlipped ? "is-switched" : "",
      ].filter(Boolean).join(" "),
      "clip-path": `url(#${labelClipId})`,
      "aria-hidden": "true",
    });
    const labelX = district.center[0];
    const labelTop = bounds.y + (roomy ? 21 : 13);

    const textLine = (className, y, value) =>
      makeSvgElement(
        "text",
        { x: labelX, y, "text-anchor": "middle", class: className },
        value,
      );

    if (dense) {
      const centerY = district.center[1];
      labelGroup.append(
        textLine("district-map-number", centerY - 10, `#${district.id}`),
        textLine(
          "district-map-vote-share compact",
          centerY + 4,
          formatPercent(district.demShare, 0),
        ),
        makeSvgElement("rect", {
          x: labelX - 9,
          y: centerY + 7,
          width: 18,
          height: 13,
          rx: 4,
          class: `district-model-footer dense assigned-${assignedParty.toLowerCase()}`,
        }),
        textLine(
          "district-model-footer-party compact",
          centerY + 17,
          assignedParty,
        ),
      );
    } else if (roomy) {
      const voteBarX = bounds.x + 14;
      const voteBarWidth = Math.max(22, bounds.width - 28);
      const footerX = bounds.x + 6;
      const footerY = bounds.y + bounds.height - 34;
      const footerWidth = Math.max(28, bounds.width - 12);
      labelGroup.append(
        textLine("district-map-number", labelTop, `DISTRICT ${district.id}`),
        textLine("district-map-kicker", labelTop + 20, "Democratic vote"),
        textLine("district-map-vote-share", labelTop + 40, formatPercent(district.demShare, 1)),
        makeSvgElement("rect", {
          x: voteBarX,
          y: labelTop + 49,
          width: voteBarWidth,
          height: 5,
          rx: 2.5,
          class: "district-vote-track",
        }),
        makeSvgElement("rect", {
          x: voteBarX,
          y: labelTop + 49,
          width: Math.max(2, voteBarWidth * district.demShare),
          height: 5,
          rx: 2.5,
          class: "district-vote-value",
        }),
        textLine(
          "district-map-kicker district-result-kicker",
          footerY - 18,
          "Local winner",
        ),
        textLine(
          `district-map-winner-party winner-${observedParty.toLowerCase()}-text`,
          footerY - 6,
          localWinnerVisible,
        ),
        makeSvgElement("rect", {
          x: footerX,
          y: footerY,
          width: footerWidth,
          height: 29,
          rx: 3,
          class: `district-model-footer assigned-${assignedParty.toLowerCase()}`,
        }),
        textLine(
          "district-model-footer-kicker",
          footerY + 10,
          seatRoleLabel,
        ),
        textLine(
          "district-model-footer-party",
          footerY + 23,
          assignedPartyName,
        ),
      );
    } else {
      const footerX = bounds.x + 5;
      const footerY = bounds.y + bounds.height - 25;
      const footerWidth = Math.max(24, bounds.width - 10);
      labelGroup.append(
        textLine("district-map-number", labelTop, `DISTRICT ${district.id}`),
        textLine("district-map-kicker", labelTop + 13, "Democratic vote"),
        textLine("district-map-vote-share", labelTop + 27, formatPercent(district.demShare, 1)),
        textLine(
          `district-map-compact-winner winner-${observedParty.toLowerCase()}-text`,
          footerY - 7,
          `Winner · ${observedPartyName}`,
        ),
        makeSvgElement("rect", {
          x: footerX,
          y: footerY,
          width: footerWidth,
          height: 21,
          rx: 3,
          class: `district-model-footer assigned-${assignedParty.toLowerCase()}`,
        }),
        textLine(
          "district-model-footer-kicker compact",
          footerY + 8,
          seatRoleLabel,
        ),
        textLine(
          "district-model-footer-party compact",
          footerY + 17,
          assignedPartyName,
        ),
      );
    }
    els.mapShapes.append(labelGroup);
  });

  if (restoreDistrictFocus) {
    window.requestAnimationFrame(() => {
      const focusTarget = Array.from(
        els.mapShapes.querySelectorAll(".district-shape"),
      ).find((shape) => shape.dataset.districtId === focusedDistrictId);
      focusTarget?.focus({ preventScroll: true });
    });
  }

  const democraticVoteText = formatPercent(metrics.demVoteShare, 1);
  const republicanVoteText = formatPercent(metrics.repVoteShare, 1);
  els.demVoteLabel.textContent = `Democratic ${democraticVoteText}`;
  els.repVoteLabel.textContent = `Republican ${republicanVoteText}`;
  els.voteShareLabel.textContent = metrics.voteCountsAvailable
    ? "Statewide two-party vote"
    : "Equal-district two-party support";
  els.demVoteBar.style.width = `${metrics.demVoteShare * 100}%`;
  els.repVoteBar.style.width = `${metrics.repVoteShare * 100}%`;
  els.voteStrip.setAttribute(
    "aria-label",
    `${metrics.voteCountsAvailable ? "Statewide two-party vote" : "Equal-district two-party support"}: Democratic ${democraticVoteText}, Republican ${republicanVoteText}`,
  );
  window.requestAnimationFrame(syncMapPanCue);
}

function showTooltip(event, district, assignedParty, assignedLoss, assignmentLabel) {
  const reversed = assignedParty !== district.winner;
  const assignedPartyName = assignedParty === "D" ? "Democratic" : "Republican";
  const observedPartyName = district.winner === "D" ? "Democratic" : "Republican";
  const winnerReading =
    isExactDistrictTie(district)
      ? `${observedPartyName} under the displayed tie rule`
      : `${observedPartyName} by ${formatDistrictWinningMargin(district.margin)}`;
  const voteReading = district.voteCountsAvailable
    ? `D ${formatPercent(district.demShare, 1)} (${formatCompact(
        district.demVotes,
      )}) &nbsp;·&nbsp; R ${formatPercent(district.repShare, 1)} (${formatCompact(
        district.repVotes,
      )})`
    : `D ${formatPercent(district.demShare, 1)} &nbsp;·&nbsp; R ${formatPercent(
        district.repShare,
        1,
      )}`;
  const qualityReading = [
    district.proxy ? "proxy estimate" : "",
    district.largeThirdParty ? "large third-party flag" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  els.districtTooltip.hidden = false;
  els.districtTooltip.innerHTML = `
    <strong>District ${district.id} · winner: ${winnerReading}</strong>
    ${voteReading}
    <span class="tooltip-status">${assignmentLabel} seat: ${assignedPartyName} · district loss ${formatNumber(
      assignedLoss,
      3,
    )}${reversed ? ` · switched from ${observedPartyName}` : " · matches district winner"}${
      qualityReading ? ` · ${qualityReading}` : ""
    }</span>
  `;

  if (event) {
    moveTooltip(event);
    return;
  }

  const mapRect = els.mapShapes.ownerSVGElement.getBoundingClientRect();
  const wrap = els.mapWrap;
  const x = (district.center[0] / 640) * mapRect.width;
  const y = (district.center[1] / 330) * mapRect.height;
  const visibleLeft = wrap.scrollLeft + 8;
  const visibleRight = Math.max(visibleLeft, wrap.scrollLeft + wrap.clientWidth - 258);
  els.districtTooltip.style.left = `${clamp(x + 12, visibleLeft, visibleRight)}px`;
  els.districtTooltip.style.top = `${clamp(y + 12, 8, mapRect.height - 104)}px`;
}

function moveTooltip(event) {
  const wrap = event.currentTarget.closest(".map-wrap");
  const rect = wrap.getBoundingClientRect();
  const visibleLeft = wrap.scrollLeft + 8;
  const visibleRight = Math.max(visibleLeft, wrap.scrollLeft + rect.width - 258);
  const x = event.clientX - rect.left + wrap.scrollLeft + 13;
  const y = event.clientY - rect.top + 13;
  els.districtTooltip.style.left = `${clamp(x, visibleLeft, visibleRight)}px`;
  els.districtTooltip.style.top = `${clamp(y, 8, rect.height - 104)}px`;
}

function hideTooltip() {
  if (els.districtTooltip) els.districtTooltip.hidden = true;
}

function renderMetrics(
  metrics,
  publicMetrics,
  candidate,
  best,
  w,
  isInspection,
  diagnosticMode,
) {
  els.optimalSeats.textContent = formatSeatCount(candidate.demSeats, metrics.totalSeats);
  els.optimalLoss.textContent = formatNumber(candidate.totalLoss, 4);
  els.optimalDistrictLoss.textContent = formatNumber(candidate.districtLoss, 4);
  els.optimalDistrictLossNote.textContent = `Sum of all ${metrics.totalSeats} district losses; no averaging.`;
  els.optimalStateLoss.textContent = formatNumber(candidate.statewideLoss, 4);
  els.optimalStateLossNote.textContent = `Q(|S − T(ρ)|), using target distance ${formatNumber(
    candidate.targetDistance,
    3,
  )} seats.`;
  const objectiveExplanation = isLinearAggregationAst(compiledSpec.aggregation)
    ? `Linear F adds scaled Dist ${formatNumber(
        candidate.districtComponent,
        4,
      )} and scaled State ${formatNumber(candidate.statewideComponent, 4)}.`
    : `F evaluates scaled inputs ${formatNumber(
        candidate.districtComponent,
        4,
      )} and ${formatNumber(candidate.statewideComponent, 4)}.`;
  els.optimalLossNote.textContent = isInspection
    ? `${objectiveExplanation} This is ${formatNumber(
        candidate.totalLoss - best.totalLoss,
        4,
      )} above the current minimum.`
    : objectiveExplanation;
  const diagnosticSeats = formatSeatCount(publicMetrics.demSeats, metrics.totalSeats);
  const diagnosticLabel = getDiagnosticModeLabel(diagnosticMode, w);
  els.headlineMetricsEyebrow.textContent = `${diagnosticLabel} · ${diagnosticSeats} · diagnostics`;
  setPartyDirectionalValue(
    els.efficiencyGap,
    formatAdvantage(publicMetrics.efficiencyGap),
  );
  els.efficiencyGapNote.textContent = `${diagnosticLabel} allocation; positive values favor Democrats.`;
  if (publicMetrics.partisanBias === null) {
    setPartyDirectionalValue(els.partisanBias, "Undefined");
    els.partisanBiasNote.textContent =
      "The uniform swing to parity would move at least one district outside [0, 1].";
  } else {
    setPartyDirectionalValue(
      els.partisanBias,
      formatAdvantage(publicMetrics.partisanBias),
    );
    els.partisanBiasNote.textContent =
      diagnosticMode === "observed"
        ? "Observed FPTP under a uniform swing to 50-50 support, without clipping shares."
        : diagnosticMode === "proportional"
          ? "Proportional seats recomputed at 50-50 support; half-seat ties round down."
          : diagnosticMode === "efficiency"
            ? "The efficiency-gap-minimizing seat total recomputed at 50-50 support."
            : isAllocationDiagnosticMode(diagnosticMode)
              ? `${getDiagnosticModeLabel(diagnosticMode)} rule recomputed at 50-50 support.`
              : isProfileDiagnosticMode(diagnosticMode)
                ? "Observed FPTP under a uniform swing to 50-50 support, without clipping shares."
                : `Active model reoptimized at 50-50 support with w = ${formatAdaptiveWeight(
                    w,
                  )}.`;
  }
}

function renderPublicMetrics(publicMetrics, metrics, w, diagnosticMode) {
  const allocationLabel = getDiagnosticModeLabel(diagnosticMode, w);
  setPartyDirectionalValue(
    els.seatVoteGap,
    formatAdvantage(publicMetrics.seatVoteGap),
  );
  els.seatVoteGapNote.textContent = `${allocationLabel}: D seat share minus equal-district D support.`;

  if (publicMetrics.declination === null) {
    setPartyDirectionalValue(els.declination, "Undefined");
    els.declinationNote.textContent = "The displayed allocation must give each party at least one district.";
  } else {
    setPartyDirectionalValue(
      els.declination,
      formatDirectionalIndex(publicMetrics.declination, "R", 3),
    );
    els.declinationNote.textContent = `${allocationLabel} grouping; positive values favor R.`;
  }

  if (!Number.isFinite(publicMetrics.meanMedianGap)) {
    setPartyDirectionalValue(els.meanMedianGap, "Undefined");
    els.meanMedianGapNote.textContent =
      "A finite statewide support and district vote profile are required.";
  } else {
    setPartyDirectionalValue(
      els.meanMedianGap,
      formatDirectionalPoints(publicMetrics.meanMedianGap, "R"),
    );
    els.meanMedianGapNote.textContent =
      "Authoritative equal-district D support minus the median district share; positive values favor R.";
  }
}

function renderRepresentationSummary(metrics, candidate, schedule, w, isInspection) {
  els.paperSupport.textContent = formatPercent(metrics.modelDemShare, 1);
  els.paperSupportNote.textContent = `Equal-district support: rho / N = ${formatNumber(
    metrics.rho,
    3,
  )} / ${metrics.totalSeats}.`;

  els.rawVoteSupport.textContent = formatPercent(metrics.demVoteShare, 1);
  const turnoutGap = metrics.demVoteShare - metrics.modelDemShare;
  els.rawVoteSupportLabel.textContent = metrics.voteCountsAvailable
    ? "Raw vote share"
    : "Source support";
  els.rawVoteSupportNote.textContent = metrics.voteCountsAvailable
    ? Math.abs(turnoutGap) < 0.00005
      ? "Same as paper support because district turnout is equal."
      : `Raw minus paper support: ${formatSignedPoints(
          turnoutGap,
          1,
        )}; raw totals weight high-turnout districts more.`
    : "The source provides normalized two-party shares, not raw vote counts; districts are weighted equally.";

  const weightSummary = computeActiveWeightSummary(schedule, metrics);
  const target = getTargetContext();
  const isExactSchedule = isLinearAggregationAst(compiledSpec.aggregation);
  els.targetSwitchLabel.textContent = weightSummary.alreadyAtTarget
    ? `${target.shortLabel} target`
    : `${target.shortLabel} seat switch`;

  if (weightSummary.firstSwitchWeight === null) {
    els.firstSwitchWeight.textContent = "No departure";
    els.firstSwitchNote.textContent =
      "The active specification keeps the FPTP seat total optimal throughout w in [0, 1].";
    els.diagnosticFirstSwitchWeight.textContent = "No switch";
    els.diagnosticFirstSwitchNote.textContent =
      "The district-plurality seat total remains optimal throughout w in [0, 1].";
    els.diagnosticFirstSwitchContext.textContent = "FPTP optimal for every w";
    els.diagnosticFirstSwitchCard.setAttribute(
      "aria-label",
      "First switch weight: no switch. FPTP remains optimal for every weight from zero to one.",
    );
  } else {
    const exactFirstSwitchText = formatAdaptiveWeight(
      weightSummary.firstSwitchWeight,
      schedule,
      metrics.demSeats,
    );
    const compactFirstSwitchText = formatCompactSwitchWeight(
      weightSummary.firstSwitchWeight,
    );
    els.firstSwitchWeight.textContent = `w = ${exactFirstSwitchText}`;
    els.diagnosticFirstSwitchWeight.textContent = compactFirstSwitchText;
    els.diagnosticFirstSwitchContext.textContent = "First departure from FPTP";
    els.diagnosticFirstSwitchCard.setAttribute(
      "aria-label",
      `First switch weight: ${compactFirstSwitchText} of the zero-to-one model weight scale; exact w equals ${exactFirstSwitchText}.`,
    );
    const endpointNote =
      weightSummary.firstSwitchWeight <= 1e-10
        ? "The active specification departs from FPTP at the local-loss endpoint."
        : weightSummary.firstSwitchWeight >= 1 - 1e-10
          ? "An alternative first joins at the endpoint; FPTP remains optimal throughout [0, 1]."
          : `${
              schedule.source === "dataset"
                ? "Dataset boundary"
                : isExactSchedule
                  ? "Exact boundary"
                  : "Numerically estimated boundary"
            }; FPTP remains a minimizer through it.`;
    els.firstSwitchNote.textContent = `${formatPhi(
      weightSummary.firstSwitchWeight,
    )}. ${endpointNote}`;
    els.diagnosticFirstSwitchNote.textContent = `${
      schedule.source === "dataset"
        ? "Supplied dataset boundary"
        : isExactSchedule
          ? "Exact model boundary"
          : "Numerically estimated model boundary"
    }; FPTP remains a minimizer through this weight.`;
  }

  if (weightSummary.alreadyAtTarget) {
    els.proportionalSwitchWeight.textContent = "Already at target";
    els.proportionalSwitchNote.textContent = `${formatSeatCount(
      weightSummary.targetDemSeats,
      metrics.totalSeats,
    )} is both the FPTP seat total and the statewide endpoint; no switch is required.`;
  } else if (
    weightSummary.targetSwitchWeight === null ||
    weightSummary.targetDemSeats === null
  ) {
    els.proportionalSwitchWeight.textContent = "Unavailable";
    els.proportionalSwitchNote.textContent =
      "No supporting interval was recovered for the active statewide endpoint.";
  } else {
    els.proportionalSwitchWeight.textContent = `w = ${formatSwitchWeight(
      weightSummary.targetSwitchWeight,
    )}`;
    els.proportionalSwitchNote.textContent = `${formatPhi(
      weightSummary.targetSwitchWeight,
    )}; ${
      schedule.source === "dataset"
        ? "first supplied dataset"
        : isExactSchedule
          ? "smallest exact"
          : "smallest numerically estimated"
    } weight supporting ${formatSeatCount(
      weightSummary.targetDemSeats,
      metrics.totalSeats,
    )}.`;
  }

  renderCalculationTrace(metrics, candidate, w, isInspection);
}

function renderCalculationTrace(metrics, candidate, w, isInspection) {
  els.calculationTrace.replaceChildren();
  const rows = [
    {
      label: "Statewide support",
      tex: `\\rho=\\sum_{d=1}^{N}p_d=${formatNumber(metrics.rho, 4)},\\qquad \\bar p=\\rho/N=${formatNumber(
        metrics.modelDemShare,
        4,
      )}`,
    },
    {
      label: isInspection ? "Mapped seat total" : "Selected seat total",
      tex: `S(\\mathbf x)=\\sum_{d=1}^{N}x_d=${candidate.demSeats}`,
    },
    {
      label: "District component",
      tex: `\\mathrm{Dist}(\\mathbf x,\\mathbf p)=\\sum_{d=1}^{N}\\delta(x_d,p_d)=${formatNumber(
        candidate.districtLoss,
        4,
      )}`,
    },
    {
      label: "Statewide component",
      tex: `\\mathrm{State}(\\mathbf x,\\mathbf p)=Q\\!\\left(\\left|S(\\mathbf x)-T(\\rho)\\right|\\right)=${formatNumber(
        candidate.statewideLoss,
        4,
      )}`,
    },
    {
      label: "Scaled inputs to F",
      tex: `y_1=(1-w)\\mathrm{Dist}=${formatNumber(
        candidate.districtComponent,
        4,
      )},\\qquad y_2=w\\mathrm{State}=${formatNumber(candidate.statewideComponent, 4)}`,
    },
    {
      label: "Total objective",
      tex: `M(\\mathbf x,\\mathbf p;${formatAdaptiveWeight(w)})=F(y_1,y_2)=${formatNumber(
        candidate.totalLoss,
        4,
      )}`,
    },
  ];

  rows.forEach(({ label, tex }) => {
    const row = document.createElement("div");
    row.className = "calculation-trace-row";
    const name = document.createElement("span");
    name.textContent = label;
    const math = document.createElement("div");
    row.append(name, math);
    els.calculationTrace.append(row);
    renderMath(tex, math, true);
  });
}

function renderLossChart(curve, best, selected) {
  const maxLoss = Math.max(...curve.map((candidate) => candidate.totalLoss), 0.000001);
  const isLinear = isLinearAggregationAst(compiledSpec.aggregation);
  els.lossChartDescription.textContent = isLinear
    ? "Choose any bar to map that allocation. Height is total M; the split shows the inputs added by linear F."
    : "Choose any bar to map that allocation and inspect the two inputs evaluated by F.";
  els.chartLegend.hidden = !isLinear;
  els.lossBars.style.setProperty("--seat-options", String(curve.length));
  els.lossBars.replaceChildren();

  curve.forEach((candidate) => {
    const isBest = candidate.demSeats === best.demSeats;
    const isSelected = candidate.demSeats === selected.demSeats;
    const column = document.createElement("button");
    column.type = "button";
    column.className = `loss-column${isBest ? " is-best" : ""}${
      isSelected ? " is-selected" : ""
    }`;
    column.setAttribute("aria-pressed", String(isSelected));
    if (isBest) column.dataset.optimal = "true";
    column.setAttribute(
      "aria-label",
      `${candidate.demSeats} Democratic seats, total loss ${formatNumber(candidate.totalLoss, 4)}${
        isBest ? ", current optimum" : ""
      }${isSelected ? ", shown on map" : ", choose to show on map"}`,
    );

    const stackWrap = document.createElement("span");
    stackWrap.className = "loss-stack-wrap";
    const stack = document.createElement("span");
    stack.className = "loss-stack";
    const totalHeight = Math.max(3, (candidate.totalLoss / maxLoss) * 168);
    stack.style.height = `${totalHeight}px`;

    if (isLinear) {
      const districtSegment = document.createElement("span");
      districtSegment.className = "loss-segment district";
      const statewideSegment = document.createElement("span");
      statewideSegment.className = "loss-segment statewide";
      const componentTotal = candidate.districtComponent + candidate.statewideComponent;
      const districtShare =
        componentTotal > 1e-12 ? candidate.districtComponent / componentTotal : 1;
      districtSegment.style.height = `${districtShare * 100}%`;
      statewideSegment.style.height = `${(1 - districtShare) * 100}%`;
      stack.append(districtSegment, statewideSegment);
    } else {
      const objectiveSegment = document.createElement("span");
      objectiveSegment.className = "loss-segment objective";
      objectiveSegment.style.height = "100%";
      stack.append(objectiveSegment);
    }

    if (isBest || isSelected) {
      const value = document.createElement("span");
      value.className = "loss-value-label";
      value.textContent = formatNumber(candidate.totalLoss, 3);
      stackWrap.append(value);
    }

    stackWrap.append(stack);
    const seatLabel = document.createElement("small");
    seatLabel.textContent = `${candidate.demSeats}D`;
    column.append(stackWrap, seatLabel);
    const showDetail = () => renderLossDetail(candidate, best, isSelected);
    column.addEventListener("pointerenter", showDetail);
    column.addEventListener("focus", showDetail);
    column.addEventListener("click", () => inspectCandidateOnMap(candidate.demSeats));
    column.addEventListener("pointerleave", renderActiveLossDetail);
    column.addEventListener("blur", renderActiveLossDetail);
    els.lossBars.append(column);
  });

  window.requestAnimationFrame(() => {
    const selectedColumn = els.lossBars.querySelector(".loss-column.is-selected");
    if (!selectedColumn) return;
    const centeredLeft =
      selectedColumn.offsetLeft -
      (els.lossBars.clientWidth - selectedColumn.offsetWidth) / 2;
    els.lossBars.scrollLeft = clamp(
      centeredLeft,
      0,
      Math.max(0, els.lossBars.scrollWidth - els.lossBars.clientWidth),
    );
  });

  renderLossDetail(selected, best, selected.demSeats === best.demSeats);
}

function renderActiveLossDetail() {
  if (!activeModel) return;
  renderLossDetail(
    activeModel.selected,
    activeModel.best,
    activeModel.selected.demSeats === activeModel.best.demSeats,
  );
}

function renderLossDetail(candidate, best, isSelected) {
  const isBest = candidate.demSeats === best.demSeats;
  const inputSummary = isLinearAggregationAst(compiledSpec.aggregation)
    ? `scaled Dist ${formatNumber(candidate.districtComponent, 4)} + scaled State ${formatNumber(
        candidate.statewideComponent,
        4,
      )}`
    : `F(scaled Dist ${formatNumber(
        candidate.districtComponent,
        4,
      )}, scaled State ${formatNumber(candidate.statewideComponent, 4)})`;
  els.lossDetail.textContent = `${candidate.demSeats} D / ${candidate.repSeats} R: M = ${formatNumber(
    candidate.totalLoss,
    4,
  )} from ${inputSummary}; target gap ${formatSignedSeatGap(candidate.targetGap, 2)}${
    isBest
      ? " · current optimum"
      : isSelected
        ? ` · selected on map · ${formatNumber(candidate.totalLoss - best.totalLoss, 4)} above optimum`
        : " · choose this bar to show its allocation"
  }.`;
}

function getSwitchPivotalDistricts(frontier, fromDemSeats, toDemSeats, districts) {
  const from = frontier[fromDemSeats];
  const to = frontier[toDemSeats];
  if (!from || !to) return [];
  return districts
    .map((district, index) => ({
      id: district.id,
      demShare: district.demShare,
      fromParty: from.assignment[index] ? "D" : "R",
      toParty: to.assignment[index] ? "D" : "R",
    }))
    .filter((district) => district.fromParty !== district.toParty);
}

function formatPivotalDistricts(pivots, limit = 3) {
  if (!pivots.length) return "no district assignment changes";
  const visible = pivots.slice(0, limit).map(
    (district) =>
      `District ${district.id} (${formatPercent(district.demShare, 1)} D, ${
        district.fromParty
      } to ${district.toParty})`,
  );
  const remaining = pivots.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? `, plus ${remaining} more` : ""}`;
}

function renderSwitchSchedule(
  schedule,
  w,
  totalSeats,
  preferredDemSeats,
  frontier,
  districts,
) {
  const switchTotal = schedule.switches.length;
  const schedulePrecision =
    schedule.source === "dataset"
      ? "Switch points use the weights supplied for this election in the dataset."
      : isLinearAggregationAst(compiledSpec.aggregation)
        ? "Switch points computed exactly for the linear objective."
        : "Nonlinear crossings are numerically approximated.";
  els.switchCount.textContent = switchTotal
    ? `${switchTotal} ${
        switchTotal === 1 ? "breakpoint" : "breakpoints"
      } on the unit interval. ${schedulePrecision} Adjacent closed regimes share each breakpoint because both seat totals are optimal there.`
    : "No breakpoints on the unit interval; the same seat allocation remains optimal throughout.";
  els.switchSchedule.replaceChildren();
  const current = findCurrentRegime(schedule.segments, w, preferredDemSeats);

  schedule.segments.forEach((segment, index) => {
    const pivots =
      index > 0
        ? getSwitchPivotalDistricts(
            frontier,
            schedule.segments[index - 1].demSeats,
            segment.demSeats,
            districts,
          )
        : [];
    const row = document.createElement("button");
    row.type = "button";
    row.className = `switch-row${segment === current ? " is-current" : ""}`;
    row.setAttribute("aria-pressed", String(segment === current));
    row.setAttribute(
      "aria-label",
      `${formatInterval(segment)}, ${formatSeatCount(
        segment.demSeats,
        totalSeats,
      )}${index > 0 ? `. Pivotal assignments: ${formatPivotalDistricts(pivots)}` : ""}. Choose this regime to update the statewide weight and map.`,
    );

    const interval = document.createElement("span");
    interval.className = "switch-interval";
    interval.textContent = formatInterval(segment);

    const seats = document.createElement("span");
    seats.className = "switch-seat";
    seats.textContent = formatSeatCount(segment.demSeats, totalSeats);
    row.append(interval, seats);

    if (index > 0) {
      const marker = document.createElement("span");
      marker.className = "switch-marker";
      const relativeWeight =
        segment.start >= 1 - 1e-10
          ? "∞"
          : formatNumber(segment.start / (1 - segment.start), 4);
      marker.textContent = `${
        isLinearAggregationAst(compiledSpec.aggregation) ? "At" : "Approximately at"
      } w = ${formatSwitchWeight(
        segment.start,
      )} (φ = ${relativeWeight}): ${formatSeatCount(
        schedule.segments[index - 1].demSeats,
        totalSeats,
      )} → ${formatSeatCount(segment.demSeats, totalSeats)}`;
      row.append(marker);

      const pivot = document.createElement("span");
      pivot.className = "switch-pivots";
      pivot.textContent = `Pivotal assignments: ${formatPivotalDistricts(pivots)}`;
      row.append(pivot);
    }

    row.addEventListener("click", () => selectWeightRegime(segment));
    els.switchSchedule.append(row);
  });
}

function renderPaperFigures(districts, metrics, frontier, best, selected, schedule, w) {
  renderIsoLossFigure(districts, metrics, frontier, best, selected, w);
  renderParetoFigure(districts, metrics, frontier, best, selected);
  renderThresholdFigure(districts, metrics, frontier, schedule, w);
  renderSeatPathFigure(districts, metrics, frontier, schedule, best, w);
}

function getPaperFigureCacheKey() {
  return [
    getActiveScenarioCacheKey(),
    ...Object.keys(defaultFormulas).map((name) => activeFormulas[name]),
  ].join("||");
}

function getFeasibleLossPairs(districts, metrics) {
  const key = getPaperFigureCacheKey();
  if (!feasibleLossCache.has(key)) {
    feasibleLossCache.set(key, {
      ...computeFeasibleLossPairs(districts, metrics, compiledSpec),
      cacheKey: key,
    });
    trimCache(feasibleLossCache, 4);
  }
  return feasibleLossCache.get(key);
}

function computeFeasibleLossPairs(districts, metrics, spec) {
  const totalSeats = districts.length;
  const totalAllocationCount = 2 ** totalSeats;
  const isSampled = totalSeats > MAX_EXHAUSTIVE_ALLOCATION_SEATS;
  const allocationCount = isSampled
    ? Math.min(SAMPLED_ALLOCATION_COUNT, totalAllocationCount)
    : totalAllocationCount;
  const costD = districts.map((district) =>
    asNonnegativeScalar(
      evaluateAst(spec.districtLossA, { p: district.demShare }),
      "district loss",
    ),
  );
  const costR = districts.map((district) =>
    asNonnegativeScalar(
      evaluateAst(spec.districtLossB, { p: district.demShare }),
      "district loss",
    ),
  );
  const targetSeatCount = asFiniteScalar(
    evaluateAst(spec.stateTarget, { rho: metrics.rho, N: metrics.totalSeats }),
    "statewide target",
  );
  const statewideBySeats = Array.from({ length: totalSeats + 1 }, (_, demSeats) =>
    asNonnegativeScalar(
      evaluateAst(spec.stateLoss, {
        z: Math.abs(demSeats - targetSeatCount),
        N: totalSeats,
      }),
      "statewide loss",
    ),
  );
  const districtLosses = new Float64Array(allocationCount);
  const statewideLosses = new Float64Array(allocationCount);
  const seatTotals = new Uint8Array(allocationCount);
  const switchMargins = costD.map((value, index) => value - costR[index]);
  const allRepDistrictLoss = costR.reduce((total, value) => total + value, 0);

  if (isSampled) {
    const observed = districts.map((district) => district.winner === "D");
    const rng = mulberry32(
      hashString(
        `${totalSeats}|${costD.map((value) => value.toPrecision(12)).join("|")}|${costR
          .map((value) => value.toPrecision(12))
          .join("|")}`,
      ),
    );
    for (let sample = 0; sample < allocationCount; sample += 1) {
      let demSeats = 0;
      let districtLoss = 0;
      for (let index = 0; index < totalSeats; index += 1) {
        const assignedD =
          sample === 0
            ? false
            : sample === 1
              ? true
              : sample === 2
                ? observed[index]
                : rng() >= 0.5;
        demSeats += assignedD ? 1 : 0;
        districtLoss += assignedD ? costD[index] : costR[index];
      }
      seatTotals[sample] = demSeats;
      districtLosses[sample] = districtLoss;
      statewideLosses[sample] = statewideBySeats[demSeats];
    }
  } else {
    districtLosses[0] = allRepDistrictLoss;
    statewideLosses[0] = statewideBySeats[0];
    for (let mask = 1; mask < allocationCount; mask += 1) {
      const changedBit = mask & -mask;
      const districtIndex = 31 - Math.clz32(changedBit);
      const previousMask = mask ^ changedBit;
      const demSeats = seatTotals[previousMask] + 1;
      seatTotals[mask] = demSeats;
      districtLosses[mask] = districtLosses[previousMask] + switchMargins[districtIndex];
      statewideLosses[mask] = statewideBySeats[demSeats];
    }
  }

  const minDistrict = isSampled
    ? costD.reduce((total, value, index) => total + Math.min(value, costR[index]), 0)
    : districtLosses.reduce((minimum, value) => Math.min(minimum, value), Infinity);
  const maxDistrict = isSampled
    ? costD.reduce((total, value, index) => total + Math.max(value, costR[index]), 0)
    : districtLosses.reduce((maximum, value) => Math.max(maximum, value), -Infinity);
  const minStatewide = Math.min(...statewideBySeats);
  const maxStatewide = Math.max(...statewideBySeats);

  return {
    allocationCount,
    totalAllocationCount,
    isSampled,
    districtLosses,
    statewideLosses,
    seatTotals,
    targetSeatCount,
    bounds: { minDistrict, maxDistrict, minStatewide, maxStatewide },
  };
}

function computeParetoSeatPoints(frontier, metrics, spec) {
  const points = buildObjectiveCurve(frontier, metrics, 0, spec).map((candidate) => ({
    ...candidate,
    isPareto: false,
  }));
  const tolerance = 1e-10;
  points.forEach((candidate) => {
    candidate.isPareto = !points.some(
      (alternative) =>
        alternative !== candidate &&
        alternative.districtLoss <= candidate.districtLoss + tolerance &&
        alternative.statewideLoss <= candidate.statewideLoss + tolerance &&
        (alternative.districtLoss < candidate.districtLoss - tolerance ||
          alternative.statewideLoss < candidate.statewideLoss - tolerance),
    );
  });
  return points;
}

function getSeatPointLabelSet(points, metrics, best, selected, paretoPoints = []) {
  const labels = new Set();
  const addSeat = (value) => {
    if (Number.isInteger(value) && value >= 0 && value <= metrics.totalSeats) {
      labels.add(value);
    }
  };
  const bySeats = [...points].sort((first, second) => first.demSeats - second.demSeats);
  const paretoBySeats = [...paretoPoints].sort(
    (first, second) => first.demSeats - second.demSeats,
  );

  [
    bySeats[0]?.demSeats,
    bySeats.at(-1)?.demSeats,
    paretoBySeats[0]?.demSeats,
    paretoBySeats.at(-1)?.demSeats,
    metrics.demSeats,
    metrics.proportionalDemSeats,
    best?.demSeats,
    selected?.demSeats,
  ].forEach(addSeat);

  const cadence =
    metrics.totalSeats <= 18
      ? 1
      : metrics.totalSeats <= 30
        ? 2
        : metrics.totalSeats <= 44
          ? 4
          : 5;
  if (cadence === 1) {
    points.forEach((candidate) => addSeat(candidate.demSeats));
    return labels;
  }

  const specialSeats = [...labels];
  const specialClearance = Math.max(1, cadence - 2);
  points.forEach((candidate) => {
    if (candidate.demSeats % cadence !== 0) return;
    const crowdsSpecialLabel = specialSeats.some(
      (seat) =>
        seat !== candidate.demSeats &&
        Math.abs(seat - candidate.demSeats) <= specialClearance,
    );
    if (!crowdsSpecialLabel) addSeat(candidate.demSeats);
  });
  return labels;
}

function renderIsoLossFigure(districts, metrics, frontier, best, selected, w) {
  const paretoFlags = computeParetoSeatPoints(frontier, metrics, compiledSpec);
  const points = buildObjectiveCurve(frontier, metrics, w, compiledSpec).map(
    (candidate, index) => ({
      ...candidate,
      isPareto: paretoFlags[index].isPareto,
    }),
  );
  const paretoPoints = points
    .filter((candidate) => candidate.isPareto)
    .sort(
      (first, second) =>
        first.districtLoss - second.districtLoss ||
        second.statewideLoss - first.statewideLoss,
    );
  const selectedPoint = points.find((candidate) => candidate.demSeats === selected.demSeats);
  const dominated = points
    .filter((candidate) => !candidate.isPareto)
    .sort(
      (first, second) =>
        Math.abs(first.demSeats - best.demSeats) - Math.abs(second.demSeats - best.demSeats) ||
        first.totalLoss - second.totalLoss,
    );
  const comparison =
    selected.demSeats !== best.demSeats
      ? selectedPoint
      : dominated[0] ||
        points
          .filter((candidate) => candidate.demSeats !== best.demSeats)
          .sort((first, second) => first.totalLoss - second.totalLoss)[0];
  const domainPoints = [...paretoPoints, best, selectedPoint, comparison].filter(Boolean);
  const xView = getAdaptiveNonnegativeAxisView(
    domainPoints.map((candidate) => candidate.districtLoss),
  );
  const xDomain = xView.domain;
  const yDomain = paddedNonnegativeDomain(
    Math.min(...domainPoints.map((candidate) => candidate.statewideLoss)),
    Math.max(...domainPoints.map((candidate) => candidate.statewideLoss)),
  );
  const scales = chartScales(xDomain, yDomain);
  const priorIsoPoint = els.isoLossChart.querySelector(
    '.iso-seat-point[tabindex="0"]',
  );
  const focusedIsoElement = document.activeElement;
  const focusedIsoSeat = focusedIsoElement?.classList?.contains("iso-seat-point")
    ? focusedIsoElement.dataset.seatTotal
    : null;
  const isoRovingSeat =
    focusedIsoSeat || priorIsoPoint?.dataset.seatTotal || String(selected.demSeats);
  const restoreIsoFocus = Boolean(focusedIsoSeat);

  els.isoLossChart.dataset.xMinimum = String(xDomain[0]);
  els.isoLossChart.dataset.xMaximum = String(xDomain[1]);
  els.isoLossChart.replaceChildren();
  appendChartAxes(els.isoLossChart, xDomain, yDomain, {
    xLabel: "District loss  Dist(x,p)",
    yLabel: "Statewide loss  State(x,p)",
    xFormatter: (value) => formatNumber(value, xView.digits),
    yFormatter: (value) => formatNumber(value, 2),
    xTicks: xView.ticks,
  });

  const comparisonLevel = comparison?.totalLoss;
  if (Number.isFinite(comparisonLevel) && Math.abs(comparisonLevel - best.totalLoss) > 1e-9) {
    appendIsoContour(
      els.isoLossChart,
      xDomain,
      yDomain,
      comparisonLevel,
      w,
      compiledSpec,
      scales,
      "iso-contour-path is-comparison",
    );
  }
  appendIsoContour(
    els.isoLossChart,
    xDomain,
    yDomain,
    best.totalLoss,
    w,
    compiledSpec,
    scales,
    "iso-contour-path is-current",
  );

  if (paretoPoints.length > 1) {
    const path = paretoPoints
      .map(
        (candidate, index) =>
          `${index ? "L" : "M"} ${scales.x(candidate.districtLoss)} ${scales.y(
            candidate.statewideLoss,
          )}`,
      )
      .join(" ");
    els.isoLossChart.append(
      makeSvgElement("path", { d: path, class: "iso-frontier-path" }),
    );
  }

  const visiblePoints = points.filter(
    (candidate) =>
      candidate.districtLoss >= xDomain[0] &&
      candidate.districtLoss <= xDomain[1] &&
      candidate.statewideLoss >= yDomain[0] &&
      candidate.statewideLoss <= yDomain[1],
  );
  const labelSeatTotals = getSeatPointLabelSet(
    visiblePoints,
    metrics,
    best,
    selected,
    paretoPoints,
  );
  if (comparison) labelSeatTotals.add(comparison.demSeats);
  const resetDetail = () => renderIsoLossDetail(selectedPoint || best, best, selected, w);
  visiblePoints.forEach((candidate) => {
    const x = scales.x(candidate.districtLoss);
    const y = scales.y(candidate.statewideLoss);
    const group = makeSvgElement("g", {
      class: `iso-seat-point ${candidate.isPareto ? "is-pareto" : "is-dominated"}`,
      role: "button",
      tabindex: String(candidate.demSeats) === isoRovingSeat ? "0" : "-1",
      "data-seat-total": String(candidate.demSeats),
      "aria-label": `${candidate.demSeats} Democratic seats. District loss ${formatNumber(
        candidate.districtLoss,
        3,
      )}; statewide loss ${formatNumber(
        candidate.statewideLoss,
        3,
      )}; total misrepresentation ${formatNumber(candidate.totalLoss, 4)}. Show on map.`,
    });
    const pointElements = [
      makeSvgElement("circle", {
        cx: x,
        cy: y,
        r: candidate.isPareto ? 7 : 5,
        class: "iso-seat-mark",
      }),
    ];
    if (labelSeatTotals.has(candidate.demSeats)) {
      pointElements.push(makeSvgElement(
        "text",
        { x: x + 10, y: y - 8, class: "iso-seat-label" },
        String(candidate.demSeats),
      ));
    }
    pointElements.push(makeSvgElement("circle", {
        cx: x,
        cy: y,
        r: 16,
        class: "figure-hit-target",
      }));
    group.append(...pointElements);
    const showDetail = () => renderIsoLossDetail(candidate, best, selected, w);
    const choosePoint = () => inspectCandidateFromFigure(candidate.demSeats);
    group.addEventListener("pointerenter", showDetail);
    group.addEventListener("focus", showDetail);
    group.addEventListener("pointerleave", resetDetail);
    group.addEventListener("blur", resetDetail);
    group.addEventListener("click", choosePoint);
    group.addEventListener("keydown", (event) => {
      if (moveRovingSvgFocus(event, els.isoLossChart, ".iso-seat-point")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choosePoint();
    });
    els.isoLossChart.append(group);
  });

  if (selected.demSeats !== best.demSeats) {
    els.isoLossChart.append(
      makeSvgElement("circle", {
        cx: scales.x(selectedPoint.districtLoss),
        cy: scales.y(selectedPoint.statewideLoss),
        r: 12,
        class: "iso-inspection-ring",
      }),
    );
  }
  els.isoLossChart.append(
    makeSvgElement("circle", {
      cx: scales.x(best.districtLoss),
      cy: scales.y(best.statewideLoss),
      r: 13,
      class: "iso-optimum-ring",
    }),
  );
  if (restoreIsoFocus) {
    window.requestAnimationFrame(() => {
      const focusTarget = Array.from(
        els.isoLossChart.querySelectorAll(".iso-seat-point"),
      ).find((point) => point.dataset.seatTotal === focusedIsoSeat);
      focusTarget?.focus({ preventScroll: true });
    });
  }

  els.figure1Mode.textContent = isLinearAggregationAst(compiledSpec.aggregation)
    ? "Linear objective contours"
    : "Nonlinear objective contours";
  els.figure1Current.textContent = formatSeatCount(best.demSeats, metrics.totalSeats);
  els.figure1Objective.textContent = formatNumber(best.totalLoss, 5);
  els.figure1Comparison.textContent = comparison
    ? formatSeatCount(comparison.demSeats, metrics.totalSeats)
    : "None";
  resetDetail();
}

function renderIsoLossDetail(candidate, best, selected, w) {
  if (!candidate) return;
  const statuses = [];
  statuses.push(candidate.isPareto ? "Pareto-efficient" : "Pareto-dominated");
  if (candidate.demSeats === best.demSeats) statuses.push("optimal at this weight");
  if (candidate.demSeats === selected.demSeats) statuses.push("shown on the map");
  els.figure1Detail.textContent = `At w = ${formatAdaptiveWeight(w)}, ${formatSeatCount(
    candidate.demSeats,
    candidate.demSeats + candidate.repSeats,
  )} has Dist = ${formatNumber(candidate.districtLoss, 4)}, State = ${formatNumber(
    candidate.statewideLoss,
    4,
  )}, and M = ${formatNumber(candidate.totalLoss, 5)}; ${statuses.join(
    ", ",
  )}. The teal contour is the lowest displayed objective level that reaches the frontier.`;
}

function appendIsoContour(svg, xDomain, yDomain, level, w, spec, scales, className) {
  const path = buildIsoContourPath(xDomain, yDomain, level, w, spec, scales);
  if (path) svg.append(makeSvgElement("path", { d: path, class: className }));
}

function buildIsoContourPath(
  xDomain,
  yDomain,
  level,
  w,
  spec,
  scales,
  columns = 72,
  rows = 52,
) {
  const values = Array.from({ length: rows + 1 }, (_, row) => {
    const statewideLoss = yDomain[0] + ((yDomain[1] - yDomain[0]) * row) / rows;
    return Array.from({ length: columns + 1 }, (_, column) => {
      const districtLoss = xDomain[0] + ((xDomain[1] - xDomain[0]) * column) / columns;
      try {
        const value = evaluateAst(spec.aggregation, {
          y1: (1 - w) * districtLoss,
          y2: w * statewideLoss,
        });
        return Number.isFinite(value) ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    });
  });
  const edgePairs = {
    1: [[3, 0]],
    2: [[0, 1]],
    3: [[3, 1]],
    4: [[1, 2]],
    5: [[3, 2], [0, 1]],
    6: [[0, 2]],
    7: [[3, 2]],
    8: [[2, 3]],
    9: [[0, 2]],
    10: [[0, 3], [1, 2]],
    11: [[1, 2]],
    12: [[1, 3]],
    13: [[0, 1]],
    14: [[3, 0]],
  };
  const segments = [];

  for (let row = 0; row < rows; row += 1) {
    const y0 = yDomain[0] + ((yDomain[1] - yDomain[0]) * row) / rows;
    const y1 = yDomain[0] + ((yDomain[1] - yDomain[0]) * (row + 1)) / rows;
    for (let column = 0; column < columns; column += 1) {
      const x0 = xDomain[0] + ((xDomain[1] - xDomain[0]) * column) / columns;
      const x1 = xDomain[0] + ((xDomain[1] - xDomain[0]) * (column + 1)) / columns;
      const cellValues = [
        values[row][column],
        values[row][column + 1],
        values[row + 1][column + 1],
        values[row + 1][column],
      ];
      if (cellValues.some((value) => !Number.isFinite(value))) continue;
      const cellPoints = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const mask = cellValues.reduce(
        (total, value, index) => total | (value >= level ? 1 << index : 0),
        0,
      );
      const pairs = edgePairs[mask];
      if (!pairs) continue;
      const edgePoint = (edge) => {
        const corners = [[0, 1], [1, 2], [2, 3], [3, 0]][edge];
        const [firstIndex, secondIndex] = corners;
        const firstValue = cellValues[firstIndex];
        const secondValue = cellValues[secondIndex];
        const denominator = secondValue - firstValue;
        const amount =
          Math.abs(denominator) < 1e-12
            ? 0.5
            : clamp((level - firstValue) / denominator, 0, 1);
        return [
          cellPoints[firstIndex][0] +
            (cellPoints[secondIndex][0] - cellPoints[firstIndex][0]) * amount,
          cellPoints[firstIndex][1] +
            (cellPoints[secondIndex][1] - cellPoints[firstIndex][1]) * amount,
        ];
      };
      pairs.forEach(([firstEdge, secondEdge]) => {
        const first = edgePoint(firstEdge);
        const second = edgePoint(secondEdge);
        segments.push(
          `M ${scales.x(first[0])} ${scales.y(first[1])} L ${scales.x(
            second[0],
          )} ${scales.y(second[1])}`,
        );
      });
    }
  }
  return segments.join(" ");
}

function renderParetoFigure(districts, metrics, frontier, best, selected) {
  const feasible = getFeasibleLossPairs(districts, metrics);
  const topSeatPoints = computeParetoSeatPoints(frontier, metrics, compiledSpec);
  const paretoPoints = topSeatPoints
    .filter((candidate) => candidate.isPareto)
    .sort(
      (first, second) =>
        first.districtLoss - second.districtLoss ||
        second.statewideLoss - first.statewideLoss,
    );
  const displayedDistrictLosses = topSeatPoints.map(
    (candidate) => candidate.districtLoss,
  );
  for (const districtLoss of feasible.districtLosses) {
    displayedDistrictLosses.push(districtLoss);
  }
  const xView = getAdaptiveNonnegativeAxisView(displayedDistrictLosses);
  const xDomain = xView.domain;
  const yDomain = paddedNonnegativeDomain(
    feasible.bounds.minStatewide,
    feasible.bounds.maxStatewide,
  );
  const scales = chartScales(xDomain, yDomain);
  const priorParetoPoint = els.paretoOverlay.querySelector(
    '.pareto-seat-point[tabindex="0"]',
  );
  const focusedParetoElement = document.activeElement;
  const focusedParetoSeat = focusedParetoElement?.classList?.contains("pareto-seat-point")
    ? focusedParetoElement.dataset.seatTotal
    : null;
  const paretoRovingSeat =
    focusedParetoSeat || priorParetoPoint?.dataset.seatTotal || String(selected.demSeats);
  const restoreParetoFocus = Boolean(focusedParetoSeat);

  drawFeasibleAllocationCanvas(feasible, scales, xDomain, yDomain);
  els.paretoOverlay.dataset.xMinimum = String(xDomain[0]);
  els.paretoOverlay.dataset.xMaximum = String(xDomain[1]);
  els.paretoOverlay.replaceChildren();
  appendChartAxes(els.paretoOverlay, xDomain, yDomain, {
    xLabel: "District loss  Dist(x,p)",
    yLabel: "Statewide loss  State(x,p)",
    xFormatter: (value) => formatNumber(value, xView.digits),
    yFormatter: (value) => formatNumber(value, 2),
    xTicks: xView.ticks,
  });

  if (paretoPoints.length > 1) {
    const path = paretoPoints
      .map(
        (candidate, index) =>
          `${index ? "L" : "M"} ${scales.x(candidate.districtLoss)} ${scales.y(
            candidate.statewideLoss,
          )}`,
      )
      .join(" ");
    els.paretoOverlay.append(
      makeSvgElement("path", { d: path, class: "pareto-frontier-path" }),
    );
  }

  const labelSeatTotals = getSeatPointLabelSet(
    topSeatPoints,
    metrics,
    best,
    selected,
    paretoPoints,
  );
  topSeatPoints.forEach((candidate) => {
    const x = scales.x(candidate.districtLoss);
    const y = scales.y(candidate.statewideLoss);
    const group = makeSvgElement("g", {
      class: `pareto-seat-point${candidate.isPareto ? " is-pareto" : ""}`,
      role: "button",
      tabindex: String(candidate.demSeats) === paretoRovingSeat ? "0" : "-1",
      "data-seat-total": String(candidate.demSeats),
      "aria-label": `${candidate.demSeats} Democratic seats. District loss ${formatNumber(
        candidate.districtLoss,
        3,
      )}; statewide loss ${formatNumber(candidate.statewideLoss, 3)}. Show on map.`,
    });
    const pointElements = [
      candidate.isPareto
        ? makeSvgElement("rect", {
            x: x - 6,
            y: y - 6,
            width: 12,
            height: 12,
            rx: 1,
            class: "pareto-efficient-mark",
          })
        : makeSvgElement("circle", {
            cx: x,
            cy: y,
            r: 5.5,
            class: "pareto-top-seat-mark",
          }),
    ];
    if (labelSeatTotals.has(candidate.demSeats)) {
      pointElements.push(makeSvgElement(
        "text",
        {
          x: x + 9,
          y: y - 7,
          class: "pareto-seat-label",
        },
        String(candidate.demSeats),
      ));
    }
    pointElements.push(makeSvgElement("circle", {
        cx: x,
        cy: y,
        r: 15,
        class: "figure-hit-target",
      }));
    group.append(...pointElements);
    const showDetail = () => renderParetoDetail(candidate, best, selected);
    const choosePoint = () => inspectCandidateFromFigure(candidate.demSeats);
    group.addEventListener("pointerenter", showDetail);
    group.addEventListener("focus", showDetail);
    group.addEventListener("pointerleave", () =>
      renderParetoDetail(
        topSeatPoints.find((point) => point.demSeats === selected.demSeats),
        best,
        selected,
      ),
    );
    group.addEventListener("blur", () =>
      renderParetoDetail(
        topSeatPoints.find((point) => point.demSeats === selected.demSeats),
        best,
        selected,
      ),
    );
    group.addEventListener("click", choosePoint);
    group.addEventListener("keydown", (event) => {
      if (moveRovingSvgFocus(event, els.paretoOverlay, ".pareto-seat-point")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choosePoint();
    });
    els.paretoOverlay.append(group);
  });

  if (selected.demSeats !== best.demSeats) {
    const optimumPoint = topSeatPoints.find((point) => point.demSeats === best.demSeats);
    els.paretoOverlay.append(
      makeSvgElement("circle", {
        cx: scales.x(optimumPoint.districtLoss),
        cy: scales.y(optimumPoint.statewideLoss),
        r: 11,
        class: "pareto-optimum-ring",
      }),
    );
  }
  const selectedPoint = topSeatPoints.find((point) => point.demSeats === selected.demSeats);
  els.paretoOverlay.append(
    makeSvgElement("circle", {
      cx: scales.x(selectedPoint.districtLoss),
      cy: scales.y(selectedPoint.statewideLoss),
      r: 12,
      class: "pareto-current-ring",
    }),
  );
  if (restoreParetoFocus) {
    window.requestAnimationFrame(() => {
      const focusTarget = Array.from(
        els.paretoOverlay.querySelectorAll(".pareto-seat-point"),
      ).find((point) => point.dataset.seatTotal === focusedParetoSeat);
      focusTarget?.focus({ preventScroll: true });
    });
  }

  els.figure2Count.textContent = feasible.isSampled
    ? `${formatCompact(feasible.allocationCount)} sampled / ${formatCompact(
        feasible.totalAllocationCount >= 1e15
          ? feasible.totalAllocationCount / 1e15
          : feasible.totalAllocationCount,
      )}${feasible.totalAllocationCount >= 1e15 ? " quadrillion" : ""} total`
    : formatCompact(feasible.totalAllocationCount);
  els.figure2ParetoCount.textContent = String(paretoPoints.length);
  els.figure2Current.textContent = formatSeatCount(selected.demSeats, metrics.totalSeats);
  renderParetoDetail(selectedPoint, best, selected);
}

function drawFeasibleAllocationCanvas(feasible, scales, xDomain, yDomain) {
  const canvas = els.paretoCanvas;
  const renderKey = `${feasible.cacheKey}|${xDomain.join(":")}|${yDomain.join(":")}|${
    window.devicePixelRatio || 1
  }`;
  if (canvas.dataset.renderKey === renderKey) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(PAPER_CHART.width * pixelRatio);
  canvas.height = Math.round(PAPER_CHART.height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, PAPER_CHART.width, PAPER_CHART.height);
  context.fillStyle = "rgba(85, 127, 174, 0.24)";
  const pointSize = feasible.allocationCount > 80000 ? 1.15 : 1.5;
  for (let index = 0; index < feasible.allocationCount; index += 1) {
    context.fillRect(
      scales.x(feasible.districtLosses[index]) - pointSize / 2,
      scales.y(feasible.statewideLosses[index]) - pointSize / 2,
      pointSize,
      pointSize,
    );
  }
  canvas.dataset.renderKey = renderKey;
}

function renderParetoDetail(candidate, best, selected) {
  if (!candidate) return;
  const statuses = [];
  if (candidate.isPareto) statuses.push("Pareto-efficient");
  if (candidate.demSeats === best.demSeats) statuses.push("optimal at the current weight");
  if (candidate.demSeats === selected.demSeats) statuses.push("shown on the map");
  els.figure2Detail.textContent = `${candidate.demSeats} D / ${candidate.repSeats} R has Dist = ${formatNumber(
    candidate.districtLoss,
    4,
  )} and State = ${formatNumber(candidate.statewideLoss, 4)}${
    statuses.length ? `; ${statuses.join(" and ")}` : ""
  }. Choose a labeled point to inspect its district assignment above.`;
}

function getOptimalThresholdSeries(districts, metrics, frontier) {
  const key = getPaperFigureCacheKey();
  if (!thresholdSeriesCache.has(key)) {
    thresholdSeriesCache.set(
      key,
      computeOptimalThresholdSeries(districts, metrics, frontier, compiledSpec),
    );
    trimCache(thresholdSeriesCache, 4);
  }
  return thresholdSeriesCache.get(key);
}

function computeOptimalThresholdSeries(districts, metrics, frontier, spec, sampleCount = 960) {
  const districtOptimum = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, 0, spec));
  const stateOptimum = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, 1, spec));
  const direction = Math.sign(stateOptimum.demSeats - districtOptimum.demSeats);
  const party = direction < 0 ? "R" : "D";
  const sortedShares = districts
    .map((district) => (party === "D" ? district.demShare : district.repShare))
    .sort((first, second) => second - first);
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) =>
    computeOptimalThresholdAtWeight(
      frontier,
      metrics,
      spec,
      index / sampleCount,
      districtOptimum.demSeats,
      stateOptimum.demSeats,
      sortedShares,
      party,
    ),
  );
  return {
    samples,
    sortedShares,
    direction,
    party,
    districtOptimum,
    stateOptimum,
  };
}

function getWeightFigureView(schedule, preferFocused = true, anchorWeight = null) {
  const fullView = {
    xDomain: [0, 1],
    xTicks: evenTicks(0, 1, 5),
    xDigits: 2,
    focused: false,
  };
  if (!preferFocused) return fullView;

  const firstSwitch = Number(schedule?.switches?.[0]?.weight);
  if (!Number.isFinite(firstSwitch)) return fullView;
  const hasAnchor =
    anchorWeight !== null &&
    anchorWeight !== undefined &&
    anchorWeight !== "" &&
    Number.isFinite(Number(anchorWeight));
  const resolvedAnchor = hasAnchor
    ? clamp(Number(anchorWeight), 0, 1)
    : firstSwitch;
  const precision = getAdaptiveWeightPrecision(schedule, resolvedAnchor, null);
  const focusDomain = getSwitchFocusDomain(
    schedule,
    resolvedAnchor,
    null,
    precision.step,
  );
  if (!isWeightWithinFocusDomain(focusDomain, resolvedAnchor)) return fullView;
  const xMinimum = 0;
  const xMaximum = focusDomain.max;
  const xDigits = Math.max(3, focusDomain.digits);

  return {
    xDomain: [xMinimum, xMaximum],
    xTicks: evenTicks(xMinimum, xMaximum, 5),
    xDigits,
    focused: true,
  };
}

function getThresholdFigureView(_series, schedule, preferFocused = true, anchorWeight = null) {
  return getWeightFigureView(schedule, preferFocused, anchorWeight);
}

function getThresholdPlotSamples(series, schedule, frontier, metrics, xDomain) {
  const [xMinimum, xMaximum] = xDomain;
  const sampleWeights = series.samples
    .filter(
      (sample) => sample.weight >= xMinimum - 1e-10 && sample.weight <= xMaximum + 1e-10,
    )
    .map((sample) => sample.weight);
  const switchWeights = (schedule?.switches || [])
    .map((item) => item.weight)
    .filter((weight) => weight >= xMinimum - 1e-10 && weight <= xMaximum + 1e-10);
  const weights = [xMinimum, ...sampleWeights, ...switchWeights, xMaximum]
    .sort((first, second) => first - second)
    .filter((weight, index, list) => index === 0 || Math.abs(weight - list[index - 1]) > 1e-10);
  const cachedSamples = new Map(
    series.samples.map((sample) => [sample.weight.toFixed(10), sample]),
  );

  return weights.map((weight) =>
    cachedSamples.get(weight.toFixed(10)) ||
    computeOptimalThresholdAtWeight(
      frontier,
      metrics,
      compiledSpec,
      weight,
      series.districtOptimum.demSeats,
      series.stateOptimum.demSeats,
      series.sortedShares,
      series.party,
    ),
  );
}

function computeOptimalThresholdAtWeight(
  frontier,
  metrics,
  spec,
  weight,
  districtOptimumDemSeats,
  stateOptimumDemSeats,
  sortedShares,
  party = "D",
) {
  const best = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, weight, spec));
  const totalSeats = metrics.totalSeats;
  const partySeats = party === "D" ? best.demSeats : totalSeats - best.demSeats;
  const districtOptimumPartySeats =
    party === "D" ? districtOptimumDemSeats : totalSeats - districtOptimumDemSeats;
  const stateOptimumPartySeats =
    party === "D" ? stateOptimumDemSeats : totalSeats - stateOptimumDemSeats;
  const hasReachedStateOptimum =
    districtOptimumPartySeats === stateOptimumPartySeats ||
    partySeats >= stateOptimumPartySeats;
  let rawThreshold;
  let adjacentLowerSeat = null;

  if (hasReachedStateOptimum) {
    rawThreshold = implementingCutoff(partySeats, sortedShares);
  } else {
    adjacentLowerSeat = partySeats;
    rawThreshold = computeAdjacentThreshold(
      frontier,
      metrics,
      spec,
      adjacentLowerSeat,
      weight,
      party,
    );
  }
  const threshold = projectToImplementingCutoff(rawThreshold, partySeats, sortedShares);

  return {
    weight,
    threshold: clamp(threshold, 0, 1),
    rawThreshold: clamp(rawThreshold, 0, 1),
    projected: Math.abs(threshold - rawThreshold) > 1e-7,
    demSeats: best.demSeats,
    partySeats,
    party,
    terminal: hasReachedStateOptimum,
    adjacentLowerSeat,
  };
}

function computeAdjacentThreshold(frontier, metrics, spec, lowerSeatCount, weight, party = "D") {
  const totalSeats = frontier.length - 1;
  if (lowerSeatCount < 0) return 1;
  if (lowerSeatCount >= totalSeats) return 0;
  const prepared = buildObjectiveCurve(frontier, metrics, 0, spec);
  const lowerDemSeats = party === "D" ? lowerSeatCount : totalSeats - lowerSeatCount;
  const upperDemSeats = party === "D" ? lowerSeatCount + 1 : totalSeats - lowerSeatCount - 1;
  const lower = prepared[lowerDemSeats];
  const upper = prepared[upperDemSeats];
  const lowerScore = evaluateAst(spec.aggregation, {
    y1: (1 - weight) * lower.districtLoss,
    y2: weight * lower.statewideLoss,
  });
  const scoreDifference = (share) => {
    const demShare = party === "D" ? share : 1 - share;
    const districtLossD = evaluateAst(spec.districtLossA, { p: demShare });
    const districtLossR = evaluateAst(spec.districtLossB, { p: demShare });
    const switchMargin = party === "D"
      ? districtLossD - districtLossR
      : districtLossR - districtLossD;
    const upperDistrictLoss = Math.max(0, lower.districtLoss + switchMargin);
    return (
      evaluateAst(spec.aggregation, {
        y1: (1 - weight) * upperDistrictLoss,
        y2: weight * upper.statewideLoss,
      }) - lowerScore
    );
  };
  const atZero = scoreDifference(0);
  const atOne = scoreDifference(1);
  if (atZero <= 1e-12) return 0;
  if (atOne > 1e-12) return 1;

  let lowerShare = 0;
  let upperShare = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (lowerShare + upperShare) / 2;
    if (scoreDifference(midpoint) <= 0) {
      upperShare = midpoint;
    } else {
      lowerShare = midpoint;
    }
  }
  return (lowerShare + upperShare) / 2;
}

function implementingCutoff(demSeats, sortedShares) {
  if (demSeats <= 0) return 1;
  if (demSeats >= sortedShares.length) return 0;
  return sortedShares[demSeats - 1];
}

function projectToImplementingCutoff(rawThreshold, partySeats, sortedShares) {
  if (partySeats <= 0) {
    return Math.max(rawThreshold, Math.min(1, sortedShares[0] + 1e-8));
  }
  if (partySeats >= sortedShares.length) {
    return Math.min(rawThreshold, sortedShares.at(-1));
  }
  const upperInclusive = sortedShares[partySeats - 1];
  const lowerExclusive = sortedShares[partySeats];
  const minimumImplementing = Math.min(
    upperInclusive,
    lowerExclusive + Math.max(1e-8, (upperInclusive - lowerExclusive) * 1e-6),
  );
  return clamp(rawThreshold, minimumImplementing, upperInclusive);
}

function renderThresholdFigure(districts, metrics, frontier, schedule, w) {
  const series = getOptimalThresholdSeries(districts, metrics, frontier);
  const current = computeOptimalThresholdAtWeight(
    frontier,
    metrics,
    compiledSpec,
    w,
    series.districtOptimum.demSeats,
    series.stateOptimum.demSeats,
    series.sortedShares,
    series.party,
  );
  const preferFocused =
    els.thresholdChart
      .closest("section")
      ?.querySelector("[data-shared-weight-control]")
      ?.dataset.rangeMode === "focused";
  const view = getThresholdFigureView(series, schedule, preferFocused, w);
  const plotSamples = getThresholdPlotSamples(
    series,
    schedule,
    frontier,
    metrics,
    view.xDomain,
  );
  const yView = thresholdChartDomain(plotSamples.map((sample) => sample.threshold));
  const scales = chartScales(view.xDomain, yView.domain);
  els.thresholdChart.dataset.xMinimum = String(view.xDomain[0]);
  els.thresholdChart.dataset.xMaximum = String(view.xDomain[1]);
  els.thresholdChart.replaceChildren();
  appendChartAxes(els.thresholdChart, view.xDomain, yView.domain, {
    xLabel: "Statewide weight  w",
    yLabel: `Optimal ${series.party} cutoff  t(w)`,
    xFormatter: (value) => value.toFixed(view.xDigits),
    yFormatter: (value) => value.toFixed(yView.digits),
    xTicks: view.xTicks,
    yTicks: yView.ticks,
  });

  if (0.5 >= yView.domain[0] && 0.5 <= yView.domain[1]) {
    appendReferenceLine(
      els.thresholdChart,
      scales.y(0.5),
      "District plurality  0.50",
      "threshold-majority-line",
    );
  }
  schedule.switches
    .filter(
      (item) => item.weight >= view.xDomain[0] && item.weight <= view.xDomain[1],
    )
    .forEach((item) =>
      els.thresholdChart.append(
        makeSvgElement("line", {
          x1: scales.x(item.weight),
          x2: scales.x(item.weight),
          y1: PAPER_CHART.top,
          y2: PAPER_CHART.height - PAPER_CHART.bottom,
          class: "figure-switch-guide",
        }),
      ),
    );
  const linePath = plotSamples
    .map(
      (sample, index) =>
        `${index ? "L" : "M"} ${scales.x(sample.weight)} ${scales.y(sample.threshold)}`,
    )
    .join(" ");
  els.thresholdChart.append(makeSvgElement("path", { d: linePath, class: "threshold-rule-path" }));
  const currentInView = w >= view.xDomain[0] - 1e-10 && w <= view.xDomain[1] + 1e-10;
  const weightText = formatAdaptiveWeight(w, schedule, current.demSeats);
  if (currentInView) {
    els.thresholdChart.append(
      makeSvgElement("line", {
        x1: scales.x(w),
        x2: scales.x(w),
        y1: PAPER_CHART.top,
        y2: PAPER_CHART.height - PAPER_CHART.bottom,
        class: "figure-current-guide",
      }),
      makeSvgElement("circle", {
        cx: scales.x(w),
        cy: scales.y(current.threshold),
        r: 7,
        class: "figure-current-dot",
      }),
    );
  } else {
    const currentIsRight = w > view.xDomain[1];
    els.thresholdChart.append(
      makeSvgElement(
        "text",
        {
          x: currentIsRight
            ? PAPER_CHART.width - PAPER_CHART.right - 8
            : PAPER_CHART.left + 8,
          y: PAPER_CHART.top + 18,
          class: `figure-end-label${currentIsRight ? " is-right" : ""}`,
        },
        `${currentIsRight ? "Current" : "← Current"} w = ${weightText}${
          currentIsRight ? " →" : ""
        }`,
      ),
    );
  }

  els.figure3Mode.textContent = isPaperLinearSpecification()
    ? series.party === "D"
      ? "Paper linear cutoff"
      : "Paper cutoff, party-symmetric orientation"
    : "General adjacent-indifference cutoff";
  const focusRange = `${view.xDomain[0].toFixed(view.xDigits)}–${view.xDomain[1].toFixed(
    view.xDigits,
  )}`;
  els.figure3AxisNote.textContent = view.focused
    ? `Switch focus: w = ${focusRange} · choose “Show full 0–1” to expand.`
    : "Full weight range 0–1 · click the plot to set w.";
  els.figure3Description.textContent = `Interactive line chart of the model's optimal ${
    series.party
  } district vote-share threshold as statewide weight changes. ${
    view.focused
      ? `The horizontal axis and shared control focus on w ${focusRange}, covering the switching range relevant to the current weight.`
      : "The horizontal axis shows the full weight range from 0 to 1."
  } Switch positions ${
    schedule.source === "dataset"
      ? "use the election's supplied dataset weights"
      : isLinearAggregationAst(compiledSpec.aggregation)
        ? "are exact"
        : "are numerically estimated"
  }.${currentInView ? "" : ` The current weight ${weightText} is outside the focused plot.`}`;
  const thresholdRole = current.terminal
    ? "the cutoff implementing the terminal statewide optimum"
    : current.projected
      ? `the implementing cutoff after applying the observed-district cap; the unconstrained adjacent indifference point is ${formatNumber(
          current.rawThreshold,
          4,
        )}`
    : `the indifference cutoff between ${current.adjacentLowerSeat} and ${
        current.adjacentLowerSeat + 1
      } ${series.party} seats`;
  const focusDetail = view.focused
    ? `The axes expand w = ${focusRange} over the active switching range. `
    : "The axes show the full weight range. ";
  els.figure3Detail.textContent = `${focusDetail}At w = ${weightText}, t(w) = ${formatNumber(
    current.threshold,
    4,
  )}: ${thresholdRole}. Assigning ${series.party} to districts with ${series.party} support at or above this cutoff implements ${current.partySeats} ${series.party} seats and yields ${formatSeatCount(
    current.demSeats,
    metrics.totalSeats,
  )}.`;
}

function renderSeatPathFigure(districts, metrics, frontier, schedule, best, w) {
  const districtOptimum = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, 0, compiledSpec));
  const stateOptimum = chooseBestCandidate(buildObjectiveCurve(frontier, metrics, 1, compiledSpec));
  const targetSeatCount = buildObjectiveCurve(frontier, metrics, 0, compiledSpec)[0].targetSeatCount;
  const thresholdSeries = getOptimalThresholdSeries(districts, metrics, frontier);
  const preferFocused =
    els.seatPathChart
      .closest("section")
      ?.querySelector("[data-shared-weight-control]")
      ?.dataset.rangeMode === "focused";
  const view = getThresholdFigureView(thresholdSeries, schedule, preferFocused, w);
  const xDomain = view.xDomain;
  const weightText = formatAdaptiveWeight(w, schedule, best.demSeats);
  const seatValues = [
    targetSeatCount,
    districtOptimum.demSeats,
    stateOptimum.demSeats,
    ...schedule.segments.map((segment) => segment.demSeats),
  ];
  const yDomain = seatChartDomain(seatValues, metrics.totalSeats);
  const yTicks = integerTicks(yDomain[0], yDomain[1]);
  const scales = chartScales(xDomain, yDomain);
  els.seatPathChart.dataset.xMinimum = String(xDomain[0]);
  els.seatPathChart.dataset.xMaximum = String(xDomain[1]);
  els.seatPathChart.replaceChildren();
  appendChartAxes(els.seatPathChart, xDomain, yDomain, {
    xLabel: "Statewide weight  w",
    yLabel: "Optimal D seats  S*(w)",
    xFormatter: (value) => value.toFixed(view.xDigits),
    yFormatter: (value) => String(Math.round(value)),
    xTicks: view.xTicks,
    yTicks,
  });

  appendReferenceLine(
    els.seatPathChart,
    scales.y(targetSeatCount),
    `Target  T(rho) = ${formatNumber(targetSeatCount, 2)}`,
    "seat-target-line",
  );
  schedule.switches
    .filter(
      (item) => item.weight >= xDomain[0] - 1e-10 && item.weight <= xDomain[1] + 1e-10,
    )
    .forEach((item) => {
    els.seatPathChart.append(
      makeSvgElement("line", {
        x1: scales.x(item.weight),
        x2: scales.x(item.weight),
        y1: PAPER_CHART.top,
        y2: PAPER_CHART.height - PAPER_CHART.bottom,
        class: "figure-switch-guide",
      }),
      makeSvgElement("circle", {
        cx: scales.x(item.weight),
        cy: scales.y(item.toDemSeats),
        r: 4.5,
        class: "seat-switch-dot",
      }),
    );
  });

  const pathParts = [];
  const visibleSegments = schedule.segments
    .map((segment) => ({
      ...segment,
      visibleStart: Math.max(segment.start, xDomain[0]),
      visibleEnd: Math.min(segment.end, xDomain[1]),
    }))
    .filter((segment) => segment.visibleEnd >= segment.visibleStart - 1e-10);
  visibleSegments.forEach((segment, index) => {
    const startX = scales.x(segment.visibleStart);
    const endX = scales.x(segment.visibleEnd);
    const seatY = scales.y(segment.demSeats);
    const previous = visibleSegments[index - 1];
    if (!previous || segment.visibleStart > previous.visibleEnd + 1e-10) {
      pathParts.push(`M ${startX} ${seatY}`);
    } else {
      pathParts.push(`L ${startX} ${seatY}`);
    }
    pathParts.push(`L ${endX} ${seatY}`);
  });
  const leftRegime = findCurrentRegime(schedule.segments, xDomain[0] + 1e-10);
  const rightRegime = findCurrentRegime(schedule.segments, xDomain[1] - 1e-10);
  const leftLabel =
    xDomain[0] <= 1e-10
      ? `District optimum  ${districtOptimum.demSeats} D`
      : `At w ${xDomain[0].toFixed(view.xDigits)}  ${leftRegime.demSeats} D`;
  const rightLabel =
    xDomain[1] >= 1 - 1e-10
      ? `State optimum  ${stateOptimum.demSeats} D`
      : `At w ${xDomain[1].toFixed(view.xDigits)}  ${rightRegime.demSeats} D`;
  const currentInView = w >= xDomain[0] - 1e-10 && w <= xDomain[1] + 1e-10;
  const currentElements = currentInView
    ? [
        makeSvgElement("line", {
          x1: scales.x(w),
          x2: scales.x(w),
          y1: PAPER_CHART.top,
          y2: PAPER_CHART.height - PAPER_CHART.bottom,
          class: "figure-current-guide",
        }),
        makeSvgElement("circle", {
          cx: scales.x(w),
          cy: scales.y(best.demSeats),
          r: 7,
          class: "figure-current-dot",
        }),
      ]
    : [
        makeSvgElement(
          "text",
          {
            x:
              w > xDomain[1]
                ? PAPER_CHART.width - PAPER_CHART.right - 8
                : PAPER_CHART.left + 8,
            y: PAPER_CHART.top + 18,
            class: `figure-end-label${w > xDomain[1] ? " is-right" : ""}`,
          },
          `${w > xDomain[1] ? "Current" : "← Current"} w = ${weightText}${
            w > xDomain[1] ? " →" : ""
          }`,
        ),
      ];
  els.seatPathChart.append(
    makeSvgElement("path", { d: pathParts.join(" "), class: "seat-path-line" }),
    makeSvgElement(
      "text",
      {
        x: PAPER_CHART.left + 8,
        y: scales.y(leftRegime.demSeats) - 10,
        class: "figure-end-label",
      },
      leftLabel,
    ),
    makeSvgElement(
      "text",
      {
        x: PAPER_CHART.width - PAPER_CHART.right - 8,
        y:
          scales.y(rightRegime.demSeats) -
          (Math.abs(rightRegime.demSeats - targetSeatCount) < 1 ? 22 : 10),
        class: "figure-end-label is-right",
      },
      rightLabel,
    ),
    ...currentElements,
  );

  els.figure4Mode.textContent = schedule.source === "dataset"
    ? "Dataset optimal path"
    : isLinearAggregationAst(compiledSpec.aggregation)
      ? "Exact optimal path"
      : "Numerical optimal path";
  els.figure4SwitchCount.textContent = `${schedule.switches.length} ${
    schedule.switches.length === 1 ? "switch" : "switches"
  }`;
  const regime = findCurrentRegime(schedule.segments, w, best.demSeats);
  const focusRange = `${xDomain[0].toFixed(view.xDigits)}–${xDomain[1].toFixed(
    view.xDigits,
  )}`;
  const switchList = schedule.switches.length
    ? schedule.switches
        .map((item) => {
          const pivots = getSwitchPivotalDistricts(
            frontier,
            item.fromDemSeats,
            item.toDemSeats,
            districts,
          );
          return `${formatSwitchWeight(item.weight)} (${formatPivotalDistricts(pivots, 1)})`;
        })
        .join("; ")
    : "none";
  els.figure4Detail.textContent = `${
    view.focused
      ? `The horizontal axis focuses on w ${focusRange}, covering the switching range relevant to the current weight. `
      : "The horizontal axis shows the full weight range. "
  }At w = ${weightText}, the optimum is ${formatSeatCount(
    best.demSeats,
    metrics.totalSeats,
  )} throughout ${formatInterval(regime)}. Switching weights and pivotal assignments: ${switchList}.${
    currentInView ? "" : " The current weight is outside the focused plot."
  }`;
}

function chartScales(xDomain, yDomain) {
  const plotRight = PAPER_CHART.width - PAPER_CHART.right;
  const plotBottom = PAPER_CHART.height - PAPER_CHART.bottom;
  return {
    x: (value) =>
      PAPER_CHART.left +
      ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) *
        (plotRight - PAPER_CHART.left),
    y: (value) =>
      plotBottom -
      ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) *
        (plotBottom - PAPER_CHART.top),
  };
}

function appendChartAxes(svg, xDomain, yDomain, options) {
  const plotRight = PAPER_CHART.width - PAPER_CHART.right;
  const plotBottom = PAPER_CHART.height - PAPER_CHART.bottom;
  const scales = chartScales(xDomain, yDomain);
  const xTicks = options.xTicks || evenTicks(xDomain[0], xDomain[1], 5);
  const yTicks = options.yTicks || evenTicks(yDomain[0], yDomain[1], 5);
  svg.append(
    makeSvgElement("rect", {
      x: PAPER_CHART.left,
      y: PAPER_CHART.top,
      width: plotRight - PAPER_CHART.left,
      height: plotBottom - PAPER_CHART.top,
      class: "figure-plot-background",
    }),
  );

  xTicks.forEach((tick) => {
    const x = scales.x(tick);
    svg.append(
      makeSvgElement("line", {
        x1: x,
        x2: x,
        y1: PAPER_CHART.top,
        y2: plotBottom,
        class: "figure-grid-line",
      }),
      makeSvgElement(
        "text",
        { x, y: plotBottom + 24, class: "figure-tick-label", "text-anchor": "middle" },
        options.xFormatter(tick),
      ),
    );
  });
  yTicks.forEach((tick) => {
    const y = scales.y(tick);
    svg.append(
      makeSvgElement("line", {
        x1: PAPER_CHART.left,
        x2: plotRight,
        y1: y,
        y2: y,
        class: "figure-grid-line",
      }),
      makeSvgElement(
        "text",
        {
          x: PAPER_CHART.left - 12,
          y: y + 4,
          class: "figure-tick-label",
          "text-anchor": "end",
        },
        options.yFormatter(tick),
      ),
    );
  });
  svg.append(
    makeSvgElement("line", {
      x1: PAPER_CHART.left,
      x2: plotRight,
      y1: plotBottom,
      y2: plotBottom,
      class: "figure-axis-line",
    }),
    makeSvgElement("line", {
      x1: PAPER_CHART.left,
      x2: PAPER_CHART.left,
      y1: PAPER_CHART.top,
      y2: plotBottom,
      class: "figure-axis-line",
    }),
    makeSvgElement(
      "text",
      {
        x: (PAPER_CHART.left + plotRight) / 2,
        y: PAPER_CHART.height - 10,
        class: "figure-axis-label",
        "text-anchor": "middle",
      },
      options.xLabel,
    ),
    makeSvgElement(
      "text",
      {
        x: 18,
        y: (PAPER_CHART.top + plotBottom) / 2,
        class: "figure-axis-label",
        "text-anchor": "middle",
        transform: `rotate(-90 18 ${(PAPER_CHART.top + plotBottom) / 2})`,
      },
      options.yLabel,
    ),
  );
}

function appendReferenceLine(svg, y, label, className) {
  const plotRight = PAPER_CHART.width - PAPER_CHART.right;
  svg.append(
    makeSvgElement("line", {
      x1: PAPER_CHART.left,
      x2: plotRight,
      y1: y,
      y2: y,
      class: className,
    }),
    makeSvgElement(
      "text",
      {
        x: plotRight - 6,
        y: y - 7,
        class: "figure-reference-label",
        "text-anchor": "end",
      },
      label,
    ),
  );
}

function makeSvgElement(name, attributes = {}, textContent = null) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (textContent !== null) element.textContent = textContent;
  return element;
}

function evenTicks(minimum, maximum, intervalCount) {
  return Array.from(
    { length: intervalCount + 1 },
    (_, index) => minimum + ((maximum - minimum) * index) / intervalCount,
  );
}

function integerTicks(minimum, maximum) {
  const start = Math.ceil(minimum);
  const end = Math.floor(maximum);
  const span = Math.max(0, end - start);
  const step = Math.max(1, Math.ceil(span / 7));
  const ticks = [];
  for (let value = start; value <= end; value += step) ticks.push(value);
  if (ticks.at(-1) !== end) ticks.push(end);
  return ticks;
}

function paddedNonnegativeDomain(minimum, maximum) {
  const naturalSpan = maximum - minimum;
  const span = naturalSpan > 1e-9 ? naturalSpan : Math.max(1, Math.abs(maximum) * 0.25);
  return [Math.max(0, minimum - span * 0.07), maximum + span * 0.07];
}

function getAdaptiveNonnegativeAxisView(values, targetIntervals = 6) {
  let supportMinimum = Infinity;
  let supportMaximum = -Infinity;
  for (const candidate of values || []) {
    const value = Number(candidate);
    if (!Number.isFinite(value) || value < 0) continue;
    supportMinimum = Math.min(supportMinimum, value);
    supportMaximum = Math.max(supportMaximum, value);
  }
  if (!Number.isFinite(supportMinimum) || !Number.isFinite(supportMaximum)) {
    return {
      domain: [0, 1],
      ticks: evenTicks(0, 1, targetIntervals),
      digits: 2,
      support: [0, 1],
    };
  }

  const scale = Math.max(Math.abs(supportMinimum), Math.abs(supportMaximum), 1);
  const span = Math.max(supportMaximum - supportMinimum, scale * 0.02);
  const padding = Math.max(span * 0.08, scale * 0.005);
  const rawMinimum = Math.max(0, supportMinimum - padding);
  const rawMaximum = supportMaximum + padding;
  const step = niceTickStep(Math.max(rawMaximum - rawMinimum, scale * 0.02), targetIntervals);
  const domainMinimum = Math.max(
    0,
    Math.floor((rawMinimum + 1e-12) / step) * step,
  );
  let domainMaximum = Math.ceil((rawMaximum - 1e-12) / step) * step;
  if (!(domainMaximum > domainMinimum)) domainMaximum = domainMinimum + step;
  return {
    domain: [domainMinimum, domainMaximum],
    ticks: axisTicks(domainMinimum, domainMaximum, step),
    digits: tickPrecision(step),
    support: [supportMinimum, supportMaximum],
  };
}

function niceTickStep(span, targetIntervals = 5) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const roughStep = span / Math.max(1, targetIntervals);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 2.5
        ? 2.5
        : normalized <= 5
          ? 5
          : 10;
  return factor * magnitude;
}

function tickPrecision(step) {
  for (let digits = 0; digits <= 6; digits += 1) {
    if (Math.abs(step - Number(step.toFixed(digits))) < 1e-10) return digits;
  }
  return 6;
}

function axisTicks(minimum, maximum, step) {
  const ticks = [];
  const start = Math.ceil((minimum - 1e-10) / step) * step;
  for (let value = start; value <= maximum + 1e-10; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

function thresholdChartDomain(values) {
  let minimum = Math.min(0.5, ...values);
  let maximum = Math.max(0.5, ...values);
  const naturalSpan = maximum - minimum;
  const padding = Math.max(0.003, naturalSpan * 0.12);
  minimum = Math.max(0, minimum - padding);
  maximum = Math.min(1, maximum + padding);
  if (maximum - minimum < 0.018) {
    const midpoint = (minimum + maximum) / 2;
    minimum = Math.max(0, midpoint - 0.009);
    maximum = Math.min(1, midpoint + 0.009);
  }
  const step = niceTickStep(maximum - minimum, 8);
  const domain = [
    Math.max(0, Math.floor((minimum + 1e-12) / step) * step),
    Math.min(1, Math.ceil((maximum - 1e-12) / step) * step),
  ];
  return {
    domain,
    ticks: axisTicks(domain[0], domain[1], step),
    digits: tickPrecision(step),
  };
}

function seatChartDomain(values, totalSeats) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum - minimum < 1) {
    return [Math.max(0, minimum - 1), Math.min(totalSeats, maximum + 1)];
  }
  return [Math.max(0, Math.floor(minimum) - 1), Math.min(totalSeats, Math.ceil(maximum) + 1)];
}

function trimCache(cache, maximumSize) {
  while (cache.size > maximumSize) cache.delete(cache.keys().next().value);
}

function renderDistrictRows(districts, outcome, diagnosticMode, w) {
  const tableContext = {
    model: ["Prediction detail", "Model assignments by district", "Model"],
    inspection: ["Counterfactual detail", "Selected assignments by district", "Selected"],
    observed: ["FPTP detail", "Local plurality assignments by district", "FPTP"],
    proportional: [
      "Proportional benchmark detail",
      "Proportional assignments by district",
      "Proportional",
    ],
    efficiency: [
      "Efficiency-gap benchmark detail",
      "Efficiency-gap-minimizing assignments by district",
      "EG minimum",
    ],
    meanMedian: ["Vote-profile detail", "Mean-median gap by district", "Observed"],
    competitive: ["Vote-profile detail", "Competitive districts", "Observed"],
    responsiveness: ["Vote-swing detail", "Districts pivotal under a 45%-55% swing", "Observed"],
  }[diagnosticMode] || [
    "Displayed allocation detail",
    `${getDiagnosticModeLabel(diagnosticMode, w)} assignments by district`,
    "Displayed",
  ];
  [
    els.districtAssignmentsEyebrow.textContent,
    els.districtAssignmentsTitle.textContent,
    els.districtModelColumn.textContent,
  ] = tableContext;
  els.districtRows.replaceChildren();
  districts.forEach((district, index) => {
    const assignedParty = outcome.assignment[index] ? "D" : "R";
    const isFlipped = assignedParty !== district.winner;
    const row = document.createElement("div");
    row.className = `district-row${isFlipped ? " is-flipped" : ""}`;
    row.setAttribute("role", "row");
    row.innerHTML = `
      <span role="cell">District ${district.id}</span>
      <span role="cell">${formatPercent(district.demShare, 1)}</span>
      <span role="cell"><b class="party-pill ${district.winner === "D" ? "dem" : "rep"}">${
        district.winner
      }</b></span>
      <span role="cell"><b class="party-pill ${assignedParty === "D" ? "dem" : "rep"}">${
        assignedParty
      }</b></span>
      <span role="cell"><b class="status-pill${isFlipped ? " flip" : ""}">${
        diagnosticMode === "observed" || isProfileDiagnosticMode(diagnosticMode)
          ? "Plurality"
          : isFlipped
            ? "Reassigned"
            : "Matches"
      }</b></span>
      <span role="cell">${formatNumber(outcome.districtLosses[index], 4)}</span>
    `;
    els.districtRows.append(row);
  });
}

function restoreProportionalStatewideTarget() {
  const proportionalTarget = findPresetById("stateTarget", "proportional");
  if (!proportionalTarget || getTargetContext().id === "proportional") return;

  setFormulaFields({
    ...activeFormulas,
    stateTarget: proportionalTarget.tex,
  });
  previewAllFormulas();
  if (!applySpecification(false)) return;

  hideResultsReturnCue();
  setFormulaStatus("Proportional statewide target restored.");
  els.diagnosticPickerStatus.textContent =
    "Proportional target restored · Map: model prediction";
  window.requestAnimationFrame(() => {
    els.mapWSlider.focus({ preventScroll: true });
  });
}

function applySpecification(showStatus, successMessage = "Model updated.") {
  clearAllFormulaErrors();
  const formulas = getFormulaFields();
  const validationDistricts =
    activeState === CUSTOM_STATE_KEY
      ? createCustomScenario(customState)
      : generateScenario(activeState, activeYear);
  const result = compileSpecification(formulas, {
    districts: validationDistricts,
    weight: Number(els.wSlider.value),
  });

  if (result.errors.length) {
    result.errors.forEach(({ key, message }) => setFormulaError(key, message));
    setFormulaStatus("The active model was not changed. Correct the marked expressions and apply again.", true);
    hideResultsReturnCue();
    return false;
  }

  const previousFormulas = activeFormulas;
  const previousCompiledSpec = compiledSpec;
  activeFormulas = formulas;
  compiledSpec = result.compiled;
  clearCandidateInspection();
  selectModelMapMode();
  syncAllPresetSelections();
  syncBenchmarkSelection();
  syncTopSpecificationStatus();
  renderActiveSpec();
  if (!render()) {
    activeFormulas = previousFormulas;
    compiledSpec = previousCompiledSpec;
    render();
    setFormulaStatus("The active model was not changed because the new formulas could not be evaluated safely.", true);
    hideResultsReturnCue();
    return false;
  }
  setFormulaStatus(showStatus ? successMessage : "Model updated.");
  showResultsReturnCue();
  return true;
}

function compileSpecification(formulas, validationContext = null) {
  const compiled = {};
  const errors = [];

  Object.keys(specMeta).forEach((key) => {
    try {
      if (key === "districtLoss") {
        compiled.districtLossA = parseMathExpression(
          getFormulaSource(formulas.districtLossA),
        );
        compiled.districtLossB = parseMathExpression(
          getFormulaSource(formulas.districtLossB),
        );
        validateCompiledExpression(key, {
          districtLossA: compiled.districtLossA,
          districtLossB: compiled.districtLossB,
        });
        return;
      }
      compiled[key] = parseMathExpression(getFormulaSource(formulas[key]));
      validateCompiledExpression(key, compiled[key]);
    } catch (error) {
      errors.push({ key, message: humanizeFormulaError(error) });
    }
  });

  if (!errors.length && validationContext?.districts?.length) {
    errors.push(
      ...validateCompiledSpecificationForScenario(
        compiled,
        validationContext.districts,
        validationContext.weight,
      ),
    );
  }

  return { compiled, errors };
}

function getFormulaSource(value) {
  const source = String(value ?? "").trim();
  if (!source) throw formulaError("Enter a formula before applying the specification.");
  if (source.length > MAX_FORMULA_SOURCE_LENGTH) {
    throw formulaError(
      `Formula source must be ${MAX_FORMULA_SOURCE_LENGTH} characters or fewer.`,
    );
  }
  return source;
}

function validateCompiledSpecificationForScenario(spec, districts, weight = 0.5) {
  const errors = [];
  const metrics = computeMetrics(districts);
  const selectedProfileSuffix = ` for the selected ${metrics.totalSeats}-district profile.`;
  const recordError = (key, error) => {
    const message = humanizeFormulaError(error).replace(/[.\s]+$/, "");
    errors.push({ key, message: `${message}${selectedProfileSuffix}` });
  };

  let frontier = null;
  try {
    frontier = computeRankedCandidateFrontier(districts, spec);
  } catch (error) {
    recordError("districtLoss", error);
  }

  let targetSeatCount = null;
  try {
    targetSeatCount = asFiniteScalar(
      evaluateAst(spec.stateTarget, { rho: metrics.rho, N: metrics.totalSeats }),
      "statewide target",
    );
    if (targetSeatCount < -1e-9 || targetSeatCount > metrics.totalSeats + 1e-9) {
      throw formulaError("T(rho) must remain between 0 and N seats");
    }
  } catch (error) {
    recordError("stateTarget", error);
  }

  const statewideLosses = new Map();
  if (targetSeatCount !== null) {
    try {
      for (let demSeats = 0; demSeats <= metrics.totalSeats; demSeats += 1) {
        const targetDistance = Math.abs(demSeats - targetSeatCount);
        statewideLosses.set(
          demSeats,
          asNonnegativeScalar(
            evaluateAst(spec.stateLoss, { z: targetDistance, N: metrics.totalSeats }),
            "statewide loss",
          ),
        );
      }
    } catch (error) {
      recordError("stateLoss", error);
      statewideLosses.clear();
    }
  }

  if (frontier && statewideLosses.size) {
    try {
      const activeWeight = Number.isFinite(Number(weight))
        ? clamp(Number(weight), 0, 1)
        : 0.5;
      const weights = new Set([activeWeight]);
      for (let index = 0; index <= FORMULA_SCENARIO_WEIGHT_SAMPLES; index += 1) {
        weights.add(index / FORMULA_SCENARIO_WEIGHT_SAMPLES);
      }
      weights.forEach((candidateWeight) => {
        frontier.forEach((candidate) => {
          asNonnegativeScalar(
            evaluateAst(spec.aggregation, {
              y1: (1 - candidateWeight) * candidate.districtLoss,
              y2: candidateWeight * statewideLosses.get(candidate.demSeats),
            }),
            "aggregation function",
          );
        });
      });
    } catch (error) {
      recordError("aggregation", error);
    }
  }

  return errors;
}

function validateCompiledExpression(key, ast) {
  if (key === "aggregation") {
    const grid = [0, 0.2, 1, 4];
    const points = grid.flatMap((y1) => grid.map((y2) => ({ y1, y2 })));
    const valueAt = (y1, y2) =>
      asNonnegativeScalar(evaluateAst(ast, { y1, y2 }), "aggregation function");
    points.forEach(({ y1, y2 }) => valueAt(y1, y2));
    grid.forEach((fixed) => {
      for (let index = 1; index < grid.length; index += 1) {
        const previousY1 = valueAt(grid[index - 1], fixed);
        const nextY1 = valueAt(grid[index], fixed);
        const previousY2 = valueAt(fixed, grid[index - 1]);
        const nextY2 = valueAt(fixed, grid[index]);
        if (nextY1 < previousY1 - 1e-9 || nextY2 < previousY2 - 1e-9) {
          throw formulaError(
            "F must be coordinatewise nondecreasing, as assumed in the paper.",
          );
        }
      }
    });
    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        const a = points[first];
        const b = points[second];
        const midpointValue = valueAt((a.y1 + b.y1) / 2, (a.y2 + b.y2) / 2);
        const endpointAverage = (valueAt(a.y1, a.y2) + valueAt(b.y1, b.y2)) / 2;
        if (midpointValue > endpointAverage + 1e-8) {
          throw formulaError("F must be convex on nonnegative losses, as assumed in the paper.");
        }
      }
    }
    const origin = valueAt(0, 0);
    if (valueAt(0.001, 0) <= origin + 1e-12 || valueAt(0, 0.001) <= origin + 1e-12) {
      throw formulaError("F must respond positively to each loss component at the origin.");
    }
    return;
  }

  if (key === "districtLoss") {
    let previousMargin = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= 20; index += 1) {
      const p = index / 20;
      const lossA = asNonnegativeScalar(
        evaluateAst(ast.districtLossA, { p }),
        "district loss for party A",
      );
      const lossB = asNonnegativeScalar(
        evaluateAst(ast.districtLossB, { p }),
        "district loss for party B",
      );
      const margin = lossA - lossB;
      if (margin > previousMargin + 1e-9) {
        throw formulaError(
          "The switch margin delta(1,p)-delta(0,p) must be weakly decreasing in p.",
        );
      }
      previousMargin = margin;
    }
    return;
  }

  if (key === "stateTarget") {
    FORMULA_VALIDATION_DELEGATION_SIZES.forEach((N) => {
      for (let index = 0; index <= 20; index += 1) {
        const rho = (N * index) / 20;
        const target = asFiniteScalar(evaluateAst(ast, { rho, N }), "statewide target");
        if (target < -1e-9 || target > N + 1e-9) {
          throw formulaError("T(rho) must remain between 0 and N seats, as assumed in the paper.");
        }
      }
    });
    return;
  }

  FORMULA_VALIDATION_DELEGATION_SIZES.forEach((N) => {
    const step = N / 40;
    const values = Array.from({ length: 41 }, (_, index) => {
      const z = index * step;
      return asNonnegativeScalar(evaluateAst(ast, { z, N }), "statewide loss");
    });
    if (Math.abs(values[0]) > 1e-9) {
      throw formulaError("Q must satisfy Q(0)=0, as assumed in the paper.");
    }
    const slopes = [];
    for (let index = 1; index < values.length; index += 1) {
      const slope = (values[index] - values[index - 1]) / step;
      if (slope <= 1e-10) {
        throw formulaError("Q must be strictly increasing, as assumed in the paper.");
      }
      slopes.push(slope);
    }
    for (let index = 1; index < slopes.length; index += 1) {
      if (slopes[index] < slopes[index - 1] - 1e-8) {
        throw formulaError("Q must be weakly convex, as assumed in the paper.");
      }
    }
  });
}

function getFormulaFields() {
  return {
    aggregation: els.formulaAggregation.value.trim(),
    districtLossA: els.formulaDistrictLossA.value.trim(),
    districtLossB: els.formulaDistrictLossB.value.trim(),
    stateTarget: els.formulaStateTarget.value.trim(),
    stateLoss: els.formulaStateLoss.value.trim(),
  };
}

function setFormulaFields(formulas) {
  els.formulaDistrictLossA.value = formulas.districtLossA ?? defaultFormulas.districtLossA;
  els.formulaDistrictLossB.value = formulas.districtLossB ?? defaultFormulas.districtLossB;
  ["stateTarget", "stateLoss", "aggregation"].forEach((key) => {
    const meta = specMeta[key];
    els[meta.field].value = formulas[key] ?? defaultFormulas[key];
  });
}

function previewAllFormulas() {
  Object.keys(specMeta).forEach(renderFormulaPreview);
}

function renderFormulaPreview(key) {
  const meta = specMeta[key];
  renderMath(getSpecificationDisplayTex(key, getFormulaFields()), els[meta.preview], true);
}

function renderActiveSpec() {
  if (!els.activeSpec) return;
  els.activeSpec.replaceChildren();
  Object.entries(specMeta).forEach(([key, meta]) => {
    const item = document.createElement("div");
    item.className = "active-math-item";
    const label = document.createElement("small");
    label.textContent = meta.label;
    const math = document.createElement("div");
    item.append(label, math);
    els.activeSpec.append(item);
    renderMath(getSpecificationDisplayTex(key, activeFormulas), math, true);
  });

  const derived = document.createElement("div");
  derived.className = "active-math-item active-derived-spec";
  const derivedLabel = document.createElement("small");
  derivedLabel.textContent = "Full objective function";
  const derivedMath = document.createElement("div");
  derived.append(derivedLabel, derivedMath);
  els.activeSpec.append(derived);
  const derivedTex = isPaperLinearSpecification()
    ? `\\begin{aligned}
        ${paperLinearSpecification.districtTotalDisplay}\\\\
        ${paperLinearSpecification.statewideDisplay}\\\\
        ${paperLinearSpecification.objectiveDisplay}
      \\end{aligned}`
    : "\\begin{aligned}\\mathrm{Dist}(\\mathbf x,\\mathbf p)&=\\sum_{d=1}^{N}\\delta(x_d,p_d),\\\\ \\mathrm{State}(\\mathbf x,\\mathbf p)&=Q\\!\\left(\\left|S(\\mathbf x)-T(\\rho)\\right|\\right),\\\\ M(\\mathbf x,\\mathbf p;w)&=F\\!\\left((1-w)\\mathrm{Dist}(\\mathbf x,\\mathbf p),w\\mathrm{State}(\\mathbf x,\\mathbf p)\\right).\\end{aligned}";
  renderMath(derivedTex, derivedMath, true);
}

function getSpecificationDisplayTex(key, formulas) {
  if (key === "districtLoss") {
    const expressionA = formulas.districtLossA || "\\text{empty}";
    const expressionB = formulas.districtLossB || "\\text{empty}";
    return `\\begin{aligned}
      \\delta(1,p)&=${expressionA},\\qquad \\delta(0,p)=${expressionB}.
    \\end{aligned}`;
  }
  const expression = formulas[key] || "\\text{empty}";
  return `${specMeta[key].prefix}${expression}`;
}

function renderMath(tex, element, displayMode) {
  if (typeof window !== "undefined" && window.katex) {
    window.katex.render(tex, element, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml",
    });
    return;
  }
  element.textContent = tex;
}

function syncAllPresetSelections() {
  Object.keys(specMeta).forEach(syncPresetSelection);
}

function syncPresetSelection(key) {
  const meta = specMeta[key];
  const preset =
    key === "districtLoss"
      ? formulaPresets.districtLoss.find(
          (candidate) =>
            normalizeFormulaForComparison(candidate.texA) ===
              normalizeFormulaForComparison(els.formulaDistrictLossA.value) &&
            normalizeFormulaForComparison(candidate.texB) ===
              normalizeFormulaForComparison(els.formulaDistrictLossB.value),
        )
      : findPresetByTex(key, els[meta.field].value);
  els[meta.preset].value = preset ? preset.id : "custom";
  els[meta.note].textContent = preset
    ? preset.description
    : "This custom formula will be checked against the model assumptions before it is applied.";
}

function findMatchingBenchmark(formulas = activeFormulas) {
  return (
    benchmarkSpecifications.find((candidate) =>
      Object.keys(defaultFormulas).every(
        (key) =>
          normalizeFormulaForComparison(candidate.formulas[key]) ===
          normalizeFormulaForComparison(formulas[key]),
      ),
    ) || null
  );
}

function syncBenchmarkSelection() {
  const benchmark = findMatchingBenchmark();
  els.benchmarkSelect.value = benchmark ? benchmark.id : "custom";
  els.benchmarkDescription.textContent = benchmark
    ? benchmark.description
    : "This custom specification passed the model's numerical admissibility checks.";
}

function syncTopSpecificationStatus() {
  const benchmark = findMatchingBenchmark();
  const isDefault = isPaperLinearSpecification();
  const specificationLabel = isDefault
    ? "Paper linear benchmark"
    : benchmark?.label || "Custom specification";
  els.topSpecControl.classList.toggle("is-general", !isDefault);
  els.topSpecLabel.textContent = specificationLabel;
  els.advancedSpecLabel.textContent = specificationLabel;
  els.topSpecBadge.textContent = isDefault ? "Default" : "General";
  const specificationSummary = getSpecificationSummary();
  els.topSpecNote.textContent = specificationSummary;
  els.topSpecNote.title = specificationSummary;
}

function findPresetById(key, id) {
  return formulaPresets[key].find((preset) => preset.id === id) || null;
}

function findPresetByTex(key, tex) {
  const normalized = normalizeFormulaForComparison(tex);
  return (
    formulaPresets[key].find(
      (preset) => normalizeFormulaForComparison(preset.tex) === normalized,
    ) || null
  );
}

function normalizeFormulaForComparison(value) {
  return String(value).replace(/\s+/g, "");
}

function getTargetLabel() {
  const preset = findPresetByTex("stateTarget", activeFormulas.stateTarget);
  return preset ? preset.label : "Custom statewide";
}

function getTargetContext(formulas = activeFormulas) {
  const preset = findPresetByTex("stateTarget", formulas.stateTarget);
  const contexts = {
    proportional: {
      id: "proportional",
      shortLabel: "Proportionality",
      mapLabel: "Statewide proportionality",
      goalPhrase: "statewide proportionality",
      sliderLabel: "Balance local districts and statewide proportionality",
      endpointLabel: "Statewide proportionality",
      valueLead: "Proportional target",
    },
    efficiency: {
      id: "efficiency",
      shortLabel: "Efficiency gap",
      mapLabel: "Efficiency-gap target",
      goalPhrase: "the efficiency-gap target",
      sliderLabel: "Balance local districts and efficiency gap",
      endpointLabel: "Efficiency-gap target",
      valueLead: "Zero-gap seat target",
    },
    squareLaw: {
      id: "squareLaw",
      shortLabel: "Square-law target",
      mapLabel: "Square-law seat target",
      goalPhrase: "the square-law seat target",
      sliderLabel: "Balance local districts and the square-law target",
      endpointLabel: "Square-law target",
      valueLead: "Square-law seat target",
    },
    cubeLaw: {
      id: "cubeLaw",
      shortLabel: "Cube-law target",
      mapLabel: "Cube-law seat target",
      goalPhrase: "the cube-law seat target",
      sliderLabel: "Balance local districts and the cube-law target",
      endpointLabel: "Cube-law target",
      valueLead: "Cube-law seat target",
    },
  };
  return (
    contexts[preset?.id] || {
      id: "custom",
      shortLabel: "Custom target",
      mapLabel: "Custom statewide target",
      goalPhrase: "the custom statewide target",
      sliderLabel: "Balance local districts and the custom statewide target",
      endpointLabel: "Custom statewide target",
      valueLead: "Custom seat target",
    }
  );
}

function getSpecificationSummary(formulas = activeFormulas) {
  const districtPreset = formulaPresets.districtLoss.find(
    (preset) =>
      normalizeFormulaForComparison(preset.texA) ===
        normalizeFormulaForComparison(formulas.districtLossA) &&
      normalizeFormulaForComparison(preset.texB) ===
        normalizeFormulaForComparison(formulas.districtLossB),
  );
  const stateLossPreset = findPresetByTex("stateLoss", formulas.stateLoss);
  const aggregationPreset = findPresetByTex("aggregation", formulas.aggregation);
  const target = getTargetContext(formulas);
  return `Local: ${shortComponentLabel(
    districtPreset?.label || "Custom district loss",
  )} · Statewide: ${target.mapLabel} · Penalty: ${shortComponentLabel(
    stateLossPreset?.label || "Custom statewide penalty",
  )} · Aggregation: ${shortComponentLabel(
    aggregationPreset?.label || "Custom aggregation",
  )}`;
}

function shortComponentLabel(label) {
  return String(label).replace(/\s*\(paper(?: appendix)?\)/gi, "");
}

function setFormulaError(key, message) {
  const errorElement = els[specMeta[key].error];
  errorElement.textContent = message;
  errorElement.hidden = false;
}

function clearFormulaError(key) {
  const errorElement = els[specMeta[key].error];
  errorElement.textContent = "";
  errorElement.hidden = true;
}

function clearAllFormulaErrors() {
  Object.keys(specMeta).forEach(clearFormulaError);
}

function setFormulaStatus(message, isError = false) {
  els.formulaStatus.textContent = message;
  els.formulaStatus.classList.toggle("is-error", isError);
}

function humanizeFormulaError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Formula error:\s*/i, "");
}

function parseMathExpression(tex) {
  const source = normalizeTexExpression(tex);
  const tokens = tokenizeExpression(source);
  let cursor = 0;

  function peek() {
    return tokens[cursor] || { type: "eof", value: "" };
  }

  function consume(type, value) {
    const token = peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw formulaError(`Expected ${value || type} near "${token.value || "end"}".`);
    }
    cursor += 1;
    return token;
  }

  function parseExpression() {
    let node = parseTerm();
    while (peek().type === "operator" && ["+", "-"].includes(peek().value)) {
      const operator = consume("operator").value;
      node = { type: "binary", operator, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseUnary();
    while (true) {
      const token = peek();
      if (token.type === "operator" && ["*", "/"].includes(token.value)) {
        const operator = consume("operator").value;
        node = { type: "binary", operator, left: node, right: parseUnary() };
        continue;
      }
      if (startsPrimary(token)) {
        node = { type: "binary", operator: "*", left: node, right: parseUnary() };
        continue;
      }
      break;
    }
    return node;
  }

  function parseUnary() {
    if (peek().type === "operator" && ["+", "-"].includes(peek().value)) {
      const operator = consume("operator").value;
      return { type: "unary", operator, value: parseUnary() };
    }
    return parsePower();
  }

  function parsePower() {
    let node = parsePrimary();
    if (peek().type === "operator" && peek().value === "^") {
      consume("operator", "^");
      node = { type: "binary", operator: "^", left: node, right: parseUnary() };
    }
    return node;
  }

  function parsePrimary() {
    const token = peek();
    if (token.type === "number") {
      cursor += 1;
      return { type: "number", value: Number(token.value) };
    }

    if (token.type === "identifier") {
      cursor += 1;
      const name = token.value;
      if (peek().type === "leftParen" && supportedFunctions.has(name)) {
        consume("leftParen");
        const args = [];
        if (peek().type !== "rightParen") {
          args.push(parseExpression());
          while (peek().type === "comma") {
            consume("comma");
            args.push(parseExpression());
          }
        }
        consume("rightParen");
        return { type: "call", name, args };
      }
      return { type: "variable", name };
    }

    if (token.type === "leftParen") {
      consume("leftParen");
      const node = parseExpression();
      consume("rightParen");
      return node;
    }

    throw formulaError(`Unexpected token "${token.value || "end"}".`);
  }

  const ast = parseExpression();
  if (peek().type !== "eof") {
    throw formulaError(`Unexpected token "${peek().value}".`);
  }
  return ast;
}

const supportedFunctions = new Set([
  "abs",
  "sqrt",
  "ln",
  "log",
  "exp",
  "max",
  "min",
  "mean",
  "rms",
  "sum",
]);

function normalizeTexExpression(tex) {
  let source = String(tex || "").trim();
  if (!source) throw formulaError("Expression is empty.");
  if (source.includes("=")) source = source.slice(source.lastIndexOf("=") + 1);
  source = source.replace(/\$/g, "");
  source = source.replace(/\\tfrac|\\dfrac/g, "\\frac");
  source = expandTexCommand(source, "\\frac", 2, ([numerator, denominator]) =>
    `((${numerator})/(${denominator}))`,
  );
  source = expandTexCommand(source, "\\sqrt", 1, ([radicand]) => `sqrt(${radicand})`);
  source = source.replace(/\\operatorname\s*\{([A-Za-z]+)\}/g, "$1");
  source = source.replace(/\\mathrm\s*\{([A-Za-z]+)\}/g, "$1");
  source = source.replace(/\\left|\\right|\\bigl|\\bigr|\\Bigl|\\Bigr/g, "");
  source = source.replace(/\\lvert|\\rvert/g, "|");
  source = source.replace(/\\cdot|\\times/g, "*");
  source = source.replace(/\\rho/g, "rho");
  source = source.replace(/\\(max|min|mean|rms|sum|abs|ln|log|exp)/g, "$1");
  source = source.replace(/y_\{?1\}?/g, "y1");
  source = source.replace(/y_\{?2\}?/g, "y2");
  source = source.replace(/([xp])_\{?[A-Za-z0-9]+\}?/g, "$1");
  source = source.replace(
    /(x|p|z|N|rho|y1|y2)(?=(?:max|min|mean|rms|sum|abs|sqrt|ln|log|exp)\()/g,
    "$1*",
  );
  source = replaceAbsoluteValueBars(source);
  source = source.replace(/[{}]/g, (character) => (character === "{" ? "(" : ")"));
  source = source.replace(/[−–]/g, "-");
  source = source.replace(/\\,/g, "").replace(/\\;/g, "").replace(/\\!/g, "");
  source = source.replace(/\s+/g, "");

  if (source.includes("\\")) {
    const command = source.match(/\\[A-Za-z]+/)?.[0] || "backslash command";
    throw formulaError(`Unsupported TeX command ${command}.`);
  }
  return source;
}

function expandTexCommand(source, command, groupCount, replacer) {
  let result = source;
  let index = result.lastIndexOf(command);

  while (index !== -1) {
    let cursor = index + command.length;
    const groups = [];
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      while (/\s/.test(result[cursor] || "")) cursor += 1;
      if (result[cursor] !== "{") {
        throw formulaError(`${command} requires ${groupCount} braced ${groupCount === 1 ? "argument" : "arguments"}.`);
      }
      const group = readBraceGroup(result, cursor);
      groups.push(group.content);
      cursor = group.end;
    }
    result = `${result.slice(0, index)}${replacer(groups)}${result.slice(cursor)}`;
    index = result.lastIndexOf(command);
  }
  return result;
}

function readBraceGroup(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return { content: source.slice(start + 1, index), end: index + 1 };
  }
  throw formulaError("Unclosed brace group.");
}

function replaceAbsoluteValueBars(source) {
  let result = source;
  let safety = 0;
  while (/\|[^|]+\|/.test(result) && safety < 20) {
    result = result.replace(/\|([^|]+)\|/, "abs($1)");
    safety += 1;
  }
  if (result.includes("|")) throw formulaError("Absolute-value bars must occur in pairs.");
  return result;
}

function tokenizeExpression(source) {
  const tokens = [];
  let cursor = 0;

  while (cursor < source.length) {
    const remainder = source.slice(cursor);
    const number = remainder.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      cursor += number[0].length;
      continue;
    }

    const identifier = remainder.match(/^[A-Za-z][A-Za-z0-9]*/);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] });
      cursor += identifier[0].length;
      continue;
    }

    const character = source[cursor];
    if (["+", "-", "*", "/", "^"].includes(character)) {
      tokens.push({ type: "operator", value: character });
    } else if (character === "(") {
      tokens.push({ type: "leftParen", value: character });
    } else if (character === ")") {
      tokens.push({ type: "rightParen", value: character });
    } else if (character === ",") {
      tokens.push({ type: "comma", value: character });
    } else {
      throw formulaError(`Unsupported character "${character}".`);
    }
    cursor += 1;
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function startsPrimary(token) {
  return ["number", "identifier", "leftParen"].includes(token.type);
}

function evaluateAst(node, variables) {
  if (node.type === "number") return node.value;
  if (node.type === "variable") {
    if (node.name === "pi") return Math.PI;
    if (node.name === "e") return Math.E;
    if (!(node.name in variables)) throw formulaError(`Unknown variable "${node.name}".`);
    return variables[node.name];
  }
  if (node.type === "unary") {
    const value = evaluateAst(node.value, variables);
    return mapValue(value, (entry) => (node.operator === "-" ? -entry : entry));
  }
  if (node.type === "binary") {
    return applyBinaryOperation(
      node.operator,
      evaluateAst(node.left, variables),
      evaluateAst(node.right, variables),
    );
  }
  if (node.type === "call") {
    const args = node.args.map((argument) => evaluateAst(argument, variables));
    return callMathFunction(node.name, args);
  }
  throw formulaError("Unknown expression node.");
}

function applyBinaryOperation(operator, left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
      throw formulaError("Vector lengths do not match.");
    }
    const length = Array.isArray(left) ? left.length : right.length;
    return Array.from({ length }, (_, index) =>
      applyBinaryOperation(
        operator,
        Array.isArray(left) ? left[index] : left,
        Array.isArray(right) ? right[index] : right,
      ),
    );
  }

  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return left / right;
  if (operator === "^") return left ** right;
  throw formulaError(`Unsupported operator "${operator}".`);
}

function callMathFunction(name, args) {
  if (["abs", "sqrt", "ln", "log", "exp"].includes(name)) {
    if (args.length !== 1) throw formulaError(`${name} expects one argument.`);
    const functions = {
      abs: Math.abs,
      sqrt: Math.sqrt,
      ln: Math.log,
      log: Math.log,
      exp: Math.exp,
    };
    return mapValue(args[0], functions[name]);
  }

  if (["mean", "rms", "sum"].includes(name)) {
    const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    if (!values.length || values.some(Array.isArray)) {
      throw formulaError(`${name} expects one or more scalar arguments.`);
    }
    if (name === "sum") return values.reduce((total, value) => total + value, 0);
    if (name === "mean") {
      return values.reduce((total, value) => total + value, 0) / values.length;
    }
    return Math.sqrt(
      values.reduce((total, value) => total + value ** 2, 0) / values.length,
    );
  }

  if (["max", "min"].includes(name)) {
    if (!args.length) throw formulaError(`${name} expects at least one argument.`);
    const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    if (values.some(Array.isArray)) throw formulaError(`${name} received a nested vector.`);
    return name === "max" ? Math.max(...values) : Math.min(...values);
  }

  throw formulaError(`Unsupported function "${name}".`);
}

function mapValue(value, operation) {
  return Array.isArray(value) ? value.map(operation) : operation(value);
}

function asFiniteScalar(value, label) {
  if (Array.isArray(value) || !Number.isFinite(value)) {
    throw formulaError(`${label} must return one finite number.`);
  }
  return value;
}

function asNonnegativeScalar(value, label) {
  const scalar = asFiniteScalar(value, label);
  if (scalar < -1e-10) throw formulaError(`${label} must be nonnegative.`);
  return Math.max(0, scalar);
}

function formulaError(message) {
  return new Error(`Formula error: ${message}`);
}

function findCurrentRegime(segments, w, preferredDemSeats = null) {
  if (preferredDemSeats !== null) {
    const preferred = segments.find(
      (segment) =>
        segment.demSeats === preferredDemSeats &&
        w >= segment.start - 1e-9 &&
        w <= segment.end + 1e-9,
    );
    if (preferred) return preferred;
  }
  return (
    segments.find(
      (segment, index) =>
        w >= segment.start - 1e-9 &&
        (index === segments.length - 1 || w < segment.end - 1e-9),
    ) || segments.at(-1)
  );
}

function formatInterval(segment) {
  const left = formatSwitchWeight(segment.start);
  const right = formatSwitchWeight(segment.end);
  return `${left} ≤ w ≤ ${right}`;
}

function formatSwitchWeight(value) {
  if (Math.abs(value) < 0.0000005) return "0.000";
  if (Math.abs(value - 1) < 0.0000005) return "1.000";
  return value.toFixed(4);
}

function formatPhi(weight) {
  if (weight >= 1 - 1e-10) return "phi = infinity";
  return `phi = ${formatNumber(weight / (1 - weight), 4)}`;
}

function partyFill(party, demShare) {
  const assignedSupport = party === "D" ? demShare : 1 - demShare;
  const intensity = clamp(0.34 + Math.max(0, assignedSupport - 0.5) * 1.8, 0.34, 0.9);
  return party === "D"
    ? mixHex("#dbe8f4", "#557fae", intensity)
    : mixHex("#f7dddd", "#c96868", intensity);
}

function mixHex(first, second, amount) {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  const mixed = firstRgb.map((value, index) =>
    Math.round(value + (secondRgb[index] - value) * amount),
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function formatSeatCount(demSeats, totalSeats) {
  return `${demSeats} D / ${totalSeats - demSeats} R`;
}

function setPartySeatCount(element, demSeats, totalSeats) {
  if (!element) return;
  const democratic = document.createElement("span");
  democratic.className = "party-seat is-dem";
  democratic.textContent = `${demSeats} D`;

  const divider = document.createElement("span");
  divider.className = "party-seat-divider";
  divider.textContent = "/";
  divider.setAttribute("aria-hidden", "true");

  const republican = document.createElement("span");
  republican.className = "party-seat is-rep";
  republican.textContent = `${totalSeats - demSeats} R`;

  element.classList.add("party-seat-count");
  element.replaceChildren(democratic, divider, republican);
  element.setAttribute("aria-label", formatNamedSeatCount(demSeats, totalSeats));
}

function setPartyDirectionalValue(element, value) {
  if (!element) return;
  element.textContent = value;
  element.classList.remove("party-dem-text", "party-rep-text");
  if (/^D(?:\s|$)/.test(value)) {
    element.classList.add("party-dem-text");
  } else if (/^R(?:\s|$)/.test(value)) {
    element.classList.add("party-rep-text");
  }
}

function formatNamedSeatCount(demSeats, totalSeats) {
  return `${demSeats} Democratic · ${totalSeats - demSeats} Republican`;
}

function formatAdvantage(value) {
  if (Math.abs(value) < 0.0005) return "Even";
  return `${value > 0 ? "D" : "R"} +${formatPoints(Math.abs(value), 1)}`;
}

function formatDirectionalPoints(value, positiveParty) {
  if (Math.abs(value) < 0.0005) return "Even";
  const negativeParty = positiveParty === "D" ? "R" : "D";
  return `${value > 0 ? positiveParty : negativeParty} +${formatPoints(
    Math.abs(value),
    1,
  )}`;
}

function formatDirectionalIndex(value, positiveParty, digits = 3) {
  if (Math.abs(value) < 0.0005) return "Even";
  const negativeParty = positiveParty === "D" ? "R" : "D";
  return `${value > 0 ? positiveParty : negativeParty} +${Math.abs(value).toFixed(digits)}`;
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPoints(value, digits = 1) {
  return `${(value * 100).toFixed(digits)} pts`;
}

function isExactDistrictTie(district) {
  return Math.abs(Number(district?.demShare) - 0.5) <= 1e-12;
}

function formatDistrictWinningMargin(value) {
  const points = Math.abs(Number(value)) * 100;
  const digits = points < 0.1 ? 3 : points < 1 ? 2 : 1;
  return formatPoints(Math.abs(Number(value)), digits);
}

function formatSignedPoints(value, digits = 1) {
  if (Math.abs(value) < 0.0005) return "0.0 pts";
  return `${value > 0 ? "+" : "−"}${formatPoints(Math.abs(value), digits)}`;
}

function formatSignedSeatGap(value, digits = 2) {
  if (Math.abs(value) < 0.0005) return `${(0).toFixed(digits)} seats`;
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)} seats`;
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function formatCompact(value) {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function averageValues(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function medianValue(values) {
  const sorted = values.slice().sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function nearestIntegerWithTiesDown(value) {
  const lower = Math.floor(value);
  const upper = Math.ceil(value);
  const lowerDistance = value - lower;
  const upperDistance = upper - value;
  return lowerDistance <= upperDistance + 1e-12 ? lower : upper;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function centroid(points) {
  const total = points.reduce(
    (accumulator, point) => {
      accumulator.x += point[0];
      accumulator.y += point[1];
      return accumulator;
    },
    { x: 0, y: 0 },
  );
  return [total.x / points.length, total.y / points.length];
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.__MODEL_EXPLORER__ = {
    bundledElectionData,
    stateConfigs,
    SCENARIO_URL_VERSION,
    SCENARIO_JSON_SCHEMA,
    SCENARIO_JSON_VERSION,
    METHODOLOGY_VERSION,
    CUSTOM_DISTRICT_MIN,
    CUSTOM_DISTRICT_MAX,
    MAX_FORMULA_SOURCE_LENGTH,
    FORMULA_SCENARIO_WEIGHT_SAMPLES,
    FORMULA_VALIDATION_MAX_DISTRICTS,
    paperLinearSpecification,
    formulaPresets,
    benchmarkSpecifications,
    defaultFormulas,
    encodeBase64Url,
    decodeBase64Url,
    canonicalizeFormulas,
    getCustomDataVersion,
    serializeCustomState,
    deserializeCustomState,
    parseScenarioUrl,
    buildScenarioUrl,
    buildPublicationRecord,
    buildPublicationSvg,
    parseMathExpression,
    evaluateAst,
    compileSpecification,
    validateCompiledSpecificationForScenario,
    generateScenario,
    getElectionRecord,
    getScenarioStartingWeight,
    getElectionQualityCounts,
    getScenarioMetadata,
    createCustomScenario,
    createCustomLayout,
    makeExampleCustomVotes,
    makeRandomCustomVotes,
    validateCustomStateDefinition,
    parseCustomVoteCsv,
    describeVoteDataQuality,
    computeMetrics,
    computeEfficiencyGap,
    computePartisanBias,
    computePublicMetrics,
    computeDeclination,
    computeResponsiveness,
    computeAllocationRuleSeatShareAtSupport,
    computeAllocationRulePartisanBias,
    computeAllocationRuleResponsiveness,
    createUniformShiftedDistricts,
    computeRankedCandidateFrontier,
    computeModelSeatShareAtSupport,
    computeModelPartisanBias,
    computeModelResponsiveness,
    computePaperBenchmarkSummary,
    computeActiveWeightSummary,
    computeLinearSupportInterval,
    computeCandidateFrontier,
    computeFeasibleLossPairs,
    computeParetoSeatPoints,
    buildIsoContourPath,
    buildObjectiveCurve,
    chooseBestCandidate,
    chooseScheduleCandidate,
    scoreAllocationOutcome,
    getReferenceSeatCount,
    chooseReferenceCandidate,
    buildReferenceOutcomes,
    buildOutcomeComparison,
    getMapPresentation,
    computeSwitchSchedule,
    applyBundledSwitchWeights,
    getSwitchFocusDomain,
    getWeightFigureView,
    getPaperChartWeightAtClientX,
    formatAdaptiveWeight,
    formatCompactSwitchWeight,
    formatWeightWithPercent,
    isExactDistrictTie,
    formatDistrictWinningMargin,
    csvCell,
    getAdaptiveNonnegativeAxisView,
    getSwitchPivotalDistricts,
    computeOptimalThresholdSeries,
    computeOptimalThresholdAtWeight,
    computeAdjacentThreshold,
    implementingCutoff,
    isLinearAggregationAst,
    getTargetContext,
    getSpecificationSummary,
    nearestIntegerWithTiesDown,
  };
}
