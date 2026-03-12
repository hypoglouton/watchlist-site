const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/'
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.=^/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function pickRegion(searchItem, quoteItem) {
  return (
    searchItem?.exchDisp ||
    quoteItem?.fullExchangeName ||
    quoteItem?.exchange ||
    searchItem?.exchange ||
    ''
  );
}

function buildScore(item, queryNorm) {
  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name);
  let score = 0;

  if (symbol === queryNorm) score += 1000;
  if (name === queryNorm) score += 800;
  if (symbol.startsWith(queryNorm)) score += 300;
  if (name.startsWith(queryNorm)) score += 220;
  if (symbol.includes(queryNorm)) score += 120;
  if (name.includes(queryNorm)) score += 90;
  if (item.quoteType === 'ETF') score += 10;
  if (item.isYahooFinance) score += 5;
  return score;
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
    const errorMessage = data?.finance?.error?.description || data?.chart?.error?.description || 'yahoo_request_failed';
    throw new Error(errorMessage);
  }

  return data;
}

module.exports = async function handler(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing_query' });
  }

  try {
    const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=fr-FR&region=FR&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=false&enableNavLinks=false`;
    const searchData = await fetchJson(searchUrl);
    const allowedTypes = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'FUTURE', 'CURRENCY']);

    const rawQuotes = Array.isArray(searchData?.quotes) ? searchData.quotes : [];
    const filtered = rawQuotes
      .filter((item) => item?.symbol && allowedTypes.has(String(item.quoteType || '').toUpperCase()))
      .filter((item) => !item.isNews)
      .filter((item) => !String(item.symbol).includes('=') || item.quoteType === 'CURRENCY' || item.quoteType === 'FUTURE' || q.includes('='));

    const uniqueBySymbol = [];
    const seen = new Set();
    for (const item of filtered) {
      const key = String(item.symbol).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueBySymbol.push(item);
    }

    const queryNorm = normalizeText(q);
    uniqueBySymbol.sort((a, b) => buildScore(b, queryNorm) - buildScore(a, queryNorm));

    const shortlist = uniqueBySymbol.slice(0, 8);
    const symbols = shortlist.map((item) => item.symbol).join(',');

    let quoteMap = new Map();
    if (symbols) {
      const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&lang=fr-FR&region=FR`;
      const quoteData = await fetchJson(quoteUrl);
      const quoteResults = Array.isArray(quoteData?.quoteResponse?.result) ? quoteData.quoteResponse.result : [];
      quoteMap = new Map(quoteResults.map((item) => [String(item.symbol).toUpperCase(), item]));
    }

    const results = shortlist.map((item) => {
      const quote = quoteMap.get(String(item.symbol).toUpperCase()) || {};
      return {
        symbol: item.symbol,
        name: quote.longName || quote.shortName || item.longname || item.shortname || item.symbol,
        type: normalizeType(item.quoteType || quote.quoteType),
        region: pickRegion(item, quote),
        currency: quote.currency || item.currency || '',
        price: Number.isFinite(Number(quote.regularMarketPrice)) ? Number(quote.regularMarketPrice) : null,
        change: Number.isFinite(Number(quote.regularMarketChange)) ? Number(quote.regularMarketChange) : null,
        changePercent: Number.isFinite(Number(quote.regularMarketChangePercent)) ? Number(quote.regularMarketChangePercent) : null,
        previousClose: Number.isFinite(Number(quote.regularMarketPreviousClose)) ? Number(quote.regularMarketPreviousClose) : null
      };
    });

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
};
