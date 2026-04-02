# DeFi Yield Radar 📡

Live yield aggregator pulling data from DeFiLlama across every major DeFi chain.

## Features

- **Live yield data** from DeFiLlama's `/pools` endpoint — thousands of pools updated in real time
- **Smart risk scoring** — each pool gets a 0–100 risk score based on APY magnitude, TVL depth, and IL exposure
- **Three charts**: Top chains by avg APY (horizontal bar), APY distribution (doughnut), TVL vs APY scatter
- **Powerful filters**: chain, stablecoin/volatile, min/max APY, min TVL, free-text search
- **Sort by**: APY, TVL, or risk score
- **Stablecoin spotlight**: 24-card grid showing the best stable yields sorted by APY
- **Auto-refresh** every 5 minutes

## Data Source

All data is sourced from [DeFiLlama](https://defillama.com) — the most comprehensive DeFi data aggregator.

## Tech

Plain HTML/CSS/JS + Chart.js — no build step, deploys as a static site.
