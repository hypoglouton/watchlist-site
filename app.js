const MARKET_CARDS = [
  { key: 'cac40', label: 'CAC 40' },
  { key: 'sp500', label: 'S&P 500' },
  { key: 'euroStoxx50', label: 'Euro Stoxx 50' },
  { key: 'nasdaq', label: 'Nasdaq' },
  { key: 'brent', label: 'Pétrole Brent' },
  { key: 'gold', label: 'Once d\'or' },
  { key: 'eurusd', label: 'EUR/USD Spot' },
  { key: 'silver', label: 'Silver Continuous Contract' }
];

const STORAGE_KEY = 'premium-watchlist-v1';

const defaultWatchlist = [
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Action', region: 'NasdaqGS', currency: 'USD' },
  { symbol: 'MSFT.DE', name: 'Microsoft Corporation', type: 'Action', region: 'XETRA', currency: 'EUR' },
  { symbol: 'CLS', name: 'Celestica Inc.', type: 'Action', region: 'NYSE', currency: 'USD' },
  { symbol: 'NVDA.DE', name: 'NVIDIA Corporation', type: 'Action', region: 'XETRA', currency: 'EUR' },
  { symbol: 'PPFB.DE', name: 'iShares Physical Metals PLC O', type: 'Action', region: 'XETRA', currency: 'EUR' },
  { symbol: 'USCPHM.HM', name: 'OSS.Shill.Barc.C US Sec.Val.TRI', type: 'ETF', region: 'Hamburg', currency: 'EUR' },
  { symbol: 'QVMP.DE', name: 'Invesco S&P 500 QVM UCITS ETF', type: 'ETF', region: 'XETRA', currency: 'EUR' },
  { symbol: '1MU.MI', name: 'Micron Technology, Inc.', type: 'Action', region: 'Milan', currency: 'EUR' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'Action', region: 'NasdaqGS', currency: 'USD' },
  { symbol: 'BLK', name: 'BlackRock, Inc.', type: 'Action', region: 'NYSE', currency: 'USD' },
  { symbol: 'SPGI', name: 'S&P Global Inc.', type: 'Action', region: 'NYSE', currency: 'USD' },
  { symbol: 'E7S.SG', name: 'Constellation Energy Corp', type: 'Action', region: 'Stuttgart', currency: 'EUR' }
];

const els = {
  marketGrid: document.getElementById('marketGrid'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchResults: document.getElementById('searchResults'),
  watchlistBody: document.getElementById('watchlistBody'),
  watchlistCount: document.getElementById('watchlistCount'),
  refreshBtn: document.getElementById('refreshBtn')
};

let watchlist = loadWatchlist();

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...defaultWatchlist];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...defaultWatchlist];
  } catch {
    return [...defaultWatchlist];
  }
}

function saveWatchlist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value));
}

function formatPrice(value) {
  return formatNumber(value, 2);
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return '<span class="empty-cell">&nbsp;</span>';
  const number = Number(value);
  const cls = number > 0 ? 'positive' : number < 0 ? 'negative' : 'neutral';
  const sign = number > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${formatNumber(number, 2)}%</span>`;
}

function formatChange(value) {
  if (!Number.isFinite(Number(value))) return '<span class="empty-cell">&nbsp;</span>';
  const number = Number(value);
  const cls = number > 0 ? 'positive' : number < 0 ? 'negative' : 'neutral';
  const sign = number > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${formatNumber(number, 2)}</span>`;
}

function emptyCell(value) {
  return Number.isFinite(Number(value)) ? formatPercent(value) : '<span class="empty-cell">&nbsp;</span>';
}

function renderMarketCards(payload = {}) {
  els.marketGrid.innerHTML = MARKET_CARDS.map(({ key, label }) => {
    const item = payload[key] || {};
    const price = item.error ? 'Indisponible' : formatPrice(item.price);
    const changeValue = Number(item.changePercent);
    const cls = changeValue > 0 ? 'positive' : changeValue < 0 ? 'negative' : 'neutral';
    const sign = changeValue > 0 ? '+' : '';
    const variation = item.error
      ? 'Erreur de récupération des marchés.'
      : Number.isFinite(changeValue)
        ? `${sign}${formatNumber(changeValue, 2)}%`
        : '—';

    return `
      <article class="market-card">
        <div>
          <div class="market-label">${escapeHtml(label)}</div>
          <div class="market-price">${escapeHtml(price)}</div>
        </div>
        <div class="market-change ${cls}">${escapeHtml(variation)}</div>
      </article>
    `;
  }).join('');
}

