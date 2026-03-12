const { API_KEY, normalizeQuoteItem } = require('./_fmp');

const LEGACY_BASE = 'https://financialmodelingprep.com/api/v3';
const STABLE_BASE = 'https://financialmodelingprep.com/stable';

function buildUrl(base, path, params = {}) {
  const url = new URL(`${base}/${path}`);
  url.searchParams.set('apikey', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(base, path, params = {}) {
  const response = await fetch(buildUrl(base, path, params), {
    headers: { Accept: 'application/json', 'User-Agent': 'watchlist-site/1.0' }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `fmp_http_${response.status}`);
  }
  return data;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toType(raw) {
  const v = String(raw || '').toUpperCase();
  if (v.includes('ETF')) return 'ETF';
  if (v.includes('FUND')) return 'Fonds';
  if (v.includes('INDEX')) return 'Indice';
  return 'Action';
}

function mapItem(item = {}) {
  return normalizeQuoteItem({
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchangeShortName || item.exchange || item.stockExchange,
    currency: item.currency,
    type: item.type || item.assetType || toType(item.type),
    price: item.price,
    previousClose: item.previousClose,
    change: item.change,
    changesPercentage: item.changesPercentage
  });
}

function scoreItem(item, queryNorm) {
  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name);
  const region = normalizeText(item.region);
  let score = 0;

  if (symbol === queryNorm) score += 1000;
  if (name === queryNorm) score += 900;
  if (symbol.startsWith(queryNorm)) score += 300;
  if (name.startsWith(queryNorm)) score += 220;
  if (symbol.includes(queryNorm)) score += 120;
  if (name.includes(queryNorm)) score += 100;

  if (['nasdaq', 'nasdaqgs', 'nyse', 'amex', 'xetra', 'euronext', 'milan', 'hamburg', 'stuttgart'].includes(region)) score += 60;
  if (region === 'neo' || region === 'hkse' || region === 'tsx') score -= 40;
  if ((item.type || '').toLowerCase() === 'etf') score -= 10;
  if (/lever|2x|3x|ultra|daily|inverse/i.test(item.name || '')) score -= 120;
  if (/income|covered call|yield/i.test(item.name || '')) score -= 80;

  return score;
}

async function fetchLegacySearch(query) {
  const exchanges = ['NASDAQ', 'NYSE', 'AMEX', 'XETRA', 'EURONEXT', 'MUTUAL_FUND'];
  const lists = await Promise.all(exchanges.map((exchange) =>
    fetchJson(LEGACY_BASE, 'search', { query, limit: 12, exchange }).catch(() => [])
  ));
  return lists.flat();
}

async function fetchStableSearch(query) {
  const [bySymbol, byName] = await Promise.all([
    fetchJson(STABLE_BASE, 'search-symbol', { query, limit: 12 }).catch(() => []),
    fetchJson(STABLE_BASE, 'search-name', { query, limit: 12 }).catch(() => [])
  ]);
  return [...(Array.isArray(bySymbol) ? bySymbol : []), ...(Array.isArray(byName) ? byName : [])];
}

async function enrichQuotes(rows) {
  const symbols = rows.map((r) => r.symbol).filter(Boolean).slice(0, 10);
  if (!symbols.length) return new Map();
  const data = await fetchJson(STABLE_BASE, 'batch-quote-short', { symbols: symbols.join(',') }).catch(() => []);
  const map = new Map();
  for (const item of Array.isArray(data) ? data : []) {
    map.set(String(item.symbol || '').toUpperCase(), item);
  }
  return map;
}

module.exports = async function handler(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing_query' });

  try {
    const merged = [...await fetchLegacySearch(q), ...await fetchStableSearch(q)];
    const unique = [];
    const seen = new Set();

    for (const raw of merged) {
      if (!raw || !raw.symbol) continue;
      if (String(raw.symbol).includes('^')) continue;
      const key = String(raw.symbol).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(mapItem(raw));
    }

    const queryNorm = normalizeText(q);
    unique.sort((a, b) => scoreItem(b, queryNorm) - scoreItem(a, queryNorm));
    const top = unique.slice(0, 8);
    const quotes = await enrichQuotes(top);

    const results = top.map((item) => {
      const qrow = quotes.get(String(item.symbol || '').toUpperCase());
      if (!qrow) return item;
      return {
        ...item,
        price: Number.isFinite(Number(qrow.price)) ? Number(qrow.price) : item.price,
        change: Number.isFinite(Number(qrow.change)) ? Number(qrow.change) : item.change,
        previousClose: Number.isFinite(Number(qrow.price)) && Number.isFinite(Number(qrow.change))
          ? Number(qrow.price) - Number(qrow.change)
          : item.previousClose,
        changePercent: Number.isFinite(Number(qrow.changesPercentage))
          ? Number(qrow.changesPercentage)
          : item.changePercent
      };
    });

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: 'search_failed', details: error instanceof Error ? error.message : 'unknown_error' });
  }
};
