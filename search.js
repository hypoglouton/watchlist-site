import yahooFinance from "yahoo-finance2";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function levenshtein(a, b) {
  const s = normalizeCompact(a);
  const t = normalizeCompact(b);

  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));

  for (let i = 0; i <= s.length; i++) dp[i][0] = i;
  for (let j = 0; j <= t.length; j++) dp[0][j] = j;

  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[s.length][t.length];
}

function similarityScore(a, b) {
  const s = normalizeCompact(a);
  const t = normalizeCompact(b);
  const maxLen = Math.max(s.length, t.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(s, t) / maxLen;
}

function isLikelyETF(item) {
  const type = normalizeText(item.quoteType || item.typeDisp || item.type);
  const name = normalizeText(item.shortname || item.longname || item.name);
  const symbol = normalizeText(item.symbol);

  return (
    type.includes("etf") ||
    type.includes("fund") ||
    name.includes("etf") ||
    name.includes("ucits") ||
    name.includes("ishares") ||
    name.includes("amundi") ||
    name.includes("spdr") ||
    name.includes("xtrackers") ||
    name.includes("lyxor") ||
    name.includes("vanguard") ||
    symbol.endsWith(".pa") ||
    symbol.endsWith(".de") ||
    symbol.endsWith(".as") ||
    symbol.endsWith(".br")
  );
}

function isEuropean(item) {
  const exchange = normalizeText(item.exchange || item.exchDisp || item.fullExchangeName);
  const symbol = normalizeText(item.symbol);

  return (
    exchange.includes("paris") ||
    exchange.includes("euronext") ||
    exchange.includes("xetra") ||
    exchange.includes("frankfurt") ||
    exchange.includes("amsterdam") ||
    exchange.includes("brussels") ||
    exchange.includes("milan") ||
    exchange.includes("madrid") ||
    exchange.includes("london") ||
    symbol.endsWith(".pa") ||
    symbol.endsWith(".de") ||
    symbol.endsWith(".as") ||
    symbol.endsWith(".br") ||
    symbol.endsWith(".mi") ||
    symbol.endsWith(".mc") ||
    symbol.endsWith(".l")
  );
}

function isAcceptableYahooResult(item) {
  if (!item || !item.symbol) return false;

  const quoteType = normalizeText(item.quoteType || item.typeDisp || item.type);
  const exchange = normalizeText(item.exchange || item.exchDisp || item.fullExchangeName);
  const name = normalizeText(item.shortname || item.longname || item.name || "");

  if (!name) return false;

  if (quoteType.includes("index")) return false;
  if (quoteType.includes("currency")) return false;
  if (quoteType.includes("cryptocurrency")) return false;
  if (quoteType.includes("future")) return false;
  if (quoteType.includes("option")) return false;
  if (exchange.includes("ccc")) return false;

  return true;
}

function isGoodMatch(item, query) {
  const q = normalizeCompact(query);
  const symbol = normalizeCompact(item.symbol);
  const name = normalizeCompact(item.shortname || item.longname || item.name);

  if (!q || !symbol || !name) return false;

  if (symbol === q || name === q) return true;
  if (symbol.startsWith(q)) return true;
  if (name.startsWith(q)) return true;
  if (name.includes(q) && q.length >= 4) return true;

  const symbolSim = similarityScore(symbol, q);
  const nameSim = similarityScore(name, q);

  if (q.length <= 3) return symbol === q || symbol.startsWith(q);
  if (q.length <= 5) return symbolSim >= 0.82 || nameSim >= 0.74;

  return symbolSim >= 0.74 || nameSim >= 0.69;
}

function scoreResult(item, query) {
  const q = normalizeCompact(query);
  const symbol = normalizeCompact(item.symbol);
  const name = normalizeCompact(item.shortname || item.longname || item.name);
  const europe = isEuropean(item);
  const etf = isLikelyETF(item);

  let score = 0;

  if (symbol === q) score += 2500;
  if (name === q) score += 1800;

  if (symbol.startsWith(q)) score += 700;
  if (name.startsWith(q)) score += 350;

  if (symbol.includes(q)) score += 220;
  if (name.includes(q)) score += 150;

  score += Math.round(similarityScore(symbol, q) * 220);
  score += Math.round(similarityScore(name, q) * 160);

  if (europe) score += 80;
  if (etf && europe) score += 120;
  else if (etf) score += 40;

  return score;
}

function dedupeResults(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = `${normalizeText(item.symbol)}|${normalizeText(item.shortname || item.longname || item.name)}|${normalizeText(item.exchange || item.exchDisp || item.fullExchangeName || "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

async function safeQuote(symbol) {
  try {
    const q = await yahooFinance.quote(symbol);

    const price = Number(q?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
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
    };
  } catch {
    return null;
  }
}

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || "").trim();

    if (!q) {
      return json(res, 400, { error: "missing_query" });
    }

    const raw = await yahooFinance.search(q);
    let results = Array.isArray(raw?.quotes) ? raw.quotes : [];

    results = results.filter(isAcceptableYahooResult);
    results = results.filter((item) => isGoodMatch(item, q));
    results = dedupeResults(results);

    results = results
      .map((item) => ({ ...item, _score: scoreResult(item, q) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);

    const withQuotes = await Promise.all(
      results.map(async (item) => {
        const quote = await safeQuote(item.symbol);
        if (!quote) return null;

        return {
          symbol: quote.symbol,
          name: quote.name || item.shortname || item.longname || item.name || item.symbol,
          type: quote.type || item.quoteType || item.typeDisp || "",
          region: quote.region || item.exchange || item.exchDisp || "",
          currency: quote.currency || "",
          price: quote.price,
          changePercent: quote.changePercent,
          change: quote.change,
          previousClose: quote.previousClose,
          _score: item._score
        };
      })
    );

    let cleaned = withQuotes.filter(Boolean);

    if (!cleaned.length) {
      return json(res, 200, { results: [] });
    }

    cleaned.sort((a, b) => b._score - a._score);

    const top = cleaned[0];
    const second = cleaned[1];
    const qNorm = normalizeCompact(q);
    const exactTop =
      normalizeCompact(top.symbol) === qNorm ||
      normalizeCompact(top.name) === qNorm;

    if (!second || exactTop || top._score - second._score >= 350) {
      cleaned = [top];
    } else {
      cleaned = cleaned.slice(0, 5);
    }

    cleaned = cleaned.map(({ _score, ...rest }) => rest);

    return json(res, 200, { results: cleaned });
  } catch (error) {
    return json(res, 500, {
      error: "search_failed",
      details: String(error?.message || error)
    });
  }
}
