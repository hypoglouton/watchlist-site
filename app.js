const assets = [
  { name: "Microsoft", ticker: "MSFT", type: "Action", market: "US" },
  { name: "Apple", ticker: "AAPL", type: "Action", market: "US" },
  { name: "NVIDIA", ticker: "NVDA", type: "Action", market: "US" },
  { name: "Amazon", ticker: "AMZN", type: "Action", market: "US" },
  { name: "Alphabet", ticker: "GOOGL", type: "Action", market: "US" },
  { name: "Meta Platforms", ticker: "META", type: "Action", market: "US" },
  { name: "Tesla", ticker: "TSLA", type: "Action", market: "US" },
  { name: "ASML", ticker: "ASML", type: "Action", market: "Europe" },
  { name: "LVMH", ticker: "MC", type: "Action", market: "Europe" },
  { name: "Air Liquide", ticker: "AI", type: "Action", market: "Europe" },
  { name: "TotalEnergies", ticker: "TTE", type: "Action", market: "Europe" },
  { name: "L'Oréal", ticker: "OR", type: "Action", market: "Europe" },
  { name: "Amundi MSCI World", ticker: "CW8", type: "ETF", market: "Europe" },
  { name: "iShares Core MSCI World", ticker: "EUNL", type: "ETF", market: "Europe" },
  { name: "SPDR S&P 500 ETF", ticker: "SPY", type: "ETF", market: "US" },
  { name: "Invesco QQQ Trust", ticker: "QQQ", type: "ETF", market: "US" },
  { name: "Vanguard S&P 500", ticker: "VOO", type: "ETF", market: "US" }
];

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("results");
const watchlistBox = document.getElementById("watchlist");

let watchlist = JSON.parse(localStorage.getItem("watchlist")) || [];

function saveWatchlist() {
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

function renderWatchlist() {
  watchlistBox.innerHTML = "";

  if (watchlist.length === 0) {
    watchlistBox.innerHTML = "<p>Aucune valeur dans la watchlist.</p>";
    return;
  }

  watchlist.forEach((item) => {
    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div>
        <div class="title">${item.name} (${item.ticker})</div>
        <div class="meta">${item.type} • ${item.market}</div>
      </div>
      <button class="remove-btn" data-ticker="${item.ticker}">Retirer</button>
    `;

    watchlistBox.appendChild(row);
  });

  document.querySelectorAll(".remove-btn").forEach((button) => {
    button.addEventListener("click", () => {
      watchlist = watchlist.filter((item) => item.ticker !== button.dataset.ticker);
      saveWatchlist();
      renderWatchlist();
    });
  });
}

function renderResults(items) {
  resultsBox.innerHTML = "";

  if (items.length === 0) {
    resultsBox.innerHTML = "<p>Aucun résultat.</p>";
    return;
  }

  items.forEach((item) => {
    const alreadyAdded = watchlist.some((w) => w.ticker === item.ticker);

    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div>
        <div class="title">${item.name} (${item.ticker})</div>
        <div class="meta">${item.type} • ${item.market}</div>
      </div>
      <button class="add-btn" data-ticker="${item.ticker}" ${alreadyAdded ? "disabled" : ""}>
        ${alreadyAdded ? "Déjà ajoutée" : "Ajouter"}
      </button>
    `;

    resultsBox.appendChild(row);
  });

  document.querySelectorAll(".add-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const item = assets.find((asset) => asset.ticker === button.dataset.ticker);
      if (!item) return;

      const exists = watchlist.some((w) => w.ticker === item.ticker);
      if (!exists) {
        watchlist.push(item);
        saveWatchlist();
        renderWatchlist();
        button.textContent = "Déjà ajoutée";
        button.disabled = true;
      }
    });
  });
}

function searchAssets() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    resultsBox.innerHTML = "<p>Entre un nom ou un ticker.</p>";
    return;
  }

  const matches = assets.filter((asset) =>
    asset.name.toLowerCase().includes(query) ||
    asset.ticker.toLowerCase().includes(query)
  );

  renderResults(matches);
}

searchButton.addEventListener("click", searchAssets);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchAssets();
  }
});

renderWatchlist();
