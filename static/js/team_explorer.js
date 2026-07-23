/* global d3 */
(function () {
  "use strict";

  var root = document.getElementById("rosterLab");
  if (!root) return;

  var staticBase = (document.body.getAttribute("data-static-base") || "/static/").replace(/\/?$/, "/");
  var fmtPct = d3.format(".1%");
  var fmt1 = d3.format(".1f");
  var fmt2 = d3.format(".2f");
  var roleOrder = ["Scorer", "Creator", "Two-way", "Defender"];
  var roleColors = {
    Scorer: "#65c9bb",
    Creator: "#6ea0f8",
    "Two-way": "#a77ce8",
    Defender: "#ff7067"
  };
  var metrics = [
    { key: "points_per_36", short: "Scoring", label: "Scoring load", unit: "PTS / 36", color: "#65c9bb", format: fmt1 },
    { key: "assists_per_36", short: "Creation", label: "Creation", unit: "AST / 36", color: "#6ea0f8", format: fmt1 },
    { key: "rebounds_per_36", short: "Boards", label: "Rebounding", unit: "REB / 36", color: "#a77ce8", format: fmt1 },
    { key: "stocks_per_36", short: "Def. events", label: "Defensive events", unit: "STL + BLK / 36", color: "#ff7067", format: fmt1 },
    { key: "efg_pct", short: "Efficiency", label: "Efficiency", unit: "eFG%", color: "#f2b63d", format: fmtPct },
    { key: "role_category_count", short: "Breadth", label: "Role breadth", unit: "areas", color: "#cbd5df", format: fmt1 }
  ];

  var teamMeta = {
    ATL: ["Atlanta Hawks", "Atlanta, Georgia", "GA"], BOS: ["Boston Celtics", "Boston, Massachusetts", "MA"],
    BRK: ["Brooklyn Nets", "Brooklyn, New York", "NY"], NJN: ["New Jersey Nets", "East Rutherford, New Jersey", "NJ"],
    CHA: ["Charlotte Bobcats", "Charlotte, North Carolina", "NC"], CHO: ["Charlotte Hornets", "Charlotte, North Carolina", "NC"],
    CHI: ["Chicago Bulls", "Chicago, Illinois", "IL"], CLE: ["Cleveland Cavaliers", "Cleveland, Ohio", "OH"],
    DAL: ["Dallas Mavericks", "Dallas, Texas", "TX"], DEN: ["Denver Nuggets", "Denver, Colorado", "CO"],
    DET: ["Detroit Pistons", "Detroit, Michigan", "MI"], GSW: ["Golden State Warriors", "San Francisco, California", "CA"],
    HOU: ["Houston Rockets", "Houston, Texas", "TX"], IND: ["Indiana Pacers", "Indianapolis, Indiana", "IN"],
    LAC: ["LA Clippers", "Inglewood, California", "CA"], LAL: ["Los Angeles Lakers", "Los Angeles, California", "CA"],
    MEM: ["Memphis Grizzlies", "Memphis, Tennessee", "TN"], MIA: ["Miami Heat", "Miami, Florida", "FL"],
    MIL: ["Milwaukee Bucks", "Milwaukee, Wisconsin", "WI"], MIN: ["Minnesota Timberwolves", "Minneapolis, Minnesota", "MN"],
    NOH: ["New Orleans Hornets", "New Orleans, Louisiana", "LA"], NOP: ["New Orleans Pelicans", "New Orleans, Louisiana", "LA"],
    NYK: ["New York Knicks", "New York, New York", "NY"], OKC: ["Oklahoma City Thunder", "Oklahoma City, Oklahoma", "OK"],
    ORL: ["Orlando Magic", "Orlando, Florida", "FL"], PHI: ["Philadelphia 76ers", "Philadelphia, Pennsylvania", "PA"],
    PHO: ["Phoenix Suns", "Phoenix, Arizona", "AZ"], POR: ["Portland Trail Blazers", "Portland, Oregon", "OR"],
    SAC: ["Sacramento Kings", "Sacramento, California", "CA"], SAS: ["San Antonio Spurs", "San Antonio, Texas", "TX"],
    TOR: ["Toronto Raptors", "Toronto, Ontario", "ON"], UTA: ["Utah Jazz", "Salt Lake City, Utah", "UT"],
    WAS: ["Washington Wizards", "Washington, District of Columbia", "DC"]
  };

  var allRows = [];
  var seasons = [];
  var seasonRows = [];
  var seasonValues = {};
  var teams = [];
  var state = {
    year: null,
    team: null,
    compare: null,
    player: null,
    rotationOnly: true,
    profile: "All",
    tab: "map",
    sort: "minutes_per_game"
  };

  function staticUrl(path) { return staticBase + path; }

  d3.csv(staticUrl("data/player_seasons.csv"), normalizeRow)
    .then(function (rows) {
      allRows = rows.filter(function (row) { return row.player && row.team && Number.isFinite(row.year); });
      seasons = Array.from(new Set(allRows.map(function (row) { return row.year; }))).sort(d3.descending);
      readUrlState();
      bindControls();
      updateSeasonContext();
      renderAll(false);
      root.setAttribute("aria-busy", "false");
      observeSize();
    })
    .catch(function (error) {
      root.setAttribute("aria-busy", "false");
      var box = document.getElementById("rosterLoadError");
      box.hidden = false;
      box.textContent = "Unable to load the player-season roster data. " + (error && error.message ? error.message : "");
    });

  function normalizeRow(row) {
    ["year", "minutes_per_game", "points_per_game", "points_per_36", "fga_per_game", "efg_pct",
      "assists_per_36", "rebounds_per_36", "stocks_per_36", "turnovers_per_36",
      "role_category_count", "win_pct"].forEach(function (key) { row[key] = +row[key]; });
    row.key = [row.year, row.team, row.player].join("|");
    return row;
  }

  function readUrlState() {
    var params = new URLSearchParams(window.location.search);
    var requestedYear = +params.get("year");
    state.year = seasons.indexOf(requestedYear) >= 0 ? requestedYear : seasons[0];
    state.team = params.get("team") || null;
    state.compare = params.get("compare") || null;
    state.player = params.get("player") || null;
    state.rotationOnly = params.get("rotation") !== "all";
    state.tab = ["map", "coverage", "benchmark"].indexOf(params.get("tab")) >= 0 ? params.get("tab") : "map";
  }

  function updateSeasonContext() {
    seasonRows = allRows.filter(function (row) { return row.year === state.year; });
    seasonValues = {};
    metrics.concat([
      { key: "fga_per_game" }, { key: "points_per_game" }
    ]).forEach(function (metric) {
      seasonValues[metric.key] = seasonRows.map(function (row) { return row[metric.key]; })
        .filter(Number.isFinite).sort(d3.ascending);
    });
    teams = Array.from(d3.group(seasonRows, function (row) { return row.team; }), function (entry) {
      return { code: entry[0], win_pct: d3.median(entry[1], function (row) { return row.win_pct; }), rows: entry[1] };
    }).sort(function (a, b) { return d3.descending(a.win_pct, b.win_pct) || d3.ascending(a.code, b.code); });

    if (!teams.some(function (team) { return team.code === state.team; })) state.team = teams[0] ? teams[0].code : null;
    if (state.compare === state.team || !teams.some(function (team) { return team.code === state.compare; })) state.compare = null;
    var roster = currentRoster();
    if (!roster.some(function (row) { return row.player === state.player; })) state.player = roster[0] ? roster[0].player : null;
  }

  function currentTeamRows(code) {
    return seasonRows.filter(function (row) { return row.team === (code || state.team); })
      .sort(function (a, b) { return d3.descending(a.minutes_per_game, b.minutes_per_game); });
  }

  function currentRoster() {
    var rows = currentTeamRows(state.team);
    return state.rotationOnly ? rows.slice(0, 10) : rows;
  }

  function rotationRows(code) { return currentTeamRows(code).slice(0, 10); }

  function bindControls() {
    var seasonSelect = document.getElementById("rosterSeason");
    seasonSelect.innerHTML = seasons.map(function (year) {
      return '<option value="' + year + '">' + seasonLabel(year) + "</option>";
    }).join("");
    seasonSelect.addEventListener("change", function () {
      var priorTeam = state.team;
      state.year = +this.value;
      state.team = priorTeam;
      state.player = null;
      updateSeasonContext();
      renderAll(true);
    });

    document.getElementById("rotationToggle").addEventListener("change", function () {
      state.rotationOnly = this.checked;
      var roster = currentRoster();
      if (!roster.some(function (row) { return row.player === state.player; })) state.player = roster[0] ? roster[0].player : null;
      renderAll(true);
    });
    document.getElementById("coverageSort").addEventListener("change", function () {
      state.sort = this.value;
      renderCoverage();
    });
    document.getElementById("previousPlayer").addEventListener("click", function () { stepPlayer(-1); });
    document.getElementById("nextPlayer").addEventListener("click", function () { stepPlayer(1); });
    document.getElementById("applyCompare").addEventListener("click", applyComparison);
    document.getElementById("removeCompare").addEventListener("click", function () {
      state.compare = null;
      document.getElementById("compareMenu").open = false;
      renderAll(true);
    });
    document.getElementById("exportRoster").addEventListener("click", exportRoster);
    document.getElementById("copyRosterLink").addEventListener("click", copyLink);
    document.querySelectorAll("#analysisTabs [data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.tab = this.getAttribute("data-tab");
        renderTabs();
        writeUrl(true);
        document.getElementById(this.getAttribute("aria-controls")).scrollIntoView({ block: "nearest" });
      });
    });
    window.addEventListener("popstate", function () {
      readUrlState();
      updateSeasonContext();
      renderAll(false);
    });
  }

  function renderAll(pushHistory) {
    document.getElementById("rosterSeason").value = state.year;
    document.getElementById("rotationToggle").checked = state.rotationOnly;
    document.getElementById("coverageSort").value = state.sort;
    renderTeamRail();
    renderCompareControl();
    renderSummary();
    renderFilters();
    renderRoleMap();
    renderPlayerTray();
    renderCoverage();
    renderBenchmark();
    renderTabs();
    writeUrl(!!pushHistory);
  }

  function renderTeamRail() {
    var rail = d3.select("#teamRail");
    rail.selectAll("button")
      .data(teams, function (team) { return team.code; })
      .join("button")
      .attr("type", "button")
      .attr("class", function (team) { return team.code === state.team ? "team-card is-selected" : "team-card"; })
      .attr("aria-pressed", function (team) { return team.code === state.team ? "true" : "false"; })
      .attr("title", function (team) { return teamName(team.code) + ", " + fmtPct(team.win_pct); })
      .html(function (team) {
        return "<strong>" + escapeHtml(team.code) + "</strong><span>" + fmtPct(team.win_pct) + "</span>";
      })
      .on("click", function (event, team) {
        state.team = team.code;
        if (state.compare === state.team) state.compare = null;
        state.player = currentRoster()[0] ? currentRoster()[0].player : null;
        renderAll(true);
        var selected = document.querySelector(".team-card.is-selected");
        if (selected) selected.scrollIntoView({ inline: "center", block: "nearest" });
      });
  }

  function renderCompareControl() {
    var select = document.getElementById("compareTeamSelect");
    var candidates = teams.filter(function (team) { return team.code !== state.team; });
    select.innerHTML = candidates.map(function (team) {
      return '<option value="' + team.code + '">' + escapeHtml(teamName(team.code)) + " — " + fmtPct(team.win_pct) + "</option>";
    }).join("");
    select.value = state.compare || (candidates[0] ? candidates[0].code : "");
    document.getElementById("removeCompare").disabled = !state.compare;
  }

  function applyComparison() {
    var value = document.getElementById("compareTeamSelect").value;
    state.compare = value && value !== state.team ? value : null;
    document.getElementById("compareMenu").open = false;
    renderAll(true);
  }

  function renderSummary() {
    var roster = currentRoster();
    var team = teams.find(function (item) { return item.code === state.team; });
    document.getElementById("teamSummaryTitle").textContent = teamName(state.team);
    document.getElementById("teamSeasonLabel").textContent = seasonLabel(state.year) + " · " + (state.rotationOnly ? "10-player rotation proxy" : "all listed player rows");
    document.getElementById("summaryWin").textContent = team ? fmtPct(team.win_pct) : "—";
    document.getElementById("summarySize").textContent = roster.length;
    document.getElementById("summaryBreadth").textContent = fmt2(d3.mean(roster, function (row) { return row.role_category_count; }) || 0);
    document.getElementById("rosterInterpretation").textContent = rosterInterpretation(roster);

    var compareBox = document.getElementById("compareSummary");
    if (state.compare) {
      var compareTeam = teams.find(function (item) { return item.code === state.compare; });
      var compareRoster = rotationRows(state.compare);
      compareBox.hidden = false;
      compareBox.innerHTML = '<span>Comparison team</span><strong>' + escapeHtml(teamName(state.compare)) + "</strong><p>" +
        (compareTeam ? fmtPct(compareTeam.win_pct) : "—") + " win % · " + compareRoster.length + "-player rotation · " +
        fmt2(d3.mean(compareRoster, function (row) { return row.role_category_count; }) || 0) + " average role breadth</p>";
    } else {
      compareBox.hidden = true;
      compareBox.innerHTML = "";
    }
  }

  function rosterInterpretation(roster) {
    if (!roster.length) return "No player rows are available for this selection.";
    var totalScoring = d3.sum(roster, function (row) { return Math.max(0, row.points_per_game); });
    var topTwoShare = totalScoring ? d3.sum(roster.slice(0).sort(function (a, b) { return d3.descending(a.points_per_game, b.points_per_game); }).slice(0, 2), function (row) { return row.points_per_game; }) / totalScoring : 0;
    var creationWeights = roster.map(function (row) { return Math.max(0, row.assists_per_36 * row.minutes_per_game); }).sort(d3.descending);
    var creationShare = d3.sum(creationWeights) ? d3.sum(creationWeights.slice(0, 2)) / d3.sum(creationWeights) : 0;
    var teamBreadth = d3.mean(roster, function (row) { return row.role_category_count; });
    var seasonTeamBreadths = teams.map(function (team) { return d3.mean(rotationRows(team.code), function (row) { return row.role_category_count; }); });
    var breadthMedian = d3.median(seasonTeamBreadths);
    var scoringText = topTwoShare >= 0.42 ? "Scoring responsibility is concentrated among two high-volume players." : "Scoring responsibility is spread beyond the top two options.";
    var creationText = creationShare <= 0.55 ? " Creation is distributed across several rotation players." : " Creation is concentrated in the leading playmakers.";
    var breadthText = teamBreadth >= breadthMedian ? " The rotation has above-season-median role breadth." : " The rotation has below-season-median role breadth.";
    return scoringText + creationText + breadthText;
  }

  function renderFilters() {
    var values = ["All"].concat(roleOrder);
    d3.select("#roleFilters").selectAll("button")
      .data(values)
      .join("button")
      .attr("type", "button")
      .attr("aria-pressed", function (value) { return value === state.profile ? "true" : "false"; })
      .attr("class", function (value) { return "role-filter role-" + value.toLowerCase().replace(/[^a-z]+/g, "-"); })
      .text(function (value) { return value === "All" || value === "Two-way" ? value : value + "s"; })
      .on("click", function (event, value) {
        state.profile = value;
        renderFilters();
        renderRoleMap();
      });
  }

  function roleCoordinates(row) {
    return {
      x: d3.mean([percentile(row, "points_per_36"), percentile(row, "fga_per_game")]),
      y: d3.mean([percentile(row, "assists_per_36"), percentile(row, "rebounds_per_36"), percentile(row, "stocks_per_36"), percentile(row, "efg_pct"), percentile(row, "role_category_count")])
    };
  }

  function roleProfile(row) {
    var scoring = d3.mean([percentile(row, "points_per_36"), percentile(row, "fga_per_game")]);
    var creation = percentile(row, "assists_per_36");
    var defense = d3.mean([percentile(row, "stocks_per_36"), percentile(row, "rebounds_per_36")]);
    var breadth = d3.mean([percentile(row, "role_category_count"), creation, defense, percentile(row, "efg_pct")]);
    if (breadth >= 70 && scoring >= 55 && defense >= 55) return "Two-way";
    var choices = [{ name: "Scorer", value: scoring }, { name: "Creator", value: creation }, { name: "Defender", value: defense }];
    choices.sort(function (a, b) { return d3.descending(a.value, b.value); });
    return choices[0].name;
  }

  function renderRoleMap() {
    var container = d3.select("#rosterRoleMap");
    container.selectAll("*").remove();
    var roster = currentRoster().map(function (row) {
      return Object.assign({}, row, { coordinates: roleCoordinates(row), roleProfile: roleProfile(row) });
    });
    var visible = roster.filter(function (row) { return state.profile === "All" || row.roleProfile === state.profile || row.player === state.player; });
    if (!visible.length) return;

    var nodeWidth = container.node().clientWidth || 800;
    var width = Math.max(340, nodeWidth);
    var compactLandscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
    var mobile = width < 600 && !compactLandscape;
    var height = compactLandscape ? 210 : (mobile ? 420 : Math.max(430, Math.min(540, width * 0.58)));
    var margin = compactLandscape ? { top: 24, right: 32, bottom: 38, left: 44 } : (mobile ? { top: 32, right: 24, bottom: 54, left: 48 } : { top: 34, right: 56, bottom: 58, left: 62 });
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;
    var x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
    var y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
    var radius = d3.scaleSqrt().domain([0, d3.max(roster, function (row) { return row.minutes_per_game; }) || 40]).range([7, mobile ? 21 : 25]);
    var svg = container.append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("role", "group")
      .attr("aria-label", "Roster role map for " + teamName(state.team) + ", " + seasonLabel(state.year));
    svg.append("title").text("Roster role map: scoring load horizontally and non-scoring contribution vertically");
    var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    [25, 50, 75].forEach(function (tick) {
      g.append("line").attr("class", tick === 50 ? "role-map-midline" : "role-map-gridline")
        .attr("x1", x(tick)).attr("x2", x(tick)).attr("y1", 0).attr("y2", innerHeight);
      g.append("line").attr("class", tick === 50 ? "role-map-midline" : "role-map-gridline")
        .attr("x1", 0).attr("x2", innerWidth).attr("y1", y(tick)).attr("y2", y(tick));
    });
    g.append("g").attr("class", "axis roster-axis").attr("transform", "translate(0," + innerHeight + ")")
      .call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat(function (d) { return d; }));
    g.append("g").attr("class", "axis roster-axis")
      .call(d3.axisLeft(y).tickValues([0, 25, 50, 75, 100]).tickFormat(function (d) { return d; }));
    g.append("text").attr("class", "role-axis-label").attr("x", innerWidth / 2).attr("y", innerHeight + 45).attr("text-anchor", "middle").text("Scoring load percentile →");
    g.append("text").attr("class", "role-axis-label").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -39).attr("text-anchor", "middle").text("Non-scoring contribution percentile →");

    var marks = g.append("g").attr("class", "roster-bubbles").selectAll("circle")
      .data(visible, function (row) { return row.key; }).join("circle")
      .attr("cx", function (row) { return x(row.coordinates.x); })
      .attr("cy", function (row) { return y(row.coordinates.y); })
      .attr("r", function (row) { return radius(row.minutes_per_game) + (row.player === state.player ? 3 : 0); })
      .attr("fill", function (row) { return roleColors[row.roleProfile]; })
      .attr("fill-opacity", function (row) { return row.player === state.player ? .76 : .38; })
      .attr("stroke", function (row) { return row.player === state.player ? "#28d7f7" : roleColors[row.roleProfile]; })
      .attr("stroke-width", function (row) { return row.player === state.player ? 4 : 1.5; })
      .attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", bubbleAriaLabel)
      .on("click", function (event, row) { selectPlayer(row.player, true); })
      .on("keydown", function (event, row) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPlayer(row.player, true); }
      })
      .on("pointerenter focus", function (event, row) { showTooltip(event, playerTooltip(row)); })
      .on("pointermove", function (event) { positionTooltip(event); })
      .on("pointerleave blur", hideTooltip);

    marks.append("title").text(function (row) { return bubbleAriaLabel(row); });
    var labelRows = visible.filter(function (row) {
      var rank = roster.findIndex(function (item) { return item.key === row.key; });
      return row.player === state.player || rank < ((mobile || compactLandscape) ? 5 : 7);
    }).map(function (row, index) { return Object.assign({}, row, { labelIndex: index }); });
    var labels = g.append("g").attr("class", "bubble-labels").selectAll("g").data(labelRows).join("g")
      .attr("transform", function (row) {
        var rightSide = row.coordinates.x < 70;
        var dx = rightSide ? radius(row.minutes_per_game) + 7 : -radius(row.minutes_per_game) - 7;
        var mobileOffsets = [-11, 18, 14, -13, 20];
        var dy = mobile ? mobileOffsets[row.labelIndex % mobileOffsets.length] : -2;
        return "translate(" + (x(row.coordinates.x) + dx) + "," + (y(row.coordinates.y) + dy) + ")";
      })
      .attr("text-anchor", function (row) { return row.coordinates.x < 70 ? "start" : "end"; });
    labels.append("text").attr("class", function (row) { return row.player === state.player ? "bubble-name is-selected" : "bubble-name"; })
      .text(function (row) { return shortPlayerName(row.player); });
    labels.filter(function (row) { return row.player === state.player || (!mobile && !compactLandscape); }).append("text")
      .attr("class", "bubble-minutes").attr("y", 15).text(function (row) { return fmt1(row.minutes_per_game) + " MPG"; });

    var legend = d3.select("#roleLegend");
    legend.selectAll("span").data(roleOrder).join("span").html(function (role) {
      return '<i style="--role-color:' + roleColors[role] + '"></i><b>' + role + "</b> profile";
    });
  }

  function bubbleAriaLabel(row) {
    return row.player + ", " + fmt1(row.minutes_per_game) + " minutes per game, " + row.roleProfile +
      " profile, scoring load " + ordinal(Math.round(row.coordinates.x)).replace(" pct.", " percentile") + ", non-scoring contribution " + ordinal(Math.round(row.coordinates.y)).replace(" pct.", " percentile");
  }

  function playerTooltip(row) {
    return "<strong>" + escapeHtml(row.player) + "</strong><br>" + escapeHtml(teamName(row.team)) + " · " + seasonLabel(row.year) +
      "<br>" + fmt1(row.minutes_per_game) + " MPG · " + escapeHtml(row.pos || row.position_group || "Position not listed") +
      "<br>Scoring load: " + Math.round(row.coordinates.x) + "th percentile<br>Non-scoring contribution: " + Math.round(row.coordinates.y) + "th percentile<br>" + escapeHtml(row.roleProfile) + " profile";
  }

  function selectPlayer(player, pushHistory) {
    state.player = player;
    renderRoleMap();
    renderPlayerTray();
    renderCoverage();
    if (pushHistory) writeUrl(true);
  }

  function stepPlayer(direction) {
    var roster = currentRoster();
    if (!roster.length) return;
    var index = roster.findIndex(function (row) { return row.player === state.player; });
    index = (index + direction + roster.length) % roster.length;
    selectPlayer(roster[index].player, true);
  }

  function selectedRow() {
    return currentRoster().find(function (row) { return row.player === state.player; }) || currentRoster()[0];
  }

  function renderPlayerTray() {
    var row = selectedRow();
    if (!row) return;
    var profile = roleProfile(row);
    document.getElementById("playerTrayTitle").textContent = row.player;
    document.getElementById("playerTrayMeta").textContent = fmt1(row.minutes_per_game) + " MPG · " + (row.pos || row.position_group || "Position not listed") + " · " + teamName(row.team) + " · " + seasonLabel(row.year);
    document.getElementById("selectedPlayerSwatch").style.setProperty("--player-color", roleColors[profile]);
    var roster = currentRoster();
    var index = roster.findIndex(function (item) { return item.player === row.player; });
    document.getElementById("playerPosition").textContent = (index + 1) + " / " + roster.length;
    document.getElementById("playerMetricStrip").innerHTML = metrics.map(function (metric) {
      var pct = percentile(row, metric.key);
      return '<article><span>' + escapeHtml(metric.label) + "</span><strong style=\"--metric-color:" + metric.color + '\">' +
        metric.format(row[metric.key]) + '</strong><small>' + escapeHtml(metric.unit) + " · " + ordinal(Math.round(pct)) +
        '</small><i><b style="width:' + pct + "%;--metric-color:" + metric.color + '"></b></i></article>';
    }).join("");
    document.getElementById("playerRoleLabels").innerHTML = [
      ["Roster profile", profile],
      ["Dataset profile", displayLabel(row.profile_group)],
      ["Shot role", displayLabel(row.efficient_lower_shot_label)],
      ["Event role", displayLabel(row.defensive_event_profile)]
    ].map(function (entry) { return "<span><b>" + escapeHtml(entry[0]) + "</b> " + escapeHtml(entry[1]) + "</span>"; }).join("");
  }

  function renderCoverage() {
    var roster = currentRoster().slice().sort(function (a, b) {
      return d3.descending(a[state.sort], b[state.sort]) || d3.descending(a.minutes_per_game, b.minutes_per_game);
    });
    var table = '<table class="coverage-table"><caption class="sr-only">Roster coverage percentiles and raw player values</caption><thead><tr><th scope="col">Player</th><th scope="col">MPG</th>' +
      metrics.map(function (metric) { return '<th scope="col">' + escapeHtml(metric.short) + "</th>"; }).join("") + "</tr></thead><tbody>";
    roster.forEach(function (row) {
      var selected = row.player === state.player;
      table += '<tr data-player="' + escapeHtml(row.player) + '"' + (selected ? ' class="is-selected" aria-current="true"' : "") + '><th scope="row"><button type="button" class="matrix-player"><i style="--player-color:' + roleColors[roleProfile(row)] + '"></i>' + escapeHtml(shortPlayerName(row.player)) + '</button></th><td class="minutes-cell">' + fmt1(row.minutes_per_game) + "</td>";
      metrics.forEach(function (metric) {
        var pct = percentile(row, metric.key);
        table += '<td><div class="matrix-value"><span>' + metric.format(row[metric.key]) + '<small>' + ordinal(Math.round(pct)) +
          '</small></span><i><b style="width:' + pct + "%;--metric-color:" + metric.color + '"></b><em></em></i></div></td>';
      });
      table += "</tr>";
    });
    table += "</tbody></table>";
    var wrap = document.getElementById("coverageTable");
    wrap.innerHTML = table;
    wrap.querySelectorAll("tbody tr").forEach(function (row) {
      row.addEventListener("click", function () { selectPlayer(this.getAttribute("data-player"), true); });
    });
  }

  function renderBenchmark() {
    var teamShapes = teams.map(function (team) { return teamShape(team.code); });
    metrics.forEach(function (metric) {
      var values = teamShapes.map(function (shape) { return shape.raw[metric.key]; }).sort(d3.ascending);
      teamShapes.forEach(function (shape) { shape.percentiles[metric.key] = percentileFromValues(shape.raw[metric.key], values); });
    });
    var selected = teamShapes.find(function (shape) { return shape.code === state.team; });
    var comparison = teamShapes.find(function (shape) { return shape.code === state.compare; });
    var topFiveCodes = teams.slice(0, 5).map(function (team) { return team.code; });
    var topFive = {};
    metrics.forEach(function (metric) {
      topFive[metric.key] = d3.mean(teamShapes.filter(function (shape) { return topFiveCodes.indexOf(shape.code) >= 0; }), function (shape) { return shape.percentiles[metric.key]; });
    });

    var legendData = [
      { label: teamName(state.team), color: "#28d7f7", type: "bar" },
      { label: "League average", color: "#cbd5df", type: "marker" },
      { label: "Top-five teams", color: "#72c77d", type: "bar" }
    ];
    if (comparison) legendData.splice(1, 0, { label: teamName(state.compare), color: "#ffb21c", type: "bar" });
    d3.select("#benchmarkLegend").selectAll("span").data(legendData).join("span").html(function (item) {
      return '<i class="' + item.type + '" style="--series-color:' + item.color + '"></i>' + escapeHtml(item.label);
    });

    var container = d3.select("#teamBenchmark");
    container.selectAll("*").remove();
    if (!selected) return;
    var width = Math.max(360, container.node().clientWidth || 620);
    var seriesCount = comparison ? 3 : 2;
    var rowHeight = comparison ? 88 : 74;
    var height = metrics.length * rowHeight + 40;
    var margin = { top: 16, right: 44, bottom: 24, left: width < 520 ? 92 : 126 };
    var innerWidth = width - margin.left - margin.right;
    var x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
    var svg = container.append("svg").attr("viewBox", "0 0 " + width + " " + height).attr("role", "img").attr("aria-labelledby", "benchmarkTitle");
    var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    var series = [
      { key: "selected", label: state.team, color: "#28d7f7", values: selected.percentiles },
      { key: "top", label: "Top 5", color: "#72c77d", values: topFive }
    ];
    if (comparison) series.splice(1, 0, { key: "compare", label: state.compare, color: "#ffb21c", values: comparison.percentiles });
    var barHeight = 11;
    metrics.forEach(function (metric, metricIndex) {
      var y0 = metricIndex * rowHeight;
      g.append("text").attr("class", "benchmark-metric-label").attr("x", -12).attr("y", y0 + 13).attr("text-anchor", "end").text(metric.short);
      g.append("line").attr("class", "benchmark-baseline").attr("x1", 0).attr("x2", innerWidth).attr("y1", y0 + 18).attr("y2", y0 + 18);
      g.append("line").attr("class", "league-marker").attr("x1", x(50)).attr("x2", x(50)).attr("y1", y0 + 8).attr("y2", y0 + seriesCount * 18 + 13);
      series.forEach(function (item, seriesIndex) {
        var value = item.values[metric.key];
        var yBar = y0 + 8 + seriesIndex * 18;
        g.append("rect").attr("class", "benchmark-bar").attr("x", 0).attr("y", yBar).attr("height", barHeight).attr("width", x(value)).attr("fill", item.color);
        g.append("text").attr("class", "benchmark-value").attr("x", Math.min(innerWidth + 6, x(value) + 5)).attr("y", yBar + 10).text(Math.round(value));
      });
    });
  }

  function teamShape(code) {
    var roster = rotationRows(code);
    var totalMinutes = d3.sum(roster, function (row) { return row.minutes_per_game; }) || 1;
    var raw = {};
    metrics.forEach(function (metric) {
      raw[metric.key] = d3.sum(roster, function (row) { return row[metric.key] * row.minutes_per_game; }) / totalMinutes;
    });
    return { code: code, raw: raw, percentiles: {} };
  }

  function renderTabs() {
    document.body.setAttribute("data-active-tab", state.tab);
    document.querySelectorAll("#analysisTabs [data-tab]").forEach(function (button) {
      var active = button.getAttribute("data-tab") === state.tab;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("tabindex", active ? "0" : "-1");
    });
  }

  function writeUrl(push) {
    if (!state.year || !state.team) return;
    var params = new URLSearchParams();
    params.set("year", state.year);
    params.set("team", state.team);
    if (state.compare) params.set("compare", state.compare);
    if (state.player) params.set("player", state.player);
    params.set("rotation", state.rotationOnly ? "10" : "all");
    params.set("tab", state.tab);
    var next = window.location.pathname + "?" + params.toString() + window.location.hash;
    if (push && next !== window.location.pathname + window.location.search + window.location.hash) history.pushState({}, "", next);
    else history.replaceState({}, "", next);
  }

  function exportRoster() {
    var columns = ["year", "player", "team", "pos", "minutes_per_game", "points_per_36", "assists_per_36", "rebounds_per_36", "stocks_per_36", "efg_pct", "role_category_count", "win_pct"];
    var csv = [columns.join(",")].concat(currentRoster().map(function (row) {
      return columns.map(function (key) { return csvValue(row[key]); }).join(",");
    })).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = "nba-roster-lab-" + state.year + "-" + state.team.toLowerCase() + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function copyLink() {
    var status = document.getElementById("shareStatus");
    var done = function () { status.textContent = "Link copied."; document.getElementById("copyRosterLink").textContent = "Copied"; setTimeout(function () { document.getElementById("copyRosterLink").textContent = "Copy link"; }, 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(window.location.href).then(done).catch(function () { status.textContent = "Copy failed. Use the browser address bar."; });
    else { status.textContent = "Use the browser address bar to copy this view."; }
  }

  function showTooltip(event, html) {
    var tooltip = d3.select("#tooltip").style("display", "block").html(html);
    positionTooltip(event);
    return tooltip;
  }

  function positionTooltip(event) {
    if (!event || !Number.isFinite(event.clientX)) return;
    var node = document.getElementById("tooltip");
    var left = Math.min(window.innerWidth - 260, event.clientX + 14);
    var top = Math.min(window.innerHeight - (node.offsetHeight || 120) - 12, event.clientY + 14);
    node.style.left = Math.max(8, left) + "px";
    node.style.top = Math.max(8, top) + "px";
  }

  function hideTooltip() { d3.select("#tooltip").style("display", "none"); }

  function percentile(row, key) { return percentileFromValues(row[key], seasonValues[key] || []); }
  function percentileFromValues(value, values) {
    if (!Number.isFinite(value) || !values.length) return 0;
    return Math.max(1, Math.min(100, (d3.bisectRight(values, value) / values.length) * 100));
  }
  function teamName(code) { return teamMeta[code] ? teamMeta[code][0] : code || "Unknown team"; }
  function seasonLabel(year) { return (year - 1) + "–" + String(year).slice(-2); }
  function shortPlayerName(name) {
    var parts = String(name || "").trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : name;
  }
  function displayLabel(value) {
    return String(value || "Not labeled").replace(/Other core player/g, "Standard profile").replace(/steals \+ blocks/g, "defensive events");
  }
  function ordinal(value) {
    var mod100 = value % 100;
    var suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th");
    return value + suffix + " pct.";
  }
  function csvValue(value) { var text = String(value == null ? "" : value); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function observeSize() {
    if (!("ResizeObserver" in window)) return;
    var timer;
    var observer = new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () { renderRoleMap(); renderBenchmark(); }, 120);
    });
    observer.observe(document.getElementById("rosterRoleMap"));
    observer.observe(document.getElementById("teamBenchmark"));
  }
}());
