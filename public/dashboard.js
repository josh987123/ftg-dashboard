/* ============================================================
   FTG DASHBOARD — COMPLETE RESPONSIVE SCRIPT (PART 1 OF 3)
============================================================ */

/* ------------------------------------------------------------
   MOBILE SIDEBAR NAVIGATION
------------------------------------------------------------ */
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const mobileBtn = document.getElementById("mobileMenuButton");

mobileBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.remove("hidden");
});

overlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
});

/* ------------------------------------------------------------
   NAVIGATION LINKS (DESKTOP + MOBILE)
------------------------------------------------------------ */
const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".dashboard-section");

navItems.forEach(item => {
  item.addEventListener("click", () => {
    // Remove old states
    navItems.forEach(i => i.classList.remove("active"));
    sections.forEach(s => s.classList.remove("visible"));

    // Activate clicked
    item.classList.add("active");
    const id = item.dataset.section;
    const section = document.getElementById(id);
    if (section) section.classList.add("visible");

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("open");
      overlay.classList.add("hidden");
    }

    // Section-specific loaders
    if (id === "financials") loadFinancialCharts();
    if (id === "revenue") initRevenueModule();
  });
});

/* ------------------------------------------------------------
   EXECUTIVE OVERVIEW (STATIC KPI CARDS)
------------------------------------------------------------ */
document.getElementById("currentUser").innerText =
  "Logged in as: FTG Internal Access";

function loadOverviewKPIs() {
  const container = document.getElementById("overviewCards");
  if (!container) return;

  const KPIs = [
    { title: "Total Revenue (YTD)", value: "$45.2M" },
    { title: "Open Projects", value: "18" },
    { title: "AP Outstanding", value: "$1.9M" },
    { title: "AR Outstanding", value: "$2.3M" },
    { title: "Retention Held", value: "$780k" }
  ];

  container.innerHTML = KPIs
    .map(k => `
      <div class="card">
        <div class="card-title">${k.title}</div>
        <div class="card-value">${k.value}</div>
      </div>
    `)
    .join("");
}

loadOverviewKPIs();

/* ============================================================
   FINANCIALS SECTION (STATIC CHARTS)
============================================================ */
async function loadFinancialCharts() {
  try {
    const response = await fetch("./data/financials.json");
    const data = await response.json();

    const months = ["Jan","Feb","Mar","Apr","May","Jun"];

    renderFinancialBar(
      "revenueChart",
      "Monthly Revenue",
      months,
      data.revenue["2023"].slice(0, 6)
    );

    renderFinancialBar(
      "arChart",
      "A/R Outstanding",
      months,
      data.accounts_receivable["2023"].slice(0, 6)
    );

    renderFinancialBar(
      "apChart",
      "A/P Outstanding",
      months,
      data.accounts_payable["2023"].slice(0, 6)
    );

  } catch (err) {
    console.error("Financial chart load error:", err);
  }
}

/* Utility: subtle gradient generator */
function makeGradient(canvas, base) {
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (base === "#3b82f6") {
    g.addColorStop(0, "#60a5fa");
    g.addColorStop(1, "#1d4ed8");
  } else if (base === "#ef4444") {
    g.addColorStop(0, "#f87171");
    g.addColorStop(1, "#b91c1c");
  } else {
    g.addColorStop(0, base);
    g.addColorStop(1, base);
  }
  return g;
}

/* Utility renderer for Financials section */
function renderFinancialBar(id, label, labels, values) {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  const gradient = makeGradient(ctx, "#3b82f6");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: gradient
        }
      ]
    },
    options: {
      responsive: true,
      aspectRatio: 1.8,
      scales: {
        y: {
          ticks: {
            callback: v => "$" + v.toLocaleString()
          }
        }
      }
    }
  });
}

/* ============================================================
   REVENUE VIEW — UI INITIALIZATION
============================================================ */

let revenueDataCache = null;
let revChartInstance = null;

