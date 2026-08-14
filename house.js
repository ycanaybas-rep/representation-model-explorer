"use strict";

(() => {
  const FULL_HOUSE_SEATS = 435;
  const DEFAULT_WEIGHT = 0;
  const SWITCH_TOLERANCE = 1e-10;
  const CHAMBER_ROWS = 12;
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HOUSE_CHART_VIEWBOX = Object.freeze({
    width: 960,
    height: 440,
    margin: Object.freeze({ top: 30, right: 32, bottom: 68, left: 86 }),
  });

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
        demSeats: snapshot.demSeats,
        demSeatShare: snapshot.demSeatShare,
      };
    });
    const events = eventGroups.map((group, index) => {
      const exact = computeHouseSnapshot(yearModel, group.weight);
      return {
        weight: group.weight,
        states: group.states.map((item) => ({ ...item })),
        beforeDemSeats: regimes[index].demSeats,
        exactDemSeats: exact.demSeats,
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
    if (Math.abs(endpoint.demSeatShare - vertices.at(-1).demSeatShare) > 1e-12) {
      vertices.push({ weight: 1, demSeatShare: endpoint.demSeatShare });
    }
    const shares = [
      ...regimes.map((regime) => regime.demSeatShare),
      ...events.map((event) => event.exactDemSeats / yearModel.totalSeats),
      endpoint.demSeatShare,
    ];
    return {
      totalSeats: yearModel.totalSeats,
      regimes,
      events,
      vertices,
      endpoint: {
        demSeats: endpoint.demSeats,
        demSeatShare: endpoint.demSeatShare,
      },
      minDemSeats: Math.min(...shares.map((share) => Math.round(share * yearModel.totalSeats))),
      maxDemSeats: Math.max(...shares.map((share) => Math.round(share * yearModel.totalSeats))),
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

  function formatComposition(demSeats, totalSeats) {
    return `${demSeats} D / ${totalSeats - demSeats} R`;
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
      "houseDemVoteShare",
      "houseRepVoteShare",
      "houseFptpSeats",
      "houseProportionalSeats",
      "houseDistrictsChanged",
      "houseDistrictsChangedNote",
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
      elements.houseCoverageDetail.textContent = formatCoverageDetail(model);
      elements.houseCoverageValue.textContent = `${model.totalSeats} of ${FULL_HOUSE_SEATS} seats`;
      elements.houseCoverageBar.style.width = `${(model.totalSeats / FULL_HOUSE_SEATS) * 100}%`;
      elements.houseUncoveredSeats.textContent = `${model.uncoveredSeats} seats are outside this year’s panel and remain unassigned here.`;
      elements.houseDemVoteShare.textContent = formatPercent(model.demSupport, 1);
      elements.houseRepVoteShare.textContent = formatPercent(model.repSupport, 1);
      elements.houseCompositionBar.setAttribute(
        "aria-label",
        `Covered-district two-party vote shares: Democratic ${formatPercent(model.demSupport, 1)}, Republican ${formatPercent(model.repSupport, 1)}`,
      );
      elements.houseDemBar.style.width = `${model.demSupport * 100}%`;
      elements.houseRepBar.style.width = `${model.repSupport * 100}%`;
      elements.houseFptpSeats.textContent = formatComposition(
        model.fptpDemSeats,
        model.totalSeats,
      );
      elements.houseProportionalSeats.textContent = formatComposition(
        model.proportionalDemSeats,
        model.totalSeats,
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
      const { width, height, margin } = HOUSE_CHART_VIEWBOX;
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = (weight) => margin.left + clampWeight(weight) * plotWidth;
      const y = (share) =>
        margin.top + ((domain.max - share) / (domain.max - domain.min)) * plotHeight;
      const title = svg.querySelector("title") || createSvgElement("title");
      title.id = "houseTrajectorySvgTitle";
      title.textContent = `Democratic share of ${series.totalSeats} covered House seats by statewide weight`;
      const description = elements.houseTrajectoryDescription;
      const rangeText = `${formatPercent(series.minDemSeatShare, 1)} to ${formatPercent(series.maxDemSeatShare, 1)}`;
      description.textContent = `Focused vertical scale. The step line shows the modeled Democratic share of ${series.totalSeats} covered House seats as w changes from zero to one. There are ${series.events.length} switching points and the share ranges from ${rangeText}.`;
      elements.houseChartScale.textContent = `Focused vertical scale: ${formatPercent(domain.min, 1)}–${formatPercent(domain.max, 1)}.`;

      const grid = createSvgElement("g", { class: "house-chart-grid" });
      const yTicks = Array.from({ length: 5 }, (_, index) =>
        domain.min + ((domain.max - domain.min) * index) / 4,
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

      if (domain.min <= 0.5 && domain.max >= 0.5) {
        const majority = createSvgElement("g", { class: "house-chart-majority" });
        majority.append(
          createSvgElement("line", {
            x1: margin.left,
            x2: width - margin.right,
            y1: y(0.5),
            y2: y(0.5),
          }),
        );
        const label = createSvgElement("text", {
          x: width - margin.right - 4,
          y: y(0.5) - 8,
        });
        label.textContent = "50% majority";
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
      [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
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
        label.textContent = tick.toFixed(tick === 0 || tick === 1 ? 0 : 2);
        axes.append(label);
      });

      const xLabel = createSvgElement("text", {
        x: margin.left + plotWidth / 2,
        y: height - 14,
        class: "house-chart-axis-title house-chart-x-title",
      });
      xLabel.textContent = "Statewide weight w";
      const yLabel = createSvgElement("text", {
        x: 18,
        y: margin.top + plotHeight / 2,
        class: "house-chart-axis-title house-chart-y-title",
        transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`,
      });
      yLabel.textContent = "Democratic share of covered seats";
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
      series.events.forEach((event) => {
        eventPoints.append(
          createSvgElement("circle", {
            cx: x(event.weight),
            cy: y(event.exactDemSeats / series.totalSeats),
            r: 2.8,
          }),
        );
      });
      const currentGuide = createSvgElement("line", {
        id: "houseChartCurrentGuide",
        class: "house-chart-current-guide",
        y1: margin.top,
        y2: height - margin.bottom,
      });
      const currentPoint = createSvgElement("circle", {
        id: "houseChartCurrentPoint",
        class: "house-chart-current-point",
        r: 7,
      });

      svg.dataset.plotLeft = String(margin.left);
      svg.dataset.plotRight = String(width - margin.right);
      svg.dataset.yMin = String(domain.min);
      svg.dataset.yMax = String(domain.max);
      svg.replaceChildren(title, description, grid, axes, path, eventPoints, currentGuide, currentPoint);
    }

    function updateCurrentChartMarker(snapshot) {
      if (!activeChartDomain) return;
      const { width, height, margin } = HOUSE_CHART_VIEWBOX;
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = margin.left + snapshot.weight * plotWidth;
      const y =
        margin.top +
        ((activeChartDomain.max - snapshot.demSeatShare) /
          (activeChartDomain.max - activeChartDomain.min)) *
          plotHeight;
      const guide = elements.houseSeatShareChart.querySelector("#houseChartCurrentGuide");
      const point = elements.houseSeatShareChart.querySelector("#houseChartCurrentPoint");
      guide?.setAttribute("x1", String(x));
      guide?.setAttribute("x2", String(x));
      point?.setAttribute("cx", String(x));
      point?.setAttribute("cy", String(y));
      const formattedWeight = formatWeightWithPercent(snapshot.weight, engine);
      elements.houseTrajectoryReading.textContent = `At ${formattedWeight}, Democrats hold ${snapshot.demSeats} of ${snapshot.totalSeats} covered seats (${formatPercent(snapshot.demSeatShare, 1)}).`;
      elements.houseTrajectoryDescription.textContent = `The step line shows the modeled Democratic share of ${snapshot.totalSeats} covered House seats as w changes from zero to one. At ${formattedWeight}, Democrats hold ${snapshot.demSeats} seats, or ${formatPercent(snapshot.demSeatShare, 1)}. The focused vertical scale runs from ${formatPercent(activeChartDomain.min, 1)} to ${formatPercent(activeChartDomain.max, 1)}.`;
      elements.houseSeatShareChart.removeAttribute("aria-label");
    }

    function handleChartClick(event) {
      const bounds = elements.houseSeatShareChart.getBoundingClientRect();
      if (!bounds.width) return;
      const viewboxX = ((event.clientX - bounds.left) / bounds.width) * HOUSE_CHART_VIEWBOX.width;
      const { margin, width } = HOUSE_CHART_VIEWBOX;
      const weight = clampWeight(
        (viewboxX - margin.left) / (width - margin.left - margin.right),
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
      const compositionKey = `${activeSnapshot.demSeats}-${activeSnapshot.repSeats}-${activeSnapshot.stateResults
        .map((state) => state.demSeats)
        .join("-")}`;

      const formattedWeight = formatWeightWithPercent(weight, engine);
      elements.houseWeightValue.value = formattedWeight;
      elements.houseWeightValue.textContent = formattedWeight;
      elements.houseWeight.setAttribute(
        "aria-valuetext",
        `w ${formatWeight(weight, engine)}; ${formatWeightShare(1 - weight, engine)} local district results and ${formatWeightShare(weight, engine)} statewide representation; ${activeSnapshot.demSeats} Democratic and ${activeSnapshot.repSeats} Republican modeled seats`,
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
      elements.houseWeightReading.textContent = `${formatWeightShare(1 - snapshot.weight, engine)} local district results · ${formatWeightShare(snapshot.weight, engine)} statewide representation. The House total changes only when a state crosses a switching point.`;
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
        `${snapshot.year} modeled panel at ${formatWeightWithPercent(snapshot.weight, engine)}: ${snapshot.demSeats} Democratic seats and ${snapshot.repSeats} Republican seats`,
      );
      elements.houseChamberSeats.setAttribute(
        "aria-label",
        `${snapshot.demSeats} Democratic and ${snapshot.repSeats} Republican seats among ${snapshot.totalSeats} covered House districts, plus ${activeYearModel.uncoveredSeats} neutral positions outside the panel. Seats are arranged for composition only, not member seating or geography.`,
      );
      const republicanStart = FULL_HOUSE_SEATS - snapshot.repSeats;
      chamberSeats.forEach((seat, index) => {
        seat.classList.toggle("is-dem", index < snapshot.demSeats);
        seat.classList.toggle("is-rep", index >= republicanStart);
        seat.classList.toggle(
          "is-uncovered",
          index >= snapshot.demSeats && index < republicanStart,
        );
      });

      elements.houseDistrictsChanged.textContent = String(snapshot.flips);
      elements.houseDistrictsChangedNote.textContent = `${snapshot.flips} of ${snapshot.totalSeats} modeled district assignments differ from their local plurality winner.`;
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
    SWITCH_TOLERANCE,
    clampWeight,
    getAvailableYears,
    buildYearModel,
    buildSwitchGroups,
    computeHouseSnapshot,
    computeMajorityInversion,
    distributeSeats,
    buildChamberSeatLayout,
    buildHouseSeatShareSeries,
    getSeatShareChartDomain,
    getAdjacentCompositionWeight,
    formatComposition,
    formatWeight,
    formatWeightWithPercent,
    formatWeightShare,
    formatCoverageDetail,
  };

  globalThis.__HOUSE_EXPLORER__ = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initializeHousePage);
  }
})();
