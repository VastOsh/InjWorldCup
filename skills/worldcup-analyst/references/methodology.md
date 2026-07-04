# Model methodology

The analysis behind `get_analysis` / `get_premium_analysis` is a deterministic
Poisson goals model. No LLM inference, no randomness — the same inputs always
give the same output.

## Inputs
- Each team's **group-stage record**: matches played, goals for, goals against
  (aggregated from finished group matches).
- The match's **decimal odds** (multipliers), used only for the *market*
  comparison — never as a model input.

## Expected goals (λ)
Attack and defence are expressed relative to the tournament's average goals per
team per game. For each side:

```
λ_home = (home goals-for/game) × (away goals-against/game) / leagueAvg × homeAdv
λ_away = (away goals-for/game) × (home goals-against/game) / leagueAvg
```

`homeAdv` is small (~1.05) because World Cup venues are effectively neutral.
Teams with no group data fall back to league-average rates. λ is clamped to a
plausible band.

## Scoreline & outcome probabilities
Home and away goals are modelled as independent Poisson variables. The full
score grid (0–8 each) gives:
- the **most likely scoreline** (grid maximum),
- **home / draw / away** probabilities (summing the grid regions),
- the **scoreline map** (top cells) in the premium report.

## Market probabilities & value
Odds are converted to probabilities and normalised to remove the bookmaker's
overround (vig), so they sum to 1. **Value** = model probability − market
probability for an outcome; a positive gap means the model rates it more likely
than the price implies.

## Suggested stake (premium)
Fractional Kelly on the value outcome using the *actual* payout odds:

```
f* = (p · o − 1) / (o − 1)          # p = model prob, o = decimal odds
stake = min(f* / 4, 0.25)           # quarter-Kelly, capped at 25% bankroll
```

## Limitations
- Group records are small samples; early-tournament edges are noisy.
- Independence of goals is a simplification (no explicit correlation term).
- The model has no injuries, lineups, travel, or motivation context.
Treat outputs as a disciplined second opinion, not a prediction of fact.
