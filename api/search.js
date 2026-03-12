const { fmpFetch, normalizeQuoteItem } = require('./_fmp');

const API_KEY = process.env.FMP_API_KEY || 'FWbT2hS8KD6DOJT4pUOUy4Ivjs1zvxmM';

const PREFERRED_EXCHANGES = [
  'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'NASDAQCM', 'NYSE', 'AMEX',
  'XETRA', 'PARIS', 'EURONEXT', 'MILAN', 'FRANKFURT', 'STUTTGART', 'HAMBURG', 'BRUSSELS', 'AMSTERDAM', 'LSE', 'SIX'
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.+\/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exchangePriority(exchange) {
  const ex = String(exchange || '').toUpperCase();
  const idx = PREFERRED_EXCHANGES.indexOf(ex);
  if (idx === -1) return 0;
  return PREFERRED_EXCHANGES.length - idx;
}

function scoreItem(rawItem, queryNorm) {
  const symbolRaw = String(rawItem.symbol || '');
  const nameRaw = String(rawItem.name || rawItem.companyName || '');
  const symbol = normalizeText(symbolRaw);
  const name = normalizeText(nameRaw || symbolRaw);
  const exchange = String(rawItem.exchange || rawItem.exchangeShortName || rawItem.stockExchange || '').toUpperCase();
  const type = String(rawItem.type || rawItem.assetType || rawItem.instrumentType || '').toUpperCase();

  let score = 0;

  if (symbol === queryNorm) score += 3000;
  if (name === queryNorm) score += 1800;
  if (symbol.startsWith(queryNorm)) score += 1100;
  if (name.startsWith(queryNorm)) score += 800;
  if (name.includes(queryNorm)) score += 260;
  if (symbol.includes(queryNorm)) score += 220;

  if (['STOCK', 'EQUITY'].includes(type)) score += 140;
  else if (type === 'ETF') score += 70;

  score += exchangePriority(exchange) * 16;

  if (/\.(TO|NE|HK)$/i.test(symbolRaw)) score -= 140;
  if (/^(OTC|PINK|GREY)/i.test(exchange)) score -= 220;
  if (/\b(2x|3x|ultra|leveraged|inverse|bear|bull|income|covered call|warrant|rights|units?)\b/i.test(nameRaw)) score -= 300;
  if (/\badr\b/i.test(nameRaw)) score -= 220;

  return score;
}

function mapSearchItem(item = {}, quote = null) {
  const exchange = item.exchangeShortName || item.exchange || item.stockExchange || '';
  const typeRaw = item.type || item.assetType || item.instrumentType || '';
  return normalizeQuoteItem({
    symbol: item.symbol,
    name: item.name || item.companyName || item.symbol,
    exchange,
    currency: item.currency,
    type: typeRaw,
    price: quote?.price,
    previousClose: quote?.previousClose,
    change: quote?.change,
    changesPercentage: quote?.changesPercentage ?? quote?.changePercent
  });
}

async function legacySearchTicker(query) {
  const url = new URL('https://financialmodelingprep.com/api/v3/search-ticker');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', '12');
  url.searchParams.set('apikey', API_KEY);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'watchlist-site/1.0'
    }
  });

  if (!response.ok) return [];

  try {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchQuotesBatch(symbols) {
  const cleaned = Array.from(new Set(symbols.filter(Boolean).map((v) => String(v).toUpperCase()))).slice(0, 8);
  if (!cleaned.length) return new Map();

  try {
    const data = await fmpFetch('batch-quote', { symbols: cleaned.join(',') });
    const map = new Map();
    for (const item of Array.isArray(data) ? data : []) {
      if (!item?.symbol) continue;
      map.set(String(item.symbol).toUpperCase(), item);
    }
    return map;
  } catch {
    return new Map();
  }
}

module.exports = async function handler(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing_query' });
  }

  try {
    const queryNorm = normalizeText(q);
    const isTickerLike = /^[A-Za-z0-9.\-^]{1,15}$/.test(q);

    const tasks = [
      fmpFetch('search-name', { query: q }).catch(() => []),
      legacySearchTicker(q).catch(() => [])
    ];

    if (isTickerLike) {
      tasks.push(fmpFetch('search-symbol', { query: q }).catch(() => []));
      tasks.push(fmpFetch('quote', { symbol: q.toUpperCase() }).catch(() => []));
    }

    const responses = await Promise.all(tasks);
    const merged = responses.flatMap((data) => (Array.isArray(data) ? data : []));

    const deduped = [];
    const seen = new Set();
    for (const item of merged) {
      if (!item || !item.symbol) continue;
      const exchange = String(item.exchangeShortName || item.exchange || item.stockExchange || '').toUpperCase();
      const key = `${String(item.symbol).toUpperCase()}|${exchange}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({
        ...item,
        name: item.name || item.companyName || item.symbol
      });
    }

    deduped.sort((a, b) => scoreItem(b, queryNorm) - scoreItem(a, queryNorm));

    let shortlist = deduped.slice(0, 8);
    if (shortlist.length === 0 && isTickerLike) {
      const single = await fmpFetch('quote', { symbol: q.toUpperCase() }).catch(() => []);
      const item = Array.isArray(single) && single[0] ? single[0] : null;
      if (item?.symbol) shortlist = [item];
    }

    const quoteMap = await fetchQuotesBatch(shortlist.map((item) => item.symbol));
    const results = shortlist.map((item) => mapSearchItem(item, quoteMap.get(String(item.symbol).toUpperCase()) || null));

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
