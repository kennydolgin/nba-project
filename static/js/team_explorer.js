/* global d3 */
var teamSuccessOrder = ["Low-winning teams", "Middle-winning teams", "High-winning teams"];
var teamExplorerColors = {
  "Balanced profile": "#2f6f9f",
  "Mixed profile": "#67a6b8",
  "Narrow profile": "#c65f1a",
  "Efficient lower-shot player": "#3b7f64",
  "Other core player": "#b9c3d1",
  "Top steals + blocks, not top scorer": "#3b7f64",
  "Top steals + blocks + top scorer": "#c65f1a",
  "Top scorer, not top steals + blocks": "#8f9bad"
};
var teamViewConfig = {
  profileMix: {
    title: "Role profile mix by team success",
    note: "Broader player-season statistical profiles are somewhat more common on stronger teams, but this pattern is descriptive.",
    dataKey: "profileMix",
    scatterKey: "scoringScatter",
    scatterTitle: "Player-season scoring volume versus team win percentage",
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
    scatterTitle: "Player-season shot volume versus shooting efficiency",
    x: "fga_per_game",
    y: "efg_pct",
    color: "team_success_bucket",
    xLabel: "Field-goal attempts per game",
    yLabel: "eFG% (shooting efficiency)"
  },
  defenseOverlap: {
    title: "Defensive-event leaders who are not top scorers",
    note: "Most top defensive-event player-seasons are not top-quartile scoring seasons. Steals + blocks are useful box-score events, not complete defense.",
    dataKey: "defenseOverlap",
    scatterKey: "defenseScatter",
    scatterTitle: "Player-season scoring versus defensive events per 36",
    x: "points_per_game",
    y: "steals_blocks_per_36",
    color: "team_success_bucket",
    xLabel: "Points per game",
    yLabel: "Defensive events (steals + blocks) per 36"
  }
};

var teamFmtPct = d3.format(".1%");
var teamFmtNum = d3.format(",.0f");
var teamTooltip = d3.select("#tooltip");
var teamStaticBase = (document.body.getAttribute("data-static-base") || "/static/").replace(/\/?$/, "/");
var teamAppData = null;
var teamPlayerRows = [];

function teamStaticUrl(path) {
  return teamStaticBase + path;
}

function initTeamExplorer() {
  d3.json(teamStaticUrl("data/nba_app_data.json"), function(error, data) {
    if (error) {
      d3.select("#barChart").append("p").attr("class", "load-error").text("Unable to load team explorer data.");
      return;
    }

    teamAppData = data;
    renderTeamMetrics(data.summary || {});

    d3.csv(teamStaticUrl("data/player_seasons.csv"), function(csvError, rows) {
      teamPlayerRows = csvError ? [] : rows.map(normalizeTeamPlayerRow).filter(function(row) {
        return row.player && Number.isFinite(row.win_pct);
      });
      updateTeamView("profileMix");
      d3.select("#viewSelect").on("change", function() {
        updateTeamView(this.value);
      });
    });
  });
}

function normalizeTeamPlayerRow(row) {
  [
    "year", "win_pct", "points_per_game", "points_per_36", "fga_per_game",
    "efg_pct", "assists_per_36", "rebounds_per_36", "stocks_per_36",
    "steals_blocks_per_36", "minutes_per_game", "role_category_count"
  ].forEach(function(key) {
    row[key] = +row[key];
  });
  if (!Number.isFinite(row.stocks_per_36) && Number.isFinite(row.steals_blocks_per_36)) {
    row.stocks_per_36 = row.steals_blocks_per_36;
  }
  return row;
}

function renderTeamMetrics(summary) {
  d3.select("#metricRows").text(teamFmtNum(summary.playerSeasonRows || 0));
  d3.select("#metricTeams").text(teamFmtNum(summary.teamSeasonRecords || 0));
  d3.select("#metricEfficient").text(teamFmtPct(summary.highWinningEfficientLowerShotShare || 0));
  d3.select("#metricDefense").text(teamFmtPct(summary.topStocksNotTopScorerShare || 0));
}

function updateTeamView(viewName) {
  var config = teamViewConfig[viewName] || teamViewConfig.profileMix;
  d3.select("#barTitle").text(config.title);
  d3.select("#barNote").text(config.note);
  d3.select("#scatterTitle").text(config.scatterTitle);
  renderTeamBarChart(teamAppData[config.dataKey] || []);
  renderTeamScatter(teamAppData[config.scatterKey] || [], config);
  renderTeamExamples(viewName);
}

