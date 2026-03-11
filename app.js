const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("results");
const watchlistBox = document.getElementById("watchlist");

const MARKET_INDEX_CONFIG = [
  { key: "cac40", symbol: "^FCHI", label: "CAC 40" },
  { key: "sp500", symbol: "^GSPC", label: "S&P 500" },
  { key: "eurostoxx50", symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { key: "nasdaq", symbol: "^IXIC", label: "Nasdaq" },
  { key: "brent", symbol: "BZ=F", label: "Pétrole Brent" },
  { key: "gold", symbol: "GC=F", label: "Once d'or" },
  { key: "eurusd", symbol: "EURUSD=X", label: "EUR/USD Spot" },
  { key: "silver", symbol: "SI=F", label: "Silver Continuous Contract" }
];

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
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCompactPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (!Number.isFinite(num)) return "";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatAbsoluteChange(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const sign = num > 0 ? "+" : "";
  return `${sign}${formatCompactPrice(num)}`;
}

function getChangeClass(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (!Number.isFinite(num)) return "neutral";
  if (num > 0) return "positive";
  if (num < 0) return "negative";
  return "neutral";
}

function formatTimestamp() {
  return new Date().toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function valueOrBlank(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "-") return `<span class="watchlist-empty-cell"></span>`;
  return escapeHtml(normalized);
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

function renderSectionHead(title, countLabel) {
  return `
    <div class="section-head">
      <div class="section-head-title">${escapeHtml(title)}</div>
      <div class="section-count">${escapeHtml(countLabel)}</div>
    </div>
  `;
}

function renderEmptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

async function refreshMarketIndices() {
  const tasks = MARKET_INDEX_CONFIG.map(async (indexItem) => {
    const card = document.querySelector(`[data-index-card="${indexItem.key}"]`);
    if (!card) return;

    try {
      const quote = await apiQuote(indexItem.symbol);
      if (!quote || quote.price == null) throw new Error("quote_unavailable");

      const changeClass = getChangeClass(quote.changePercent);
      const absoluteChange = formatAbsoluteChange(quote.change) || "-";
      const percentChange = formatPercent(quote.changePercent) || "-";
      const previousClose = quote.previousClose != null ? formatCompactPrice(quote.previousClose) : "-";

      card.classList.remove("index-loading", "positive", "negative", "neutral");
      card.classList.add(changeClass);
      card.innerHTML = `
        <div class="index-name">${escapeHtml(indexItem.label)}</div>
        <div class="index-value">${formatCompactPrice(quote.price)}</div>
        <div class="index-change ${changeClass}">${absoluteChange} • ${percentChange}</div>
        <div class="index-meta">Clôture précédente : ${previousClose}<br>Mis à jour : ${escapeHtml(formatTimestamp())}</div>
      `;
    } catch {
      card.classList.remove("positive", "negative", "neutral");
      card.classList.add("index-loading");
      card.innerHTML = `
        <div class="index-name">${escapeHtml(indexItem.label)}</div>
        <div class="index-value">Indisponible</div>
        <div class="index-change">-</div>
        <div class="index-meta">La dernière cote n’a pas pu être récupérée.</div>
      `;
    }
  });

  await Promise.all(tasks);
}

async function refreshWatchlist() {
  if (watchlist.length === 0) {
    renderWatchlist();
    return;
  }

  watchlistBox.innerHTML = `
    <div class="watchlist-shell">
      ${renderSectionHead("Ma watchlist", `${watchlist.length} valeur${watchlist.length > 1 ? "s" : ""}`)}
      ${renderEmptyState("Rafraîchissement des cours en cours...")}
    </div>
  `;

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
    watchlistBox.innerHTML = `
      <div class="watchlist-shell">
        ${renderSectionHead("Ma watchlist", "0 valeur")}
        ${renderEmptyState("Ta watchlist est vide pour le moment.")}
      </div>
    `;
    return;
  }

  const rows = watchlist.map((item) => {
    const changeClass = getChangeClass(item.changePercent);
    const priceText = formatPrice(item.price);
    const previousCloseText = formatPrice(item.previousClose);
    const absChangeText = formatAbsoluteChange(item.change);
    const pctChangeText = formatPercent(item.changePercent);

    return `
      <tr>
        <td class="watchlist-name-cell">
          <div class="watchlist-name-main">${escapeHtml(item.name || item.symbol)}</div>
          <div class="watchlist-name-sub">Instrument</div>
        </td>
        <td><span class="watchlist-ticker">${escapeHtml(item.symbol)}</span></td>
        <td><span class="watchlist-badge">${valueOrBlank(item.type)}</span></td>
        <td><span class="watchlist-badge">${valueOrBlank(item.region)}</span></td>
        <td><span class="watchlist-badge">${valueOrBlank(item.currency)}</span></td>
        <td class="align-right">
          <div class="watchlist-price ${changeClass}">${priceText || ""}</div>
          <div class="watchlist-subvalue">Dernière cote</div>
        </td>
        <td class="align-right ${changeClass}">${escapeHtml(absChangeText)}</td>
        <td class="align-right ${changeClass}">${escapeHtml(pctChangeText)}</td>
        <td class="align-right">${escapeHtml(previousCloseText)}</td>
        <td class="align-center"><span class="watchlist-empty-cell"></span></td>
        <td class="align-center"><span class="watchlist-empty-cell"></span></td>
        <td class="align-center"><span class="watchlist-empty-cell"></span></td>
        <td class="align-center"><span class="watchlist-empty-cell"></span></td>
        <td class="align-center"><button class="remove-btn" data-symbol="${escapeHtml(item.symbol)}">Retirer</button></td>
      </tr>
    `;
  }).join("");

  watchlistBox.innerHTML = `
    <div class="watchlist-shell">
      ${renderSectionHead("Ma watchlist", `${watchlist.length} valeur${watchlist.length > 1 ? "s" : ""}`)}
      <div class="toolbar">
        <div class="toolbar-copy">
          <div class="toolbar-title">Vue tableau</div>
          <div class="toolbar-subtitle">Les colonnes encore non alimentées sont laissées vides pour la suite.</div>
        </div>
        <div class="toolbar-actions">
          <button id="refreshWatchlistBtn">Rafraîchir les cours</button>
        </div>
      </div>
      <div class="watchlist-table-wrap">
        <table class="watchlist-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Ticker</th>
              <th>Type</th>
              <th>Marché</th>
              <th>Devise</th>
              <th class="align-right">Prix</th>
              <th class="align-right">Var. jour</th>
              <th class="align-right">Var. %</th>
              <th class="align-right">Clôture préc.</th>
              <th class="align-center">1M</th>
              <th class="align-center">6M</th>
              <th class="align-center">1A</th>
              <th class="align-center">Notes</th>
              <th class="align-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;

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
    resultsBox.innerHTML = `
      ${renderSectionHead("Résultats de recherche", "0 résultat")}
      ${renderEmptyState("Aucun résultat cotable trouvé.")}
    `;
    return;
  }

  const header = document.createElement("div");
  header.innerHTML = renderSectionHead(
    "Résultats de recherche",
    `${items.length} résultat${items.length > 1 ? "s" : ""}`
  );
  resultsBox.appendChild(header.firstElementChild);

  items.forEach((item) => {
    const alreadyAdded = watchlist.some((w) => normalizeText(w.symbol) === normalizeText(item.symbol));
    const row = document.createElement("div");
    row.className = "card";

    const percentText = formatPercent(item.changePercent) || "-";
    const changeClass = getChangeClass(item.changePercent);
    const priceText = formatPrice(item.price) || "-";

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
          <div class="meta-line">Clôture précédente : ${escapeHtml(formatPrice(item.previousClose) || "-")}</div>
        </div>
      </div>
      <div class="actions">
        <button class="add-btn" data-symbol="${escapeHtml(item.symbol)}" ${alreadyAdded ? "disabled" : ""}>
          ${alreadyAdded ? "Déjà ajoutée" : "Ajouter"}
        </button>
      </div>
    `;

    resultsBox.appendChild(row);
  });

  document.querySelectorAll(".add-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((asset) => asset.symbol === button.dataset.symbol);
      if (!item) return;

      const exists = watchlist.some((w) => normalizeText(w.symbol) === normalizeText(item.symbol));
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

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    resultsBox.innerHTML = renderEmptyState("Entre un nom ou un ticker pour lancer la recherche.");
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = "Recherche...";
  resultsBox.innerHTML = `
    ${renderSectionHead("Résultats de recherche", "Analyse en cours")}
    ${renderEmptyState("Recherche des instruments cotables en cours...")}
  `;

  try {
    const items = await apiSearch(query);
    renderResults(items);
  } catch {
    resultsBox.innerHTML = `
      ${renderSectionHead("Résultats de recherche", "Erreur")}
      ${renderEmptyState("La recherche a échoué. Réessaie dans un instant.")}
    `;
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = "Rechercher";
  }
}

searchButton.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSearch();
  }
});

refreshMarketIndices();
renderWatchlist();
