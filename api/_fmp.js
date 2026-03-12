const API_KEY = process.env.FMP_API_KEY || 'FWbT2hS8KD6DOJT4pUOUy4Ivjs1zvxmM';
const BASE_URL = 'https://financialmodelingprep.com/stable';

function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}/${path}`);
  const finalParams = { ...params, apikey: API_KEY };
  for (const [key, value] of Object.entries(finalParams)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fmpFetch(path, params = {}) {
  const response = await fetch(buildUrl(path, params), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'watchlist-site/1.0'
    }
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error((data && (data.error || data.message || data['Error Message'])) || `fmp_http_${response.status}`);
  }

  if (data && typeof data === 'object' && !Array.isArray(data) && (data.error || data.message)) {
    throw new Error(data.error || data.message);
  }

  return data;
}

function normalizeType(rawType) {
  const value = String(rawType || '').toUpperCase();
  const map = {
    STOCK: 'Action',
    EQUITY: 'Action',
    ETF: 'ETF',
    ETN: 'ETF',
    FUND: 'Fonds',
    MUTUAL_FUND: 'Fonds',
    MUTUALFUND: 'Fonds',
    INDEX: 'Indice',
    FOREX: 'Forex',
    CURRENCY: 'Forex',
    COMMODITY: 'Matière première',
    CRYPTO: 'Crypto'
  };
  return map[value] || rawType || '';
}

function firstArrayItem(data) {
  return Array.isArray(data) ? data[0] || null : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeQuoteItem(item = {}) {
  const price = toNumber(item.price ?? item.lastPrice ?? item.ask ?? item.bid);
  const previousClose = toNumber(item.previousClose ?? item.previous_close);
  const rawChange = toNumber(item.change ?? item.changePrice ?? item.changes);
  const rawChangePercent = toNumber(
    item.changesPercentage ?? item.changePercent ?? item.change_percentage ?? item.percentChange
  );

  let changePercent = rawChangePercent;
  if (changePercent === null && price !== null && previousClose !== null && previousClose !== 0) {
    changePercent = ((price - previousClose) / previousClose) * 100;
  }

  let change = rawChange;
  if (change === null && price !== null && previousClose !== null) {
    change = price - previousClose;
  }

  return {
    symbol: item.symbol || '',
    name: item.name || item.companyName || item.shortName || item.symbol || '',
    type: normalizeType(item.type || item.assetType || item.instrumentType),
    region: item.exchange || item.exchangeShortName || item.exchangeName || '',
    currency: item.currency || '',
    price,
    previousClose,
    change,
    changePercent
  };
}

function pickHistoryRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.historical)) return data.historical;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getHistoryClose(row = {}) {
  return toNumber(row.close ?? row.adjClose ?? row.adjustedClose ?? row.price);
}

function getHistoryDateMs(row = {}) {
  const value = row.date || row.datetime || row.label;
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

function getReferenceValue(rows, targetMs) {
  if (!rows.length) return null;
  let best = null;
  let bestGap = Infinity;
  for (const row of rows) {
    const time = getHistoryDateMs(row);
    const close = getHistoryClose(row);
    if (time === null || close === null) continue;
    const gap = Math.abs(time - targetMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = close;
    }
  }
  return best;
}

function calcPerf(latest, reference) {
  const l = toNumber(latest);
  const r = toNumber(reference);
  if (l === null || r === null || r === 0) return null;
  return ((l / r) - 1) * 100;
}

module.exports = {
  API_KEY,
  fmpFetch,
  normalizeType,
  normalizeQuoteItem,
  firstArrayItem,
  pickHistoryRows,
  getHistoryClose,
  getReferenceValue,
  calcPerf,
  toNumber
};
