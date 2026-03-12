const { fmpFetch, normalizeQuoteItem, toNumber } = require('./_fmp');

const MARKET_CONFIG = {
  cac40: {
    bucket: 'index',
    labelHints: ['cac 40', 'cac40'],
    symbolHints: ['PX1', 'CAC40', '^FCHI']
  },
  sp500: {
    bucket: 'index',
    labelHints: ['s&p 500', 'sp 500', 's and p 500'],
    symbolHints: ['SPX', '^GSPC', 'GSPC']
  },
  euroStoxx50: {
    bucket: 'index',
    labelHints: ['euro stoxx 50', 'eurostoxx 50', 'stoxx 50'],
    symbolHints: ['SX5E', 'STOXX50E', '^STOXX50E']
  },
  nasdaq: {
    bucket: 'index',
    labelHints: ['nasdaq composite', 'nasdaq'],
    symbolHints: ['IXIC', '^IXIC', 'COMP']
  },
  brent: {
    bucket: 'commodity',
    labelHints: ['brent', 'brent crude'],
    symbolHints: ['BZUSD', 'BRENT', 'UKOIL']
  },
  gold: {
    bucket: 'commodity',
    labelHints: ['gold'],
    symbolHints: ['GCUSD', 'XAUUSD', 'GOLD']
  },
  eurusd: {
    bucket: 'forex',
    labelHints: ['eur/usd', 'eur usd', 'euro usd'],
    symbolHints: ['EURUSD']
  },
  silver: {
    bucket: 'commodity',
    labelHints: ['silver'],
    symbolHints: ['SIUSD', 'XAGUSD', 'SILVER']
  }
};

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

function scoreCandidate(item, config) {
  const symbol = normalizeText(item.symbol || '');
  const name = normalizeText(item.name || item.label || item.description || '');
  let score = 0;

  for (const hint of config.symbolHints || []) {
    const h = normalizeText(hint);
    if (!h) continue;
    if (symbol === h) score += 1000;
    if (symbol.startsWith(h)) score += 400;
    if (symbol.includes(h)) score += 180;
    if (name.includes(h)) score += 80;
  }

  for (const hint of config.labelHints || []) {
    const h = normalizeText(hint);
    if (!h) continue;
    if (name === h) score += 900;
    if (name.startsWith(h)) score += 500;
    if (name.includes(h)) score += 260;
    if (symbol === h) score += 200;
  }

  if (config.bucket === 'commodity') {
    if (/crude|oil/.test(name) && config.labelHints.some((v) => /brent/i.test(v))) score += 60;
    if (/spot/.test(name) && config.labelHints.some((v) => /gold|silver/i.test(v))) score += 40;
  }

  if (config.bucket === 'index') {
    if (/index/.test(name)) score += 20;
  }

  return score;
}

async function fetchBucket(bucket) {
  if (bucket === 'index') return fmpFetch('batch-index-quotes');
  if (bucket === 'commodity') return fmpFetch('batch-commodity-quotes');
  if (bucket === 'forex') return fmpFetch('batch-forex-quotes');
  return [];
}

async function fetchAllBuckets() {
  const [indexes, commodities, forex] = await Promise.all([
    fetchBucket('index').catch(() => []),
    fetchBucket('commodity').catch(() => []),
    fetchBucket('forex').catch(() => []),
  ]);

  return { indexes, commodities, forex };
}

function selectFromBucket(items, config) {
  let best = null;
  let bestScore = -Infinity;

  for (const item of Array.isArray(items) ? items : []) {
    const score = scoreCandidate(item, config);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best || bestScore < 200) {
    throw new Error('market_symbol_not_found');
  }

  const quote = normalizeQuoteItem(best);
  const price = quote.price ?? toNumber(best.last) ?? toNumber(best.close);
  const changePercent = quote.changePercent ?? toNumber(best.changesPercentage) ?? toNumber(best.changePercent);
  const change = quote.change ?? toNumber(best.change);

  if (price === null) {
    throw new Error('missing_price');
  }

  return {
    symbol: best.symbol || quote.symbol,
    price,
    change,
    changePercent
  };
}

module.exports = async function handler(req, res) {
  try {
    const buckets = await fetchAllBuckets();
    const payload = {};

    for (const [key, config] of Object.entries(MARKET_CONFIG)) {
      try {
        const items = config.bucket === 'index'
          ? buckets.indexes
          : config.bucket === 'commodity'
            ? buckets.commodities
            : buckets.forex;
        payload[key] = selectFromBucket(items, config);
      } catch (error) {
        payload[key] = {
          error: 'market_fetch_failed',
          details: error instanceof Error ? error.message : 'unknown_error'
        };
      }
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'market_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
