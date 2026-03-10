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
  const num = Number(value);
  if (Number.isNaN(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)} %`;
}

async function fetchQuote(symbol) {
  const url =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;

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
  toolbar.style.marginBottom = "12px";
  toolbar.innerHTML = `<button id="refreshWatchlistBtn">Rafraîchir les cours</button>`;
  watchlistBox.appendChild(toolbar);

  watchlist.forEach((item) => {
    const row = document.createElement("div");
    row.className = "card";

    const priceText = item.price ? `${formatPrice(item.price)}` : "-";
    const percentText = item.changePercent ? formatPercent(item.changePercent) : "-";
    const prevCloseText = item.previousClose ? formatPrice(item.previousClose) : "-";

    row.innerHTML = `
      <div>
        <div class="title">${escapeHtml(item.name)} (${escapeHtml(item.symbol)})</div>
        <div class="meta">${escapeHtml(item.type)} • ${escapeHtml(item.region || "-")}</div>
        <div class="meta">Prix : ${priceText} | Var. jour : ${percentText} | Clôture précédente : ${prevCloseText}</div>
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
    const alreadyAdded = watchlist.some((w) => w.symbol === item.symbol);

    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div>
        <div class="title">${escapeHtml(item.name)} (${escapeHtml(item.symbol)})</div>
        <div class="meta">${escapeHtml(item.type)} • ${escapeHtml(item.region || "-")} • ${escapeHtml(item.currency || "-")}</div>
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

      const exists = watchlist.some((w) => w.symbol === item.symbol);
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
        ...item,
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
    const url =
      `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      resultsBox.innerHTML = "<p>Limite API atteinte pour le moment. Réessaie un peu plus tard.</p>";
      return;
    }

    const matches = (data.bestMatches || []).slice(0, 10).map((item) => ({
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
