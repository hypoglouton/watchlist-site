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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function apiSearch(query) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "search_failed");
  return Array.isArray(data.results) ? data.results : [];
}

async function apiQuote(symbol) {
  const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
  const data = await response.json();
  if (!response.ok) return null;
  return data;
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
      const quote = await apiQuote(item.symbol);

      refreshed.push({
        ...item,
        name: quote?.name || item.name || item.symbol,
        type: quote?.type || item.type || "",
        region: quote?.region || item.region || "",
        currency: quote?.currency || item.currency || "",
        price: quote?.price ?? item.price ?? "",
        changePercent: quote?.changePercent ?? item.changePercent ?? "",
        change: quote?.change ?? item.change ?? "",
        previousClose: quote?.previousClose ?? item.previousClose ?? ""
      });
    } catch {
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

    const priceText = item.price !== "" ? formatPrice(item.price) : "-";
    const percentText = item.changePercent !== "" ? formatPercent(item.changePercent) : "-";
    const prevCloseText = item.previousClose !== "" ? formatPrice(item.previousClose) : "-";
    const changeClass = getChangeClass(item.changePercent);

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(item.name || item.symbol)}</div>
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
    const alreadyAdded = watchlist.some(
      (w) => normalizeText(w.symbol) === normalizeText(item.symbol)
    );

    const row = document.createElement("div");
    row.className = "card";

    const percentText = item.changePercent !== "" ? formatPercent(item.changePercent) : "-";
    const changeClass = getChangeClass(item.changePercent);

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(item.name || item.symbol)}</div>
            <div class="ticker">${escapeHtml(item.symbol)}</div>
          </div>

          <div class="price-box">
            <div class="price ${changeClass}">${formatPrice(item.price)}</div>
            <div class="change ${changeClass}">${percentText}</div>
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

      const exists = watchlist.some(
        (w) => normalizeText(w.symbol) === normalizeText(item.symbol)
      );
      if (exists) return;

      button.disabled = true;
      button.textContent = "Ajout...";

      watchlist.push({
        symbol: item.symbol,
        name: item.name || item.symbol,
        type: item.type || "",
        region: item.region || "",
        currency: item.currency || "",
        price: item.price ?? "",
        changePercent: item.changePercent ?? "",
        change: item.change ?? "",
        previousClose: item.previousClose ?? ""
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
    const results = await apiSearch(query);
    renderResults(results);
  } catch {
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
