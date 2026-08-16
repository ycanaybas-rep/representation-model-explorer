"use strict";

(() => {
  const FULL_HOUSE_SEATS = 435;
  // Observed election assignments for districts outside the bundled state panel.
  // These seats remain fixed while w changes the covered state delegations.
  const OUTSIDE_PANEL_SEATS_BY_YEAR = Object.freeze({
    2000: Object.freeze({ demSeats: 42, repSeats: 71, otherSeats: 2 }),
    2002: Object.freeze({ demSeats: 53, repSeats: 75, otherSeats: 1 }),
    2004: Object.freeze({ demSeats: 37, repSeats: 59, otherSeats: 1 }),
    2006: Object.freeze({ demSeats: 47, repSeats: 50, otherSeats: 0 }),
    2008: Object.freeze({ demSeats: 53, repSeats: 44, otherSeats: 0 }),
    2010: Object.freeze({ demSeats: 36, repSeats: 61, otherSeats: 0 }),
    2012: Object.freeze({ demSeats: 73, repSeats: 78, otherSeats: 0 }),
    2014: Object.freeze({ demSeats: 30, repSeats: 68, otherSeats: 0 }),
    2016: Object.freeze({ demSeats: 32, repSeats: 66, otherSeats: 0 }),
    2018: Object.freeze({ demSeats: 41, repSeats: 57, otherSeats: 0 }),
    2020: Object.freeze({ demSeats: 35, repSeats: 63, otherSeats: 0 }),
    2022: Object.freeze({ demSeats: 47, repSeats: 71, otherSeats: 0 }),
    2024: Object.freeze({ demSeats: 34, repSeats: 58, otherSeats: 0 }),
  });
  const DEFAULT_WEIGHT = 0;
  const SWITCH_TOLERANCE = 1e-10;
  const CHAMBER_ROWS = 12;
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HOUSE_CHART_LAYOUTS = Object.freeze({
    desktop: Object.freeze({
      mode: "desktop",
      width: 960,
      height: 440,
      margin: Object.freeze({ top: 30, right: 32, bottom: 68, left: 86 }),
      xTicks: Object.freeze([0, 0.25, 0.5, 0.75, 1]),
      yTickCount: 5,
      showEventPoints: true,
      majorityLabel: "218-seat majority",
    }),
    medium: Object.freeze({
      mode: "medium",
      width: 720,
      height: 360,
      margin: Object.freeze({ top: 30, right: 24, bottom: 58, left: 76 }),
      xTicks: Object.freeze([0, 0.25, 0.5, 0.75, 1]),
      yTickCount: 4,
      showEventPoints: false,
      majorityLabel: "218-seat majority",
    }),
    compact: Object.freeze({
      mode: "compact",
      width: 360,
      height: 300,
      margin: Object.freeze({ top: 38, right: 14, bottom: 56, left: 62 }),
      xTicks: Object.freeze([0, 0.5, 1]),
      yTickCount: 4,
      showEventPoints: false,
      majorityLabel: "218 majority",
    }),
  });

  function getHouseChartLayout(mode = false) {
    if (mode === true || mode === "compact") return HOUSE_CHART_LAYOUTS.compact;
    if (mode === "medium") return HOUSE_CHART_LAYOUTS.medium;
    return HOUSE_CHART_LAYOUTS.desktop;
  }

  function getHouseChartMode(isCompact, isMedium) {
    if (isCompact) return "compact";
    if (isMedium) return "medium";
    return "desktop";
  }

  function getWeightFromChartPoint(clientX, bounds, layout) {
    if (!bounds || !Number.isFinite(bounds.width) || bounds.width <= 0) {
      return DEFAULT_WEIGHT;
    }
    const viewboxX = ((Number(clientX) - bounds.left) / bounds.width) * layout.width;
    const { margin, width } = layout;
    return clampWeight(
      (viewboxX - margin.left) / (width - margin.left - margin.right),
    );
  }

  function clampWeight(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_WEIGHT;
    return Math.min(1, Math.max(0, numeric));
  }

  function getAvailableYears(engine) {
    return Array.from(
      new Set(Object.values(engine.stateConfigs).flatMap((config) => config.years)),
    ).sort((first, second) => first - second);
  }

  function buildYearModel(engine, year) {
    if (!engine) throw new Error("The shared model engine is unavailable.");
    const numericYear = Number(year);
    const compilation = engine.compileSpecification(engine.defaultFormulas);
    if (compilation.errors.length) {
      throw new Error(compilation.errors.map((error) => error.message).join(" "));
    }

    const states = Object.entries(engine.stateConfigs)
      .filter(([, config]) => config.years.includes(numericYear))
      .map(([name, config]) => {
        const districts = engine.generateScenario(name, numericYear);
        const metrics = engine.computeMetrics(districts);
        const frontier = engine.computeRankedCandidateFrontier(
          districts,
          compilation.compiled,
        );
        const election = engine.getElectionRecord(name, numericYear);
        const quality = engine.getElectionQualityCounts(election);
        const calculatedSchedule = engine.computeSwitchSchedule(
          frontier,
          metrics,
          compilation.compiled,
        );
        const schedule = engine.applyBundledSwitchWeights(
          calculatedSchedule,
          election,
        );
        return {
          name,
          code: config.code,
          districts,
          metrics,
          frontier,
          election,
          quality,
          schedule,
          switches: schedule.switches.map((item) => ({ ...item })),
        };
      })
      .sort((first, second) => first.name.localeCompare(second.name));

    if (!states.length) throw new Error(`No covered state elections are available for ${numericYear}.`);

    const totalSeats = states.reduce((total, state) => total + state.metrics.totalSeats, 0);
    const totalRho = states.reduce((total, state) => total + state.metrics.rho, 0);
    const fptpDemSeats = states.reduce((total, state) => total + state.metrics.demSeats, 0);
    const proportionalDemSeats = states.reduce(
      (total, state) => total + state.metrics.proportionalDemSeats,
      0,
    );
    const proxyCount = states.reduce((total, state) => total + state.quality.proxy, 0);
    const largeThirdPartyCount = states.reduce(
      (total, state) => total + state.quality.largeThirdParty,
      0,
    );
    const outsideAssignments = OUTSIDE_PANEL_SEATS_BY_YEAR[numericYear];
    if (!outsideAssignments) {
      throw new Error(`Outside-panel House assignments are unavailable for ${numericYear}.`);
    }
    if (
      !Object.values(outsideAssignments).every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    ) {
      throw new Error(`${numericYear} outside-panel assignments must be nonnegative integers.`);
    }
    const uncoveredSeats = FULL_HOUSE_SEATS - totalSeats;
    const assignedOutsideSeats =
      outsideAssignments.demSeats +
      outsideAssignments.repSeats +
      outsideAssignments.otherSeats;
    if (assignedOutsideSeats !== uncoveredSeats) {
      throw new Error(
        `${numericYear} outside-panel assignments cover ${assignedOutsideSeats} seats; expected ${uncoveredSeats}.`,
      );
    }

    return {
      engine,
      year: numericYear,
      spec: compilation.compiled,
      states,
      stateCount: states.length,
      totalSeats,
      coveredSeats: totalSeats,
      uncoveredSeats,
      outsideDemSeats: outsideAssignments.demSeats,
      outsideRepSeats: outsideAssignments.repSeats,
      outsideOtherSeats: outsideAssignments.otherSeats,
      demSupport: totalRho / totalSeats,
      repSupport: 1 - totalRho / totalSeats,
      fptpDemSeats,
      fptpRepSeats: totalSeats - fptpDemSeats,
      proportionalDemSeats,
      proportionalRepSeats: totalSeats - proportionalDemSeats,
      fullFptpDemSeats: fptpDemSeats + outsideAssignments.demSeats,
      fullFptpRepSeats:
        totalSeats - fptpDemSeats + outsideAssignments.repSeats,
      fullProportionalDemSeats:
        proportionalDemSeats + outsideAssignments.demSeats,
      fullProportionalRepSeats:
        totalSeats - proportionalDemSeats + outsideAssignments.repSeats,
      fullFptpOtherSeats: outsideAssignments.otherSeats,
      fullProportionalOtherSeats: outsideAssignments.otherSeats,
      proxyCount,
      largeThirdPartyCount,
      switchGroups: buildSwitchGroups(states),
    };
  }

  function buildSwitchGroups(states) {
    const switches = states.flatMap((state) => {
      const demDirection = Math.sign(
        state.metrics.proportionalDemSeats - state.metrics.demSeats,
      );
      return state.switches.map((item) => ({
        weight: Number(item.weight),
        state: state.name,
        code: state.code,
        fromDemSeats: item.fromDemSeats,
        toDemSeats: item.toDemSeats,
        demDelta: Number(item.toDemSeats) - Number(item.fromDemSeats) || demDirection,
      }));
    });

    switches.sort((first, second) => first.weight - second.weight || first.state.localeCompare(second.state));
    return switches.reduce((groups, item) => {
      const previous = groups.at(-1);
      if (previous && Math.abs(previous.weight - item.weight) <= SWITCH_TOLERANCE) {
        previous.states.push(item);
        previous.demDelta += item.demDelta;
        return groups;
      }
      groups.push({
        weight: item.weight,
        states: [item],
        demDelta: item.demDelta,
      });
      return groups;
    }, []);
  }

  function countDirectionalSwitches(districts, assignment) {
    if (!Array.isArray(districts) || !Array.isArray(assignment)) {
      throw new Error("Districts and assignments are required to count switches.");
    }
    if (districts.length !== assignment.length) {
      throw new Error("District and assignment counts must match.");
    }

    return assignment.reduce(
      (counts, assignedParty, index) => {
        const localWinner = districts[index]?.winner;
        if (localWinner !== "D" && localWinner !== "R") {
          throw new Error(`District ${index + 1} has no valid local plurality winner.`);
        }
        if (Number(assignedParty) === 1 && localWinner === "R") {
          counts.democratic += 1;
        } else if (Number(assignedParty) === 0 && localWinner === "D") {
          counts.republican += 1;
        }
        return counts;
      },
      { democratic: 0, republican: 0 },
    );
  }

  function computeHouseSnapshot(yearModel, weight) {
    const w = clampWeight(weight);
    const stateResults = yearModel.states.map((state) => {
      const curve = yearModel.engine.buildObjectiveCurve(
        state.frontier,
        state.metrics,
        w,
        yearModel.spec,
      );
      const calculatedBest = yearModel.engine.chooseBestCandidate(curve, state.metrics);
      const best = yearModel.engine.chooseScheduleCandidate(
        curve,
        state.schedule,
        w,
        calculatedBest,
      );
      const demSeatChange = best.demSeats - state.metrics.demSeats;
      const directionalSwitches = countDirectionalSwitches(
        state.districts,
        best.assignment,
      );
      return {
        name: state.name,
        code: state.code,
        demSupport: state.metrics.modelDemShare,
        repSupport: 1 - state.metrics.modelDemShare,
        totalSeats: state.metrics.totalSeats,
        fptpDemSeats: state.metrics.demSeats,
        fptpRepSeats: state.metrics.repSeats,
        proportionalDemSeats: state.metrics.proportionalDemSeats,
        proportionalRepSeats: state.metrics.proportionalRepSeats,
        demSeats: best.demSeats,
        repSeats: best.repSeats,
        demSeatChange,
        flips: best.flips,
        democraticSwitches: directionalSwitches.democratic,
        republicanSwitches: directionalSwitches.republican,
        districtLoss: best.districtLoss,
        statewideLoss: best.statewideLoss,
        totalLoss: best.totalLoss,
      };
    });

    const coveredDemSeats = stateResults.reduce(
      (total, state) => total + state.demSeats,
      0,
    );
    const coveredRepSeats = yearModel.totalSeats - coveredDemSeats;
    const fullDemSeats = coveredDemSeats + yearModel.outsideDemSeats;
    const fullRepSeats = coveredRepSeats + yearModel.outsideRepSeats;
    const fullOtherSeats = yearModel.outsideOtherSeats;
    const flips = stateResults.reduce((total, state) => total + state.flips, 0);
    const democraticSwitches = stateResults.reduce(
      (total, state) => total + state.democraticSwitches,
      0,
    );
    const republicanSwitches = stateResults.reduce(
      (total, state) => total + state.republicanSwitches,
      0,
    );
    const coveredSeatShare = coveredDemSeats / yearModel.totalSeats;
    const seatSupportGap = coveredSeatShare - yearModel.demSupport;
    const efficiencyGap = coveredSeatShare - 2 * yearModel.demSupport + 0.5;
    const majorityInversion = computeMajorityInversion(
      yearModel.demSupport,
      coveredSeatShare,
    );

    return {
      year: yearModel.year,
      weight: w,
      totalSeats: yearModel.totalSeats,
      demSeats: coveredDemSeats,
      repSeats: coveredRepSeats,
      demSeatShare: coveredSeatShare,
      repSeatShare: 1 - coveredSeatShare,
      fullHouseSeats: FULL_HOUSE_SEATS,
      fullDemSeats,
      fullRepSeats,
      fullOtherSeats,
      fullDemSeatShare: fullDemSeats / FULL_HOUSE_SEATS,
      fullRepSeatShare: fullRepSeats / FULL_HOUSE_SEATS,
      fullOtherSeatShare: fullOtherSeats / FULL_HOUSE_SEATS,
      demSupport: yearModel.demSupport,
      repSupport: yearModel.repSupport,
      seatSupportGap,
      efficiencyGap,
      gallagherIndex: Math.abs(seatSupportGap),
      flips,
      democraticSwitches,
      republicanSwitches,
      pluralityRetained: yearModel.totalSeats - flips,
      changedStates: stateResults.filter((state) => state.demSeatChange !== 0).length,
      majorityInversion,
      stateResults,
    };
  }

  function computeMajorityInversion(demSupport, demSeatShare) {
    if (Math.abs(demSupport - 0.5) <= 1e-12) return null;
    if (demSupport > 0.5) return demSeatShare <= 0.5;
    return demSeatShare >= 0.5;
  }

  function distributeSeats(total, rowCount = CHAMBER_ROWS) {
    const rows = Math.max(1, Math.min(rowCount, total));
    const weights = Array.from({ length: rows }, (_, index) => 11 + index * 2.25);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const raw = weights.map((value) => (value / weightTotal) * total);
    const counts = raw.map(Math.floor);
    let remainder = total - counts.reduce((sum, value) => sum + value, 0);
    raw
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((first, second) => second.fraction - first.fraction || second.index - first.index)
      .forEach(({ index }) => {
        if (remainder <= 0) return;
        counts[index] += 1;
        remainder -= 1;
      });
    return counts;
  }

  function buildChamberSeatLayout(total, rowCount = CHAMBER_ROWS) {
    const counts = distributeSeats(total, rowCount);
    const lastRow = Math.max(1, counts.length - 1);
    return counts.flatMap((count, rowIndex) => {
      const progress = rowIndex / lastRow;
      const radiusX = 16 + progress * 30;
      const radiusY = radiusX * 1.9;
      return Array.from({ length: count }, (_, column) => {
        const angle = (Math.PI * (column + 1)) / (count + 1);
        return {
          x: 50 + radiusX * Math.cos(angle),
          y: 96 - radiusY * Math.sin(angle),
          rowIndex,
          column,
        };
      });
    });
  }

  function getChamberSeatCategory(index, snapshot, yearModel) {
    const seatIndex = Number(index);
    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= FULL_HOUSE_SEATS
    ) {
      throw new RangeError(`House seat index must be between 0 and ${FULL_HOUSE_SEATS - 1}.`);
    }

    const fixedDemocraticEnd = yearModel.outsideDemSeats;
    const democraticEnd = snapshot.fullDemSeats;
    const republicanStart = FULL_HOUSE_SEATS - snapshot.fullRepSeats;
    const fixedRepublicanStart = FULL_HOUSE_SEATS - yearModel.outsideRepSeats;

    if (seatIndex < fixedDemocraticEnd) return "fixed-dem";
    if (seatIndex < democraticEnd) return "modeled-dem";
    if (seatIndex < republicanStart) return "fixed-other";
    if (seatIndex < fixedRepublicanStart) return "modeled-rep";
    return "fixed-rep";
  }

  function getChamberSwitchIndexes(
    categories,
    democraticSwitches,
    republicanSwitches,
  ) {
    const modeledDemocratic = [];
    const modeledRepublican = [];
    categories.forEach((category, index) => {
      if (category === "modeled-dem") modeledDemocratic.push(index);
      if (category === "modeled-rep") modeledRepublican.push(index);
    });
    const toDemocraticCount = Math.max(0, Number(democraticSwitches) || 0);
    const toRepublicanCount = Math.max(0, Number(republicanSwitches) || 0);
    if (
      toDemocraticCount > modeledDemocratic.length ||
      toRepublicanCount > modeledRepublican.length
    ) {
      throw new RangeError("Changed-district counts exceed the modeled House seats.");
    }
    return {
      toDemocratic: toDemocraticCount
        ? modeledDemocratic.slice(-toDemocraticCount)
        : [],
      toRepublican: toRepublicanCount
        ? modeledRepublican.slice(0, toRepublicanCount)
        : [],
    };
  }

  function buildHouseSeatShareSeries(yearModel) {
    const eventGroups = yearModel.switchGroups.filter(
      (group) => Number.isFinite(group.weight) && group.weight > 0 && group.weight < 1,
    );
    const boundaries = [0, ...eventGroups.map((group) => group.weight), 1];
    const regimes = boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1];
      const sampleWeight = index === 0 ? 0 : (start + end) / 2;
      const snapshot = computeHouseSnapshot(yearModel, sampleWeight);
      return {
        start,
        end,
        sampleWeight,
        demSeats: snapshot.fullDemSeats,
        demSeatShare: snapshot.fullDemSeatShare,
      };
    });
    const events = eventGroups.map((group, index) => {
      const exact = computeHouseSnapshot(yearModel, group.weight);
      return {
        weight: group.weight,
        states: group.states.map((item) => ({ ...item })),
        beforeDemSeats: regimes[index].demSeats,
        exactDemSeats: exact.fullDemSeats,
        afterDemSeats: regimes[index + 1].demSeats,
      };
    });
    const endpoint = computeHouseSnapshot(yearModel, 1);
    const vertices = [
      { weight: 0, demSeatShare: regimes[0].demSeatShare },
      ...events.flatMap((event, index) => [
        { weight: event.weight, demSeatShare: regimes[index].demSeatShare },
        { weight: event.weight, demSeatShare: regimes[index + 1].demSeatShare },
      ]),
      { weight: 1, demSeatShare: regimes.at(-1).demSeatShare },
    ];
    if (Math.abs(endpoint.fullDemSeatShare - vertices.at(-1).demSeatShare) > 1e-12) {
      vertices.push({ weight: 1, demSeatShare: endpoint.fullDemSeatShare });
    }
    const demSeatCounts = [
      ...regimes.map((regime) => regime.demSeats),
      ...events.map((event) => event.exactDemSeats),
      endpoint.fullDemSeats,
    ];
    const shares = demSeatCounts.map((seats) => seats / FULL_HOUSE_SEATS);
    return {
      totalSeats: FULL_HOUSE_SEATS,
      coveredSeats: yearModel.totalSeats,
      regimes,
      events,
      vertices,
      endpoint: {
        demSeats: endpoint.fullDemSeats,
        demSeatShare: endpoint.fullDemSeatShare,
      },
      minDemSeats: Math.min(...demSeatCounts),
      maxDemSeats: Math.max(...demSeatCounts),
      minDemSeatShare: Math.min(...shares),
      maxDemSeatShare: Math.max(...shares),
    };
  }

  function getSeatShareChartDomain(series) {
    const dataMinimum = series.minDemSeatShare;
    const dataMaximum = series.maxDemSeatShare;
    const range = dataMaximum - dataMinimum;
    const padding = Math.max(0.01, range * 0.14);
    let minimum = Math.max(0, Math.floor((dataMinimum - padding) * 100) / 100);
    let maximum = Math.min(1, Math.ceil((dataMaximum + padding) * 100) / 100);
    if (maximum - minimum < 0.04) {
      const midpoint = (minimum + maximum) / 2;
      minimum = Math.max(0, Math.floor((midpoint - 0.02) * 100) / 100);
      maximum = Math.min(1, Math.ceil((midpoint + 0.02) * 100) / 100);
    }
    return { min: minimum, max: maximum };
  }

  function getAdjacentCompositionWeight(groups, weight, direction) {
    const w = clampWeight(weight);
    if (!groups.length) return direction > 0 ? 1 : 0;
    if (direction > 0) {
      const nextIndex = groups.findIndex((group) => group.weight > w + SWITCH_TOLERANCE);
      if (nextIndex < 0) return 1;
      const lower = groups[nextIndex].weight;
      const upper = groups[nextIndex + 1]?.weight ?? 1;
      return clampWeight((lower + upper) / 2);
    }

    let previousIndex = -1;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      if (groups[index].weight < w - SWITCH_TOLERANCE) {
        previousIndex = index;
        break;
      }
    }
    if (previousIndex < 0) return 0;
    const upper = groups[previousIndex].weight;
    const lower = groups[previousIndex - 1]?.weight ?? 0;
    return clampWeight((lower + upper) / 2);
  }

  function formatComposition(demSeats, repSeats, otherSeats = 0) {
    const majorParties = `${demSeats} D / ${repSeats} R`;
    return otherSeats ? `${majorParties} / ${otherSeats} Independent` : majorParties;
  }

  function formatOutsideAssignments(model) {
    const assignments = [
      `${model.outsideDemSeats} Democratic`,
      `${model.outsideRepSeats} Republican`,
    ];
    if (model.outsideOtherSeats) {
      assignments.push(`${model.outsideOtherSeats} Independent`);
    }
    return `${model.uncoveredSeats} seats are outside this year’s panel (${assignments.join(", ")}). Their assignments do not change with w.`;
  }

  function formatPercent(value, digits = 1) {
    return `${(Number(value) * 100).toFixed(digits)}%`;
  }

  function formatWeight(value, engine = null) {
    const w = clampWeight(value);
    if (typeof engine?.formatAdaptiveWeight === "function") {
      return engine.formatAdaptiveWeight(w);
    }
    return w.toFixed(Math.abs(w) < 0.01 && w !== 0 ? 6 : 3);
  }

  function formatWeightWithPercent(value, engine = null) {
    const w = clampWeight(value);
    if (typeof engine?.formatWeightWithPercent === "function") {
      return engine.formatWeightWithPercent(w);
    }
    return `w = ${formatWeight(w, engine)} · ${formatPercent(w, w < 0.01 ? 3 : 1)}`;
  }

  function formatWeightShare(value, engine = null) {
    const share = clampWeight(value);
    if (typeof engine?.formatCompactSwitchWeight === "function") {
      return engine.formatCompactSwitchWeight(share);
    }
    return formatPercent(share, share < 0.01 ? 3 : 1);
  }

  function formatCoverageDetail(model) {
    const qualityNotes = [];
    if (model.proxyCount) {
      qualityNotes.push(`${model.proxyCount} proxy-marked ${model.proxyCount === 1 ? "race" : "races"}`);
    }
    if (model.largeThirdPartyCount) {
      qualityNotes.push(
        `${model.largeThirdPartyCount} ${model.largeThirdPartyCount === 1 ? "race has" : "races have"} the large-third-party flag`,
      );
    }
    const qualityText = qualityNotes.length
      ? ` Data notes: ${qualityNotes.join("; ")}.`
      : " No proxy or large-third-party flags are present.";
    return `${model.stateCount} covered states, ${model.totalSeats} districts, ${model.switchGroups.length} switching points.${qualityText}`;
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });
    return element;
  }

  function initializeHousePage() {
    if (document.body?.dataset.page !== "house") return;
    const engine = globalThis.__MODEL_EXPLORER__;
    if (!engine) throw new Error("The model engine did not load.");

    const ids = [
      "houseYearSelect",
      "houseCoverageDetail",
      "houseWeight",
      "houseWeightValue",
      "houseWeightMarkers",
      "housePreviousComposition",
      "houseNextComposition",
      "houseSwitchReading",
      "houseWeightReading",
      "housePanelSeatSummary",
      "houseDemSeats",
      "houseRepSeats",
      "houseOtherSeatSummary",
      "houseOtherSeats",
      "houseOtherLegend",
      "houseChamberSeats",
      "houseCompositionBar",
      "houseDemBar",
      "houseRepBar",
      "houseCoverageValue",
      "houseCoverageBar",
      "houseUncoveredSeats",
      "houseDemVoteShare",
      "houseRepVoteShare",
      "houseFptpSeats",
      "houseProportionalSeats",
      "houseChangedSummary",
      "houseDistrictsChanged",
      "houseDemocraticSwitches",
      "houseRepublicanSwitches",
      "houseDistrictsChangedNote",
      "houseChartRegion",
      "houseSeatShareChart",
      "houseTrajectoryDescription",
      "houseTrajectoryReading",
      "houseChartScale",
    ];
    const elements = Object.fromEntries(
      ids.map((id) => {
        const element = document.getElementById(id);
        if (!element) throw new Error(`Missing House Explorer element #${id}`);
        return [id, element];
      }),
    );

    const years = getAvailableYears(engine);
    const initial = readInitialState(years);
    let activeYearModel = null;
    let activeSnapshot = null;
    let activeSeatShareSeries = null;
    let activeChartDomain = null;
    const compactChartQuery = window.matchMedia("(max-width: 620px)");
    const mediumChartQuery = window.matchMedia("(max-width: 840px)");
    const getActiveChartLayout = () => getHouseChartLayout(
      getHouseChartMode(compactChartQuery.matches, mediumChartQuery.matches),
    );
    let activeChartLayout = getActiveChartLayout();
    let chamberSeats = [];
    let renderFrame = 0;
    let lastCompositionKey = "";
    const preserveCleanPageUrl = !window.location.search;

    elements.houseYearSelect.replaceChildren(
      ...years
        .slice()
        .reverse()
        .map((year) => {
          const option = document.createElement("option");
          option.value = String(year);
          option.textContent = String(year);
          return option;
        }),
    );
    elements.houseYearSelect.value = String(initial.year);
    elements.houseWeight.value = String(initial.weight);

    elements.houseYearSelect.addEventListener("change", () => {
      loadYear(Number(elements.houseYearSelect.value));
    });

    elements.houseWeight.addEventListener("input", requestRender);
    elements.houseWeight.addEventListener("change", () => {
      renderCurrentWeight();
    });
    elements.houseWeight.addEventListener("keydown", handleWeightKeyboard);

    elements.housePreviousComposition.addEventListener("click", () => {
      moveToComposition(-1);
    });
    elements.houseNextComposition.addEventListener("click", () => {
      moveToComposition(1);
    });
    elements.houseSeatShareChart.addEventListener("click", handleChartClick);
    elements.houseChartRegion.addEventListener("keydown", handleChartKeyboard);
    const handleChartLayoutChange = () => {
      activeChartLayout = getActiveChartLayout();
      if (!activeSeatShareSeries || !activeChartDomain) return;
      renderSeatShareChart(activeSeatShareSeries, activeChartDomain);
      if (activeSnapshot) updateCurrentChartMarker(activeSnapshot);
    };
    [compactChartQuery, mediumChartQuery].forEach((query) => {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handleChartLayoutChange);
      } else if (typeof query.addListener === "function") {
        query.addListener(handleChartLayoutChange);
      }
    });

    loadYear(initial.year);

    function readInitialState(availableYears) {
      const params = new URLSearchParams(window.location.search);
      const requestedYear = Number(params.get("year"));
      const year = availableYears.includes(requestedYear)
        ? requestedYear
        : availableYears.at(-1);
      return { year, weight: clampWeight(params.get("w")) };
    }

    function loadYear(year) {
      activeYearModel = buildYearModel(engine, year);
      renderYearInputs();
      renderCurrentWeight(true);
    }

    function requestRender() {
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        renderCurrentWeight();
      });
    }

    function renderYearInputs() {
      const model = activeYearModel;
      elements.houseYearSelect.value = String(model.year);
      elements.houseCoverageDetail.textContent = formatCoverageDetail(model);
      elements.houseCoverageValue.textContent = `${model.totalSeats} of ${FULL_HOUSE_SEATS} seats`;
      elements.houseCoverageBar.style.width = `${(model.totalSeats / FULL_HOUSE_SEATS) * 100}%`;
      elements.houseUncoveredSeats.textContent = formatOutsideAssignments(model);
      elements.houseDemVoteShare.textContent = formatPercent(model.demSupport, 1);
      elements.houseRepVoteShare.textContent = formatPercent(model.repSupport, 1);
      elements.houseCompositionBar.setAttribute(
        "aria-label",
        `Covered-district two-party vote shares: Democratic ${formatPercent(model.demSupport, 1)}, Republican ${formatPercent(model.repSupport, 1)}`,
      );
      elements.houseDemBar.style.width = `${model.demSupport * 100}%`;
      elements.houseRepBar.style.width = `${model.repSupport * 100}%`;
      elements.houseFptpSeats.textContent = formatComposition(
        model.fullFptpDemSeats,
        model.fullFptpRepSeats,
        model.fullFptpOtherSeats,
      );
      elements.houseProportionalSeats.textContent = formatComposition(
        model.fullProportionalDemSeats,
        model.fullProportionalRepSeats,
        model.fullProportionalOtherSeats,
      );
      renderSwitchMarkers(model.switchGroups);
      chamberSeats = renderChamberStructure();
      activeSeatShareSeries = buildHouseSeatShareSeries(model);
      activeChartDomain = getSeatShareChartDomain(activeSeatShareSeries);
      renderSeatShareChart(activeSeatShareSeries, activeChartDomain);
      lastCompositionKey = "";
    }

    function handleWeightKeyboard(event) {
      const directionByKey = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -10,
        PageUp: 10,
      };
      const direction = directionByKey[event.key];
      if (!direction) return;
      event.preventDefault();
      const baseStep = event.shiftKey ? 0.01 : 0.001;
      const nextWeight = clampWeight(
        Number(elements.houseWeight.value) + direction * baseStep,
      );
      elements.houseWeight.value = nextWeight.toFixed(6);
      renderCurrentWeight(true);
    }

    function renderSwitchMarkers(groups) {
      elements.houseWeightMarkers.replaceChildren(
        ...groups.map((group) => {
          const marker = document.createElement("i");
          marker.className = "house-weight-marker";
          marker.style.left = `${group.weight * 100}%`;
          return marker;
        }),
      );
    }

    function renderChamberStructure() {
      const dais = elements.houseChamberSeats.querySelector(".house-chamber-dais");
      const seatEntries = buildChamberSeatLayout(FULL_HOUSE_SEATS).map((position) => {
        const seat = document.createElement("i");
        seat.className = "house-seat";
        seat.setAttribute("aria-hidden", "true");
        seat.style.left = `${position.x}%`;
        seat.style.top = `${position.y}%`;
        return { seat, ...position };
      });
      elements.houseChamberSeats.replaceChildren(
        ...(dais ? [dais] : []),
        ...seatEntries.map((entry) => entry.seat),
      );
      return seatEntries
        .sort(
          (first, second) =>
            first.x - second.x ||
            second.rowIndex - first.rowIndex ||
            first.column - second.column,
        )
        .map((entry) => entry.seat);
    }

    function renderSeatShareChart(series, domain) {
      const svg = elements.houseSeatShareChart;
      activeChartLayout = getActiveChartLayout();
      const {
        width,
        height,
        margin,
        xTicks,
        yTickCount,
        showEventPoints,
        majorityLabel,
        mode,
      } = activeChartLayout;
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = (weight) => margin.left + clampWeight(weight) * plotWidth;
      const y = (share) =>
        margin.top + ((domain.max - share) / (domain.max - domain.min)) * plotHeight;
      const title = svg.querySelector("title") || createSvgElement("title");
      title.id = "houseTrajectorySvgTitle";
      title.textContent = "Democratic share of all 435 House seats by statewide weight";
      const description = elements.houseTrajectoryDescription;
      const rangeText = `${formatPercent(series.minDemSeatShare, 1)} to ${formatPercent(series.maxDemSeatShare, 1)}`;
      description.textContent = `Focused vertical scale. The step line shows the Democratic share of all 435 House seats as w changes from zero to one. Outside-panel assignments remain fixed. There are ${series.events.length} switching points and the share ranges from ${rangeText}. Use the arrow keys to change w, Home for zero, or End for one.`;
      elements.houseChartScale.textContent = `Focused vertical scale: ${formatPercent(domain.min, 1)}–${formatPercent(domain.max, 1)}.`;

      const grid = createSvgElement("g", { class: "house-chart-grid" });
      const yTicks = Array.from({ length: yTickCount }, (_, index) =>
        domain.min + ((domain.max - domain.min) * index) / (yTickCount - 1),
      );
      yTicks.forEach((tick) => {
        const position = y(tick);
        grid.append(
          createSvgElement("line", {
            x1: margin.left,
            x2: width - margin.right,
            y1: position,
            y2: position,
          }),
        );
        const label = createSvgElement("text", {
          x: margin.left - 14,
          y: position,
          class: "house-chart-tick-label house-chart-y-tick",
        });
        label.textContent = formatPercent(tick, 1);
        grid.append(label);
      });

      const majorityShare = (Math.floor(FULL_HOUSE_SEATS / 2) + 1) / FULL_HOUSE_SEATS;
      if (domain.min <= majorityShare && domain.max >= majorityShare) {
        const majority = createSvgElement("g", { class: "house-chart-majority" });
        majority.append(
          createSvgElement("line", {
            x1: margin.left,
            x2: width - margin.right,
            y1: y(majorityShare),
            y2: y(majorityShare),
          }),
        );
        const label = createSvgElement("text", {
          x: width - margin.right - 4,
          y: y(majorityShare) - 8,
        });
        label.textContent = majorityLabel;
        majority.append(label);
        grid.append(majority);
      }

      const axes = createSvgElement("g", { class: "house-chart-axes" });
      axes.append(
        createSvgElement("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: height - margin.bottom,
          y2: height - margin.bottom,
        }),
      );
      xTicks.forEach((tick) => {
        const position = x(tick);
        axes.append(
          createSvgElement("line", {
            x1: position,
            x2: position,
            y1: height - margin.bottom,
            y2: height - margin.bottom + 7,
          }),
        );
        const label = createSvgElement("text", {
          x: position,
          y: height - margin.bottom + 27,
          class: "house-chart-tick-label house-chart-x-tick",
        });
        label.textContent = tick.toFixed(tick === 0 || tick === 1 ? 0 : mode === "compact" ? 1 : 2);
        axes.append(label);
      });

      const xLabel = createSvgElement("text", {
        x: margin.left + plotWidth / 2,
        y: height - 14,
        class: "house-chart-axis-title house-chart-x-title",
      });
      xLabel.textContent = "Statewide weight w";
      const yLabel = mode === "compact"
        ? createSvgElement("text", {
          x: margin.left,
          y: 21,
          class: "house-chart-axis-title house-chart-y-title house-chart-y-title-compact",
        })
        : createSvgElement("text", {
          x: 18,
          y: margin.top + plotHeight / 2,
          class: "house-chart-axis-title house-chart-y-title",
          transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`,
        });
      yLabel.textContent = mode === "compact"
        ? "Democratic House share"
        : "Democratic share of all 435 seats";
      axes.append(xLabel, yLabel);

      const pathData = series.vertices
        .map((vertex, index) => `${index ? "L" : "M"}${x(vertex.weight).toFixed(2)},${y(vertex.demSeatShare).toFixed(2)}`)
        .join(" ");
      const path = createSvgElement("path", {
        class: "house-chart-path",
        d: pathData,
      });
      const eventPoints = createSvgElement("g", {
        class: "house-chart-events",
        "aria-hidden": "true",
      });
      if (showEventPoints) {
        series.events.forEach((event) => {
          eventPoints.append(
            createSvgElement("circle", {
              cx: x(event.weight),
              cy: y(event.exactDemSeats / series.totalSeats),
              r: 2.8,
            }),
          );
        });
      }
      const currentGuide = createSvgElement("line", {
        id: "houseChartCurrentGuide",
        class: "house-chart-current-guide",
        y1: margin.top,
        y2: height - margin.bottom,
      });
      const currentPoint = createSvgElement("circle", {
        id: "houseChartCurrentPoint",
        class: "house-chart-current-point",
        r: mode === "compact" ? 6 : 7,
      });

      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.dataset.chartMode = mode;
      svg.dataset.plotLeft = String(margin.left);
      svg.dataset.plotRight = String(width - margin.right);
      svg.dataset.yMin = String(domain.min);
      svg.dataset.yMax = String(domain.max);
      svg.replaceChildren(title, description, grid, axes, path, eventPoints, currentGuide, currentPoint);
    }

    function updateCurrentChartMarker(snapshot) {
      if (!activeChartDomain) return;
      const { width, height, margin } = activeChartLayout;
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = margin.left + snapshot.weight * plotWidth;
      const y =
        margin.top +
        ((activeChartDomain.max - snapshot.fullDemSeatShare) /
          (activeChartDomain.max - activeChartDomain.min)) *
          plotHeight;
      const guide = elements.houseSeatShareChart.querySelector("#houseChartCurrentGuide");
      const point = elements.houseSeatShareChart.querySelector("#houseChartCurrentPoint");
      guide?.setAttribute("x1", String(x));
      guide?.setAttribute("x2", String(x));
      point?.setAttribute("cx", String(x));
      point?.setAttribute("cy", String(y));
      const formattedWeight = formatWeightWithPercent(snapshot.weight, engine);
      elements.houseTrajectoryReading.textContent = `At ${formattedWeight}, Democrats hold ${snapshot.fullDemSeats} of 435 seats (${formatPercent(snapshot.fullDemSeatShare, 1)}).`;
      elements.houseTrajectoryDescription.textContent = `The step line shows the Democratic share of all 435 House seats as w changes from zero to one. At ${formattedWeight}, Democrats hold ${snapshot.fullDemSeats} seats, or ${formatPercent(snapshot.fullDemSeatShare, 1)}. Outside-panel assignments remain fixed. The focused vertical scale runs from ${formatPercent(activeChartDomain.min, 1)} to ${formatPercent(activeChartDomain.max, 1)}. Use the arrow keys to change w, Home for zero, or End for one.`;
      elements.houseSeatShareChart.removeAttribute("aria-label");
    }

    function handleChartKeyboard(event) {
      const currentWeight = clampWeight(elements.houseWeight.value);
      const step = event.shiftKey ? 0.05 : 0.01;
      const nextByKey = {
        ArrowLeft: currentWeight - step,
        ArrowDown: currentWeight - step,
        ArrowRight: currentWeight + step,
        ArrowUp: currentWeight + step,
        PageDown: currentWeight - 0.1,
        PageUp: currentWeight + 0.1,
        Home: 0,
        End: 1,
      };
      if (!(event.key in nextByKey)) return;
      event.preventDefault();
      elements.houseWeight.value = String(clampWeight(nextByKey[event.key]));
      renderCurrentWeight(true);
    }

    function handleChartClick(event) {
      const bounds = elements.houseSeatShareChart.getBoundingClientRect();
      if (!bounds.width) return;
      const weight = getWeightFromChartPoint(
        event.clientX,
        bounds,
        activeChartLayout,
      );
      elements.houseWeight.value = String(weight);
      renderCurrentWeight(true);
      elements.houseWeight.focus({ preventScroll: true });
    }

    function renderCurrentWeight(force = false) {
      if (!activeYearModel) return;
      const weight = clampWeight(elements.houseWeight.value);
      elements.houseWeight.value = String(weight);
      activeSnapshot = computeHouseSnapshot(activeYearModel, weight);
      const compositionKey = `${activeSnapshot.fullDemSeats}-${activeSnapshot.fullRepSeats}-${activeSnapshot.fullOtherSeats}-${activeSnapshot.flips}-${activeSnapshot.democraticSwitches}-${activeSnapshot.republicanSwitches}-${activeSnapshot.stateResults
        .map((state) => state.demSeats)
        .join("-")}`;

      const formattedWeight = formatWeightWithPercent(weight, engine);
      elements.houseWeightValue.value = formattedWeight;
      elements.houseWeightValue.textContent = formattedWeight;
      elements.houseWeight.setAttribute(
        "aria-valuetext",
        `w ${formatWeight(weight, engine)}; ${formatWeightShare(1 - weight, engine)} local district results and ${formatWeightShare(weight, engine)} statewide representation; ${activeSnapshot.fullDemSeats} Democratic, ${activeSnapshot.fullRepSeats} Republican, and ${activeSnapshot.fullOtherSeats} Independent House seats; outside-panel assignments remain fixed`,
      );
      renderWeightReading(activeSnapshot);
      renderSwitchReading(activeSnapshot.weight);
      updateUrl(activeSnapshot.year, activeSnapshot.weight);
      updateCurrentChartMarker(activeSnapshot);

      if (!force && compositionKey === lastCompositionKey) return;
      lastCompositionKey = compositionKey;
      renderComposition(activeSnapshot);
    }

    function renderWeightReading(snapshot) {
      if (snapshot.weight <= SWITCH_TOLERANCE) {
        elements.houseWeightReading.textContent =
          "At w = 0, every covered district retains its local plurality winner.";
        return;
      }
      if (snapshot.weight >= 1 - SWITCH_TOLERANCE) {
        elements.houseWeightReading.textContent =
          "At w = 1, each state reaches its nearest whole-seat proportional target; district placement no longer affects the objective.";
        return;
      }
      elements.houseWeightReading.textContent = `${formatWeightShare(1 - snapshot.weight, engine)} local district results · ${formatWeightShare(snapshot.weight, engine)} statewide representation.`;
    }

    function renderSwitchReading(weight) {
      const groups = activeYearModel.switchGroups;
      const previous = [...groups]
        .reverse()
        .find((group) => group.weight < weight - SWITCH_TOLERANCE);
      const next = groups.find((group) => group.weight > weight + SWITCH_TOLERANCE);
      elements.housePreviousComposition.disabled = !previous;
      elements.houseNextComposition.disabled = !next;
      if (!next) {
        elements.houseSwitchReading.textContent = "No later recorded composition is available; w = 1 is the proportional endpoint.";
        return;
      }
      const stateNames = next.states.map((item) => item.code).join(", ");
      const direction = next.demDelta > 0 ? `D +${next.demDelta}` : next.demDelta < 0 ? `R +${Math.abs(next.demDelta)}` : "offsetting state moves";
      elements.houseSwitchReading.textContent = `Next recorded switch: w = ${formatWeight(next.weight, engine)} · ${stateNames} · ${direction}.`;
    }

    function renderComposition(snapshot) {
      elements.houseDemSeats.textContent = String(snapshot.fullDemSeats);
      elements.houseRepSeats.textContent = String(snapshot.fullRepSeats);
      elements.houseOtherSeats.textContent = String(snapshot.fullOtherSeats);
      elements.houseOtherSeatSummary.hidden = snapshot.fullOtherSeats === 0;
      elements.houseOtherLegend.hidden = snapshot.fullOtherSeats === 0;
      elements.housePanelSeatSummary.setAttribute(
        "aria-label",
        `${snapshot.year} House at ${formatWeightWithPercent(snapshot.weight, engine)}: ${snapshot.fullDemSeats} Democratic seats, ${snapshot.fullRepSeats} Republican seats, and ${snapshot.fullOtherSeats} Independent seats. The fixed outside-panel seats include ${activeYearModel.outsideDemSeats} Democratic, ${activeYearModel.outsideRepSeats} Republican, and ${activeYearModel.outsideOtherSeats} Independent seats.`,
      );
      elements.houseChamberSeats.setAttribute(
        "aria-label",
        `${snapshot.fullDemSeats} Democratic, ${snapshot.fullRepSeats} Republican, and ${snapshot.fullOtherSeats} Independent seats across all 435 House positions. The modeled panel contains ${snapshot.demSeats} Democratic and ${snapshot.repSeats} Republican seats. Fixed outside-panel assignments contain ${activeYearModel.outsideDemSeats} Democratic, ${activeYearModel.outsideRepSeats} Republican, and ${activeYearModel.outsideOtherSeats} Independent seats. Dark-and-gold rings mark ${snapshot.democraticSwitches} seats changed from a Republican local winner to Democratic and ${snapshot.republicanSwitches} changed from a Democratic local winner to Republican. Seats are arranged for composition only, not member seating or geography.`,
      );
      const chamberCategories = chamberSeats.map((seat, index) =>
        getChamberSeatCategory(index, snapshot, activeYearModel),
      );
      const switchIndexes = getChamberSwitchIndexes(
        chamberCategories,
        snapshot.democraticSwitches,
        snapshot.republicanSwitches,
      );
      const switchedToDemocratic = new Set(switchIndexes.toDemocratic);
      const switchedToRepublican = new Set(switchIndexes.toRepublican);
      chamberSeats.forEach((seat, index) => {
        const category = chamberCategories[index];
        const switchedToDem = switchedToDemocratic.has(index);
        const switchedToRep = switchedToRepublican.has(index);
        seat.dataset.seatCategory = category;
        seat.classList.toggle(
          "is-dem",
          category === "modeled-dem" || category === "fixed-dem",
        );
        seat.classList.toggle(
          "is-rep",
          category === "modeled-rep" || category === "fixed-rep",
        );
        seat.classList.toggle("is-other", category === "fixed-other");
        seat.classList.toggle("is-fixed-dem", category === "fixed-dem");
        seat.classList.toggle("is-fixed-rep", category === "fixed-rep");
        seat.classList.toggle("is-switched", switchedToDem || switchedToRep);
        seat.classList.toggle("is-switched-to-dem", switchedToDem);
        seat.classList.toggle("is-switched-to-rep", switchedToRep);
      });

      elements.houseDistrictsChanged.textContent = String(snapshot.flips);
      elements.houseDemocraticSwitches.textContent = String(
        snapshot.democraticSwitches,
      );
      elements.houseRepublicanSwitches.textContent = String(
        snapshot.republicanSwitches,
      );
      elements.houseChangedSummary.setAttribute(
        "aria-label",
        `${snapshot.flips} changed ${snapshot.flips === 1 ? "district" : "districts"}: ${snapshot.democraticSwitches} switched to a Democratic assignment and ${snapshot.republicanSwitches} switched to a Republican assignment.`,
      );
      elements.houseDistrictsChangedNote.textContent = `${snapshot.flips} of ${snapshot.totalSeats} covered district assignments differ from their local plurality winner; fixed outside seats are excluded.`;
    }

    function moveToComposition(direction) {
      const weight = getAdjacentCompositionWeight(
        activeYearModel.switchGroups,
        elements.houseWeight.value,
        direction,
      );
      elements.houseWeight.value = String(weight);
      renderCurrentWeight(true);
      elements.houseWeight.focus({ preventScroll: true });
    }

    function updateUrl(year, weight) {
      if (preserveCleanPageUrl || !window.history?.replaceState) return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("year", String(year));
        url.searchParams.set("w", Number(weight).toFixed(6));
        window.history.replaceState(null, "", url);
      } catch {
        // Direct file previews can disallow History API URL changes; the page still works.
      }
    }
  }

  const api = {
    FULL_HOUSE_SEATS,
    HOUSE_CHART_LAYOUTS,
    OUTSIDE_PANEL_SEATS_BY_YEAR,
    SWITCH_TOLERANCE,
    clampWeight,
    getHouseChartLayout,
    getHouseChartMode,
    getWeightFromChartPoint,
    getAvailableYears,
    buildYearModel,
    buildSwitchGroups,
    countDirectionalSwitches,
    computeHouseSnapshot,
    computeMajorityInversion,
    distributeSeats,
    buildChamberSeatLayout,
    getChamberSeatCategory,
    getChamberSwitchIndexes,
    buildHouseSeatShareSeries,
    getSeatShareChartDomain,
    getAdjacentCompositionWeight,
    formatComposition,
    formatWeight,
    formatWeightWithPercent,
    formatWeightShare,
    formatCoverageDetail,
    formatOutsideAssignments,
  };

  globalThis.__HOUSE_EXPLORER__ = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initializeHousePage);
  }
})();
