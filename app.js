const API_KEY = "355DCVOBSX0C2X75";

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("results");
const watchlistBox = document.getElementById("watchlist");

let watchlist = JSON.parse(localStorage.getItem("watchlist")) || [];

const SMART_ALIASES = [
  {
    aliases: [
      "ishares physical gold",
      "ishares physical gold etc",
      "ishares gold",
      "physical gold",
      "gold ishares",
      "sgln",
      "igln",
      "egln"
    ],
    candidates: [
      {
        symbol: "EGLN",
        apiSymbol: "EGLN",
        yahooSymbol: "EGLN.L",
        name: "iShares Physical Gold ETC",
        type: "ETC",
        region: "United Kingdom",
        currency: "EUR"
      },
      {
        symbol: "SGLN",
        apiSymbol: "SGLN",
        yahooSymbol: "SGLN.L",
        name: "iShares Physical Gold ETC",
        type: "ETC",
        region: "United Kingdom",
        currency: "USD"
      },
      {
        symbol: "IGLN",
        apiSymbol: "IGLN",
        yahooSymbol: "IGLN.L",
        name: "iShares Physical Gold ETC",
        type: "ETC",
        region: "United Kingdom",
        currency: "USD"
      }
    ]
  }
];

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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeResults(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${normalizeText(item.symbol)}|${normalizeText(item.name)}|${normalizeText(item.region)}|${normalizeText(item.currency)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function chooseResults(items, query) {
  if (!items.length) return [];
  const q = normalizeText(query);

  const scored = [...items].map((item) => {
    let score = 0;
    const symbol = normalizeText(item.symbol);
    const name = normalizeText(item.name);
    const region = normalizeText(item.region);
    const currency = normalizeText(item.currency);
    const etfLike =
      normalizeText(item.type).includes("etf") ||
      normalizeText(item.type).includes("etc") ||
      normalizeText(item.type).includes("etp");

    if (symbol === q) score += 1000;
    if (name === q) score += 900;
    if (symbol.startsWith(q)) score += 200;
    if (name.startsWith(q)) score += 160;
    if (symbol.includes(q)) score += 120;
    if (name.includes(q)) score += 100;
    if (currency === "eur") score += 70;
    if (
      region.includes("france") ||
      region.includes("germany") ||
      region.includes("netherlands") ||
      region.includes("europe") ||
      region.includes("united kingdom")
    ) score += 50;
    if (etfLike) score += 40;

    return { ...item, _score: score };
  }).sort((a, b) => b._score - a._score);

  if (scored.length === 1) return [scored[0]];

  const top = scored[0];
  const second = scored[1];

  if (normalizeText(top.symbol) === q || normalizeText(top.name) === q) {
    return [top];
  }

  if (top._score - second._score >= 180) {
    return [top];
  }

  return scored.slice(0, 4);
}

function findLocalAliasMatches(query) {
  const q = normalizeText(query);

  for (const entry of SMART_ALIASES) {
    const hit = entry.aliases.some((alias) => {
      const a = normalizeText(alias);
      return q === a || q.includes(a) || a.includes(q);
    });

    if (hit) {
      return entry.candidates;
    }
  }

  return [];
}

async function fetchQuoteAlpha(symbol) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.Note) {
    throw new Error("API_LIMIT");
  }

  const quote = data["Global Quote"];
  if (!quote || !quote["01. symbol"] || !quote["05. price"]) {
    return null;
  }

  return {
    source: "alpha",
    symbol: quote["01. symbol"] || symbol,
    price: quote["05. price"] || "",
    changePercent: (quote["10. change percent"] || "").replace("%", "").trim(),
    change: quote["09. change"] || "",
    previousClose: quote["08. previous close"] || ""
  };
}

