/* global d3, USCloroplethByState */
var stateCodes = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56"
};

var staticBase = (document.body.getAttribute("data-static-base") || "/static/").replace(/\/?$/, "/");

function staticUrl(path) {
  return staticBase + path;
}

var chart = USCloroplethByState()
  .width(760)
  .height(480)
  .id(function(d) { return d.id; })
  .color(function(d) { return d.value; })
  .tooltip(function(d) {
    if (!d || !d.state) return "No NBA team";
    return d.state + "<br>" +
      "Teams: " + d.teams + "<br>" +
      "Average win pct: " + d3.format(".1%")(d.value);
  });

d3.select("#yearSlider")
  .on("input", function() {
    d3.select("#yearSliderLabel").text(d3.event.target.value);
    update(d3.event.target.value);
  })
  .on("change", function() {
    d3.select("#yearSliderLabel").text(d3.event.target.value);
    update(d3.event.target.value);
  });

update(2025);

function update(year) {
  d3.json("/api/map/" + year, function(err, data) {
    if (err || !Array.isArray(data)) {
      d3.csv(staticUrl("data/team_state_win_pct.csv"), function(csvErr, rows) {
        if (csvErr) throw csvErr;
        drawMap(rows.filter(function(row) { return +row.year === +year; }));
      });
      return;
    }

    drawMap(data);
  });
}

function drawMap(data) {
  data.forEach(function(d) {
    d.id = stateCodes[d.state];
    d.value = +d.avg_win_pct;
  });

  chart.colorScale(d3.scaleThreshold()
    .domain([.25, .35, .45, .50, .55, .60, .65, .70])
    .range(d3.schemeBlues[9])
  );

  d3.select("#maps")
    .datum(data)
    .call(chart);

  renderTable(data);
}

function renderTable(data) {
  var topRows = data
    .slice()
    .sort(function(a, b) { return +b.avg_win_pct - +a.avg_win_pct; })
    .slice(0, 8);

  var html = "<table class='mini-table'><thead><tr><th>State</th><th>Teams</th><th>Win %</th></tr></thead><tbody>";
  topRows.forEach(function(row) {
    html += "<tr><td>" + row.state + "</td><td>" + row.teams + "</td><td>" + d3.format(".1%")(+row.avg_win_pct) + "</td></tr>";
  });
  html += "</tbody></table>";
  d3.select("#mapTable").html(html);
}
