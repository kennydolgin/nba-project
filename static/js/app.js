const successOrder = ["Low-winning teams", "Middle-winning teams", "High-winning teams"];
const colors = {
  "Balanced profile": "#2f6f9f",
  "Mixed profile": "#67a6b8",
  "Narrow profile": "#c65f1a",
  "Efficient lower-shot player": "#3b7f64",
  "Other core player": "#b9c3d1",
  "Top steals + blocks, not top scorer": "#3b7f64",
  "Top steals + blocks + top scorer": "#c65f1a"
};
const compareColors = { A: "#2f6f9f", B: "#c65f1a" };

const viewConfig = {
  profileMix: {
    title: "Role profile mix by team success",
    note: "Broader statistical profiles are somewhat more common on stronger teams, but this pattern is descriptive.",
    dataKey: "profileMix",
    scatterKey: "scoringScatter",
    scatterTitle: "Scoring volume versus team win percentage",
    x: "points_per_game",
    y: "win_pct",
    color: "profile_group",
    xLabel: "Points per game",
    yLabel: "Team win percentage"
  },
  efficientLowerShot: {
    title: "Efficient lower-shot contributors by team success",
    note: "High-winning teams have the largest share of efficient lower-shot player-seasons in this dataset.",
    dataKey: "efficientLowerShot",
    scatterKey: "efficiencyScatter",
    scatterTitle: "Shot volume versus effective field-goal percentage",
    x: "fga_per_game",
    y: "efg_pct",
    color: "team_success_bucket",
    xLabel: "Field-goal attempts per game",
    yLabel: "Effective field-goal percentage"
  },
  defenseOverlap: {
    title: "Defensive-event leaders who are not top scorers",
    note: "Most top steals-plus-blocks player-seasons are not top-quartile scoring seasons.",
    dataKey: "defenseOverlap",
    scatterKey: "defenseScatter",
    scatterTitle: "Scoring versus steals + blocks per 36 minutes",
    x: "points_per_game",
    y: "steals_blocks_per_36",
    color: "defensive_event_profile",
    xLabel: "Points per game",
    yLabel: "Steals + blocks per 36"
  }
};

const compareMetrics = [
  { key: "points_per_36", label: "Scoring", unit: "pts/36", format: d3.format(".1f") },
  { key: "assists_per_36", label: "Creation", unit: "ast/36", format: d3.format(".1f") },
  { key: "rebounds_per_36", label: "Rebounding", unit: "reb/36", format: d3.format(".1f") },
  { key: "stocks_per_36", label: "Defensive events", unit: "stl+blk/36", format: d3.format(".2f") },
  { key: "efg_pct", label: "Shooting efficiency", unit: "eFG%", format: d3.format(".1%") },
  { key: "fga_per_game", label: "Shot volume", unit: "FGA/g", format: d3.format(".1f") },
  { key: "turnovers_per_36", label: "Turnovers", unit: "to/36", format: d3.format(".1f") },
  { key: "role_category_count", label: "Role dimensions", unit: "categories", format: d3.format(".0f") }
];
const roleShapeMetrics = [
  { key: "points_per_36", label: "Scoring", unit: "pts/36", format: d3.format(".1f") },
  { key: "assists_per_36", label: "Creation", unit: "ast/36", format: d3.format(".1f") },
  { key: "rebounds_per_36", label: "Boards", unit: "reb/36", format: d3.format(".1f") },
  { key: "stocks_per_36", label: "Events", unit: "stl+blk/36", format: d3.format(".2f") },
  { key: "efg_pct", label: "Efficiency", unit: "eFG%", format: d3.format(".1%") },
  { key: "role_category_count", label: "Breadth", unit: "roles", format: d3.format(".0f") }
];
const winningBandMetrics = [
  { key: "points_per_36", label: "Scoring", unit: "pts/36", format: d3.format(".1f") },
  { key: "fga_per_game", label: "Shot volume", unit: "FGA/g", format: d3.format(".1f") },
  { key: "assists_per_36", label: "Creation", unit: "ast/36", format: d3.format(".1f") },
  { key: "rebounds_per_36", label: "Rebounding", unit: "reb/36", format: d3.format(".1f") },
  { key: "stocks_per_36", label: "Defensive events", unit: "stl+blk/36", format: d3.format(".2f") },
  { key: "efg_pct", label: "Efficiency", unit: "eFG%", format: d3.format(".1%") },
  { key: "role_category_count", label: "Role dimensions", unit: "roles", format: d3.format(".0f") }
];
const winBucketColors = {
  "Low-winning teams": "#8f9bad",
  "Middle-winning teams": "#2f6f9f",
  "High-winning teams": "#3b7f64"
};
const similarityKeys = [
  "points_per_36",
  "assists_per_36",
  "rebounds_per_36",
  "stocks_per_36",
  "efg_pct"
];

const fmtPct = d3.format(".1%");
const fmtNum = d3.format(",.0f");
const tooltip = d3.select("#tooltip");
const staticBase = (document.body.dataset.staticBase || "/static/").replace(/\/?$/, "/");

let appData;
let playerRows = [];
let rowsByPlayer = new Map();
let percentileLookup = {};
let selectedComparison = [];

function staticUrl(path) {
  return staticBase + path;
}