/* ------------------------------------------------------------
   INIT MODULE
------------------------------------------------------------ */
async function initRevenueModule() {
  try {
    // Load JSON only once
    if (!revenueDataCache) {
      const response = await fetch("./data/financials.json");
      revenueDataCache = await response.json();
    }

    setupRevenueUI(revenueDataCache);
    updateRevenueView(revenueDataCache);

  } catch (err) {
    console.error("Revenue module error:", err);
  }
}

/* ------------------------------------------------------------
   UI SETUP: YEAR DROPDOWN, RANGE SLIDERS, VIEW SWITCHING
------------------------------------------------------------ */
function setupRevenueUI(data) {
  const years = Object.keys(data.revenue)
    .map(Number)
    .sort((a, b) => a - b);

  /* ------------------ YEAR DROPDOWN ------------------ */
  const yearSelect = document.getElementById("revYear");
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = Math.max(...years);

  /* ------------------ SLIDER SETUP ------------------ */
  const s = document.getElementById("revRangeStart");
  const e = document.getElementById("revRangeEnd");

  s.min = e.min = years[0];
  s.max = e.max = years[years.length - 1];

  s.value = years[0];
  e.value = years[years.length - 1];

  document.getElementById("revRangeStartLabel").innerText = s.value;
  document.getElementById("revRangeEndLabel").innerText = e.value;

  // Make sure start ≤ end
  s.oninput = () => {
    if (+s.value > +e.value) s.value = e.value;
    document.getElementById("revRangeStartLabel").innerText = s.value;
  };

  e.oninput = () => {
    if (+e.value < +s.value) e.value = s.value;
    document.getElementById("revRangeEndLabel").innerText = e.value;
  };

  /* ------------------ VIEW SWITCHER ------------------ */
  document.getElementById("revViewType").onchange = () => {
    const view = document.getElementById("revViewType").value;

    const compareWrap = document.getElementById("revCompareWrapper");
    const yearWrap = document.getElementById("revYearWrapper");
    const rangeWrap = document.getElementById("revRangeWrapper");

    if (view === "annual") {
      compareWrap.style.display = "none";
      yearWrap.style.display = "none";
      rangeWrap.classList.remove("hidden");
    } else {
      compareWrap.style.display = "flex";
      yearWrap.style.display = "flex";
      rangeWrap.classList.add("hidden");
    }
  };

  /* ------------------ UPDATE BUTTON ------------------ */
  document.getElementById("revUpdateBtn").onclick = () =>
    updateRevenueView(data);
}

/* ============================================================
   REVENUE VIEW — MAIN UPDATE ENGINE
============================================================ */

