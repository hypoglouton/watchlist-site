import yahooFinance from 'yahoo-finance2';

function normalizeType(rawType) {
  const value = String(rawType || '').toUpperCase();
  const map = {
    EQUITY: 'Action',
    ETF: 'ETF',
    MUTUALFUND: 'Fonds',
    INDEX: 'Indice',
    CURRENCY: 'Forex',
    CRYPTOCURRENCY: 'Crypto',
    FUTURE: 'Future'
  };
  return map[value] || rawType || '';
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function calcPerf(latest, past) {
  if (!Number.isFinite(latest) || !Number.isFinite(past) || past === 0) return null;
  return ((latest - past) / past) * 100;
}

function firstValidNumber(array) {
  if (!Array.isArray(array)) return null;
  for (const value of array) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function nearestPastValue(points, targetTs) {
  if (!Array.isArray(points) || !points.length) return null;
  let candidate = null;
  for (const point of points) {
    if (point.ts <= targetTs && Number.isFinite(point.value)) candidate = point.value;
    if (point.ts > targetTs) break;
  }
  return candidate;
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim();
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol' });
  }

  try {
    const quote = await yahooFinance.quote(symbol, {
      fields: [
        'symbol',
        'shortName',
        'longName',
        'quoteType',
        'currency',
        'fullExchangeName',
        'exchange',
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketPreviousClose',
        'previousClose'
      ]
    });

    const chart = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 1000 * 60 * 60 * 24 * 760),
      interval: '1d'
    }).catch(() => null);

    const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
    const adjclose = chart?.indicators?.adjclose?.[0]?.adjclose;
    const close = chart?.indicators?.quote?.[0]?.close;
    const values = Array.isArray(adjclose) ? adjclose : close;

    const points = timestamps
      .map((ts, i) => ({ ts: Number(ts) * 1000, value: Number(values?.[i]) }))
      .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.value));

    const historyLatest = points.length ? points[points.length - 1].value : null;
    const price = toNumber(quote.regularMarketPrice) ?? historyLatest;
    const previousClose = toNumber(quote.regularMarketPreviousClose) ?? toNumber(quote.previousClose);
    const change = toNumber(quote.regularMarketChange) ?? (Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null);
    const changePercent = toNumber(quote.regularMarketChangePercent) ?? (Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : null);

    const now = Date.now();
    const month1 = new Date(now);
    month1.setMonth(month1.getMonth() - 1);
    const month6 = new Date(now);
    month6.setMonth(month6.getMonth() - 6);
    const year1 = new Date(now);
    year1.setFullYear(year1.getFullYear() - 1);

    const latestForPerf = Number.isFinite(historyLatest) ? historyLatest : price;

    return res.status(200).json({
      symbol,
      name: quote.longName || quote.shortName || symbol,
      type: normalizeType(quote.quoteType),
      region: quote.fullExchangeName || quote.exchange || '',
      currency: quote.currency || '',
      price: toNumber(price),
      previousClose: toNumber(previousClose),
      change: toNumber(change),
      changePercent: toNumber(changePercent),
      perf1m: calcPerf(latestForPerf, nearestPastValue(points, month1.getTime())),
      perf6m: calcPerf(latestForPerf, nearestPastValue(points, month6.getTime())),
      perf1y: calcPerf(latestForPerf, nearestPastValue(points, year1.getTime())),
      historyAsOf: firstValidNumber(timestamps) ? new Date(points[points.length - 1].ts).toISOString().slice(0, 10) : ''
    });
  } catch (error) {
    return res.status(500).json({
      error: 'quote_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
}
