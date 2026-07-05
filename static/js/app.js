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

const fmtPct = d3.format(".1%");
const fmtNum = d3.format(",.0f");
const tooltip = d3.select("#tooltip");
let appData;

fetch("/api/data")
  .then(response => response.json())
  .then(data => {
    appData = data;
    renderMetrics(data.summary);
    renderExamples(data.examples);
    updateView("profileMix");
    d3.select("#viewSelect").on("change", event => updateView(event.target.value));
  });

function renderMetrics(summary) {
  d3.select("#metricRows").text(fmtNum(summary.playerSeasonRows));
  d3.select("#metricTeams").text(fmtNum(summary.teamSeasonRecords));
  d3.select("#metricEfficient").text(fmtPct(summary.highWinningEfficientLowerShotShare));
  d3.select("#metricDefense").text(fmtPct(summary.topStocksNotTopScorerShare));
}

function updateView(viewName) {
  const config = viewConfig[viewName];
  d3.select("#barTitle").text(config.title);
  d3.select("#barNote").text(config.note);
  d3.select("#scatterTitle").text(config.scatterTitle);
  renderBarChart(appData[config.dataKey]);
  renderScatter(appData[config.scatterKey], config);
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

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLinear().domain(d3.extent(clean, d => d.x)).nice().range([0, innerWidth]);
  const y = d3.scaleLinear().domain(d3.extent(clean, d => d.y)).nice().range([innerHeight, 0]);
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
    .attr("opacity", .62)
    .on("mousemove", (event, d) => showTooltip(event, [
      `<strong>${d.player}</strong> (${d.year}, ${d.team})`,
      `${config.xLabel}: ${d3.format(".1f")(d.x)}`,
      `${config.yLabel}: ${config.y.includes("pct") ? fmtPct(d.y) : d3.format(".2f")(d.y)}`,
      d[config.color]
    ].join("<br>")))
    .on("mouseleave", hideTooltip);

  const legend = container.append("div").attr("class", "legend");
  groups.slice(0, 8).forEach(group => {
    const item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", color(group));
    item.append("b").text(group || "Unlabeled");
  });
}

function renderExamples(examples) {
  const container = d3.select("#examples").attr("class", "example-list");
  container.append("h3").text("Concrete examples");
  examples.forEach(example => {
    const article = container.append("article");
    article.append("strong").text(`${example.player}, ${example.team} (${example.year})`);
    article.append("p").text(example.note);
  });
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
