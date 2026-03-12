const { fmpFetch, normalizeQuoteItem, firstArrayItem } = require('./_fmp');

const MARKET_CONFIG = {
  cac40: { kind: 'index', symbol: '^FCHI', nameHint: 'CAC 40' },
  sp500: { kind: 'index', symbol: '^GSPC', nameHint: 'S&P 500' },
  euroStoxx50: { kind: 'index', symbol: '^STOXX50E', nameHint: 'Euro Stoxx 50' },
  nasdaq: { kind: 'index', symbol: '^IXIC', nameHint: 'Nasdaq Composite' },
  brent: { kind: 'commodity', symbol: 'CLUSD', fallbackSymbols: ['BZUSD', 'BNO'], nameHint: 'Brent' },
  gold: { kind: 'commodity', symbol: 'GCUSD', nameHint: 'Gold' },
  eurusd: { kind: 'forex', symbol: 'EURUSD', nameHint: 'EUR/USD' },
  silver: { kind: 'commodity', symbol: 'SIUSD', nameHint: 'Silver' }
};

let cachedIndexList = null;
let cachedCommodityList = null;

async function fetchQuote(symbol) {
  const data = await fmpFetch('quote', { symbol });
  const item = normalizeQuoteItem(firstArrayItem(data) || { symbol });
  if (item.price === null) {
    throw new Error('missing_price');
  }
  return {
    symbol,
    price: item.price,
    change: item.change,
    changePercent: item.changePercent
  };
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getIndexList() {
  if (!cachedIndexList) cachedIndexList = fmpFetch('index-list').catch(() => []);
  return cachedIndexList;
}

async function getCommodityList() {
  if (!cachedCommodityList) cachedCommodityList = fmpFetch('commodities-list').catch(() => []);
  return cachedCommodityList;
}

function pickBestSymbol(items, hint, fallbacks = []) {
  const hintNorm = normalizeText(hint);
  let best = null;
  let bestScore = -Infinity;

  for (const item of Array.isArray(items) ? items : []) {
    const symbol = String(item.symbol || '');
    const name = String(item.name || item.label || item.description || '');
    const symbolNorm = normalizeText(symbol);
    const nameNorm = normalizeText(name);
    let score = 0;

    if (fallbacks.some((s) => String(s).toUpperCase() === symbol.toUpperCase())) score += 600;
    if (nameNorm === hintNorm) score += 1000;
    if (nameNorm.startsWith(hintNorm)) score += 450;
    if (nameNorm.includes(hintNorm)) score += 280;
    if (symbolNorm === hintNorm) score += 500;
    if (symbolNorm.includes(hintNorm)) score += 120;
    if (/brent/i.test(hint) && /brent/i.test(name)) score += 400;
    if (/cac/i.test(hint) && /cac/i.test(name)) score += 400;

    if (score > bestScore) {
      bestScore = score;
      best = symbol;
    }
  }

  return best;
}

async function resolveFallbackSymbol(config) {
  if (config.kind === 'index') {
    const list = await getIndexList();
    return pickBestSymbol(list, config.nameHint, [config.symbol, ...(config.fallbackSymbols || [])]);
  }
  if (config.kind === 'commodity') {
    const list = await getCommodityList();
    return pickBestSymbol(list, config.nameHint, [config.symbol, ...(config.fallbackSymbols || [])]);
  }
  return null;
}

async function fetchMarket(config) {
  const tried = [config.symbol, ...(config.fallbackSymbols || [])].filter(Boolean);

  for (const symbol of tried) {
    try {
      return await fetchQuote(symbol);
    } catch {
      // continue
    }
  }

  const resolved = await resolveFallbackSymbol(config);
  if (resolved && !tried.includes(resolved)) {
    return fetchQuote(resolved);
  }

  throw new Error('market_symbol_not_found');
}

module.exports = async function handler(req, res) {
  try {
    const entries = await Promise.all(
      Object.entries(MARKET_CONFIG).map(async ([key, config]) => {
        try {
          const value = await fetchMarket(config);
          return [key, value];
        } catch (error) {
          return [key, {
            error: 'market_fetch_failed',
            details: error instanceof Error ? error.message : 'unknown_error'
          }];
        }
      })
    );

    return res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    return res.status(500).json({
      error: 'market_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
