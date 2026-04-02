'use strict';

const API_URL = 'https://yields.llama.fi/pools';
const REFRESH_INTERVAL = 5 * 60 * 1000;

let allPools = [];
let filteredPools = [];
let displayCount = 50;
let chainChart, apyDistChart, scatterChart;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtApy(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 10000) return '>10k%';
  return v.toFixed(2) + '%';
}

function fmtTvl(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

function riskScore(pool) {
  // 0–100, lower = safer
  let score = 0;
  const apy = pool.apy || 0;
  if (apy > 500) score += 40;
  else if (apy > 100) score += 25;
  else if (apy > 30) score += 15;
  else if (apy > 10) score += 5;

  const tvl = pool.tvlUsd || 0;
  if (tvl < 100_000) score += 30;
  else if (tvl < 1_000_000) score += 20;
  else if (tvl < 10_000_000) score += 10;

  if (pool.ilRisk === 'YES') score += 15;
  if (!pool.stablecoin && apy > 50) score += 10;
  return Math.min(score, 100);
}

function riskLabel(score) {
  if (score < 20) return { label: 'Low', cls: 'risk-low' };
  if (score < 45) return { label: 'Medium', cls: 'risk-medium' };
  if (score < 70) return { label: 'High', cls: 'risk-high' };
  return { label: 'Degen 🔥', cls: 'risk-degen' };
}

function apyClass(apy) {
  if (apy > 100) return 'apy-fire';
  if (apy > 30) return 'apy-high';
  if (apy > 10) return 'apy-mid';
  return 'apy-low';
}

function ilClass(il) {
  if (!il || il === 'NO' || il === 'NONE') return { label: 'None', cls: 'il-low' };
  if (il === 'LOW') return { label: 'Low', cls: 'il-low' };
  if (il === 'MEDIUM') return { label: 'Med', cls: 'il-med' };
  return { label: 'High', cls: 'il-high' };
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  const btn = document.getElementById('refreshBtn');
  btn.innerHTML = '<span class="spinning">↻</span> Loading';
  btn.disabled = true;

  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    const data = json.data || [];

    // Filter out extreme outliers and pools with no TVL
    allPools = data
      .filter(p => p.tvlUsd > 10000 && p.apy != null && p.apy >= 0 && p.apy < 1_000_000)
      .map(p => ({ ...p, _risk: riskScore(p) }));

    populateChainFilter();
    updateStats();
    buildCharts();
    applyFilters();
    buildStableGrid();

    document.getElementById('lastUpdated').textContent =
      'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    console.error(e);
    document.getElementById('poolTableBody').innerHTML =
      '<tr><td colspan="10" class="loading-cell">Failed to load data. Retrying...</td></tr>';
  }

  btn.innerHTML = '↻ Refresh';
  btn.disabled = false;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats() {
  const pools = allPools;
  document.getElementById('statPools').textContent = pools.length.toLocaleString();

  const avgApy = pools.reduce((s, p) => s + (p.apy || 0), 0) / pools.length;
  document.getElementById('statAvgApy').textContent = fmtApy(avgApy);

  const totalTvl = pools.reduce((s, p) => s + (p.tvlUsd || 0), 0);
  document.getElementById('statTvl').textContent = fmtTvl(totalTvl);

  const chains = new Set(pools.map(p => p.chain)).size;
  document.getElementById('statChains').textContent = chains;

  const stables = pools.filter(p => p.stablecoin).sort((a, b) => b.apy - a.apy);
  document.getElementById('statBestStable').textContent = stables.length
    ? fmtApy(stables[0].apy) + ' — ' + stables[0].symbol.slice(0, 12)
    : '—';

  const top = [...pools].sort((a, b) => b.apy - a.apy)[0];
  document.getElementById('statBestDegen').textContent = top
    ? fmtApy(top.apy) + ' — ' + top.symbol.slice(0, 12)
    : '—';
}

// ── Chain filter ──────────────────────────────────────────────────────────────

function populateChainFilter() {
  const chains = [...new Set(allPools.map(p => p.chain))].sort();
  const sel = document.getElementById('filterChain');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Chains</option>';
  chains.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Charts ────────────────────────────────────────────────────────────────────

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } }
};

function buildCharts() {
  buildChainChart();
  buildApyDistChart();
  buildScatterChart();
}

function buildChainChart() {
  // Top 10 chains by average APY (min 5 pools)
  const byChain = {};
  allPools.forEach(p => {
    if (!byChain[p.chain]) byChain[p.chain] = [];
    byChain[p.chain].push(p.apy || 0);
  });
  const entries = Object.entries(byChain)
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => ({ chain: k, avg: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 12);

  const labels = entries.map(e => e.chain);
  const data = entries.map(e => parseFloat(e.avg.toFixed(2)));

  if (chainChart) chainChart.destroy();
  chainChart = new Chart(document.getElementById('chainChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg APY %',
        data,
        backgroundColor: data.map((v, i) => `hsl(${190 + i * 15},70%,55%)`),
        borderRadius: 4
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1e2d45' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e2d45' } }
      },
      plugins: { ...chartDefaults.plugins, legend: { display: false } }
    }
  });
}

function buildApyDistChart() {
  const buckets = [
    { label: '0–5%', min: 0, max: 5 },
    { label: '5–10%', min: 5, max: 10 },
    { label: '10–20%', min: 10, max: 20 },
    { label: '20–50%', min: 20, max: 50 },
    { label: '50–100%', min: 50, max: 100 },
    { label: '100–500%', min: 100, max: 500 },
    { label: '500%+', min: 500, max: Infinity }
  ];
  const counts = buckets.map(b => allPools.filter(p => p.apy >= b.min && p.apy < b.max).length);
  const colors = ['#22c55e', '#38bdf8', '#a855f7', '#eab308', '#f97316', '#ef4444', '#dc2626'];

  if (apyDistChart) apyDistChart.destroy();
  apyDistChart = new Chart(document.getElementById('apyDistChart'), {
    type: 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, padding: 8 } }
      }
    }
  });
}

