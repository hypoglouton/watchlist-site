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

function getCountLabel(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`;
}

function createEmptyState(title, text) {
  return `
    <div class="empty-state">
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

function createInfoState(title, text) {
  return `
    <div class="info-state">
      <div class="info-state-title">${escapeHtml(title)}</div>
      <div class="info-state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

function createSectionTop(kicker, title, meta = "") {
  return `
    <div class="list-head">
      <div>
        <div class="list-kicker">${escapeHtml(kicker)}</div>
        <div class="list-title">${escapeHtml(title)}</div>
      </div>
      ${meta ? `<div class="list-meta">${escapeHtml(meta)}</div>` : ""}
    </div>
  `;
}

function createAssetCard(item, actionLabel, actionClass, disabled = false, extraMetaHtml = "") {
  const priceText = item.price !== "" ? formatPrice(item.price) : "-";
  const percentText = item.changePercent !== "" ? formatPercent(item.changePercent) : "-";
  const prevCloseText = item.previousClose !== "" ? formatPrice(item.previousClose) : "-";
  const changeClass = getChangeClass(item.changePercent);
  const disabledAttr = disabled ? "disabled" : "";

  return `
    <div class="card">
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
          ${item.previousClose !== undefined ? `<div class="meta-line">Clôture précédente : ${prevCloseText}</div>` : ""}
          ${extraMetaHtml}
        </div>
      </div>

      <div class="actions">
        <button class="${actionClass}" data-symbol="${escapeHtml(item.symbol)}" ${disabledAttr}>${escapeHtml(actionLabel)}</button>
      </div>
    </div>
  `;
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
  if (watchlist.length === 0) {
    renderWatchlist();
    return;
  }

  watchlistBox.innerHTML = `
    ${createSectionTop("Watchlist", "Mise à jour des cours", "Actualisation en cours")}
    ${createInfoState("Chargement en cours", "Les derniers cours sont en train d’être récupérés.")}
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
    watchlistBox.innerHTML = createEmptyState(
      "Watchlist vide",
      "Ajoute une première valeur depuis les résultats de recherche pour commencer ton suivi."
    );
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `
    ${createSectionTop("Watchlist", "Valeurs suivies", getCountLabel(watchlist.length, "ligne", "lignes"))}
    <div class="toolbar-actions">
      <button id="refreshWatchlistBtn">Rafraîchir les cours</button>
    </div>
  `;
  watchlistBox.appendChild(toolbar);

  watchlist.forEach((item) => {
    const row = document.createElement("div");
    row.innerHTML = createAssetCard(item, "Retirer", "remove-btn", false);
    watchlistBox.appendChild(row.firstElementChild);
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

function renderResults(items, query = "") {
  resultsBox.innerHTML = "";

  if (!items.length) {
    resultsBox.innerHTML = createEmptyState(
      "Aucun résultat cotable",
      query ? `Aucun instrument exploitable trouvé pour “${query}”.` : "Aucun instrument exploitable trouvé."
    );
    return;
  }

  const header = document.createElement("div");
  header.className = "toolbar";
  header.innerHTML = createSectionTop(
    "Résultats",
    query ? `Recherche : ${query}` : "Recherche",
    getCountLabel(items.length, "résultat", "résultats")
  );
  resultsBox.appendChild(header);

  items.forEach((item) => {
    const alreadyAdded = watchlist.some(
      (w) => normalizeText(w.symbol) === normalizeText(item.symbol)
    );

    const row = document.createElement("div");
    row.innerHTML = createAssetCard(
      item,
      alreadyAdded ? "Déjà ajoutée" : "Ajouter",
      "add-btn",
      alreadyAdded,
      ""
    );
    resultsBox.appendChild(row.firstElementChild);
  });

  document.querySelectorAll(".add-btn").forEach((button) => {
    button.addEventListener("click", () => {
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
    resultsBox.innerHTML = createInfoState(
      "Recherche incomplète",
      "Entre un nom ou un ticker pour lancer la recherche."
    );
    return;
  }

  resultsBox.innerHTML = `
    ${createSectionTop("Résultats", `Recherche : ${query}`, "Interrogation en cours")}
    ${createInfoState("Recherche en cours", "Les instruments les plus pertinents sont en train d’être récupérés.")}
  `;

  try {
    const results = await apiSearch(query);
    renderResults(results, query);
  } catch {
    resultsBox.innerHTML = createEmptyState(
      "Erreur de recherche",
      "La recherche a échoué. Vérifie l’API ou réessaie dans un instant."
    );
  }
}

searchButton.addEventListener("click", searchAssets);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchAssets();
  }
});

renderWatchlist();