async function fetchJsonFromAny(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

fetchJsonFromAny(["/api/data", staticUrl("data/nba_app_data.json")])
  .then(async data => {
    appData = data;
    playerRows = (await loadPlayerSeasons(data))
      .map(normalizePlayerRow)
      .filter(row => row.player && Number.isFinite(row.win_pct));
    buildPlayerState();
    initPlayerComparison();
    if (d3.select("#metricRows").node()) {
      renderMetrics(data.summary);
    }
    if (d3.select("#viewSelect").node()) {
      updateView("profileMix");
      d3.select("#viewSelect").on("change", event => updateView(event.target.value));
    }
  })
  .catch(error => {
    d3.select("#barChart").append("p").attr("class", "load-error").text("Unable to load app data.");
    console.error(error);
  });

async function loadPlayerSeasons(data) {
  if (data.playerSeasons && data.playerSeasons.length) return data.playerSeasons;
  try {
    return await d3.csv(staticUrl("data/player_seasons.csv"));
  } catch (error) {
    console.warn("Falling back to sampled player rows.", error);
    return data.scoringScatter || [];
  }
}

function normalizePlayerRow(row) {
  const numericFields = [
    "year", "age", "games", "games_started", "minutes_per_game", "points_per_game",
    "points_per_36", "fga_per_game", "efg_pct", "assists_per_36", "rebounds_per_36",
    "stocks_per_36", "steals_blocks_per_36", "turnovers_per_36", "role_category_count",
    "role_value_score", "win_pct", ...similarityKeys
  ];
  const clean = { ...row };
  numericFields.forEach(field => {
    clean[field] = row[field] === "" || row[field] == null ? NaN : +row[field];
  });
  clean.key = rowKey(clean);
  return clean;
}

function rowKey(row) {
  return `${row.player}|${row.year}|${row.team}`;
}

function buildPlayerState() {
  rowsByPlayer = new Map();
  playerRows.forEach(row => {
    if (!rowsByPlayer.has(row.player)) rowsByPlayer.set(row.player, []);
    rowsByPlayer.get(row.player).push(row);
  });
  rowsByPlayer.forEach(rows => rows.sort((a, b) => d3.descending(a.year, b.year) || d3.descending(a.win_pct, b.win_pct)));
  percentileLookup = {};
  compareMetrics.forEach(metric => {
    percentileLookup[metric.key] = playerRows
      .map(row => row[metric.key])
      .filter(Number.isFinite)
      .sort(d3.ascending);
  });
}

function renderMetrics(summary) {
  d3.select("#metricRows").text(fmtNum(summary.playerSeasonRows));
  d3.select("#metricTeams").text(fmtNum(summary.teamSeasonRecords));
  d3.select("#metricEfficient").text(fmtPct(summary.highWinningEfficientLowerShotShare));
  d3.select("#metricDefense").text(fmtPct(summary.topStocksNotTopScorerShare));
}

function initPlayerComparison() {
  const players = Array.from(rowsByPlayer.keys()).sort(d3.ascending);
  const datalist = d3.select("#playerOptions");
  datalist.selectAll("option")
    .data(players)
    .join("option")
    .attr("value", d => d);

  d3.select("#playerAInput").property("value", chooseDefaultPlayer(["Jrue Holiday", "LeBron James", "Nikola Jokic"], players, 0));
  d3.select("#playerBInput").property("value", chooseDefaultPlayer(["James Harden", "Stephen Curry", "Draymond Green"], players, 1));

  ["A", "B"].forEach(side => {
    d3.select(`#player${side}Input`)
      .on("input", () => {
        if (rowsByPlayer.has(d3.select(`#player${side}Input`).property("value"))) updateSeasonOptions(side);
      })
      .on("change", () => updateSeasonOptions(side));
    d3.select(`#season${side}Select`).on("change", updateComparison);
    updateSeasonOptions(side, false);
  });
  updateComparison();
}

function chooseDefaultPlayer(preferred, players, fallbackIndex) {
  return preferred.find(name => rowsByPlayer.has(name)) || players[fallbackIndex] || "";
}

function updateSeasonOptions(side, shouldUpdate = true) {
  const input = d3.select(`#player${side}Input`);
  const select = d3.select(`#season${side}Select`);
  const currentKey = select.property("value");
  const player = input.property("value");
  const rows = rowsByPlayer.get(player) || [];

  select.selectAll("option")
    .data(rows, d => d.key)
    .join("option")
    .attr("value", d => d.key)
    .text(d => `${d.year} ${d.team} (${fmtPct(d.win_pct)})`);

  const keepCurrent = rows.some(row => row.key === currentKey);
  select.property("value", keepCurrent ? currentKey : (rows[0] ? rows[0].key : ""));
  if (shouldUpdate) updateComparison();
}

function getSelectedRow(side) {
  const player = d3.select(`#player${side}Input`).property("value");
  const key = d3.select(`#season${side}Select`).property("value");
  return (rowsByPlayer.get(player) || []).find(row => row.key === key);
}

function updateComparison() {
  const selected = [
    { side: "A", row: getSelectedRow("A") },
    { side: "B", row: getSelectedRow("B") }
  ].filter(item => item.row);

  selectedComparison = selected;
  renderComparisonInsight(selected);
  renderPlayerCards(selected);
  renderRoleUniverse(selected);
  renderRoleShape(selected);
  renderSimilarityConstellation(selected);
  renderWinningBands(selected);
  renderFingerprintChart(selected);
  renderSimilarityContext(selected);

  if (appData) {
    const viewName = d3.select("#viewSelect").property("value") || "profileMix";
    const config = viewConfig[viewName];
    if (config && appData[config.scatterKey]) renderScatter(appData[config.scatterKey], config);
  }
}

function renderComparisonInsight(selected) {
  const container = d3.select("#comparisonInsight");
  container.selectAll("*").remove();
  if (selected.length < 2) {
    container.append("p").text("Choose two players and seasons to compare their statistical fingerprints.");
    return;
  }

  const summaries = selected.map(item => ({ ...item, summary: getSimilaritySummary(item.row) }));
  const [a, b] = summaries;
  const diff = a.summary.medianWin - b.summary.medianWin;
  const lead = Math.abs(diff) < 0.01
    ? "These two selected profiles have similar historical team-win context."
    : `${diff > 0 ? a.row.player : b.row.player}'s selected profile has the stronger historical team-win context.`;

  container.append("p")
    .html(`<strong>${escapeHtml(lead)}</strong> Comparable player-seasons had median team win percentages of ${fmtPct(a.summary.medianWin)} for ${escapeHtml(a.row.player)} and ${fmtPct(b.summary.medianWin)} for ${escapeHtml(b.row.player)}. Treat this as descriptive evidence, not a causal player ranking.`);
}

function renderPlayerCards(selected) {
  const cards = d3.select("#playerCards");
  cards.selectAll("*").remove();

  cards.selectAll("article")
    .data(selected, d => d.side)
    .join("article")
    .attr("class", d => `player-card side-${d.side.toLowerCase()}`)
    .html(d => {
      const row = d.row;
      const summary = getSimilaritySummary(row);
      return `
        <div class="player-card-heading">
          <span class="side-pill">Player ${d.side}</span>
          <h3>${escapeHtml(row.player)}</h3>
          <p>${row.year} ${escapeHtml(row.team)} &middot; ${escapeHtml(row.pos || row.position_group || "")}</p>
        </div>
        <dl class="stat-list">
          <div><dt>Team win %</dt><dd>${fmtPct(row.win_pct)}</dd></div>
          <div><dt>Comparable-season median</dt><dd>${fmtPct(summary.medianWin)}</dd></div>
          <div><dt>Strong-team comp share</dt><dd>${fmtPct(summary.highShare)}</dd></div>
          <div><dt>Role dimensions</dt><dd>${fmtNum(row.role_category_count || 0)}</dd></div>
        </dl>
        <div class="badge-row">
          <strong class="badge-label">Role labels</strong>
          ${roleBadge("Profile", row.profile_group || "Unlabeled")}
          ${roleBadge("Shot role", shotRoleLabel(row.efficient_lower_shot_label))}
          ${roleBadge("Event role", eventRoleLabel(row.defensive_event_profile))}
        </div>
      `;
    });
}

function renderRoleUniverse(selected) {
  const container = d3.select("#roleUniverseChart");
  if (container.empty()) return;
  container.selectAll("*").remove();
  if (!playerRows.length) return;

  const width = Math.max(container.node().clientWidth || 1100, 560);
  const height = width < 760 ? 440 : 520;
  const margin = { top: 28, right: 34, bottom: 62, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const sampledRows = playerRows
    .filter(row => row.minutes_per_game >= 10 && Number.isFinite(row.win_pct))
    .map(row => ({ ...row, universe: roleUniverseCoordinates(row) }))
    .filter(row => Number.isFinite(row.universe.x) && Number.isFinite(row.universe.y));
  const selectedRows = selected
    .map(item => ({ ...item.row, side: item.side, universe: roleUniverseCoordinates(item.row) }))
    .filter(row => Number.isFinite(row.universe.x) && Number.isFinite(row.universe.y));

  const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
  const r = d3.scaleSqrt()
    .domain(d3.extent(sampledRows, d => d.minutes_per_game).filter(Number.isFinite))
    .range([2.2, 6.5]);

  const svg = container.append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
    .attr("class", "winning-zone")
    .attr("x", x(45))
    .attr("y", y(82))
    .attr("width", x(100) - x(45))
    .attr("height", y(40) - y(82));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickValues([0, 25, 50, 75, 100]));

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 44)
    .attr("text-anchor", "middle")
    .attr("class", "bar-label")
    .text("Scoring load percentile");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -48)
    .attr("text-anchor", "middle")
    .attr("class", "bar-label")
    .text("Non-scoring contribution percentile");

  g.append("g")
    .attr("class", "universe-cloud")
    .selectAll("circle")
    .data(sampledRows)
    .join("circle")
    .attr("cx", d => x(d.universe.x))
    .attr("cy", d => y(d.universe.y))
    .attr("r", d => r(d.minutes_per_game))
    .attr("fill", d => winBucketColors[d.team_success_bucket] || "#8f9bad")
    .attr("opacity", d => d.team_success_bucket === "High-winning teams" ? .58 : .34)
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>${d.player}</strong> (${d.year}, ${d.team})`,
      `Team win context: ${fmtPct(d.win_pct)}`,
      `Scoring load: ${Math.round(d.universe.x)}th percentile`,
      `Non-scoring contribution: ${Math.round(d.universe.y)}th percentile`,
      d.profile_group || "Unlabeled"
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  const selectedLayer = g.append("g").attr("class", "selected-universe-layer");

  selectedLayer.selectAll("circle.selected-ring")
    .data(selectedRows)
    .join("circle")
    .attr("class", "selected-ring")
    .attr("cx", d => x(d.universe.x))
    .attr("cy", d => y(d.universe.y))
    .attr("r", 13)
    .attr("fill", "none")
    .attr("stroke", d => compareColors[d.side])
    .attr("stroke-width", 3);

  selectedLayer.selectAll("circle.selected-core")
    .data(selectedRows)
    .join("circle")
    .attr("class", "selected-core")
    .attr("cx", d => x(d.universe.x))
    .attr("cy", d => y(d.universe.y))
    .attr("r", 5)
    .attr("fill", "#fff")
    .attr("stroke", "#0b1f3a")
    .attr("stroke-width", 1.5);

  selectedLayer.selectAll("text")
    .data(selectedUniverseLabels(selectedRows, x, y, innerWidth, innerHeight))
    .join("text")
    .attr("class", "selected-label label-halo")
    .attr("x", d => d.labelX)
    .attr("y", d => d.labelY)
    .attr("text-anchor", d => d.anchor)
    .text(d => d.label);

  const legend = container.append("div").attr("class", "legend universe-legend");
  successOrder.forEach(bucket => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", winBucketColors[bucket]);
    item.append("b").text(bucket);
  });
  selectedRows.forEach(row => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch selected-swatch").style("border-color", compareColors[row.side]);
    item.append("b").text(`Player ${row.side}: ${row.player}`);
  });
}

function roleUniverseCoordinates(row) {
  return {
    x: avgFinite([
      percentile(row, "points_per_36"),
      percentile(row, "fga_per_game")
    ]),
    y: avgFinite([
      percentile(row, "assists_per_36"),
      percentile(row, "rebounds_per_36"),
      percentile(row, "stocks_per_36"),
      percentile(row, "efg_pct"),
      percentile(row, "role_category_count")
    ])
  };
}

function renderRoleShape(selected) {
  const container = d3.select("#roleShapeChart");
  if (container.empty()) return;
  container.selectAll("*").remove();
  if (!selected.length) return;

  const width = Math.max(container.node().clientWidth || 560, 420);
  const height = width < 520 ? 410 : 470;
  const radius = Math.min(width, height - 112) / 2 - 42;
  const cx = width / 2;
  const cy = radius + 52;
  const angle = d3.scalePoint()
    .domain(roleShapeMetrics.map(metric => metric.key))
    .range([0, Math.PI * 2])
    .padding(.5);
  const radial = d3.scaleLinear().domain([0, 100]).range([0, radius]);
  const line = d3.lineRadial()
    .angle(d => angle(d.key))
    .radius(d => radial(d.percentile))
    .curve(d3.curveLinearClosed);

  const series = selected.map(item => ({
    side: item.side,
    player: item.row.player,
    row: item.row,
    values: roleShapeMetrics.map(metric => ({
      ...metric,
      percentile: percentile(item.row, metric.key),
      actual: item.row[metric.key]
    }))
  }));

  const svg = container.append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  [25, 50, 75, 100].forEach(ring => {
    g.append("circle")
      .attr("class", "radar-ring")
      .attr("r", radial(ring));
    g.append("text")
      .attr("class", "radar-ring-label")
      .attr("x", 4)
      .attr("y", -radial(ring) + 4)
      .text(ring === 100 ? "100th" : ring);
  });

  roleShapeMetrics.forEach(metric => {
    const a = angle(metric.key) - Math.PI / 2;
    const x2 = Math.cos(a) * radius;
    const y2 = Math.sin(a) * radius;
    g.append("line")
      .attr("class", "radar-spoke")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", x2)
      .attr("y2", y2);
    g.append("text")
      .attr("class", "radar-axis-label")
      .attr("x", Math.cos(a) * (radius + 18))
      .attr("y", Math.sin(a) * (radius + 18))
      .attr("text-anchor", Math.abs(Math.cos(a)) < .25 ? "middle" : (Math.cos(a) > 0 ? "start" : "end"))
      .attr("dominant-baseline", "middle")
      .text(metric.label);
  });

  g.selectAll("path.role-shape")
    .data(series)
    .join("path")
    .attr("class", "role-shape")
    .attr("d", d => line(d.values))
    .attr("fill", d => compareColors[d.side])
    .attr("stroke", d => compareColors[d.side]);

  g.selectAll("g.role-shape-points")
    .data(series)
    .join("g")
    .attr("class", "role-shape-points")
    .selectAll("circle")
    .data(d => d.values.map(value => ({ ...value, side: d.side, player: d.player })))
    .join("circle")
    .attr("cx", d => Math.cos(angle(d.key) - Math.PI / 2) * radial(d.percentile))
    .attr("cy", d => Math.sin(angle(d.key) - Math.PI / 2) * radial(d.percentile))
    .attr("r", 4)
    .attr("fill", d => compareColors[d.side])
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>${d.player}</strong>`,
      `${d.label}: ${ordinal(Math.round(d.percentile))} percentile`,
      `Actual: ${d.format(d.actual)} ${d.unit}`
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  const strip = container.append("div").attr("class", "role-value-strip");
  roleShapeMetrics.forEach(metric => {
    const item = strip.append("article");
    item.append("span").text(metric.label);
    selected.forEach(selection => {
      item.append("b")
        .style("color", compareColors[selection.side])
        .text(`${selection.side}: ${metric.format(selection.row[metric.key])}`);
    });
  });
}

