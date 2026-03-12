const { fmpFetch, normalizeQuoteItem } = require('./_fmp');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreItem(item, queryNorm) {
  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name);
  let score = 0;

  if (symbol === queryNorm) score += 1000;
  if (name === queryNorm) score += 850;
  if (symbol.startsWith(queryNorm)) score += 300;
  if (name.startsWith(queryNorm)) score += 220;
  if (symbol.includes(queryNorm)) score += 100;
  if (name.includes(queryNorm)) score += 80;
  if (item.type === 'ETF') score += 15;
  if (/\.[A-Z]{1,3}$/.test(item.symbol || '')) score += 10;
  return score;
}

function mapSearchItem(item = {}) {
  const exchange = item.exchangeShortName || item.exchange || item.stockExchange || '';
  const typeRaw = item.type || item.assetType || item.instrumentType || '';
  const normalized = normalizeQuoteItem({
    symbol: item.symbol,
    name: item.name,
    exchange,
    currency: item.currency,
    type: typeRaw,
    price: item.price,
    previousClose: item.previousClose,
    change: item.change,
    changesPercentage: item.changesPercentage
  });
  return normalized;
}

module.exports = async function handler(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing_query' });
  }

  try {
    const [bySymbol, byName] = await Promise.all([
      fmpFetch('search-symbol', { query: q, limit: 12 }).catch(() => []),
      fmpFetch('search-name', { query: q, limit: 12 }).catch(() => [])
    ]);

    const merged = [...(Array.isArray(bySymbol) ? bySymbol : []), ...(Array.isArray(byName) ? byName : [])]
      .filter((item) => item && item.symbol)
      .filter((item) => !String(item.symbol).includes('^'));

    const unique = [];
    const seen = new Set();
    for (const item of merged) {
      const key = String(item.symbol).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(mapSearchItem(item));
    }

    const queryNorm = normalizeText(q);
    unique.sort((a, b) => scoreItem(b, queryNorm) - scoreItem(a, queryNorm));

    return res.status(200).json({ results: unique.slice(0, 8) });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
