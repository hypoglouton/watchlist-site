const { fmpFetch, normalizeQuoteItem, firstArrayItem } = require('./_fmp');

const MARKET_MAP = {
  cac40: '^FCHI',
  sp500: '^GSPC',
  euroStoxx50: '^STOXX50E',
  nasdaq: '^IXIC',
  brent: 'CLUSD',
  gold: 'GCUSD',
  eurusd: 'EURUSD',
  silver: 'SIUSD'
};

async function fetchMarket(symbol) {
  const data = await fmpFetch('quote', { symbol });
  const item = normalizeQuoteItem(firstArrayItem(data) || { symbol });
  return {
    symbol,
    price: item.price,
    change: item.change,
    changePercent: item.changePercent
  };
}

module.exports = async function handler(req, res) {
  try {
    const entries = await Promise.all(
      Object.entries(MARKET_MAP).map(async ([key, symbol]) => {
        try {
          const value = await fetchMarket(symbol);
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