function renderSimilarityConstellation(selected) {
  const container = d3.select("#constellationChart");
  if (container.empty()) return;
  container.selectAll("*").remove();
  if (!selected.length) return;

  const width = Math.max(container.node().clientWidth || 560, 300);
  const compact = width < 520;
  const vertical = selected.length > 1 && compact;
  const height = vertical ? selected.length * 218 + 26 : 450;
  const svg = container.append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
  const color = d3.scaleOrdinal()
    .domain(successOrder)
    .range(successOrder.map(bucket => winBucketColors[bucket]));

  selected.forEach((item, clusterIndex) => {
    const center = vertical
      ? { x: width / 2, y: 118 + clusterIndex * 218 }
      : { x: (clusterIndex + 1) * width / (selected.length + 1), y: height / 2 };
    const matches = getSimilarRows(item.row, compact ? 8 : 10);
    const maxDistance = d3.max(matches, d => d.distance) || 1;
    const maxRadius = compact ? Math.max(66, Math.min(width / 2 - 44, 88)) : 140;
    const distance = d3.scaleLinear().domain([0, maxDistance]).range([42, maxRadius]);
    const size = d3.scaleSqrt()
      .domain(d3.extent(matches, d => d.minutes_per_game).filter(Number.isFinite))
      .range(compact ? [4.5, 9] : [5, 11]);
    const nodes = matches.map((match, i) => {
      const theta = (Math.PI * 2 * i / matches.length) - Math.PI / 2;
      const r = distance(match.distance);
      return {
        ...match,
        theta,
        x: clamp(center.x + Math.cos(theta) * r, 18, width - 18),
        y: clamp(center.y + Math.sin(theta) * r, 18, height - 18)
      };
    });

    svg.append("g")
      .attr("class", "constellation-links")
      .selectAll("line")
      .data(nodes)
      .join("line")
      .attr("x1", center.x)
      .attr("y1", center.y)
      .attr("x2", d => d.x)
      .attr("y2", d => d.y)
      .attr("stroke-width", d => 1.2 + (1 - d.distance / maxDistance) * 2.4);

    svg.append("circle")
      .attr("class", "constellation-center")
      .attr("cx", center.x)
      .attr("cy", center.y)
      .attr("r", 16)
      .attr("fill", compareColors[item.side]);

    svg.append("text")
      .attr("class", "constellation-center-label")
      .attr("x", center.x)
      .attr("y", center.y - 24)
      .attr("text-anchor", "middle")
      .text(`${item.side}: ${shortPlayerLabel(item.row.player)}`);

    svg.append("g")
      .attr("class", "constellation-nodes")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => size(d.minutes_per_game))
      .attr("fill", d => color(d.team_success_bucket))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .on("mousemove", (event, d) => showTooltip(event, [
        `<strong>${d.player}</strong> (${d.year}, ${d.team})`,
        `Team win %: ${fmtPct(d.win_pct)}`,
        `Similarity distance: ${d3.format(".2f")(d.distance)}`,
        `Minutes/game: ${d3.format(".1f")(d.minutes_per_game)}`
      ].join("<br>")))
      .on("mouseleave", hideTooltip);

    svg.append("g")
      .attr("class", "constellation-labels")
      .selectAll("text")
      .data(nodes.slice(0, compact ? 2 : 4))
      .join("text")
      .attr("class", "label-halo")
      .attr("x", d => clamp(d.x + (Math.cos(d.theta) >= 0 ? 9 : -9), 16, width - 16))
      .attr("y", d => clamp(d.y + 4, 14, height - 8))
      .attr("text-anchor", d => Math.cos(d.theta) >= 0 ? "start" : "end")
      .text(d => `${shortPlayerLabel(d.player)} ${d.year}`);
  });

  const legend = container.append("div").attr("class", "legend");
  successOrder.forEach(bucket => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", color(bucket));
    item.append("b").text(bucket);
  });
}

