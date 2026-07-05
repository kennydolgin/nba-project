import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TABLES = ROOT / "outputs" / "tables"
STATIC_DATA = ROOT / "static" / "data"

TEAM_STATES = {
    "ATL": "GA", "BOS": "MA", "BRK": "NY", "BKN": "NY", "CHA": "NC", "CHO": "NC",
    "CHI": "IL", "CLE": "OH", "DAL": "TX", "DEN": "CO", "DET": "MI", "GSW": "CA",
    "HOU": "TX", "IND": "IN", "LAC": "CA", "LAL": "CA", "MEM": "TN", "MIA": "FL",
    "MIL": "WI", "MIN": "MN", "NJN": "NJ", "NOH": "LA", "NOK": "LA", "NOP": "LA",
    "NYK": "NY", "OKC": "OK", "ORL": "FL", "PHI": "PA", "PHO": "AZ", "PHX": "AZ",
    "POR": "OR", "SAC": "CA", "SAS": "TX", "SEA": "WA", "TOR": "NY", "UTA": "UT",
    "WAS": "DC",
}


def read_rows(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_float(value, default=None):
    try:
        if value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def slim_rows(rows, fields, limit=None):
    result = []
    for row in rows[:limit]:
        clean = {}
        for field in fields:
            value = row.get(field, "")
            number = as_float(value)
            clean[field] = number if number is not None and field not in {"player", "team", "pos", "position_group", "team_success_bucket", "profile_group", "defensive_event_profile"} else value
        result.append(clean)
    return result


def sample_evenly(rows, max_rows=1200):
    if len(rows) <= max_rows:
        return rows
    step = len(rows) / max_rows
    return [rows[int(i * step)] for i in range(max_rows)]


def build_map_csv():
    team_rows = read_rows(TABLES / "latest_season_team_records.csv")
    all_team_rows = read_rows(ROOT / "outputs" / "data" / "team_season_records.csv")
    rows = all_team_rows if all_team_rows else team_rows
    grouped = defaultdict(list)

    for row in rows:
        team = row.get("team", "")
        state = TEAM_STATES.get(team)
        win_pct = as_float(row.get("win_pct"))
        year = row.get("year", "")
        if state and win_pct is not None and year:
            grouped[(year, state)].append((team, win_pct))

    out_path = STATIC_DATA / "team_state_win_pct.csv"
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["year", "state", "teams", "avg_win_pct"])
        writer.writeheader()
        for (year, state), values in sorted(grouped.items()):
            avg = sum(value for _, value in values) / len(values)
            teams = ", ".join(sorted(team for team, _ in values))
            writer.writerow({
                "year": year,
                "state": state,
                "teams": teams,
                "avg_win_pct": round(avg, 4),
            })


def build_app_json():
    profile_mix = read_rows(TABLES / "top3_h1_profile_mix_by_success_bucket.csv")
    efficient = read_rows(TABLES / "top3_h2_efficient_lower_shot_share.csv")
    defense = read_rows(TABLES / "top3_h3_steals_blocks_scoring_overlap.csv")

    scoring_scatter = sample_evenly(read_rows(TABLES / "top3_h1_player_scatter_data.csv"))
    efficiency_scatter = sample_evenly(read_rows(TABLES / "top3_h2_efficiency_scatter_data.csv"))
    defense_scatter = sample_evenly(read_rows(TABLES / "top3_h3_scoring_steals_blocks_scatter_data.csv"))

    efficient_examples = read_rows(TABLES / "top3_h2_efficient_lower_shot_player_examples.csv")[:3]
    defense_examples = read_rows(TABLES / "top3_h3_steals_blocks_non_scorer_examples.csv")[:3]

    examples = []
    for row in efficient_examples:
        examples.append({
            "year": row["year"],
            "player": row["player"],
            "team": row["team"],
            "note": f"Efficient lower-shot contributor: {float(row['efg_pct']):.1%} eFG on {float(row['fga_per_game']):.1f} FGA/game."
        })
    for row in defense_examples:
        examples.append({
            "year": row["year"],
            "player": row["player"],
            "team": row["team"],
            "note": f"Non-top scorer with defensive-event production: {float(row['steals_blocks_per_36']):.2f} steals + blocks per 36."
        })

    app_data = {
        "summary": {
            "playerSeasonRows": 7298,
            "teamSeasonRecords": 1462,
            "pointsWinCorrelation": 0.065,
            "roleCountWinCorrelation": 0.116,
            "highWinningEfficientLowerShotShare": 0.295,
            "lowWinningEfficientLowerShotShare": 0.200,
            "topStocksNotTopScorerShare": 0.782,
        },
        "profileMix": profile_mix,
        "efficientLowerShot": efficient,
        "defenseOverlap": defense,
        "scoringScatter": slim_rows(scoring_scatter, [
            "year", "player", "team", "points_per_game", "win_pct", "profile_group", "team_success_bucket"
        ]),
        "efficiencyScatter": slim_rows(efficiency_scatter, [
            "year", "player", "team", "fga_per_game", "efg_pct", "team_success_bucket"
        ]),
        "defenseScatter": slim_rows(defense_scatter, [
            "year", "player", "team", "points_per_game", "steals_blocks_per_36", "defensive_event_profile"
        ]),
        "examples": examples,
    }

    with (STATIC_DATA / "nba_app_data.json").open("w", encoding="utf-8") as handle:
        json.dump(app_data, handle, indent=2)


def main():
    STATIC_DATA.mkdir(parents=True, exist_ok=True)
    build_map_csv()
    build_app_json()


if __name__ == "__main__":
    main()
