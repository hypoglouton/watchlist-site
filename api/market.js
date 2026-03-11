const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/"
};

async function fetchJson(url) {
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      data?.finance?.error?.description ||
      data?.quoteResponse?.error?.description ||
      "yahoo_request_failed";
    throw new Error(errorMessage);
  }

  return data;
}

export default async function handler(req, res) {
  const rawSymbols = String(req.query?.symbols || "").trim();
  const symbols = rawSymbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!symbols.length) {
    return res.status(400).json({ error: "missing_symbols" });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&lang=fr-FR&region=FR`;
    const data = await fetchJson(url);
    const items = Array.isArray(data?.quoteResponse?.result) ? data.quoteResponse.result : [];

    const results = {};
    for (const symbol of symbols) {
      const item = items.find((entry) => entry?.symbol === symbol);
      results[symbol] = item
        ? {
            symbol,
            price: Number.isFinite(Number(item.regularMarketPrice)) ? Number(item.regularMarketPrice) : null,
            change: Number.isFinite(Number(item.regularMarketChange)) ? Number(item.regularMarketChange) : null,
            changePercent: Number.isFinite(Number(item.regularMarketChangePercent)) ? Number(item.regularMarketChangePercent) : null,
            previousClose: Number.isFinite(Number(item.regularMarketPreviousClose)) ? Number(item.regularMarketPreviousClose) : null
          }
        : { symbol, price: null, change: null, changePercent: null, previousClose: null };
    }

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: "market_failed",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
}