async function fetchQuoteYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const response = await fetch(url);
  const data = await response.json();

  const result = data?.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta || meta.regularMarketPrice == null) {
    return null;
  }

  const regularMarketPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;

  let change = "";
  let changePercent = "";

  if (regularMarketPrice != null && previousClose != null && previousClose !== 0) {
    const delta = regularMarketPrice - previousClose;
    change = String(delta);
    changePercent = String((delta / previousClose) * 100);
  }

  return {
    source: "yahoo",
    symbol,
    price: String(regularMarketPrice ?? ""),
    changePercent,
    change,
    previousClose: previousClose != null ? String(previousClose) : ""
  };
}

async function fetchQuoteSmart(item) {
  const alphaCandidates = [];
  const yahooCandidates = [];

  if (item.apiSymbol) alphaCandidates.push(item.apiSymbol);
  if (item.symbol && !alphaCandidates.includes(item.symbol)) alphaCandidates.push(item.symbol);

  if (item.yahooSymbol) yahooCandidates.push(item.yahooSymbol);

  for (const candidate of alphaCandidates) {
    try {
      const quote = await fetchQuoteAlpha(candidate);
      if (quote) {
        return {
          ...quote,
          resolvedApiSymbol: candidate,
          resolvedYahooSymbol: item.yahooSymbol || ""
        };
      }
    } catch (error) {
      if (error.message === "API_LIMIT") throw error;
    }
  }

  for (const candidate of yahooCandidates) {
    try {
      const quote = await fetchQuoteYahoo(candidate);
      if (quote) {
        return {
          ...quote,
          resolvedApiSymbol: item.apiSymbol || item.symbol,
          resolvedYahooSymbol: candidate
        };
      }
    } catch (error) {
    }
  }

  return null;
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
      const quote = await fetchQuoteSmart(item);

      refreshed.push({
        ...item,
        apiSymbol: quote?.resolvedApiSymbol || item.apiSymbol || item.symbol,
        yahooSymbol: quote?.resolvedYahooSymbol || item.yahooSymbol || "",
        price: quote?.price || item.price || "",
        changePercent: quote?.changePercent || item.changePercent || "",
        change: quote?.change || item.change || "",
        previousClose: quote?.previousClose || item.previousClose || ""
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
    resultsBox.innerHTML = "<p>Aucun résultat.</p>";
    return;
  }

  items.forEach((item) => {
    const alreadyAdded = watchlist.some((w) => normalizeText(w.symbol) === normalizeText(item.symbol));

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
          <div class="meta-line">${escapeHtml(item.type || "-")} • ${escapeHtml(item.region || "-")} • ${escapeHtml(item.currency || "-")}</div>
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

      const exists = watchlist.some((w) => normalizeText(w.symbol) === normalizeText(item.symbol));
      if (exists) return;

      button.disabled = true;
      button.textContent = "Ajout...";

      let quote = null;

      try {
        quote = await fetchQuoteSmart(item);
      } catch (error) {
        quote = null;
      }

      watchlist.push({
        symbol: item.symbol,
        apiSymbol: quote?.resolvedApiSymbol || item.apiSymbol || item.symbol,
        yahooSymbol: quote?.resolvedYahooSymbol || item.yahooSymbol || "",
        name: item.name,
        type: item.type,
        region: item.region,
        currency: item.currency,
        price: quote?.price || "",
        changePercent: quote?.changePercent || "",
        change: quote?.change || "",
        previousClose: quote?.previousClose || ""
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

  const localMatches = findLocalAliasMatches(query);
  if (localMatches.length > 0) {
    renderResults(chooseResults(dedupeResults(localMatches), query));
    return;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      resultsBox.innerHTML = "<p>Limite API atteinte pour le moment. Réessaie un peu plus tard.</p>";
      return;
    }

    let matches = (data.bestMatches || []).map((item) => ({
      symbol: item["1. symbol"] || "",
      apiSymbol: item["1. symbol"] || "",
      yahooSymbol: "",
      name: item["2. name"] || "",
      type: item["3. type"] || "",
      region: item["4. region"] || "",
      currency: item["8. currency"] || ""
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