function renderWinningBands(selected) {
  const container = d3.select("#winningBandsChart");
  if (container.empty()) return;
  container.selectAll("*").remove();
  if (!playerRows.length || !selected.length) return;

  const width = Math.max(container.node().clientWidth || 1100, 680);
  const rowHeight = 50;
  const height = winningBandMetrics.length * rowHeight + 72;
  const margin = { top: 22, right: 180, bottom: 40, left: 150 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const highRows = playerRows.filter(row => row.team_success_bucket === "High-winning teams");
  const y = d3.scaleBand()
    .domain(winningBandMetrics.map(metric => metric.key))
    .range([0, innerHeight])
    .padding(.24);

  const metricStats = winningBandMetrics.map(metric => {
    const allValues = playerRows.map(row => row[metric.key]).filter(Number.isFinite).sort(d3.ascending);
    const highValues = highRows.map(row => row[metric.key]).filter(Number.isFinite).sort(d3.ascending);
    return {
      ...metric,
      domain: d3.extent(allValues),
      q1: d3.quantile(highValues, .25),
      median: d3.quantile(highValues, .5),
      q3: d3.quantile(highValues, .75)
    };
  });

  const svg = container.append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(key => winningBandMetrics.find(metric => metric.key === key).label));

  metricStats.forEach(metric => {
    const x = d3.scaleLinear().domain(metric.domain).nice().range([0, innerWidth]);
    const rowY = y(metric.key);
    const midY = rowY + y.bandwidth() / 2;

    g.append("line")
      .attr("class", "band-baseline")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", midY)
      .attr("y2", midY);

    g.append("rect")
      .attr("class", "winning-band")
      .attr("x", x(metric.q1))
      .attr("y", rowY)
      .attr("width", Math.max(1, x(metric.q3) - x(metric.q1)))
      .attr("height", y.bandwidth());

    g.append("line")
      .attr("class", "winning-band-median")
      .attr("x1", x(metric.median))
      .attr("x2", x(metric.median))
      .attr("y1", rowY - 3)
      .attr("y2", rowY + y.bandwidth() + 3);

    selected.forEach(selection => {
      const value = selection.row[metric.key];
      if (!Number.isFinite(value)) return;
      g.append("circle")
        .attr("class", "selected-band-dot")
        .attr("cx", x(value))
        .attr("cy", midY + (selection.side === "A" ? -8 : 8))
        .attr("r", 6)
        .attr("fill", compareColors[selection.side])
        .on("mousemove", event => showTooltip(event, [
          `<strong>Player ${selection.side}: ${selection.row.player}</strong>`,
          `${metric.label}: ${metric.format(value)} ${metric.unit}`,
          `Strong-team middle band: ${metric.format(metric.q1)} to ${metric.format(metric.q3)}`
        ].join("<br>")))
        .on("mouseleave", hideTooltip);

      g.append("text")
        .attr("class", "winning-band-value")
        .attr("x", innerWidth + 16)
        .attr("y", midY + (selection.side === "A" ? -8 : 8))
        .attr("dy", ".35em")
        .attr("fill", compareColors[selection.side])
        .text(`${selection.side}: ${metric.format(value)}`);
    });
  });

  g.append("text")
    .attr("class", "band-caption")
    .attr("x", 0)
    .attr("y", innerHeight + 30)
    .text("Shaded ranges are descriptive benchmarks from high-winning-team player-seasons.");
}

