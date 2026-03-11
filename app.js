const TWELVE_API_KEY = "4be4ce1ecdd74937b85c235b3b33c05f";

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("results");
const watchlistBox = document.getElementById("watchlist");

let watchlist = JSON.parse(localStorage.getItem("watchlist")) || [];

function saveWatchlist() {
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(2);
}

function formatPercent(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (!Number.isFinite(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function getChangeClass(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (!Number.isFinite(num)) return "neutral";
  if (num > 0) return "positive";
  if (num < 0) return "negative";
  return "neutral";
}

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
  const type = normalizeText(item.instrument_type || item.type);
  const name = normalizeText(item.instrument_name || item.name);
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
    name.includes("vanguard")
  );
}

function isEuropeanRegion(country, exchange) {
  const c = normalizeText(country);
  const e = normalizeText(exchange);
  return (
    c.includes("france") ||
    c.includes("germany") ||
    c.includes("netherlands") ||
    c.includes("belgium") ||
    c.includes("italy") ||
    c.includes("spain") ||
    c.includes("switzerland") ||
    c.includes("united kingdom") ||
    e.includes("paris") ||
    e.includes("euronext") ||
    e.includes("xetra") ||
    e.includes("frankfurt") ||
    e.includes("amsterdam") ||
    e.includes("london")
  );
}

function dedupeResults(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = `${normalizeText(item.symbol)}|${normalizeText(item.instrument_name || item.name)}|${normalizeText(item.exchange || "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function isGoodMatch(item, query) {
  const q = normalizeCompact(query);
  const symbol = normalizeCompact(item.symbol);
  const name = normalizeCompact(item.instrument_name || item.name);

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
  const name = normalizeCompact(item.instrument_name || item.name);
  const country = normalizeText(item.country);
  const exchange = normalizeText(item.exchange || "");
  const etf = isLikelyETF(item);
  const europe = isEuropeanRegion(country, exchange);

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

function chooseResults(items, query) {
  if (!items.length) return [];

  const filtered = items.filter((item) => isGoodMatch(item, query));
  if (!filtered.length) return [];

  const sorted = [...filtered]
    .map((item) => ({ ...item, _score: scoreResult(item, query) }))
    .sort((a, b) => b._score - a._score);

  const top = sorted[0];
  const second = sorted[1];
  const queryNorm = normalizeCompact(query);

  const exactTop =
    normalizeCompact(top.symbol) === queryNorm ||
    normalizeCompact(top.instrument_name || top.name) === queryNorm;

  if (!second) return [top];
  if (exactTop) return [top];
  if (top._score - second._score >= 350) return [top];

  return sorted.slice(0, 5);
}

async function fetchQuote(symbol) {
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || data.status === "error") return null;

    const price = Number(data.close ?? data.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    let changePercent = "";
    if (data.percent_change !== undefined && data.percent_change !== null) {
      changePercent = String(data.percent_change);
    }

    let previousClose = "";
    if (data.previous_close !== undefined && data.previous_close !== null) {
      previousClose = String(data.previous_close);
    }

    let change = "";
    if (data.change !== undefined && data.change !== null) {
      change = String(data.change);
    }

    return {
      symbol: data.symbol || symbol,
      price,
      changePercent,
      change,
      previousClose
    };
  } catch (error) {
    return null;
  }
}

async function filterQuotableResults(items) {
  const out = [];

  for (const item of items.slice(0, 5)) {
    const quote = await fetchQuote(item.symbol);
    if (quote) {
      out.push({
        ...item,
        _quote: quote
      });
    }
  }

  return out;
}

async function refreshWatchlist() {
  watchlistBox.innerHTML = "<p>Chargement des cours...</p>";

  if (watchlist.length === 0) {
    watchlistBox.innerHTML = "<p>Aucune valeur dans la watchlist.</p>";
    return;
  }

  const refreshed = [];

  for (const item of watchlist) {
    try {
      const quote = await fetchQuote(item.symbol);

      refreshed.push({
        ...item,
        price: quote?.price ?? item.price ?? "",
        changePercent: quote?.changePercent ?? item.changePercent ?? "",
        change: quote?.change ?? item.change ?? "",
        previousClose: quote?.previousClose ?? item.previousClose ?? ""
      });
    } catch (error) {
      refreshed.push(item);
    }
  }

  watchlist = refreshed;
  saveWatchlist();
  renderWatchlist();
}

function renderWatchlist() {
  watchlistBox.innerHTML = "";

  if (watchlist.length === 0) {
    watchlistBox.innerHTML = "<p>Aucune valeur dans la watchlist.</p>";
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `<button id="refreshWatchlistBtn">Rafraîchir les cours</button>`;
  watchlistBox.appendChild(toolbar);

  watchlist.forEach((item) => {
    const row = document.createElement("div");
    row.className = "card";

    const priceText = item.price ? formatPrice(item.price) : "-";
    const percentText = item.changePercent ? formatPercent(item.changePercent) : "-";
    const prevCloseText = item.previousClose ? formatPrice(item.previousClose) : "-";
    const changeClass = getChangeClass(item.changePercent);

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(item.name)}</div>
            <div class="ticker">${escapeHtml(item.symbol)}</div>
          </div>

          <div class="price-box">
            <div class="price ${changeClass}">${priceText}</div>
            <div class="change ${changeClass}">${percentText}</div>
          </div>
        </div>

        <div class="meta">
          <div class="meta-line">${escapeHtml(item.type || "-")} • ${escapeHtml(item.region || "-")} • ${escapeHtml(item.currency || "-")}</div>
          <div class="meta-line">Clôture précédente : ${prevCloseText}</div>
        </div>
      </div>

      <button class="remove-btn" data-symbol="${escapeHtml(item.symbol)}">Retirer</button>
    `;

    watchlistBox.appendChild(row);
  });

  const refreshBtn = document.getElementById("refreshWatchlistBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshWatchlist);
  }

  document.querySelectorAll(".remove-btn").forEach((button) => {
    button.addEventListener("click", () => {
      watchlist = watchlist.filter((item) => item.symbol !== button.dataset.symbol);
      saveWatchlist();
      renderWatchlist();
    });
  });
}

