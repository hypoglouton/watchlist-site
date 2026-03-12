const { fmpFetch, normalizeQuoteItem } = require('./_fmp');

const PREFERRED_EXCHANGES = [
  'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'NASDAQCM', 'NYSE', 'AMEX',
  'XETRA', 'PARIS', 'EURONEXT', 'MILAN', 'FRANKFURT', 'STUTTGART', 'HAMBURG', 'BRUSSELS', 'AMSTERDAM', 'LSE', 'SIX'
];

const BAD_NAME_PATTERNS = [
  /\b(2x|3x|ultra|leveraged|inverse|bear|bull|income|covered call|warrant|rights|units?)\b/i,
  /\badr\b/i
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
  const nameRaw = String(rawItem.name || '');
  const symbol = normalizeText(symbolRaw);
  const name = normalizeText(nameRaw);
  const exchange = String(rawItem.exchange || rawItem.exchangeShortName || rawItem.stockExchange || '').toUpperCase();
  const type = String(rawItem.type || rawItem.assetType || rawItem.instrumentType || '').toUpperCase();

  let score = 0;

  if (symbol === queryNorm) score += 2500;
  if (name === queryNorm) score += 1600;
  if (symbol.startsWith(queryNorm)) score += 900;
  if (name.startsWith(queryNorm)) score += 650;
  if (symbol.includes(queryNorm)) score += 220;
  if (name.includes(queryNorm)) score += 180;

  if (['STOCK', 'EQUITY'].includes(type)) score += 150;
  else if (type === 'ETF') score += 90;
  else score -= 20;

  score += exchangePriority(exchange) * 14;

  if (/\.(TO|NE|HK)$/i.test(symbolRaw)) score -= 120;
  if (/^(OTC|PINK|GREY)/i.test(exchange)) score -= 180;
  if (/\.(L|MI|DE|PA|AS|BR|SG|HM)$/i.test(symbolRaw)) score += 20;

  for (const pattern of BAD_NAME_PATTERNS) {
    if (pattern.test(nameRaw)) score -= 260;
  }

  return score;
}

function mapSearchItem(item = {}, quote = null) {
  const exchange = item.exchangeShortName || item.exchange || item.stockExchange || '';
  const typeRaw = item.type || item.assetType || item.instrumentType || '';
  return normalizeQuoteItem({
    symbol: item.symbol,
    name: item.name,
    exchange,
    currency: item.currency,
    type: typeRaw,
    price: quote?.price,
    previousClose: quote?.previousClose,
    change: quote?.change,
    changesPercentage: quote?.changesPercentage ?? quote?.changePercent
  });
}

async function fetchQuotesBatch(symbols) {
  const cleaned = symbols.filter(Boolean).slice(0, 8);
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
    const [bySymbol, byName] = await Promise.all([
      fmpFetch('search-symbol', { query: q, limit: 20 }).catch(() => []),
      fmpFetch('search-name', { query: q, limit: 20 }).catch(() => [])
    ]);

    const merged = [
      ...(Array.isArray(bySymbol) ? bySymbol : []),
      ...(Array.isArray(byName) ? byName : [])
    ].filter((item) => item && item.symbol && item.name);

    const deduped = [];
    const seen = new Set();
    for (const item of merged) {
      const key = `${String(item.symbol).toUpperCase()}|${String(item.exchangeShortName || item.exchange || item.stockExchange || '').toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    const queryNorm = normalizeText(q);
    deduped.sort((a, b) => scoreItem(b, queryNorm) - scoreItem(a, queryNorm));

    const shortlist = deduped.slice(0, 8);
    const quoteMap = await fetchQuotesBatch(shortlist.map((item) => item.symbol));
    let results = shortlist.map((item) => mapSearchItem(item, quoteMap.get(String(item.symbol).toUpperCase()) || null));

    if (!results.length && /^[A-Za-z.\-]{1,12}$/.test(q)) {
      const single = await fmpFetch('quote', { symbol: q.toUpperCase() }).catch(() => []);
      const item = Array.isArray(single) && single[0] ? single[0] : null;
      if (item?.symbol) results = [normalizeQuoteItem(item)];
    }

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