function updateRevenueView(data) {
  const view = document.getElementById("revViewType").value;
  const compare = document.getElementById("revCompare").checked;
  const year = parseInt(document.getElementById("revYear").value);

  let labels = [];
  let datasets = [];

  /* ============================================================
     MONTHLY VIEW
  ============================================================= */
  if (view === "monthly") {
    labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const current = data.revenue[year];
    const prior = data.revenue[year - 1];

    const ctx = document.getElementById("revChart");
    const gradBlue = makeGradient(ctx, "#3b82f6");
    const gradRed  = makeGradient(ctx, "#ef4444");

    // Prior year FIRST (left)
    if (compare && prior) {
      datasets.push({
        label: `${year - 1}`,
        data: prior,
        backgroundColor: gradRed
      });
    }

    // Current year SECOND (right)
    datasets.push({
      label: `${year}`,
      data: current,
      backgroundColor: gradBlue
    });

    setRevenueTitle(`Monthly – ${year}`);
  }

  /* ============================================================
     QUARTERLY VIEW
  ============================================================= */
  else if (view === "quarterly") {
    labels = ["Q1","Q2","Q3","Q4"];

    const months = data.revenue[year];
    const sumQ = q => months.slice((q - 1) * 3, q * 3).reduce((a,b) => a + b, 0);
    const currentQ = [sumQ(1), sumQ(2), sumQ(3), sumQ(4)];

    const ctx = document.getElementById("revChart");
    const gradBlue = makeGradient(ctx, "#3b82f6");
    const gradRed  = makeGradient(ctx, "#ef4444");

    if (compare && data.revenue[year - 1]) {
      const pm = data.revenue[year - 1];
      const sumPQ = q => pm.slice((q - 1) * 3, q * 3).reduce((a,b) => a + b, 0);

      const priorQ = [sumPQ(1), sumPQ(2), sumPQ(3), sumPQ(4)];

      // Prior year FIRST
      datasets.push({
        label: `${year - 1}`,
        data: priorQ,
        backgroundColor: gradRed
      });
    }

    // Current year SECOND
    datasets.push({
      label: `${year}`,
      data: currentQ,
      backgroundColor: gradBlue
    });

    setRevenueTitle(`Quarterly – ${year}`);
  }

  /* ============================================================
     ANNUAL VIEW
  ============================================================= */
  else if (view === "annual") {
    const start = +document.getElementById("revRangeStart").value;
    const end   = +document.getElementById("revRangeEnd").value;

    labels = [];
    const ctx = document.getElementById("revChart");
    const gradBlue = makeGradient(ctx, "#3b82f6");

    const annualTotals = [];
    for (let y = start; y <= end; y++) {
      labels.push(y.toString());
      const total = data.revenue[y].reduce((a,b) => a + b, 0);
      annualTotals.push(total);
    }

    datasets = [
      {
        label: "Annual Revenue",
        data: annualTotals,
        backgroundColor: gradBlue
      }
    ];

    setRevenueTitle(`Annual – ${start} to ${end}`);
  }

  /* ============================================================
     APPLY UPDATES
  ============================================================= */
  renderRevenueChart(labels, datasets);
  renderRevenueTable(labels, datasets);
  updateTimestamp();
}

/* ------------------------------------------------------------
   TITLE + TIMESTAMP
------------------------------------------------------------ */
function setRevenueTitle(sub) {
  document.getElementById("revChartTitleLine1").innerText = "FTG Builders Revenue";
  document.getElementById("revChartTitleLine2").innerText = sub;
}

function updateTimestamp() {
  const now = new Date();
  const t = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  document.getElementById("revChartUpdated").innerText = `Updated: ${t}`;
}

/* ------------------------------------------------------------
   CHART RENDERING (GRADIENT BARS + RESPONSIVE)
------------------------------------------------------------ */
function renderRevenueChart(labels, datasets) {
  const ctx = document.getElementById("revChart");
  if (revChartInstance) revChartInstance.destroy();

  revChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      aspectRatio: 2.0,
      plugins: {
        legend: { position: "bottom" }
      },
      scales: {
        x: {
          ticks: {
            padding: 10,
            font: { size: 11 }
          },
          grid: {
            drawOnChartArea: false
          }
        },
        y: {
          ticks: {
            callback: v => "$" + v.toLocaleString()
          }
        }
      }
    }
  });
}

/* ------------------------------------------------------------
   TABLE RENDERING
------------------------------------------------------------ */
function renderRevenueTable(labels, datasets) {
  const head = document.getElementById("revTableHead");
  const body = document.getElementById("revTableBody");

  head.innerHTML = "";
  body.innerHTML = "";

  // header
  let header = "<tr><th>Period</th>";
  datasets.forEach(ds => {
    header += `<th>${ds.label}</th>`;
  });
  header += "</tr>";
  head.innerHTML = header;

  // rows
  labels.forEach((lbl, i) => {
    let row = `<tr><td>${lbl}</td>`;
    datasets.forEach(ds => {
      const v = ds.data[i] || 0;
      row += `<td>$${v.toLocaleString()}</td>`;
    });
    row += "</tr>";
    body.innerHTML += row;
  });
}

/* ------------------------------------------------------------
   PLACEHOLDER CONTENT
------------------------------------------------------------ */
document.getElementById("projectsContent").innerText =
  "Project data loads here.";

document.getElementById("operationsContent").innerText =
  "Operations metrics load here.";

document.getElementById("reportsContent").innerText =
  "Reports will appear here.";