function renderFingerprintChart(selected) {
  const container = d3.select("#fingerprintChart");
  container.selectAll("*").remove();
  if (!selected.length) return;

  const width = container.node().clientWidth || 980;
  const rowHeight = width < 720 ? 46 : 44;
  const height = compareMetrics.length * rowHeight + 82;
  const margin = {
    top: 20,
    right: width < 720 ? 46 : 70,
    bottom: 48,
    left: width < 720 ? 138 : 166
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
  const y = d3.scaleBand().domain(compareMetrics.map(d => d.key)).range([0, innerHeight]).padding(.22);
  const side = d3.scaleBand().domain(["A", "B"]).range([0, y.bandwidth()]).padding(.18);

  const points = [];
  selected.forEach(item => {
    compareMetrics.forEach(metric => {
      const actual = item.row[metric.key];
      if (Number.isFinite(actual)) {
        points.push({
          side: item.side,
          metric,
          percentile: percentile(item.row, metric.key),
          actual
        });
      }
    });
  });

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat(d => `${d}`));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(key => compareMetrics.find(metric => metric.key === key).label));

  g.selectAll(".fingerprint-guide")
    .data([25, 50, 75])
    .join("line")
    .attr("class", "fingerprint-guide")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", 0)
    .attr("y2", innerHeight);

  g.selectAll("rect")
    .data(points)
    .join("rect")
    .attr("x", 0)
    .attr("y", d => y(d.metric.key) + side(d.side))
    .attr("width", d => x(d.percentile))
    .attr("height", side.bandwidth())
    .attr("fill", d => compareColors[d.side])
    .attr("opacity", .88)
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>Player ${d.side}: ${selected.find(item => item.side === d.side)?.row.player || ""}</strong>`,
      `${d.metric.label}: ${ordinal(Math.round(d.percentile))} percentile`,
      `Actual value: ${d.metric.format(d.actual)} ${d.metric.unit}`
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  g.selectAll(".fingerprint-value")
    .data(points)
    .join("text")
    .attr("class", "fingerprint-value")
    .attr("x", d => d.percentile > 82 ? Math.max(x(d.percentile) - 8, 22) : Math.min(x(d.percentile) + 8, innerWidth - 6))
    .attr("y", d => y(d.metric.key) + side(d.side) + side.bandwidth() / 2)
    .attr("dy", ".35em")
    .attr("text-anchor", d => d.percentile > 82 ? "end" : "start")
    .attr("fill", d => d.percentile > 82 ? "#fff" : "#5a6678")
    .text(d => `${d.side} ${ordinal(Math.round(d.percentile))}`);

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 36)
    .attr("text-anchor", "middle")
    .attr("class", "bar-label")
    .text("League percentile");

  const legend = container.append("div").attr("class", "legend");
  selected.forEach(item => {
    const entry = legend.append("span");
    entry.append("i").attr("class", "swatch").style("background", compareColors[item.side]);
    entry.append("b").text(`Player ${item.side}: ${item.row.player}`);
  });
}

function renderSimilarityContext(selected) {
  const context = d3.select("#similarContext");
  const table = d3.select("#similarTable");
  context.selectAll("*").remove();
  table.selectAll("*").remove();

  selected.forEach(item => {
    const matches = getSimilarRows(item.row, 40);
    const summary = summarizeSimilarityMatches(matches, item.row);
    const closest = matches[0];
    const block = context.append("article").attr("class", "similarity-block");
    block.append("h3").text(`${item.row.player}, ${item.row.year} ${item.row.team}`);
    block.append("p").html(`Nearest ${summary.count} comparable player-seasons had a <strong>${fmtPct(summary.medianWin)}</strong> median team win %, with <strong>${fmtPct(summary.highShare)}</strong> on high-winning teams.`);

    const stats = block.append("dl").attr("class", "similarity-stat-grid");
    [
      ["Team win %", fmtPct(item.row.win_pct)],
      ["Comparable median", fmtPct(summary.medianWin)],
      ["Strong-team share", fmtPct(summary.highShare)],
      ["Closest distance", closest ? d3.format(".2f")(closest.distance) : "--"]
    ].forEach(([label, value]) => {
      const cell = stats.append("div");
      cell.append("dt").text(label);
      cell.append("dd").text(value);
    });

    if (closest) {
      block.append("p")
        .attr("class", "closest-note")
        .html(`Closest profile: <strong>${escapeHtml(closest.player)} (${closest.year} ${escapeHtml(closest.team)})</strong>, ${fmtPct(closest.win_pct)} team win %.`);
    }
  });

  selected.forEach(item => {
    const matches = getSimilarRows(item.row, 5);
    const block = table.append("article").attr("class", "match-block");
    block.append("h3").text(`Player ${item.side}: ${item.row.player}`);
    const rows = block.append("table").attr("class", "mini-table");
    rows.append("thead").html("<tr><th>Match</th><th>Team</th><th>Win %</th></tr>");
    const body = rows.append("tbody");
    body.selectAll("tr")
      .data(matches)
      .join("tr")
      .html(match => `<td>${escapeHtml(match.player)} (${match.year})</td><td>${escapeHtml(match.team)}</td><td>${fmtPct(match.win_pct)}</td>`);
  });
}

function getSimilaritySummary(row) {
  const matches = getSimilarRows(row, 40);
  return summarizeSimilarityMatches(matches, row);
}

function summarizeSimilarityMatches(matches, row) {
  return {
    count: matches.length,
    medianWin: d3.median(matches, d => d.win_pct) || row.win_pct,
    highShare: matches.length ? d3.mean(matches, d => d.team_success_bucket === "High-winning teams" ? 1 : 0) : 0
  };
}

function getSimilarRows(row, limit) {
  const samePosition = playerRows.filter(candidate => candidate.position_group === row.position_group);
  const pool = samePosition.length >= limit ? samePosition : playerRows;
  return pool
    .filter(candidate => candidate.key !== row.key && candidate.minutes_per_game >= 10 && hasSimilarityVector(candidate) && hasSimilarityVector(row))
    .map(candidate => ({ ...candidate, distance: similarityDistance(row, candidate) }))
    .sort((a, b) => d3.ascending(a.distance, b.distance))
    .slice(0, limit);
}

function hasSimilarityVector(row) {
  return similarityKeys.every(key => Number.isFinite(row[key]));
}

function similarityDistance(a, b) {
  return Math.sqrt(d3.sum(similarityKeys, key => {
    const spread = percentileLookup[key] || [];
    if (!spread.length) return 0;
    return Math.pow((percentile(a, key) - percentile(b, key)) / 100, 2);
  }));
}

function percentile(row, key) {
  const values = percentileLookup[key] || [];
  if (!values.length || !Number.isFinite(row[key])) return 0;
  return d3.bisectRight(values, row[key]) / values.length * 100;
}

function avgFinite(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? d3.mean(clean) : NaN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ordinal(value) {
  const n = Math.round(value);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function shortPlayerLabel(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return parts[parts.length - 1];
}

function roleBadge(category, value) {
  return `<span class="role-badge"><b>${escapeHtml(category)}</b>${escapeHtml(value)}</span>`;
}

function shotRoleLabel(value) {
  if (!value || value === "Other core player") return "Standard shot profile";
  return value;
}

function eventRoleLabel(value) {
  if (!value || value === "Other core player") return "Standard event profile";
  return value;
}

function selectedUniverseLabels(rows, xScale, yScale, innerWidth, innerHeight) {
  const labels = rows.map(row => {
    const pointX = xScale(row.universe.x);
    const pointY = yScale(row.universe.y);
    const toRight = pointX < innerWidth * .68;
    return {
      ...row,
      label: `${row.side}: ${shortPlayerLabel(row.player)}`,
      labelX: clamp(pointX + (toRight ? 16 : -16), 4, innerWidth - 4),
      labelY: clamp(pointY - 14, 14, innerHeight - 8),
      anchor: toRight ? "start" : "end"
    };
  }).sort((a, b) => a.labelY - b.labelY);

  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i].labelY - labels[i - 1].labelY < 18) {
      labels[i].labelY = clamp(labels[i - 1].labelY + 18, 14, innerHeight - 8);
    }
  }
  return labels;
}

function updateView(viewName) {
  const config = viewConfig[viewName];
  d3.select("#barTitle").text(config.title);
  d3.select("#barNote").text(config.note);
  d3.select("#scatterTitle").text(config.scatterTitle);
  renderBarChart(appData[config.dataKey]);
  renderScatter(appData[config.scatterKey], config);
  renderExamplesForView(viewName);
}

function renderBarChart(data) {
  const container = d3.select("#barChart");
  container.selectAll("*").remove();

  const width = container.node().clientWidth || 760;
  const height = 330;
  const margin = { top: 18, right: 28, bottom: 58, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const profiles = Array.from(new Set(data.map(d => d.profile)));
  const x = d3.scaleBand().domain(successOrder).range([0, innerWidth]).padding(.22);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const stacked = d3.stack()
    .keys(profiles)
    .value((group, key) => {
      const found = group.values.find(row => row.profile === key);
      return found ? +found.share_of_bucket : 0;
    })(successOrder.map(bucket => ({
      bucket,
      values: data.filter(row => row.team_success_bucket === bucket)
    })));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("dy", "1em");

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(fmtPct).ticks(5));

  g.selectAll("g.layer")
    .data(stacked)
    .join("g")
    .attr("fill", d => colors[d.key] || "#789")
    .selectAll("rect")
    .data(d => d.map(item => ({ ...item, key: d.key })))
    .join("rect")
    .attr("x", d => x(d.data.bucket))
    .attr("y", d => y(d[1]))
    .attr("height", d => y(d[0]) - y(d[1]))
    .attr("width", x.bandwidth())
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>${d.data.bucket}</strong>`,
      d.key,
      `${fmtPct(d[1] - d[0])} of bucket`
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  const legend = container.append("div").attr("class", "legend");
  profiles.forEach(profile => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", colors[profile] || "#789");
    item.append("b").text(profile);
  });
}

