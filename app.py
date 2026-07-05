import csv
import json
from pathlib import Path

from flask import Flask, jsonify, render_template


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "static" / "data"

app = Flask(__name__)


def read_json(filename):
    with (DATA_DIR / filename).open(encoding="utf-8") as handle:
        return json.load(handle)


def read_csv(filename):
    with (DATA_DIR / filename).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/map")
def map_view():
    return render_template("map.html")


@app.route("/api/data")
def app_data():
    return jsonify(read_json("nba_app_data.json"))


@app.route("/api/map/<int:year>")
def map_data(year):
    rows = [row for row in read_csv("team_state_win_pct.csv") if int(row["year"]) == year]
    return jsonify(rows)


if __name__ == "__main__":
    app.run(debug=True)
