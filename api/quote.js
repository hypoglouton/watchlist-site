const {
  fmpFetch,
  normalizeQuoteItem,
  firstArrayItem,
  pickHistoryRows,
  getHistoryClose,
  getReferenceValue,
  calcPerf,
  toNumber
} = require('./_fmp');

module.exports = async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim();
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol' });
  }

  try {
    const [quoteData, historyData] = await Promise.all([
      fmpFetch('quote', { symbol }),
      fmpFetch('historical-price-eod/light', { symbol, limit: 400 }).catch(() => [])
    ]);

    const quote = normalizeQuoteItem(firstArrayItem(quoteData) || { symbol });
    const rows = pickHistoryRows(historyData);
    const latestHistory = rows.length ? getHistoryClose(rows[0]) : null;
    const latest = quote.price ?? latestHistory;

    const now = new Date();
    const t1m = new Date(now);
    t1m.setMonth(t1m.getMonth() - 1);
    const t6m = new Date(now);
    t6m.setMonth(t6m.getMonth() - 6);
    const t1y = new Date(now);
    t1y.setFullYear(t1y.getFullYear() - 1);

    return res.status(200).json({
      symbol,
      name: quote.name || symbol,
      type: quote.type,
      region: quote.region,
      currency: quote.currency,
      price: latest,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      perf1m: calcPerf(latest, getReferenceValue(rows, t1m.getTime())),
      perf6m: calcPerf(latest, getReferenceValue(rows, t6m.getTime())),
      perf1y: calcPerf(latest, getReferenceValue(rows, t1y.getTime()))
    });
  } catch (error) {
    return res.status(500).json({
      error: 'quote_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