function renderScatter(data, config) {
  const container = d3.select("#scatterPlot");
  container.selectAll("*").remove();

  const width = container.node().clientWidth || 1100;
  const height = 430;
  const margin = { top: 18, right: 28, bottom: 58, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const clean = data
    .map(row => ({ ...row, x: +row[config.x], y: +row[config.y] }))
    .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y));

  const selected = selectedComparison
    .map(item => ({
      ...item.row,
      side: item.side,
      x: +item.row[config.x],
      y: +(item.row[config.y] ?? (config.y === "steals_blocks_per_36" ? item.row.stocks_per_36 : NaN))
    }))
    .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y));

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const xDomain = d3.extent(clean.concat(selected), d => d.x);
  const yDomain = d3.extent(clean.concat(selected), d => d.y);
  const x = d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
  const y = d3.scaleLinear().domain(yDomain).nice().range([innerHeight, 0]);
  const groups = Array.from(new Set(clean.map(d => d[config.color])));
  const color = d3.scaleOrdinal().domain(groups).range(["#2f6f9f", "#c65f1a", "#3b7f64", "#8a6fb0", "#8f9bad"]);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(7));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(config.y.includes("pct") ? fmtPct : d3.format(".1f")));

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 44)
    .attr("text-anchor", "middle")
    .attr("class", "bar-label")
    .text(config.xLabel);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -48)
    .attr("text-anchor", "middle")
    .attr("class", "bar-label")
    .text(config.yLabel);

  g.append("g")
    .selectAll("circle")
    .data(clean)
    .join("circle")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", 4)
    .attr("fill", d => color(d[config.color]))
    .attr("opacity", .58)
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>${d.player}</strong> (${d.year}, ${d.team})`,
      `${config.xLabel}: ${d3.format(".1f")(d.x)}`,
      `${config.yLabel}: ${config.y.includes("pct") ? fmtPct(d.y) : d3.format(".2f")(d.y)}`,
      d[config.color]
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  g.append("g")
    .selectAll("circle")
    .data(selected)
    .join("circle")
    .attr("class", "selected-player-dot")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", 8)
    .attr("fill", "#fff")
    .attr("stroke", d => compareColors[d.side])
    .attr("stroke-width", 3)
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>Player ${d.side}: ${d.player}</strong> (${d.year}, ${d.team})`,
      `${config.xLabel}: ${d3.format(".1f")(d.x)}`,
      `${config.yLabel}: ${config.y.includes("pct") ? fmtPct(d.y) : d3.format(".2f")(d.y)}`
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  const legend = container.append("div").attr("class", "legend");
  groups.slice(0, 8).forEach(group => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", color(group));
    item.append("b").text(group || "Unlabeled");
  });
  selected.forEach(row => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch selected-swatch").style("border-color", compareColors[row.side]);
    item.append("b").text(`Player ${row.side}: ${row.player}`);
  });
}

