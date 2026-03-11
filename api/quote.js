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

function getReferenceValue(series, targetMs) {
  let candidate = null;
  for (const point of series) {
    if (!Number.isFinite(point.value)) continue;
    if (point.ts <= targetMs) candidate = point;
    else break;
  }
  return candidate ? candidate.value : null;
}

function calcPerf(latestValue, referenceValue) {
  if (!Number.isFinite(latestValue) || !Number.isFinite(referenceValue) || referenceValue === 0) return null;
  return ((latestValue / referenceValue) - 1) * 100;
}

function pickChartSeries(indicators) {
  const adjClose = indicators && indicators.adjclose && indicators.adjclose[0] && indicators.adjclose[0].adjclose;
  if (Array.isArray(adjClose) && adjClose.some((v) => Number.isFinite(v))) return adjClose;
  const close = indicators && indicators.quote && indicators.quote[0] && indicators.quote[0].close;
  if (Array.isArray(close)) return close;
  return [];
}

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
    const errorMessage =
      (data && data.chart && data.chart.error && data.chart.error.description) ||
      (data && data.finance && data.finance.error && data.finance.error.description) ||
      (data && data.quoteResponse && data.quoteResponse.error && data.quoteResponse.error.description) ||
      'yahoo_request_failed';
    throw new Error(errorMessage);
  }

  return data;
}

async function fetchQuoteSnapshot(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const data = await fetchJson(url);
  const item = data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0];
  if (!item) throw new Error('quote_not_found');
  return item;
}

async function fetchChartHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&includePrePost=false&events=div,splits`;
  const data = await fetchJson(url);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result) return { series: [], meta: {} };

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const values = pickChartSeries(result.indicators || {});
  const series = timestamps.map((ts, index) => ({ ts: ts * 1000, value: Number(values && values[index]) }))
    .filter((point) => Number.isFinite(point.value));

  return { series, meta: result.meta || {} };
}

module.exports = async function handler(req, res) {
  const symbol = String((req.query && req.query.symbol) || '').trim();
  if (!symbol) return res.status(400).json({ error: 'missing_symbol' });

  try {
    const quote = await fetchQuoteSnapshot(symbol);
    let chart = { series: [], meta: {} };
    try {
      chart = await fetchChartHistory(symbol);
    } catch (e) {}

    const series = Array.isArray(chart.series) ? chart.series : [];
    const latestSeriesPoint = series.length ? series[series.length - 1] : null;

    const now = new Date();
    const target1m = new Date(now); target1m.setMonth(target1m.getMonth() - 1);
    const target6m = new Date(now); target6m.setMonth(target6m.getMonth() - 6);
    const target1y = new Date(now); target1y.setFullYear(target1y.getFullYear() - 1);

    const livePrice = Number(quote.regularMarketPrice);
    const previousClose = Number(quote.regularMarketPreviousClose != null ? quote.regularMarketPreviousClose : quote.previousClose);
    const latestHistoryValue = latestSeriesPoint && latestSeriesPoint.value;

    const price = Number.isFinite(livePrice) ? livePrice : (Number.isFinite(latestHistoryValue) ? latestHistoryValue : null);
    const latestForHistory = Number.isFinite(latestHistoryValue) ? latestHistoryValue : price;

    const ref1m = getReferenceValue(series, target1m.getTime());
    const ref6m = getReferenceValue(series, target6m.getTime());
    const ref1y = getReferenceValue(series, target1y.getTime());

    const rawChange = Number(quote.regularMarketChange);
    const change = Number.isFinite(rawChange)
      ? rawChange
      : (Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null);

    const rawChangePercent = Number(quote.regularMarketChangePercent);
    const changePercent = Number.isFinite(rawChangePercent)
      ? rawChangePercent
      : (Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : null);

    return res.status(200).json({
      symbol,
      name: quote.longName || quote.shortName || symbol,
      type: normalizeType(quote.quoteType || (chart.meta && chart.meta.instrumentType)),
      region: quote.fullExchangeName || quote.exchange || (chart.meta && (chart.meta.exchangeName || chart.meta.fullExchangeName)) || '',
      currency: quote.currency || (chart.meta && chart.meta.currency) || '',
      price: Number.isFinite(price) ? price : null,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      change: Number.isFinite(change) ? change : null,
      changePercent: Number.isFinite(changePercent) ? changePercent : null,
      perf1m: calcPerf(latestForHistory, ref1m),
      perf6m: calcPerf(latestForHistory, ref6m),
      perf1y: calcPerf(latestForHistory, ref1y)
    });
  } catch (error) {
    return res.status(500).json({
      error: 'quote_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
