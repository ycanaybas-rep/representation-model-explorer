"use strict";

(() => {
  const FULL_HOUSE_SEATS = 435;
  const DEFAULT_WEIGHT = 0;
  const SWITCH_TOLERANCE = 1e-10;
  const CHAMBER_ROWS = 12;

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
        return {
          name,
          code: config.code,
          districts,
          metrics,
          frontier,
          election,
          quality,
          switchWeights: (election?.switchWeights || []).slice(),
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

    return {
      engine,
      year: numericYear,
      spec: compilation.compiled,
      states,
      stateCount: states.length,
      totalSeats,
      uncoveredSeats: Math.max(0, FULL_HOUSE_SEATS - totalSeats),
      demSupport: totalRho / totalSeats,
      repSupport: 1 - totalRho / totalSeats,
      fptpDemSeats,
      fptpRepSeats: totalSeats - fptpDemSeats,
      proportionalDemSeats,
      proportionalRepSeats: totalSeats - proportionalDemSeats,
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
      return state.switchWeights.map((weight) => ({
        weight: Number(weight),
        state: state.name,
        code: state.code,
        demDelta: demDirection,
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

  function computeHouseSnapshot(yearModel, weight) {
    const w = clampWeight(weight);
    const stateResults = yearModel.states.map((state) => {
      const curve = yearModel.engine.buildObjectiveCurve(
        state.frontier,
        state.metrics,
        w,
        yearModel.spec,
      );
      const best = yearModel.engine.chooseBestCandidate(curve, state.metrics);
      const demSeatChange = best.demSeats - state.metrics.demSeats;
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
        districtLoss: best.districtLoss,
        statewideLoss: best.statewideLoss,
        totalLoss: best.totalLoss,
      };
    });

    const demSeats = stateResults.reduce((total, state) => total + state.demSeats, 0);
    const repSeats = yearModel.totalSeats - demSeats;
    const flips = stateResults.reduce((total, state) => total + state.flips, 0);
    const seatShare = demSeats / yearModel.totalSeats;
    const seatSupportGap = seatShare - yearModel.demSupport;
    const efficiencyGap = seatShare - 2 * yearModel.demSupport + 0.5;
    const majorityInversion = computeMajorityInversion(
      yearModel.demSupport,
      seatShare,
    );

    return {
      year: yearModel.year,
      weight: w,
      totalSeats: yearModel.totalSeats,
      demSeats,
      repSeats,
      demSeatShare: seatShare,
      repSeatShare: 1 - seatShare,
      demSupport: yearModel.demSupport,
      repSupport: yearModel.repSupport,
      seatSupportGap,
      efficiencyGap,
      gallagherIndex: Math.abs(seatSupportGap),
      flips,
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

  function formatSupportRatio(demSupport) {
    const dem = clampWeight(demSupport);
    const rep = 1 - dem;
    if (rep <= 1e-12) return "D:R all D";
    if (dem <= 1e-12) return "D:R all R";
    const quotient = dem / rep;
    return quotient >= 1
      ? `D:R ${quotient.toFixed(3)}:1`
      : `D:R 1:${(1 / quotient).toFixed(3)}`;
  }

  function formatComposition(demSeats, totalSeats) {
    return `${demSeats} D / ${totalSeats - demSeats} R`;
  }

  function formatPercent(value, digits = 1) {
    return `${(Number(value) * 100).toFixed(digits)}%`;
  }

  function formatDirectionalPoints(value, positiveParty = "D") {
    if (Math.abs(value) < 0.0005) return "Even";
    const negativeParty = positiveParty === "D" ? "R" : "D";
    return `${value > 0 ? positiveParty : negativeParty} +${(Math.abs(value) * 100).toFixed(1)} pts`;
  }

  function formatWeight(value, engine = null) {
    const w = clampWeight(value);
    const digits = engine?.getWeightValuePrecision
      ? engine.getWeightValuePrecision(w)
      : Math.abs(w) < 0.01 && w !== 0
        ? 6
        : 3;
    return w.toFixed(digits);
  }

  function describeSeatChange(delta) {
    if (!delta) return "No change";
    return `${delta > 0 ? "D" : "R"} +${Math.abs(delta)}`;
  }

  function initializeHousePage() {
    if (document.body?.dataset.page !== "house") return;
    const engine = globalThis.__MODEL_EXPLORER__;
    if (!engine) throw new Error("The model engine did not load.");

    const ids = [
      "houseCoverageHeadline",
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
      "houseChamberSeats",
      "houseCompositionBar",
      "houseDemBar",
      "houseRepBar",
      "houseCoverageValue",
      "houseCoverageBar",
      "houseUncoveredSeats",
      "houseSupportRatio",
      "houseSupportShares",
      "houseFptpSeats",
      "houseNetChange",
      "houseProportionalSeats",
      "houseStatesChanged",
      "houseStatesChangedNote",
      "houseSeatShare",
      "houseSeatVoteGap",
      "houseEfficiencyGap",
      "houseGallagher",
      "housePluralityRetained",
      "houseMajorityInversion",
      "houseStateRows",
      "houseStateBreakdownNote",
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
    let chamberSeats = [];
    let renderFrame = 0;
    let lastCompositionKey = "";

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

    elements.housePreviousComposition.addEventListener("click", () => {
      moveToComposition(-1);
    });
    elements.houseNextComposition.addEventListener("click", () => {
      moveToComposition(1);
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
      elements.houseCoverageHeadline.textContent = `${model.stateCount} states · ${model.totalSeats} of 435 seats`;
      elements.houseCoverageDetail.textContent = `${model.stateCount} covered states, ${model.totalSeats} districts, ${model.switchGroups.length} recorded switching points.`;
      elements.houseCoverageValue.textContent = `${model.totalSeats} of ${FULL_HOUSE_SEATS} seats`;
      elements.houseCoverageBar.style.width = `${(model.totalSeats / FULL_HOUSE_SEATS) * 100}%`;
      elements.houseUncoveredSeats.textContent = `${model.uncoveredSeats} seats are outside this year’s panel and remain unassigned here.`;
      elements.houseSupportRatio.textContent = formatSupportRatio(model.demSupport);
      elements.houseSupportShares.textContent = `D ${formatPercent(model.demSupport, 1)} · R ${formatPercent(model.repSupport, 1)}. Equal-district support; not turnout-weighted.`;
      elements.houseFptpSeats.textContent = formatComposition(
        model.fptpDemSeats,
        model.totalSeats,
      );
      elements.houseProportionalSeats.textContent = formatComposition(
        model.proportionalDemSeats,
        model.totalSeats,
      );
      elements.houseStateBreakdownNote.textContent = `${model.proxyCount} district shares use a source proxy${
        model.largeThirdPartyCount
          ? `; ${model.largeThirdPartyCount} also carry the large-third-party flag`
          : ""
      }. Each row is optimized separately.`;
      renderSwitchMarkers(model.switchGroups);
      chamberSeats = renderChamberStructure(model.totalSeats);
      lastCompositionKey = "";
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

    function renderChamberStructure(totalSeats) {
      const seatEntries = [];
      const rows = distributeSeats(totalSeats);
      const rowElements = rows.map((count, rowIndex) => {
        const row = document.createElement("div");
        row.className = "house-seat-row";
        for (let column = 0; column < count; column += 1) {
          const seat = document.createElement("i");
          seat.className = "house-seat";
          seat.setAttribute("aria-hidden", "true");
          row.append(seat);
          const horizontal = count === 1 ? 0 : (column / (count - 1)) * 2 - 1;
          seatEntries.push({ seat, horizontal, rowIndex, column });
        }
        return row;
      });
      elements.houseChamberSeats.replaceChildren(...rowElements);
      return seatEntries
        .sort(
          (first, second) =>
            first.horizontal - second.horizontal ||
            second.rowIndex - first.rowIndex ||
            first.column - second.column,
        )
        .map((entry) => entry.seat);
    }

    function renderCurrentWeight(force = false) {
      if (!activeYearModel) return;
      const weight = clampWeight(elements.houseWeight.value);
      elements.houseWeight.value = String(weight);
      activeSnapshot = computeHouseSnapshot(activeYearModel, weight);
      const compositionKey = `${activeSnapshot.demSeats}-${activeSnapshot.repSeats}-${activeSnapshot.stateResults
        .map((state) => state.demSeats)
        .join("-")}`;

      elements.houseWeightValue.value = `w = ${formatWeight(weight, engine)}`;
      elements.houseWeightValue.textContent = `w = ${formatWeight(weight, engine)}`;
      elements.houseWeight.setAttribute(
        "aria-valuetext",
        `w ${formatWeight(weight, engine)}; ${Math.round((1 - weight) * 100)} percent local district fit and ${Math.round(weight * 100)} percent state proportionality; ${activeSnapshot.demSeats} Democratic and ${activeSnapshot.repSeats} Republican modeled seats`,
      );
      renderWeightReading(activeSnapshot);
      renderSwitchReading(activeSnapshot.weight);
      updateUrl(activeSnapshot.year, activeSnapshot.weight);

      if (!force && compositionKey === lastCompositionKey) return;
      lastCompositionKey = compositionKey;
      renderComposition(activeSnapshot);
      renderStateRows(activeSnapshot.stateResults);
    }

    function renderWeightReading(snapshot) {
      const localPercent = Math.round((1 - snapshot.weight) * 100);
      const statewidePercent = 100 - localPercent;
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
      elements.houseWeightReading.textContent = `${localPercent}% local district fit · ${statewidePercent}% state proportionality. The House total changes only when a state crosses a switching point.`;
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
      elements.houseDemSeats.textContent = String(snapshot.demSeats);
      elements.houseRepSeats.textContent = String(snapshot.repSeats);
      elements.housePanelSeatSummary.setAttribute(
        "aria-label",
        `${snapshot.year} modeled panel at w ${formatWeight(snapshot.weight, engine)}: ${snapshot.demSeats} Democratic seats and ${snapshot.repSeats} Republican seats`,
      );
      elements.houseChamberSeats.setAttribute(
        "aria-label",
        `${snapshot.demSeats} Democratic and ${snapshot.repSeats} Republican seats among ${snapshot.totalSeats} covered House districts. Seats are arranged for composition only, not geography.`,
      );
      elements.houseCompositionBar.setAttribute(
        "aria-label",
        `Modeled panel seat shares: Democratic ${formatPercent(snapshot.demSeatShare, 1)}, Republican ${formatPercent(snapshot.repSeatShare, 1)}`,
      );
      elements.houseDemBar.style.width = `${snapshot.demSeatShare * 100}%`;
      elements.houseRepBar.style.width = `${snapshot.repSeatShare * 100}%`;
      chamberSeats.forEach((seat, index) => {
        seat.classList.toggle("is-dem", index < snapshot.demSeats);
        seat.classList.toggle("is-rep", index >= snapshot.demSeats);
      });

      const netDemChange = snapshot.demSeats - activeYearModel.fptpDemSeats;
      elements.houseNetChange.textContent = netDemChange
        ? `${netDemChange > 0 ? "D" : "R"} gains ${Math.abs(netDemChange)} modeled ${Math.abs(netDemChange) === 1 ? "seat" : "seats"} relative to FPTP.`
        : "No net seat change from the district-plurality baseline.";
      elements.houseStatesChanged.textContent = `${snapshot.changedStates} of ${activeYearModel.stateCount}`;
      elements.houseStatesChangedNote.textContent = `${activeYearModel.stateCount - snapshot.changedStates} state delegations still match their FPTP seat totals.`;
      elements.houseSeatShare.textContent = `D ${formatPercent(snapshot.demSeatShare, 1)}`;
      elements.houseSeatVoteGap.textContent = formatDirectionalPoints(snapshot.seatSupportGap, "D");
      elements.houseEfficiencyGap.textContent = formatDirectionalPoints(snapshot.efficiencyGap, "D");
      elements.houseGallagher.textContent = formatPercent(snapshot.gallagherIndex, 1);
      elements.housePluralityRetained.textContent = `${snapshot.pluralityRetained} of ${snapshot.totalSeats}`;
      elements.houseMajorityInversion.textContent = formatMajorityInversion(snapshot);
    }

    function formatMajorityInversion(snapshot) {
      if (snapshot.majorityInversion === null) return "Not applicable · tied support";
      if (!snapshot.majorityInversion) return "No";
      const supportWinner = snapshot.demSupport > 0.5 ? "D" : "R";
      return `Yes · ${supportWinner} leads support`;
    }

    function renderStateRows(states) {
      const rows = states.map((state) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        const name = document.createElement("span");
        name.className = "house-state-name";
        const code = document.createElement("span");
        code.className = "house-state-code";
        code.textContent = state.code;
        name.append(code, document.createTextNode(state.name));
        nameCell.append(name);

        const supportCell = document.createElement("td");
        const support = document.createElement("span");
        support.className = "house-state-support";
        const supportBar = document.createElement("span");
        supportBar.className = "house-state-support-bar";
        const demBar = document.createElement("i");
        demBar.style.width = `${state.demSupport * 100}%`;
        const repBar = document.createElement("i");
        repBar.style.width = `${state.repSupport * 100}%`;
        supportBar.append(demBar, repBar);
        support.append(supportBar, document.createTextNode(`D ${formatPercent(state.demSupport, 1)}`));
        supportCell.append(support);

        const fptpCell = document.createElement("td");
        fptpCell.textContent = formatComposition(state.fptpDemSeats, state.totalSeats);
        const modelCell = document.createElement("td");
        modelCell.textContent = formatComposition(state.demSeats, state.totalSeats);
        const changeCell = document.createElement("td");
        const change = document.createElement("span");
        change.className = `house-state-change ${
          state.demSeatChange > 0 ? "is-dem" : state.demSeatChange < 0 ? "is-rep" : "is-even"
        }`;
        change.textContent = describeSeatChange(state.demSeatChange);
        changeCell.append(change);
        row.append(nameCell, supportCell, fptpCell, modelCell, changeCell);
        return row;
      });
      elements.houseStateRows.replaceChildren(...rows);
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
      if (!window.history?.replaceState) return;
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
    SWITCH_TOLERANCE,
    clampWeight,
    getAvailableYears,
    buildYearModel,
    buildSwitchGroups,
    computeHouseSnapshot,
    computeMajorityInversion,
    distributeSeats,
    getAdjacentCompositionWeight,
    formatSupportRatio,
    formatComposition,
  };

  globalThis.__HOUSE_EXPLORER__ = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initializeHousePage);
  }
})();