function renderExamplesForView(viewName) {
  const container = d3.select("#examples").attr("class", "example-list");
  container.selectAll("*").remove();
  container.append("h3").text("Concrete examples");

  if (!playerRows.length) {
    (appData.examples || []).forEach(example => {
      const article = container.append("article");
      article.append("strong").text(`${example.player}, ${example.team} (${example.year})`);
      article.append("p").text(example.note);
    });
    return;
  }

  let candidates;
  if (viewName === "efficientLowerShot") {
    candidates = playerRows
      .filter(row => row.efficient_lower_shot_label === "Efficient lower-shot player" && row.minutes_per_game >= 15)
      .sort((a, b) => d3.descending(a.win_pct, b.win_pct) || d3.descending(a.efg_pct, b.efg_pct));
  } else if (viewName === "defenseOverlap") {
    candidates = playerRows
      .filter(row => row.defensive_event_profile === "Top steals + blocks, not top scorer" && row.minutes_per_game >= 15)
      .sort((a, b) => d3.descending(a.win_pct, b.win_pct) || d3.descending(a.stocks_per_36, b.stocks_per_36));
  } else {
    candidates = playerRows
      .filter(row => row.minutes_per_game >= 15 && row.role_category_count >= 4)
      .sort((a, b) => d3.descending(a.role_category_count, b.role_category_count) || d3.descending(a.win_pct, b.win_pct));
  }

  pickDiverseExamples(candidates, 5).forEach(row => {
    const article = container.append("article");
    article.append("strong").text(`${row.player}, ${row.team} (${row.year})`);
    article.append("p").text(exampleNote(row, viewName));
  });
}