function buildScatterChart() {
  // Take top 200 pools by TVL, scatter TVL vs APY
  const sample = [...allPools]
    .sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0))
    .slice(0, 200)
    .filter(p => p.apy < 500);

  const points = sample.map(p => ({
    x: parseFloat(((p.tvlUsd || 0) / 1e6).toFixed(3)),
    y: parseFloat((p.apy || 0).toFixed(2)),
    label: p.symbol
  }));

  if (scatterChart) scatterChart.destroy();
  scatterChart = new Chart(document.getElementById('scatterChart'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'TVL vs APY',
        data: points,
        backgroundColor: 'rgba(56,189,248,0.4)',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: {
          title: { display: true, text: 'TVL ($M)', color: '#64748b' },
          ticks: { color: '#64748b' }, grid: { color: '#1e2d45' }
        },
        y: {
          title: { display: true, text: 'APY %', color: '#64748b' },
          ticks: { color: '#64748b' }, grid: { color: '#1e2d45' }
        }
      },
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw.label}: TVL $${ctx.raw.x}M, APY ${ctx.raw.y}%`
          }
        }
      }
    }
  });
}

// ── Filters & table ───────────────────────────────────────────────────────────

function applyFilters() {
  const chain = document.getElementById('filterChain').value;
  const cat = document.getElementById('filterCategory').value;
  const minApy = parseFloat(document.getElementById('filterMinApy').value) || 0;
  const maxApy = parseFloat(document.getElementById('filterMaxApy').value) || 1e9;
  const minTvl = (parseFloat(document.getElementById('filterMinTvl').value) || 0) * 1e6;
  const sortBy = document.getElementById('sortBy').value;
  const search = document.getElementById('searchInput').value.toLowerCase().trim();

  filteredPools = allPools.filter(p => {
    if (chain && p.chain !== chain) return false;
    if (cat === 'stable' && !p.stablecoin) return false;
    if (cat === 'volatile' && p.stablecoin) return false;
    if ((p.apy || 0) < minApy || (p.apy || 0) > maxApy) return false;
    if ((p.tvlUsd || 0) < minTvl) return false;
    if (search) {
      const sym = (p.symbol || '').toLowerCase();
      const prot = (p.project || '').toLowerCase();
      if (!sym.includes(search) && !prot.includes(search)) return false;
    }
    return true;
  });

  if (sortBy === 'apy') filteredPools.sort((a, b) => (b.apy || 0) - (a.apy || 0));
  else if (sortBy === 'tvl') filteredPools.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));
  else if (sortBy === 'risk') filteredPools.sort((a, b) => a._risk - b._risk);

  displayCount = 50;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('poolTableBody');
  document.getElementById('poolCount').textContent =
    filteredPools.length.toLocaleString() + ' pools';

  if (!filteredPools.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="loading-cell">No pools match your filters.</td></tr>';
    document.getElementById('loadMoreBtn').style.display = 'none';
    return;
  }

  const slice = filteredPools.slice(0, displayCount);
  tbody.innerHTML = slice.map((p, i) => {
    const risk = riskLabel(p._risk);
    const il = ilClass(p.ilRisk);
    const apyCls = apyClass(p.apy || 0);
    return `
      <tr>
        <td style="color:var(--muted)">${i + 1}</td>
        <td><span class="pool-symbol">${escHtml(p.symbol || '—')}</span></td>
        <td><span class="pool-protocol">${escHtml(p.project || '—')}</span></td>
        <td><span class="pool-chain">${escHtml(p.chain || '—')}</span></td>
        <td><span class="apy-value ${apyCls}">${fmtApy(p.apy)}</span></td>
        <td><span class="base-apy">${fmtApy(p.apyBase)}</span></td>
        <td><span class="reward-apy">${fmtApy(p.apyReward)}</span></td>
        <td><span class="tvl-value">${fmtTvl(p.tvlUsd)}</span></td>
        <td><span class="risk-badge ${risk.cls}">${risk.label}</span></td>
        <td><span class="${il.cls}">${il.label}</span></td>
      </tr>`;
  }).join('');

  const btn = document.getElementById('loadMoreBtn');
  btn.style.display = filteredPools.length > displayCount ? 'inline-block' : 'none';
}

function loadMore() {
  displayCount += 50;
  renderTable();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Stable grid ───────────────────────────────────────────────────────────────

function buildStableGrid() {
  const stables = allPools
    .filter(p => p.stablecoin && p.apy > 0 && p.tvlUsd > 500_000)
    .sort((a, b) => (b.apy || 0) - (a.apy || 0))
    .slice(0, 24);

  const grid = document.getElementById('stableGrid');
  if (!stables.length) {
    grid.innerHTML = '<div class="loading-placeholder">No stable pools found.</div>';
    return;
  }
  grid.innerHTML = stables.map(p => `
    <div class="stable-card">
      <div class="sc-symbol">${escHtml(p.symbol || '—')}</div>
      <div class="sc-protocol">${escHtml(p.project || '—')}</div>
      <div class="sc-chain">${escHtml(p.chain || '—')}</div>
      <div class="sc-apy">${fmtApy(p.apy)}</div>
      <div class="sc-tvl">TVL ${fmtTvl(p.tvlUsd)}</div>
    </div>`).join('');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

loadData();
setInterval(loadData, REFRESH_INTERVAL);
