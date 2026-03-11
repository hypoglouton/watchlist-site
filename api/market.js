import yahooFinance from 'yahoo-finance2';

const MARKET_MAP = {
  cac40: { symbol: '^FCHI' },
  sp500: { symbol: '^GSPC' },
  euroStoxx50: { symbol: '^STOXX50E' },
  nasdaq: { symbol: '^IXIC' },
  brent: { symbol: 'BZ=F' },
  gold: { symbol: 'GC=F' },
  eurusd: { symbol: 'EURUSD=X' },
  silver: { symbol: 'SI=F' }
};

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export default async function handler(req, res) {
  try {
    const symbols = Object.values(MARKET_MAP).map((item) => item.symbol);
    const quotes = await yahooFinance.quote(symbols, {
      fields: [
        'symbol',
        'shortName',
        'longName',
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketPreviousClose'
      ]
    });

    const rows = Array.isArray(quotes) ? quotes : [quotes];
    const bySymbol = new Map(rows.map((item) => [item.symbol, item]));

    const payload = {};
    for (const [key, { symbol }] of Object.entries(MARKET_MAP)) {
      const item = bySymbol.get(symbol);
      if (!item) {
        payload[key] = { error: 'not_found' };
        continue;
      }
      payload[key] = {
        symbol,
        name: item.shortName || item.longName || symbol,
        price: toNumber(item.regularMarketPrice),
        change: toNumber(item.regularMarketChange),
        changePercent: toNumber(item.regularMarketChangePercent),
        previousClose: toNumber(item.regularMarketPreviousClose)
      };
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(payload);
  } catch (error) {
    const payload = {};
    for (const key of Object.keys(MARKET_MAP)) {
      payload[key] = {
        error: 'market_fetch_failed',
        details: error instanceof Error ? error.message : 'unknown_error'
      };
    }
    return res.status(200).json(payload);
  }
}