function pickDiverseExamples(candidates, limit) {
  const picked = [];
  const usedTeams = new Set();
  const usedPlayers = new Set();
  for (const row of candidates) {
    if (picked.length >= limit) break;
    if (usedTeams.has(row.team) || usedPlayers.has(row.player)) continue;
    picked.push(row);
    usedTeams.add(row.team);
    usedPlayers.add(row.player);
  }
  for (const row of candidates) {
    if (picked.length >= limit) break;
    if (picked.some(item => item.key === row.key) || usedPlayers.has(row.player)) continue;
    picked.push(row);
    usedPlayers.add(row.player);
  }
  return picked;
}

function exampleNote(row, viewName) {
  if (viewName === "efficientLowerShot") {
    return `${fmtPct(row.efg_pct)} eFG on ${d3.format(".1f")(row.fga_per_game)} FGA/game for a ${fmtPct(row.win_pct)} team.`;
  }
  if (viewName === "defenseOverlap") {
    return `${d3.format(".2f")(row.stocks_per_36)} steals + blocks per 36 while not being a top-quartile scorer; team win % was ${fmtPct(row.win_pct)}.`;
  }
  return `${row.profile_group} with ${fmtNum(row.role_category_count)} role categories on a ${fmtPct(row.win_pct)} team.`;
}

function showTooltip(event, html) {
  tooltip
    .style("display", "block")
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(html);
}

function hideTooltip() {
  tooltip.style("display", "none");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
