const { fmpFetch, toNumber } = require('./_fmp');

const MARKET_SYMBOLS = {
  cac40: ['^FCHI', 'PX1'],
  sp500: ['^GSPC'],
  euroStoxx50: ['^STOXX50E', 'STOXX50E', 'SX5E'],
  nasdaq: ['^IXIC'],
  brent: ['BZUSD', 'UKOIL'],
  gold: ['GCUSD', 'XAUUSD'],
  eurusd: ['EURUSD'],
  silver: ['SIUSD', 'XAGUSD']
};

async function fetchQuoteForSymbol(symbol) {
  const attempts = [
    () => fmpFetch('quote-short', { symbol }),
    () => fmpFetch('quote', { symbol })
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const item = Array.isArray(data) ? data[0] : null;
      if (!item) continue;

      const price = toNumber(item.price ?? item.lastPrice ?? item.last);
      const change = toNumber(item.change ?? item.changes);
      const changePercent = toNumber(
        item.changePercent ?? item.changesPercentage ?? item.percentChange
      );

      if (price === null) continue;
      return {
        symbol,
        price,
        change,
        changePercent
      };
    } catch {
      // try next strategy
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  try {
    const payload = {};

    for (const [key, symbols] of Object.entries(MARKET_SYMBOLS)) {
      let found = null;

      for (const symbol of symbols) {
        found = await fetchQuoteForSymbol(symbol);
        if (found) break;
      }

      payload[key] = found || {
        error: 'market_fetch_failed',
        details: 'market_symbol_not_found'
      };
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'market_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