function renderTeamBarChart(data) {
  var container = d3.select("#barChart");
  container.selectAll("*").remove();
  if (!data.length) return;

  var width = container.node().clientWidth || 760;
  var height = 330;
  var margin = { top: 18, right: 28, bottom: 58, left: 72 };
  var innerWidth = width - margin.left - margin.right;
  var innerHeight = height - margin.top - margin.bottom;
  var svg = container.append("svg").attr("width", width).attr("height", height);
  var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  var profiles = uniqueValues(data.map(function(d) { return d.profile; }));
  var x = d3.scaleBand().domain(teamSuccessOrder).range([0, innerWidth]).padding(0.22);
  var y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  var grouped = teamSuccessOrder.map(function(bucket) {
    return {
      bucket: bucket,
      values: data.filter(function(row) { return row.team_success_bucket === bucket; })
    };
  });
  var stacked = d3.stack()
    .keys(profiles)
    .value(function(group, key) {
      var found = group.values.find(function(row) { return row.profile === key; });
      return found ? +found.share_of_bucket : 0;
    })(grouped);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0," + innerHeight + ")")
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("dy", "1em");

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(teamFmtPct).ticks(5));

  var layers = g.selectAll("g.layer")
    .data(stacked)
    .enter()
    .append("g")
    .attr("class", "layer")
    .attr("fill", function(d) { return teamExplorerColors[d.key] || "#789"; });

  layers.selectAll("rect")
    .data(function(d) {
      return d.map(function(item) {
        item.key = d.key;
        return item;
      });
    })
    .enter()
    .append("rect")
    .attr("x", function(d) { return x(d.data.bucket); })
    .attr("y", function(d) { return y(d[1]); })
    .attr("height", function(d) { return y(d[0]) - y(d[1]); })
    .attr("width", x.bandwidth())
    .on("mousemove", function(d) {
      showTeamTooltip(d3.event, [
        "<strong>" + escapeTeamHtml(d.data.bucket) + "</strong>",
        escapeTeamHtml(displayTeamRoleLabel(d.key)),
        teamFmtPct(d[1] - d[0]) + " of bucket"
      ].join("<br>"));
    })
    .on("mouseleave", hideTeamTooltip);

  var legend = container.append("div").attr("class", "legend");
  profiles.forEach(function(profile) {
    var item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", teamExplorerColors[profile] || "#789");
    item.append("b").text(displayTeamRoleLabel(profile));
  });
}

function renderTeamScatter(data, config) {
  var container = d3.select("#scatterPlot");
  container.selectAll("*").remove();
  if (!data.length) return;

  var width = container.node().clientWidth || 1100;
  var height = 430;
  var margin = { top: 18, right: 28, bottom: 58, left: 70 };
  var innerWidth = width - margin.left - margin.right;
  var innerHeight = height - margin.top - margin.bottom;
  var clean = data.map(function(row) {
    var copy = Object.assign({}, row);
    copy.x = +row[config.x];
    copy.y = +row[config.y];
    return copy;
  }).filter(function(row) {
    return Number.isFinite(row.x) && Number.isFinite(row.y);
  });
  var svg = container.append("svg").attr("width", width).attr("height", height);
  var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  var x = d3.scaleLinear().domain(d3.extent(clean, function(d) { return d.x; })).nice().range([0, innerWidth]);
  var y = d3.scaleLinear().domain(d3.extent(clean, function(d) { return d.y; })).nice().range([innerHeight, 0]);
  var groups = uniqueValues(clean.map(function(d) { return d[config.color]; }));
  var color = d3.scaleOrdinal().domain(groups).range(["#2f6f9f", "#c65f1a", "#3b7f64", "#8a6fb0", "#8f9bad"]);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0," + innerHeight + ")")
    .call(d3.axisBottom(x).ticks(7));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(config.y.indexOf("pct") >= 0 ? teamFmtPct : d3.format(".1f")));

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
    .enter()
    .append("circle")
    .attr("cx", function(d) { return x(d.x); })
    .attr("cy", function(d) { return y(d.y); })
    .attr("r", 3.2)
    .attr("fill", function(d) { return color(d[config.color]); })
    .attr("opacity", 0.42)
    .on("mousemove", function(d) {
      showTeamTooltip(d3.event, [
        "<strong>" + escapeTeamHtml(teamRowSeasonLabel(d)) + "</strong>",
        "One mark = one player-season",
        escapeTeamHtml(config.xLabel) + ": " + d3.format(".1f")(d.x),
        escapeTeamHtml(config.yLabel) + ": " + (config.y.indexOf("pct") >= 0 ? teamFmtPct(d.y) : d3.format(".2f")(d.y)),
        escapeTeamHtml(displayTeamRoleLabel(d[config.color] || "Unlabeled"))
      ].join("<br>"));
    })
    .on("mouseleave", hideTeamTooltip);

  var legend = container.append("div").attr("class", "legend");
  groups.slice(0, 8).forEach(function(group) {
    var item = legend.append("span");
    item.append("i").attr("class", "swatch").style("background", color(group));
    item.append("b").text(displayTeamRoleLabel(group || "Unlabeled"));
  });
  container.append("p")
    .attr("class", "chart-footnote")
    .text("Each dot is one player-season. Color groups provide context; the chart shows association, not causation.");
}

