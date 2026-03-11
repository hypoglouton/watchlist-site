import yahooFinance from "yahoo-finance2";

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const symbol = String(req.query.symbol || "").trim();

    if (!symbol) {
      return json(res, 400, { error: "missing_symbol" });
    }

    const q = await yahooFinance.quote(symbol);

    const price = Number(q?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return json(res, 404, { error: "quote_not_found" });
    }

    return json(res, 200, {
      symbol: q.symbol || symbol,
      name: q.longName || q.shortName || symbol,
      type: q.quoteType || "",
      region: q.fullExchangeName || q.exchange || "",
      currency: q.currency || "",
      price,
      changePercent: Number.isFinite(Number(q.regularMarketChangePercent))
        ? String(q.regularMarketChangePercent)
        : "",
      change: Number.isFinite(Number(q.regularMarketChange))
        ? String(q.regularMarketChange)
        : "",
      previousClose: Number.isFinite(Number(q.regularMarketPreviousClose))
        ? String(q.regularMarketPreviousClose)
        : ""
    });
  } catch (error) {
    return json(res, 500, {
      error: "quote_failed",
      details: String(error?.message || error)
    });
  }
}
