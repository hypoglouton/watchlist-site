const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/'
};

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

function formatDateYYYYMMDD(timestampMs) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getReferenceValue(series, targetMs) {
  let candidate = null;
  for (const point of series) {
    if (!Number.isFinite(point.value)) continue;
    if (point.ts <= targetMs) {
      candidate = point;
    } else {
      break;
    }
  }
  return candidate?.value ?? null;
}

function calcPerf(latestValue, referenceValue) {
  if (!Number.isFinite(latestValue) || !Number.isFinite(referenceValue) || referenceValue === 0) {
    return null;
  }
  return ((latestValue / referenceValue) - 1) * 100;
}

function pickChartSeries(indicators) {
  const adjClose = indicators?.adjclose?.[0]?.adjclose;
  if (Array.isArray(adjClose) && adjClose.some((v) => Number.isFinite(v))) return adjClose;
  const close = indicators?.quote?.[0]?.close;
  if (Array.isArray(close)) return close;
  return [];
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  const text = await response.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      data?.chart?.error?.description ||
      data?.finance?.error?.description ||
      data?.quoteResponse?.error?.description ||
      'yahoo_request_failed';
    throw new Error(errorMessage);
  }

  return data;
}

async function fetchQuoteSnapshot(symbol) {
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&lang=fr-FR&region=FR`;
  const quoteData = await fetchJson(quoteUrl);
  const item = quoteData?.quoteResponse?.result?.[0];
  if (!item) throw new Error('quote_not_found');
  return item;
}

async function fetchChartHistory(symbol) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&includePrePost=false&events=div,splits&lang=fr-FR&region=FR`;
  const chartData = await fetchJson(chartUrl);
  const result = chartData?.chart?.result?.[0];
  if (!result) {
    return { series: [], meta: {} };
  }

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const values = pickChartSeries(result.indicators || {});
  const series = timestamps
    .map((ts, index) => ({
      ts: ts * 1000,
      value: Number(values?.[index])
    }))
    .filter((point) => Number.isFinite(point.value));

  return { series, meta: result.meta || {} };
}

module.exports = async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim();
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol' });
  }

  try {
    const [quote, chart] = await Promise.all([
      fetchQuoteSnapshot(symbol),
      fetchChartHistory(symbol).catch(() => ({ series: [], meta: {} }))
    ]);

    const series = Array.isArray(chart.series) ? chart.series : [];
    const latestSeriesPoint = series.length ? series[series.length - 1] : null;

    const now = new Date();
    const target1m = new Date(now);
    target1m.setMonth(target1m.getMonth() - 1);
    const target6m = new Date(now);
    target6m.setMonth(target6m.getMonth() - 6);
    const target1y = new Date(now);
    target1y.setFullYear(target1y.getFullYear() - 1);

    const livePrice = Number(quote.regularMarketPrice);
    const previousClose = Number(quote.regularMarketPreviousClose ?? quote.previousClose);
    const latestHistoryValue = latestSeriesPoint?.value;

    const price = Number.isFinite(livePrice)
      ? livePrice
      : (Number.isFinite(latestHistoryValue) ? latestHistoryValue : null);

    const latestForHistory = Number.isFinite(latestHistoryValue)
      ? latestHistoryValue
      : (Number.isFinite(price) ? price : null);

    const ref1m = getReferenceValue(series, target1m.getTime());
    const ref6m = getReferenceValue(series, target6m.getTime());
    const ref1y = getReferenceValue(series, target1y.getTime());

    const change = Number.isFinite(Number(quote.regularMarketChange))
      ? Number(quote.regularMarketChange)
      : (Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null);

    const changePercent = Number.isFinite(Number(quote.regularMarketChangePercent))
      ? Number(quote.regularMarketChangePercent)
      : (Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0
          ? (change / previousClose) * 100
          : null);

    return res.status(200).json({
      symbol,
      name: quote.longName || quote.shortName || symbol,
      type: normalizeType(quote.quoteType || chart.meta?.instrumentType),
      region: quote.fullExchangeName || quote.exchange || chart.meta?.exchangeName || chart.meta?.fullExchangeName || '',
      currency: quote.currency || chart.meta?.currency || '',
      price: Number.isFinite(price) ? price : null,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      change: Number.isFinite(change) ? change : null,
      changePercent: Number.isFinite(changePercent) ? changePercent : null,
      perf1m: calcPerf(latestForHistory, ref1m),
      perf6m: calcPerf(latestForHistory, ref6m),
      perf1y: calcPerf(latestForHistory, ref1y),
      historyAsOf: latestSeriesPoint ? formatDateYYYYMMDD(latestSeriesPoint.ts) : ''
    });
  } catch (error) {
    return res.status(500).json({
      error: 'quote_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
