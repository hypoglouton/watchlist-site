const ALPHA_API_KEY = "355DCVOBSX0C2X75";
const FMP_API_KEY = "FWbT2hS8KD6DOJT4pUOUy4Ivjs1zvxmM";

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
  if (Number.isNaN(num)) return "-";
  return num.toFixed(2);
}

function formatPercent(value) {
  const cleaned = String(value ?? "").replace("%", "").trim();
  const num = Number(cleaned);
  if (Number.isNaN(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function getChangeClass(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (Number.isNaN(num)) return "neutral";
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
  const dist = levenshtein(s, t);
  return 1 - dist / maxLen;
}

function isLikelyETF(item) {
  const type = normalizeText(item.type);
  const name = normalizeText(item.name);
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

function isEuropeanRegion(region, exchange) {
  const r = normalizeText(region);
  const e = normalizeText(exchange);
  return (
    r.includes("europe") ||
    r.includes("france") ||
    r.includes("germany") ||
    r.includes("netherlands") ||
    r.includes("belgium") ||
    r.includes("italy") ||
    r.includes("spain") ||
    r.includes("switzerland") ||
    r.includes("united kingdom") ||
    e.includes("paris") ||
    e.includes("euronext") ||
    e.includes("xetra") ||
    e.includes("frankfurt") ||
    e.includes("amsterdam") ||
    e.includes("lse") ||
    e.includes("london")
  );
}

function dedupeResults(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${normalizeText(item.symbol)}|${normalizeText(item.name)}|${normalizeText(item.exchangeShortName || item.exchange || "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function isGoodMatch(item, query) {
  const q = normalizeCompact(query);
  const symbol = normalizeCompact(item.symbol);
  const name = normalizeCompact(item.name);

  if (!q || !symbol || !name) return false;

  if (symbol === q || name === q) return true;
  if (symbol.startsWith(q)) return true;
  if (name.startsWith(q)) return true;
  if (name.includes(q) && q.length >= 4) return true;

  const symbolSim = similarityScore(symbol, q);
  const nameSim = similarityScore(name, q);

  if (q.length <= 3) {
    return symbol === q || symbol.startsWith(q);
  }

  if (q.length <= 5) {
    return symbolSim >= 0.8 || nameSim >= 0.72;
  }

  return symbolSim >= 0.72 || nameSim >= 0.68;
}

function scoreResult(item, query) {
  const q = normalizeCompact(query);
  const symbol = normalizeCompact(item.symbol);
  const name = normalizeCompact(item.name);
  const region = normalizeText(item.region);
  const exchange = normalizeText(item.exchangeShortName || item.exchange || "");
  const currency = normalizeText(item.currency);
  const etf = isLikelyETF(item);
  const europe = isEuropeanRegion(region, exchange);

  let score = 0;

  if (symbol === q) score += 2000;
  if (name === q) score += 1700;

  if (symbol.startsWith(q)) score += 500;
  if (name.startsWith(q)) score += 300;

  if (symbol.includes(q)) score += 180;
  if (name.includes(q)) score += 130;

  score += Math.round(similarityScore(symbol, q) * 220);
  score += Math.round(similarityScore(name, q) * 160);

  if (europe) score += 80;
  if (currency === "eur") score += 60;

  if (etf && europe && currency === "eur") score += 140;
  else if (etf && europe) score += 100;
  else if (etf) score += 30;

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
    normalizeCompact(top.name) === queryNorm;

  if (!second) return [top];
  if (exactTop) return [top];
  if (top._score - second._score >= 260) return [top];

  return sorted.slice(0, 5);
}

async function fetchQuote(symbol) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.Note || data.Information || data["Error Message"]) {
    return null;
  }

  const quote = data["Global Quote"];
  if (!quote || !quote["01. symbol"]) {
    return null;
  }

  const price = Number(quote["05. price"]);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    symbol: quote["01. symbol"] || symbol,
    price: quote["05. price"] || "",
    changePercent: (quote["10. change percent"] || "").replace("%", "").trim(),
    change: quote["09. change"] || "",
    previousClose: quote["08. previous close"] || "",
  };
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
      if (!item.symbol) {
        refreshed.push(item);
        continue;
      }

      const quote = await fetchQuote(item.symbol);

      refreshed.push({
        ...item,
        price: quote?.price || item.price || "",
        changePercent: quote?.changePercent || item.changePercent || "",
        change: quote?.change || item.change || "",
        previousClose: quote?.previousClose || item.previousClose || "",
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
    resultsBox.innerHTML = "<p>Aucun résultat pertinent.</p>";
    return;
  }

  items.forEach((item) => {
    const alreadyAdded = watchlist.some(
      (w) => normalizeText(w.symbol) === normalizeText(item.symbol)
    );

    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(item.name)}</div>
            <div class="ticker">${escapeHtml(item.symbol)}</div>
          </div>
        </div>

        <div class="meta">
          <div class="meta-line">${escapeHtml(item.type || "-")} • ${escapeHtml(item.region || item.exchangeShortName || "-")} • ${escapeHtml(item.currency || "-")}</div>
        </div>
      </div>

      <button class="add-btn" data-symbol="${escapeHtml(item.symbol)}" ${alreadyAdded ? "disabled" : ""}>
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
      button.textContent = "Vérification...";

      let quote = null;

      try {
        quote = await fetchQuote(item.symbol);
      } catch (error) {
        quote = null;
      }

      if (!quote) {
        button.textContent = "Pas de cotation";
        return;
      }

      watchlist.push({
        symbol: item.symbol,
        name: item.name,
        type: item.type,
        region: item.region || item.exchangeShortName || "",
        currency: item.currency || "",
        price: quote.price || "",
        changePercent: quote.changePercent || "",
        change: quote.change || "",
        previousClose: quote.previousClose || "",
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
    const url = `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(query)}&apikey=${FMP_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      resultsBox.innerHTML = "<p>Erreur de recherche.</p>";
      return;
    }

    let matches = data.map((item) => ({
      symbol: item.symbol || "",
      name: item.name || "",
      type: item.type || item.instrumentType || "",
      region: item.exchangeShortName || item.exchange || "",
      exchangeShortName: item.exchangeShortName || "",
      currency: item.currency || "",
    }));

    matches = matches.filter((item) => item.symbol && item.name);
    matches = dedupeResults(matches);
    matches = chooseResults(matches, query);

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
