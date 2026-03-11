const API_KEY = "355DCVOBSX0C2X75";

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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLikelyETF(item) {
  const type = normalizeText(item.type);
  const name = normalizeText(item.name);
  return (
    type.includes("etf") ||
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

function isEuropeanRegion(region) {
  const r = normalizeText(region);
  return (
    r.includes("europe") ||
    r.includes("euronext") ||
    r.includes("france") ||
    r.includes("germany") ||
    r.includes("xetra") ||
    r.includes("amsterdam") ||
    r.includes("brussels") ||
    r.includes("milan") ||
    r.includes("madrid") ||
    r.includes("switzerland") ||
    r.includes("italy") ||
    r.includes("netherlands") ||
    r.includes("belgium")
  );
}

function scoreResult(item, query) {
  const q = normalizeText(query);
  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name);
  const region = normalizeText(item.region);
  const currency = normalizeText(item.currency);
  const etf = isLikelyETF(item);
  const europe = isEuropeanRegion(region);

  let score = 0;

  if (symbol === q) score += 1000;
  if (name === q) score += 900;

  if (symbol.startsWith(q)) score += 220;
  if (name.startsWith(q)) score += 180;

  if (symbol.includes(q)) score += 120;
  if (name.includes(q)) score += 100;

  if (europe) score += 80;
  if (currency === "eur") score += 60;

  if (etf && europe && currency === "eur") score += 140;
  else if (etf && europe) score += 110;
  else if (etf) score += 30;

  if (region.includes("united states") || region.includes("us")) score -= 10;

  return score;
}

function dedupeResults(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const symbol = normalizeText(item.symbol);
    const name = normalizeText(item.name);
    const region = normalizeText(item.region);
    const key = `${symbol}|${name}|${region}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function chooseResults(items, query) {
  if (!items.length) return [];

  const sorted = [...items]
    .map((item) => ({ ...item, _score: scoreResult(item, query) }))
    .sort((a, b) => b._score - a._score);

  const top = sorted[0];
  const second = sorted[1];

  if (!second) return [top];

  const queryNorm = normalizeText(query);
  const exactTop =
    normalizeText(top.symbol) === queryNorm ||
    normalizeText(top.name) === queryNorm;

  if (exactTop) return [top];

  if (top._score - second._score >= 180) {
    return [top];
  }

  return sorted.slice(0, 4);
}

async function fetchQuote(symbol) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  const quote = data["Global Quote"];

  if (!quote || !quote["01. symbol"]) {
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
        quote = await fetchQuote(item.symbol);
      } catch (error) {
        quote = null;
      }

      watchlist.push({
        symbol: item.symbol,
        name: item.name,
        type: item.type,
        region: item.region,
        currency: item.currency,
        price: quote?.price || "",
        changePercent: quote?.changePercent || "",
        change: quote?.change || "",
        previousClose: quote?.previousClose || "",
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
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      resultsBox.innerHTML = "<p>Limite API atteinte pour le moment. Réessaie un peu plus tard.</p>";
      return;
    }

    let matches = (data.bestMatches || []).map((item) => ({
      symbol: item["1. symbol"] || "",
      name: item["2. name"] || "",
      type: item["3. type"] || "",
      region: item["4. region"] || "",
      marketOpen: item["5. marketOpen"] || "",
      marketClose: item["6. marketClose"] || "",
      timezone: item["7. timezone"] || "",
      currency: item["8. currency"] || "",
      matchScore: item["9. matchScore"] || "",
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
