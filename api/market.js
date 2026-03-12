const { API_KEY, toNumber } = require('./_fmp');

const STABLE_BASE = 'https://financialmodelingprep.com/stable';

function buildUrl(path, params = {}) {
  const url = new URL(`${STABLE_BASE}/${path}`);
  url.searchParams.set('apikey', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(path, params = {}) {
  const response = await fetch(buildUrl(path, params), {
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

function normalizeQuote(item = {}, fallbackSymbol = '') {
  const price = toNumber(item.price ?? item.lastPrice ?? item.ask ?? item.bid);
  const previousClose = toNumber(item.previousClose ?? item.previous_close);
  const change = toNumber(item.change ?? item.changePrice ?? item.changes);
  let changePercent = toNumber(item.changesPercentage ?? item.changePercent ?? item.percentChange);
  if (changePercent === null && price !== null && previousClose !== null && previousClose !== 0) {
    changePercent = ((price - previousClose) / previousClose) * 100;
  }
  return {
    symbol: item.symbol || fallbackSymbol,
    price,
    change,
    changePercent
  };
}

function findByKeywords(rows, checks = []) {
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const hay = `${row.symbol || ''} ${row.name || ''} ${row.exchange || ''}`.toLowerCase();
    if (checks.every((c) => hay.includes(c))) return row;
  }
  return null;
}

async function fetchIndex(symbol, keywords = []) {
  const data = await fetchJson('quote-short', { symbol });
  const first = Array.isArray(data) ? data[0] : null;
  if (first) return normalizeQuote(first, symbol);

  const batch = await fetchJson('batch-index-quotes');
  const found = findByKeywords(batch, keywords.length ? keywords : [symbol.toLowerCase().replace('^', '')]);
  if (found) return normalizeQuote(found, symbol);
  throw new Error('market_symbol_not_found');
}

async function fetchCommodity(symbol, keywords = []) {
  const data = await fetchJson('quote-short', { symbol });
  const first = Array.isArray(data) ? data[0] : null;
  if (first) return normalizeQuote(first, symbol);

  const batch = await fetchJson('batch-commodity-quotes');
  const found = findByKeywords(batch, keywords);
  if (found) return normalizeQuote(found, symbol);
  throw new Error('market_symbol_not_found');
}

async function fetchForex(symbol, keywords = []) {
  const data = await fetchJson('quote', { symbol });
  const first = Array.isArray(data) ? data[0] : null;
  if (first) return normalizeQuote(first, symbol);

  const batch = await fetchJson('batch-forex-quotes');
  const found = findByKeywords(batch, keywords);
  if (found) return normalizeQuote(found, symbol);
  throw new Error('market_symbol_not_found');
}

module.exports = async function handler(req, res) {
  try {
    const jobs = {
      cac40: () => fetchIndex('^FCHI', ['cac']),
      sp500: () => fetchIndex('^GSPC', ['s&p', '500']),
      euroStoxx50: () => fetchIndex('^STOXX50E', ['stoxx', '50']),
      nasdaq: () => fetchIndex('^IXIC', ['nasdaq']),
      brent: () => fetchCommodity('BZUSD', ['brent']),
      gold: () => fetchCommodity('GCUSD', ['gold']),
      eurusd: () => fetchForex('EURUSD', ['eur', 'usd']),
      silver: () => fetchCommodity('SIUSD', ['silver'])
    };

    const entries = await Promise.all(Object.entries(jobs).map(async ([key, fn]) => {
      try {
        return [key, await fn()];
      } catch (error) {
        return [key, { error: 'market_fetch_failed', details: error instanceof Error ? error.message : 'unknown_error' }];
      }
    }));

    return res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    return res.status(500).json({ error: 'market_failed', details: error instanceof Error ? error.message : 'unknown_error' });
  }
};
