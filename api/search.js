const { fmpFetch, normalizeQuoteItem } = require('./_fmp');

const PREFERRED_EXCHANGES = [
  'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'NASDAQCM', 'NYSE', 'AMEX',
  'XETRA', 'PARIS', 'EURONEXT', 'MILAN', 'FRANKFURT', 'STUTTGART', 'HAMBURG', 'BRUSSELS', 'AMSTERDAM', 'LSE', 'SIX'
];

const BAD_NAME_PATTERNS = [
  /(2x|3x|ultra|leveraged|inverse|bear|bull|income|covered call|warrant|rights|units?)/i,
  /adr/i
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.+\-]+/g, ' ')
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
  const symbol = normalizeText(rawItem.symbol);
  const name = normalizeText(rawItem.name);
  const exchange = String(rawItem.exchange || rawItem.exchangeShortName || rawItem.stockExchange || '').toUpperCase();
  const type = String(rawItem.type || rawItem.assetType || rawItem.instrumentType || '').toUpperCase();

  let score = 0;

  if (symbol === queryNorm) score += 2000;
  if (name === queryNorm) score += 1200;
  if (symbol.startsWith(queryNorm)) score += 700;
  if (name.startsWith(queryNorm)) score += 450;
  if (symbol.includes(queryNorm)) score += 160;
  if (name.includes(queryNorm)) score += 120;

  if (['STOCK', 'EQUITY'].includes(type)) score += 120;
  if (type === 'ETF') score += 70;
  if (!['STOCK', 'EQUITY', 'ETF'].includes(type)) score -= 40;

  score += exchangePriority(exchange) * 12;

  if (/\.(TO|NE|HK)$/i.test(rawItem.symbol || '')) score -= 90;
  if (/^(OTC|PINK|GREY)/i.test(exchange)) score -= 140;

  for (const pattern of BAD_NAME_PATTERNS) {
    if (pattern.test(rawItem.name || '')) score -= 220;
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

async function fetchQuoteSafe(symbol) {
  try {
    const data = await fmpFetch('quote', { symbol });
    return Array.isArray(data) && data[0] ? data[0] : null;
  } catch {
    return null;
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

    const merged = [...(Array.isArray(bySymbol) ? bySymbol : []), ...(Array.isArray(byName) ? byName : [])]
      .filter((item) => item && item.symbol)
      .filter((item) => !String(item.symbol).includes('^'));

    const deduped = [];
    const seen = new Set();
    for (const item of merged) {
      const key = String(item.symbol).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    const queryNorm = normalizeText(q);
    deduped.sort((a, b) => scoreItem(b, queryNorm) - scoreItem(a, queryNorm));

    const shortlist = deduped.slice(0, 8);
    const quotes = await Promise.all(shortlist.map((item) => fetchQuoteSafe(item.symbol)));
    const results = shortlist.map((item, index) => mapSearchItem(item, quotes[index]));

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
