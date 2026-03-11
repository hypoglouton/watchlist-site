const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("results");
const watchlistBox = document.getElementById("watchlist");

const MARKET_ORDER = [
  "^FCHI",
  "^GSPC",
  "^STOXX50E",
  "^IXIC",
  "BZ=F",
  "GC=F",
  "EURUSD=X",
  "SI=F"
];

const MARKET_CARD_KEYS = {
  "^FCHI": "cac40",
  "^GSPC": "sp500",
  "^STOXX50E": "eurostoxx50",
  "^IXIC": "nasdaq",
  "BZ=F": "brent",
  "GC=F": "gold",
  "EURUSD=X": "eurusd",
  "SI=F": "silver"
};

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
    .replace(/[^a-z0-9.=^]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPrice(value) {
  return formatNumber(value, 2);
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
  return `${sign}${formatPrice(num)}`;
}

function getChangeClass(value) {
  const num = Number(String(value ?? "").replace("%", "").trim());
  if (!Number.isFinite(num)) return "neutral";
  if (num > 0) return "positive";
  if (num < 0) return "negative";
  return "neutral";
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

function displayCell(value, formatter = null) {
  if (value === null || value === undefined || value === "") {
    return '<span class="cell-empty"></span>';
  }
  const output = formatter ? formatter(value) : String(value);
  return output ? escapeHtml(output) : '<span class="cell-empty"></span>';
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

async function apiMarket() {
  const response = await fetch(`/api/market?symbols=${encodeURIComponent(MARKET_ORDER.join(","))}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "market_failed");
  return data;
}

async function refreshMarketIndices() {
  try {
    const data = await apiMarket();
    const bySymbol = data?.results || {};

    MARKET_ORDER.forEach((symbol) => {
      const cardKey = MARKET_CARD_KEYS[symbol];
      const card = document.querySelector(`[data-index-card="${cardKey}"]`);
      if (!card) return;

      const item = bySymbol[symbol];
      if (!item || item.price === null || item.price === undefined) {
        card.querySelector(".index-value").textContent = "Indisponible";
        card.querySelector(".index-change").textContent = "-";
        card.querySelector(".index-change").className = "index-change neutral";
        card.querySelector(".index-meta").textContent = "La dernière cote n’a pas pu être récupérée.";
        return;
      }

      const changeClass = getChangeClass(item.changePercent);
      const pct = formatPercent(item.changePercent) || "-";
      const abs = formatAbsoluteChange(item.change) || "-";
      const prev = formatPrice(item.previousClose) || "-";

      card.querySelector(".index-value").textContent = formatPrice(item.price);
      card.querySelector(".index-change").textContent = `${abs} • ${pct}`;
      card.querySelector(".index-change").className = `index-change ${changeClass}`;
      card.querySelector(".index-meta").textContent = `Clôture précédente : ${prev}`;
    });
  } catch {
    document.querySelectorAll("[data-index-card]").forEach((card) => {
      card.querySelector(".index-value").textContent = "Indisponible";
      card.querySelector(".index-change").textContent = "-";
      card.querySelector(".index-change").className = "index-change neutral";
      card.querySelector(".index-meta").textContent = "Erreur de récupération des marchés.";
    });
  }
}

async function refreshWatchlist() {
  if (!watchlist.length) {
    renderWatchlist();
    return;
  }

  const updated = [];
  for (const item of watchlist) {
    const fresh = await apiQuote(item.symbol);
    updated.push({
      ...item,
      ...(fresh || {})
    });
  }

  watchlist = updated;
  saveWatchlist();
  renderWatchlist();
}

function renderWatchlist() {
  watchlistBox.innerHTML = "";

  if (!watchlist.length) {
    watchlistBox.innerHTML = renderEmptyState("Ta watchlist est vide pour le moment.");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    ${renderSectionHead("Ma watchlist", `${watchlist.length} valeur${watchlist.length > 1 ? "s" : ""}`)}
    <div class="table-toolbar">
      <div class="section-head-title">Cours de la watchlist</div>
      <button id="refreshWatchlistBtn" class="small-btn">Rafraîchir les cours</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Ticker</th>
            <th>Type</th>
            <th>Marché</th>
            <th>Devise</th>
            <th class="num">Prix</th>
            <th class="num">Var %</th>
            <th class="num">Var jour</th>
            <th class="num">Clôture préc.</th>
            <th class="num">1M</th>
            <th class="num">6M</th>
            <th class="num">1A</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${watchlist.map((item) => {
            const priceClass = getChangeClass(item.changePercent);
            const pctClass = getChangeClass(item.changePercent);
            const perf1mClass = getChangeClass(item.perf1m);
            const perf6mClass = getChangeClass(item.perf6m);
            const perf1yClass = getChangeClass(item.perf1y);
            return `
              <tr>
                <td class="wl-name">
                  <div class="wl-name-main">${escapeHtml(item.name || item.symbol)}</div>
                  <div class="wl-name-sub"></div>
                </td>
                <td><span class="ticker-chip">${escapeHtml(item.symbol)}</span></td>
                <td>${displayCell(item.type)}</td>
                <td>${displayCell(item.region)}</td>
                <td>${displayCell(item.currency)}</td>
                <td class="num cell-price ${priceClass}">${displayCell(item.price, formatPrice)}</td>
                <td class="num ${pctClass}">${displayCell(item.changePercent, formatPercent)}</td>
                <td class="num ${pctClass}">${displayCell(item.change, formatAbsoluteChange)}</td>
                <td class="num">${displayCell(item.previousClose, formatPrice)}</td>
                <td class="num ${perf1mClass}">${displayCell(item.perf1m, formatPercent)}</td>
                <td class="num ${perf6mClass}">${displayCell(item.perf6m, formatPercent)}</td>
                <td class="num ${perf1yClass}">${displayCell(item.perf1y, formatPercent)}</td>
                <td><button class="remove-btn small-btn" data-symbol="${escapeHtml(item.symbol)}">Retirer</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  watchlistBox.appendChild(wrapper);

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

    const percentText = item.changePercent !== "" ? formatPercent(item.changePercent) : "-";
    const changeText = item.change !== "" ? formatAbsoluteChange(item.change) : "-";
    const changeClass = getChangeClass(item.changePercent);

    row.innerHTML = `
      <div class="left">
        <div class="top-line">
          <div class="identity">
            <div class="title">${escapeHtml(item.name || item.symbol)}</div>
            <div class="ticker">${escapeHtml(item.symbol)}</div>
          </div>

          <div class="price-box">
            <div class="price ${changeClass}">${formatPrice(item.price) || "-"}</div>
            <div class="change ${changeClass}">${percentText || "-"}</div>
          </div>
        </div>

        <div class="meta">
          <div class="meta-line">${escapeHtml(item.type || "-")} • ${escapeHtml(item.region || "-")} • ${escapeHtml(item.currency || "-")}</div>
          <div class="meta-line">Variation jour : ${changeText || "-"}</div>
          <div class="meta-line">Clôture précédente : ${item.previousClose !== "" ? formatPrice(item.previousClose) : "-"}</div>
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
    button.addEventListener("click", async () => {
      const item = items.find((asset) => asset.symbol === button.dataset.symbol);
      if (!item) return;

      const exists = watchlist.some((asset) => normalizeText(asset.symbol) === normalizeText(item.symbol));
      if (exists) return;

      button.disabled = true;
      button.textContent = "Ajout...";

      const fresh = await apiQuote(item.symbol);

      watchlist.push({
        symbol: item.symbol,
        name: item.name || item.symbol,
        type: fresh?.type || item.type || "",
        region: fresh?.region || item.region || "",
        currency: fresh?.currency || item.currency || "",
        price: fresh?.price ?? item.price ?? "",
        changePercent: fresh?.changePercent ?? item.changePercent ?? "",
        change: fresh?.change ?? item.change ?? "",
        previousClose: fresh?.previousClose ?? item.previousClose ?? "",
        perf1m: fresh?.perf1m ?? "",
        perf6m: fresh?.perf6m ?? "",
        perf1y: fresh?.perf1y ?? ""
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
  if (event.key === "Enter") handleSearch();
});

refreshMarketIndices();
renderWatchlist();
