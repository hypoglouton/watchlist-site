import yahooFinance from 'yahoo-finance2';

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
  return score;
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export default async function handler(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing_query' });
  }

  try {
    const searchData = await yahooFinance.search(q, {
      quotesCount: 12,
      newsCount: 0,
      enableFuzzyQuery: false,
      region: 'FR',
      lang: 'fr-FR'
    });

    const allowedTypes = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'FUTURE', 'CURRENCY']);
    const rawQuotes = Array.isArray(searchData?.quotes) ? searchData.quotes : [];

    const filtered = rawQuotes
      .filter((item) => item?.symbol && allowedTypes.has(String(item.quoteType || '').toUpperCase()))
      .filter((item) => !String(item.symbol).includes('=') || item.quoteType === 'CURRENCY' || item.quoteType === 'FUTURE' || q.includes('='));

    const seen = new Set();
    const unique = [];
    for (const item of filtered) {
      const key = String(item.symbol).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    const queryNorm = normalizeText(q);
    const shortlist = unique
      .map((item) => ({
        symbol: item.symbol,
        name: item.longname || item.shortname || item.symbol,
        quoteType: String(item.quoteType || '').toUpperCase(),
        exchange: item.exchDisp || item.exchange || '',
        score: buildScore({
          symbol: item.symbol,
          name: item.longname || item.shortname || item.symbol,
          quoteType: String(item.quoteType || '').toUpperCase()
        }, queryNorm)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const symbols = shortlist.map((item) => item.symbol);
    let quoteRows = [];
    if (symbols.length) {
      const quotes = await yahooFinance.quote(symbols, {
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
          'regularMarketPreviousClose'
        ]
      });
      quoteRows = Array.isArray(quotes) ? quotes : [quotes];
    }

    const quoteMap = new Map(quoteRows.map((item) => [String(item.symbol).toUpperCase(), item]));

    const results = shortlist.map((item) => {
      const quote = quoteMap.get(String(item.symbol).toUpperCase()) || {};
      return {
        symbol: item.symbol,
        name: quote.longName || quote.shortName || item.name,
        type: normalizeType(quote.quoteType || item.quoteType),
        region: quote.fullExchangeName || quote.exchange || item.exchange || '',
        currency: quote.currency || '',
        price: toNumber(quote.regularMarketPrice),
        change: toNumber(quote.regularMarketChange),
        changePercent: toNumber(quote.regularMarketChangePercent),
        previousClose: toNumber(quote.regularMarketPreviousClose)
      };
    });

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'search_failed',
      details: error instanceof Error ? error.message : 'unknown_error'
    });
  }
}