function renderWatchlist() {
  els.watchlistCount.textContent = `${watchlist.length} ${watchlist.length > 1 ? 'valeurs' : 'valeur'}`;

  if (!watchlist.length) {
    els.watchlistBody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align:center; color:#93a4c3; padding:28px 10px;">Aucune valeur dans la watchlist.</td>
      </tr>
    `;
    return;
  }

  els.watchlistBody.innerHTML = watchlist.map((item, index) => `
    <tr>
      <td>${escapeHtml(item.name || item.symbol)}</td>
      <td><span class="ticker-pill">${escapeHtml(item.symbol)}</span></td>
      <td>${escapeHtml(item.type || '')}</td>
      <td>${escapeHtml(item.region || '')}</td>
      <td>${escapeHtml(item.currency || '')}</td>
      <td>${Number.isFinite(Number(item.price)) ? formatPrice(item.price) : '<span class="empty-cell">&nbsp;</span>'}</td>
      <td>${formatPercent(item.changePercent)}</td>
      <td>${formatChange(item.change)}</td>
      <td>${Number.isFinite(Number(item.previousClose)) ? formatPrice(item.previousClose) : '<span class="empty-cell">&nbsp;</span>'}</td>
      <td>${emptyCell(item.perf1m)}</td>
      <td>${emptyCell(item.perf6m)}</td>
      <td>${emptyCell(item.perf1y)}</td>
      <td><button class="remove-btn" data-index="${index}">Retirer</button></td>
    </tr>
  `).join('');
}

function renderSearchResults(results = []) {
  if (!results.length) {
    els.searchResults.innerHTML = '<div class="result-placeholder">Aucun résultat exploitable.</div>';
    return;
  }

  els.searchResults.innerHTML = results.map((item, index) => `
    <div class="result-item">
      <div class="result-main">
        <div class="result-name">${escapeHtml(item.name || item.symbol)}</div>
        <div class="result-meta">${escapeHtml(item.symbol)} · ${escapeHtml(item.type || '')} · ${escapeHtml(item.region || '')} · ${escapeHtml(item.currency || '')}</div>
      </div>
      <div>${Number.isFinite(Number(item.price)) ? formatPrice(item.price) : '—'}</div>
      <div>${formatPercent(item.changePercent)}</div>
      <div>${Number.isFinite(Number(item.previousClose)) ? formatPrice(item.previousClose) : '—'}</div>
      <div><button class="btn secondary" data-add-index="${index}">Ajouter</button></div>
    </div>
  `).join('');

  els.searchResults.dataset.results = JSON.stringify(results);
}

async function loadMarkets() {
  renderMarketCards();
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    renderMarketCards(data);
  } catch {
    renderMarketCards();
  }
}

async function refreshWatchlistQuotes() {
  if (!watchlist.length) {
    renderWatchlist();
    return;
  }

  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = 'Actualisation...';

  await Promise.all(watchlist.map(async (item) => {
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(item.symbol)}`);
      const data = await res.json();
      if (!res.ok) return;
      Object.assign(item, {
        name: data.name || item.name,
        type: data.type || item.type,
        region: data.region || item.region,
        currency: data.currency || item.currency,
        price: data.price,
        previousClose: data.previousClose,
        change: data.change,
        changePercent: data.changePercent,
        perf1m: data.perf1m,
        perf6m: data.perf6m,
        perf1y: data.perf1y
      });
    } catch {
      // keep existing row values
    }
  }));

  saveWatchlist();
  renderWatchlist();
  els.refreshBtn.disabled = false;
  els.refreshBtn.textContent = 'Rafraîchir les cours';
}

async function runSearch() {
  const query = els.searchInput.value.trim();
  if (!query) {
    renderSearchResults([]);
    return;
  }

  els.searchBtn.disabled = true;
  els.searchBtn.textContent = 'Recherche...';
  els.searchResults.innerHTML = '<div class="result-placeholder">Recherche en cours...</div>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderSearchResults(Array.isArray(data.results) ? data.results : []);
  } catch {
    els.searchResults.innerHTML = '<div class="result-placeholder">Erreur de recherche.</div>';
  }

  els.searchBtn.disabled = false;
  els.searchBtn.textContent = 'Rechercher';
}

function addToWatchlist(item) {
  const exists = watchlist.some((row) => String(row.symbol).toUpperCase() === String(item.symbol).toUpperCase());
  if (exists) return;
  watchlist.unshift({
    symbol: item.symbol,
    name: item.name || item.symbol,
    type: item.type || '',
    region: item.region || '',
    currency: item.currency || '',
    price: item.price ?? null,
    previousClose: item.previousClose ?? null,
    change: item.change ?? null,
    changePercent: item.changePercent ?? null,
    perf1m: null,
    perf6m: null,
    perf1y: null
  });
  saveWatchlist();
  renderWatchlist();
}

els.searchBtn.addEventListener('click', runSearch);
els.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch();
});

els.searchResults.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-index]');
  if (!button) return;
  try {
    const results = JSON.parse(els.searchResults.dataset.results || '[]');
    const item = results[Number(button.dataset.addIndex)];
    if (item) addToWatchlist(item);
  } catch {
    // noop
  }
});

els.watchlistBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-index]');
  if (!button) return;
  const index = Number(button.dataset.index);
  watchlist.splice(index, 1);
  saveWatchlist();
  renderWatchlist();
});

els.refreshBtn.addEventListener('click', refreshWatchlistQuotes);

renderWatchlist();
loadMarkets();
refreshWatchlistQuotes();