function renderTeamExamples(viewName) {
  var container = d3.select("#examples").attr("class", "example-list");
  container.selectAll("*").remove();
  container.append("h3").text("Concrete examples");

  if (!teamPlayerRows.length) {
    (teamAppData.examples || []).forEach(function(example) {
      var article = container.append("article");
      article.append("strong").text(example.player + ", " + example.team + " (" + example.year + ")");
      article.append("p").text(example.note);
    });
    return;
  }

  var candidates;
  if (viewName === "efficientLowerShot") {
    candidates = teamPlayerRows
      .filter(function(row) { return row.efficient_lower_shot_label === "Efficient lower-shot player" && row.minutes_per_game >= 15; })
      .sort(function(a, b) { return d3.descending(a.win_pct, b.win_pct) || d3.descending(a.efg_pct, b.efg_pct); });
  } else if (viewName === "defenseOverlap") {
    candidates = teamPlayerRows
      .filter(function(row) { return row.defensive_event_profile === "Top steals + blocks, not top scorer" && row.minutes_per_game >= 15; })
      .sort(function(a, b) { return d3.descending(a.win_pct, b.win_pct) || d3.descending(a.stocks_per_36, b.stocks_per_36); });
  } else {
    candidates = teamPlayerRows
      .filter(function(row) { return row.minutes_per_game >= 15 && row.role_category_count >= 4; })
      .sort(function(a, b) { return d3.descending(a.role_category_count, b.role_category_count) || d3.descending(a.win_pct, b.win_pct); });
  }

  pickTeamExamples(candidates, 5).forEach(function(row) {
    var article = container.append("article");
    article.append("strong").text(row.player + ", " + row.team + " (" + row.year + ")");
    article.append("p").text(teamExampleNote(row, viewName));
  });
}

function pickTeamExamples(candidates, limit) {
  var picked = [];
  var usedTeams = {};
  var usedPlayers = {};
  candidates.forEach(function(row) {
    if (picked.length >= limit) return;
    if (usedTeams[row.team] || usedPlayers[row.player]) return;
    picked.push(row);
    usedTeams[row.team] = true;
    usedPlayers[row.player] = true;
  });
  candidates.forEach(function(row) {
    if (picked.length >= limit) return;
    if (picked.some(function(item) { return item.key === row.key; }) || usedPlayers[row.player]) return;
    picked.push(row);
    usedPlayers[row.player] = true;
  });
  return picked;
}

function teamExampleNote(row, viewName) {
  if (viewName === "efficientLowerShot") {
    return teamFmtPct(row.efg_pct) + " eFG on " + d3.format(".1f")(row.fga_per_game) + " FGA/game for a " + teamFmtPct(row.win_pct) + " team.";
  }
  if (viewName === "defenseOverlap") {
    return d3.format(".2f")(row.stocks_per_36) + " defensive events (steals + blocks) per 36 while not being a top-quartile scorer; team win % was " + teamFmtPct(row.win_pct) + ".";
  }
  return row.profile_group + " with " + teamFmtNum(row.role_category_count) + " role dimensions on a " + teamFmtPct(row.win_pct) + " team.";
}

function uniqueValues(values) {
  var seen = {};
  return values.filter(function(value) {
    var key = value || "Unlabeled";
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function showTeamTooltip(event, html) {
  teamTooltip
    .style("display", "block")
    .style("left", (event.clientX + 14) + "px")
    .style("top", (event.clientY + 14) + "px")
    .html(html);
}

function teamRowSeasonLabel(row) {
  return (row.player || "") + ", " + (row.year || "") + " " + (row.team || "");
}

function displayTeamRoleLabel(value) {
  return String(value || "Unlabeled")
    .replace(/steals \+ blocks/g, "defensive events")
    .replace(/Standard event profile/g, "Standard defensive-event profile");
}

function hideTeamTooltip() {
  teamTooltip.style("display", "none");
}

function escapeTeamHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

if (document.getElementById("barChart")) {
  initTeamExplorer();
}
