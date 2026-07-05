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
    title: "Profile mix by team success",
    note: "Broader profiles are somewhat more common on stronger teams, but this is not a rule.",
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
    note: "High-winning teams have the largest share of efficient lower-shot player-seasons.",
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
    title: "Top steals + blocks players who are not top scorers",
    note: "Most top defensive-event player-seasons are not top-quartile scoring seasons.",
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
  { key: "role_category_count", label: "Role breadth", unit: "categories", format: d3.format(".0f") }
];
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
    renderMetrics(data.summary);
    initPlayerComparison();
    updateView("profileMix");
    d3.select("#viewSelect").on("change", event => updateView(event.target.value));
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
    ? "These two selected profiles have very similar historical win-association context."
    : `${diff > 0 ? a.row.player : b.row.player}'s selected profile has the stronger historical win-association context.`;

  container.append("p")
    .html(`<strong>${escapeHtml(lead)}</strong> Similar player-seasons had median team win percentages of ${fmtPct(a.summary.medianWin)} for ${escapeHtml(a.row.player)} and ${fmtPct(b.summary.medianWin)} for ${escapeHtml(b.row.player)}. Treat this as descriptive evidence, not a causal player ranking.`);
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
          <p>${row.year} ${escapeHtml(row.team)} · ${escapeHtml(row.pos || row.position_group || "")}</p>
        </div>
        <dl class="stat-list">
          <div><dt>Team win %</dt><dd>${fmtPct(row.win_pct)}</dd></div>
          <div><dt>Similar profile median</dt><dd>${fmtPct(summary.medianWin)}</dd></div>
          <div><dt>High-winning match share</dt><dd>${fmtPct(summary.highShare)}</dd></div>
          <div><dt>Role breadth</dt><dd>${fmtNum(row.role_category_count || 0)}</dd></div>
        </dl>
        <div class="badge-row">
          <span>${escapeHtml(row.profile_group || "Unlabeled")}</span>
          <span>${escapeHtml(row.efficient_lower_shot_label || "Other core player")}</span>
          <span>${escapeHtml(row.defensive_event_profile || "Other core player")}</span>
        </div>
      `;
    });
}

function renderFingerprintChart(selected) {
  const container = d3.select("#fingerprintChart");
  container.selectAll("*").remove();
  if (!selected.length) return;

  const width = container.node().clientWidth || 980;
  const rowHeight = 42;
  const height = compareMetrics.length * rowHeight + 66;
  const margin = { top: 18, right: 108, bottom: 34, left: 158 };
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
    .attr("opacity", .88);

  g.selectAll(".fingerprint-value")
    .data(points)
    .join("text")
    .attr("class", "fingerprint-value")
    .attr("x", d => Math.min(x(d.percentile) + 8, innerWidth + 8))
    .attr("y", d => y(d.metric.key) + side(d.side) + side.bandwidth() / 2)
    .attr("dy", ".35em")
    .text(d => `${d.side}: ${Math.round(d.percentile)}th · ${d.metric.format(d.actual)} ${d.metric.unit}`);

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
    const summary = getSimilaritySummary(item.row);
    const block = context.append("article").attr("class", "similarity-block");
    block.append("h3").text(`${item.row.player}, ${item.row.year} ${item.row.team}`);
    block.append("p").html(`Nearest ${summary.count} similar player-seasons: <strong>${fmtPct(summary.medianWin)}</strong> median team win %, with <strong>${fmtPct(summary.highShare)}</strong> on high-winning teams.`);
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
