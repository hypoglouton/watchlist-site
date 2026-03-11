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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json,text/plain,*/*'
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    throw new Error((data && data.finance && data.finance.error && data.finance.error.description) || 'yahoo_request_failed');
  }

  return data;
}

module.exports = async function handler(req, res) {
  try {
    const symbols = Object.values(MARKET_MAP).map((item) => item.symbol).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const data = await fetchJson(url);
    const results = Array.isArray(data && data.quoteResponse && data.quoteResponse.result) ? data.quoteResponse.result : [];
    const bySymbol = new Map(results.map((item) => [item.symbol, item]));

    const payload = {};
    for (const [key, { symbol }] of Object.entries(MARKET_MAP)) {
      const item = bySymbol.get(symbol);
      payload[key] = item ? {
        symbol,
        name: item.shortName || item.longName || symbol,
        price: Number.isFinite(Number(item.regularMarketPrice)) ? Number(item.regularMarketPrice) : null,
        change: Number.isFinite(Number(item.regularMarketChange)) ? Number(item.regularMarketChange) : null,
        changePercent: Number.isFinite(Number(item.regularMarketChangePercent)) ? Number(item.regularMarketChangePercent) : null,
        previousClose: Number.isFinite(Number(item.regularMarketPreviousClose)) ? Number(item.regularMarketPreviousClose) : null
      } : { error: 'not_found' };
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(payload);
  } catch (error) {
    const fallback = {};
    for (const key of Object.keys(MARKET_MAP)) fallback[key] = { error: 'market_fetch_failed' };
    return res.status(200).json(fallback);
  }
};