function renderResults(items) {
  resultsBox.innerHTML = "";

  if (!items.length) {
    resultsBox.innerHTML = "<p>Aucun résultat cotable trouvé.</p>";
    return;
  }

  items.forEach((item) => {
    const symbol = item.symbol || "";
    const name = item.instrument_name || item.name || "";
    const type = item.instrument_type || item.type || "-";
    const region = item.exchange || item.country || "-";
    const currency = item.currency || "-";

    const alreadyAdded = watchlist.some(
      (w) => normalizeText(w.symbol) === normalizeText(symbol)
    );

    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(name)}</div>
            <div class="ticker">${escapeHtml(symbol)}</div>
          </div>
        </div>

        <div class="meta">
          <div class="meta-line">${escapeHtml(type)} • ${escapeHtml(region)} • ${escapeHtml(currency)}</div>
        </div>
      </div>

      <button class="add-btn" data-symbol="${escapeHtml(symbol)}" ${alreadyAdded ? "disabled" : ""}>
        ${alreadyAdded ? "Déjà ajoutée" : "Ajouter"}
      </button>
    `;

    resultsBox.appendChild(row);
  });

  document.querySelectorAll(".add-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = items.find((asset) => asset.symbol === button.dataset.symbol);
      if (!item) return;

      const exists = watchlist.some(
        (w) => normalizeText(w.symbol) === normalizeText(item.symbol)
      );
      if (exists) return;

      button.disabled = true;
      button.textContent = "Ajout...";

      const quote = item._quote || await fetchQuote(item.symbol);

      if (!quote) {
        button.textContent = "Pas de cotation";
        return;
      }

      watchlist.push({
        symbol: item.symbol,
        name: item.instrument_name || item.name || item.symbol,
        type: item.instrument_type || item.type || "",
        region: item.exchange || item.country || "",
        currency: item.currency || "",
        price: quote.price ?? "",
        changePercent: quote.changePercent ?? "",
        change: quote.change ?? "",
        previousClose: quote.previousClose ?? ""
      });

      saveWatchlist();
      renderWatchlist();

      button.textContent = "Déjà ajoutée";
      button.disabled = true;
    });
  });
}

async function searchAssets() {
  const query = searchInput.value.trim();

  if (!query) {
    resultsBox.innerHTML = "<p>Entre un nom ou un ticker.</p>";
    return;
  }

  resultsBox.innerHTML = "<p>Recherche en cours...</p>";

  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${TWELVE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !Array.isArray(data.data)) {
      resultsBox.innerHTML = "<p>Erreur de recherche.</p>";
      return;
    }

    let matches = data.data.filter((item) => item.symbol && (item.instrument_name || item.name));
    matches = dedupeResults(matches);
    matches = chooseResults(matches, query);
    matches = await filterQuotableResults(matches);

    renderResults(matches);
  } catch (error) {
    resultsBox.innerHTML = "<p>Erreur pendant la recherche.</p>";
  }
}

searchButton.addEventListener("click", searchAssets);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchAssets();
  }
});

renderWatchlist();
