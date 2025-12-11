/* ============================================================
   FTG DASHBOARD — COMPLETE RESPONSIVE SCRIPT (PART 1 OF 3)
============================================================ */

/* ------------------------------------------------------------
   PASSWORD PROTECTION
------------------------------------------------------------ */
const SITE_PASSWORD = "Ftgb2025$";

function initAuth() {
  const loginScreen = document.getElementById("loginScreen");
  const loginBtn = document.getElementById("loginBtn");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");
  
  if (!loginScreen || !loginBtn || !loginPassword) {
    console.error("Login elements not found");
    return;
  }
  
  const isAuthenticated = localStorage.getItem("ftg_authenticated");
  
  if (isAuthenticated === "true") {
    loginScreen.classList.add("hidden");
  }
  
  function attemptLogin() {
    const password = loginPassword.value;
    console.log("Login attempt with password length:", password.length);
    
    if (password === SITE_PASSWORD) {
      localStorage.setItem("ftg_authenticated", "true");
      loginScreen.classList.add("hidden");
      if (loginError) loginError.textContent = "";
      console.log("Login successful");
    } else {
      if (loginError) loginError.textContent = "Incorrect password. Please try again.";
      console.log("Login failed - password mismatch");
    }
  }
  
  loginBtn.onclick = attemptLogin;
  
  loginPassword.onkeypress = function(e) {
    if (e.key === "Enter") attemptLogin();
  };
  
  if (logoutBtn) {
    logoutBtn.onclick = function() {
      localStorage.removeItem("ftg_authenticated");
      loginScreen.classList.remove("hidden");
    };
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initAuth();
  initSidebar();
  initNavigation();
  initConfigPanels();
});

function initConfigPanels() {
  document.querySelectorAll(".config-header").forEach(header => {
    header.addEventListener("click", () => {
      const targetId = header.dataset.target;
      const body = document.getElementById(targetId);
      if (body) {
        body.classList.toggle("collapsed");
        header.classList.toggle("collapsed");
      }
    });
  });
}

function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const mobileBtn = document.getElementById("mobileMenuButton");

  if (mobileBtn) {
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.remove("hidden");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.add("hidden");
    });
  }
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".dashboard-section");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

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
      if (window.innerWidth <= 768 && sidebar && overlay) {
        sidebar.classList.remove("open");
        overlay.classList.add("hidden");
      }

      // Section-specific loaders
      if (id === "financials") loadFinancialCharts();
      if (id === "revenue") initRevenueModule();
      if (id === "accounts") initAccountModule();
      if (id === "incomeStatement") loadIncomeStatement();
    });
  });
}

/* ------------------------------------------------------------
   EXECUTIVE OVERVIEW (STATIC KPI CARDS)
------------------------------------------------------------ */
document.getElementById("currentUser").innerText = "";

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
    const response = await fetch("https://ftg-dashboard.netlify.app/data/financials.json");

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

/* Utility: subtle gradient generator with solid color fallback */
function makeGradient(canvas, base) {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return base;
    
    const height = canvas.clientHeight || canvas.offsetHeight || 300;
    if (height <= 0) return base;
    
    const g = ctx.createLinearGradient(0, 0, 0, height);
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
  } catch (err) {
    console.error("Gradient error:", err);
    return base;
  }
}

/* Utility: calculate linear regression trendline */
function calculateTrendline(data) {
  const n = data.length;
  if (n === 0) return [];
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return data.map((_, i) => slope * i + intercept);
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
let currentTableData = { labels: [], datasets: [] };

/* ------------------------------------------------------------
   INIT MODULE
------------------------------------------------------------ */
async function initRevenueModule() {
  const spinner = document.getElementById("revLoadingSpinner");
  
  try {
    spinner.classList.remove("hidden");
    
    if (!revenueDataCache) {
      const response = await fetch("https://ftg-dashboard.netlify.app/data/financials.json");
      revenueDataCache = await response.json();
    }

    setupRevenueUI(revenueDataCache);
    setupExportButtons();
    
    spinner.classList.add("hidden");
    updateRevenueView(revenueDataCache);

  } catch (err) {
    console.error("Revenue module error:", err);
    spinner.classList.add("hidden");
  }
}

/* ------------------------------------------------------------
   EXPORT DROPDOWN & FUNCTIONALITY
------------------------------------------------------------ */
function setupExportButtons() {
  const dropdown = document.getElementById("exportDropdownMenu");
  const dropdownBtn = document.getElementById("exportDropdownBtn");
  
  // Toggle dropdown
  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-dropdown")) {
      dropdown.classList.add("hidden");
    }
  });
  
  // Export button handlers
  document.getElementById("exportPrintBtn").onclick = () => {
    dropdown.classList.add("hidden");
    window.print();
  };
  
  document.getElementById("exportPdfBtn").onclick = () => {
    dropdown.classList.add("hidden");
    exportToPdf();
  };
  
  document.getElementById("exportCsvBtn").onclick = () => {
    dropdown.classList.add("hidden");
    exportToCsv();
  };
}

function exportToCsv() {
  const { labels, datasets } = currentTableData;
  if (!labels.length) return alert("No data to export");
  
  let csv = "Period," + datasets.map(ds => ds.label).join(",") + "\n";
  
  labels.forEach((lbl, i) => {
    let row = lbl;
    datasets.forEach(ds => {
      row += "," + (ds.data[i] || 0);
    });
    csv += row + "\n";
  });
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ftg_revenue_" + new Date().toISOString().split("T")[0] + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportToPdf() {
  const { labels, datasets } = currentTableData;
  if (!labels.length) return alert("No data to export");
  
  const view = document.getElementById("revViewType").value;
  const year = document.getElementById("revYear").value;
  
  let html = `
    <html>
    <head>
      <title>FTG Revenue Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        h1 { color: #1f2937; }
        h2 { color: #6b7280; font-weight: normal; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #d1d5db; padding: 12px; text-align: left; }
        th { background: #f3f4f6; }
        .positive { color: #10b981; }
        .negative { color: #ef4444; }
        .footer { margin-top: 40px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>FTG Builders Revenue Report</h1>
      <h2>${view.charAt(0).toUpperCase() + view.slice(1)} View – ${year}</h2>
      <table>
        <tr><th>Period</th>${datasets.map(ds => `<th>${ds.label}</th>`).join("")}</tr>
  `;
  
  labels.forEach((lbl, i) => {
    html += `<tr><td>${lbl}</td>`;
    datasets.forEach(ds => {
      const v = ds.data[i] || 0;
      html += `<td>$${v.toLocaleString()}</td>`;
    });
    html += "</tr>";
  });
  
  html += `
      </table>
      <div class="footer">Generated on ${new Date().toLocaleDateString()}</div>
    </body>
    </html>
  `;
  
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
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
    const excludeLabel = document.getElementById("revExcludeLabel");

    if (view === "annual") {
      compareWrap.style.display = "none";
      yearWrap.style.display = "none";
      rangeWrap.classList.remove("hidden");
      excludeLabel.textContent = "Exclude Current Year";
    } else if (view === "quarterly") {
      compareWrap.style.display = "flex";
      yearWrap.style.display = "flex";
      rangeWrap.classList.add("hidden");
      excludeLabel.textContent = "Exclude Current Quarter";
    } else {
      compareWrap.style.display = "flex";
      yearWrap.style.display = "flex";
      rangeWrap.classList.add("hidden");
      excludeLabel.textContent = "Exclude Current Month";
    }
    
    // Auto-update chart when view changes
    updateRevenueView(data);
  };
  
  // Also update when year changes
  document.getElementById("revYear").onchange = () => {
    updateRevenueView(data);
  };
  
  // Update when compare checkbox changes
  document.getElementById("revCompare").onchange = () => {
    updateRevenueView(data);
  };
  
  // Update when trendline checkbox changes  
  document.getElementById("revTrendline").onchange = () => {
    updateRevenueView(data);
  };
  document.getElementById("revExcludeCurrent").onchange = () => {
    updateRevenueView(data);
  };
  
  document.getElementById("revRangeStart").oninput = () => {
    const start = parseInt(document.getElementById("revRangeStart").value);
    const end = parseInt(document.getElementById("revRangeEnd").value);
    if (start > end) document.getElementById("revRangeEnd").value = start;
    document.getElementById("revRangeStartLabel").textContent = start;
    document.getElementById("revRangeEndLabel").textContent = document.getElementById("revRangeEnd").value;
    updateRevenueView(data);
  };
  
  document.getElementById("revRangeEnd").oninput = () => {
    const start = parseInt(document.getElementById("revRangeStart").value);
    const end = parseInt(document.getElementById("revRangeEnd").value);
    if (end < start) document.getElementById("revRangeStart").value = end;
    document.getElementById("revRangeStartLabel").textContent = document.getElementById("revRangeStart").value;
    document.getElementById("revRangeEndLabel").textContent = end;
    updateRevenueView(data);
  };
}

/* ============================================================
   REVENUE VIEW — MAIN UPDATE ENGINE
============================================================ */

// Helper: flip negative values to positive for display
function toPositive(arr) {
  return (arr || []).map(v => Math.abs(v));
}

function formatTileValue(val) {
  const absVal = Math.abs(val);
  if (absVal >= 1000000) {
    return "$" + (val / 1000000).toFixed(1) + "M";
  } else if (absVal >= 1000) {
    return "$" + (val / 1000).toFixed(0) + "K";
  }
  return "$" + val.toLocaleString();
}

function calculateCAGR(values) {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first <= 0 || last <= 0) return 0;
  const years = values.length - 1;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

function updateSummaryTiles(prefix, values, labels) {
  const validValues = values.filter(v => v !== null && v !== undefined);
  const validLabels = values.map((v, i) => v !== null && v !== undefined ? labels[i] : null).filter(l => l !== null);
  
  const avg = validValues.length > 0 ? validValues.reduce((a, b) => a + b, 0) / validValues.length : 0;
  
  let maxVal = -Infinity, maxIdx = 0;
  let minVal = Infinity, minIdx = 0;
  
  validValues.forEach((v, i) => {
    if (v > maxVal) { maxVal = v; maxIdx = i; }
    if (v < minVal) { minVal = v; minIdx = i; }
  });
  
  if (!isFinite(maxVal)) maxVal = 0;
  if (!isFinite(minVal)) minVal = 0;
  
  const cagr = calculateCAGR(validValues);
  
  document.getElementById(prefix + "AvgValue").innerText = formatTileValue(avg);
  document.getElementById(prefix + "MaxValue").innerText = formatTileValue(maxVal);
  document.getElementById(prefix + "MaxPeriod").innerText = validLabels[maxIdx] || "-";
  document.getElementById(prefix + "MinValue").innerText = formatTileValue(minVal);
  document.getElementById(prefix + "MinPeriod").innerText = validLabels[minIdx] || "-";
  document.getElementById(prefix + "CagrValue").innerText = (cagr >= 0 ? "+" : "") + cagr.toFixed(1) + "%";
}

function updateRevenueView(data) {
  const view = document.getElementById("revViewType").value;
  const compare = document.getElementById("revCompare").checked;
  const year = parseInt(document.getElementById("revYear").value);
  const excludeCurrent = document.getElementById("revExcludeCurrent").checked;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let labels = [];
  let datasets = [];
  let hasPartialPeriod = false;

  /* ============================================================
     MONTHLY VIEW
  ============================================================= */
  if (view === "monthly") {
    labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    let current = toPositive(data.revenue[year]);
    const prior = toPositive(data.revenue[year - 1]);
    
    const isCurrentYear = year === currentYear;
    
    if (excludeCurrent && isCurrentYear && current) {
      current = current.map((v, i) => i === currentMonth ? null : v);
    }
    
    const barColors = current ? current.map((v, i) => {
      if (isCurrentYear && i === currentMonth && !excludeCurrent) {
        hasPartialPeriod = true;
        return "#f59e0b";
      }
      return "#3b82f6";
    }) : "#3b82f6";

    // Prior year FIRST (left)
    if (compare && prior) {
      datasets.push({
        label: `${year - 1}`,
        data: prior,
        backgroundColor: "#ef4444"
      });
    }

    // Current year SECOND (right)
    datasets.push({
      label: `${year}`,
      data: current,
      backgroundColor: barColors,
      partialIndex: isCurrentYear && !excludeCurrent ? currentMonth : -1
    });

    setRevenueTitle(`Monthly – ${year}`);
  }

  /* ============================================================
     QUARTERLY VIEW
  ============================================================= */
  else if (view === "quarterly") {
    labels = ["Q1","Q2","Q3","Q4"];
    
    const isCurrentYear = year === currentYear;
    const currentQuarter = Math.floor(currentMonth / 3);

    let months = toPositive(data.revenue[year]);
    
    if (excludeCurrent && isCurrentYear && months) {
      months = months.map((v, i) => i === currentMonth ? 0 : v);
    }
    
    const sumQ = q => {
      const slice = months ? months.slice((q - 1) * 3, q * 3) : [];
      return slice.length > 0 ? slice.reduce((a,b) => a + b, 0) : 0;
    };
    let currentQ = [sumQ(1), sumQ(2), sumQ(3), sumQ(4)];
    
    const barColors = currentQ.map((v, i) => {
      if (isCurrentYear && i === currentQuarter) {
        hasPartialPeriod = true;
        return "#f59e0b";
      }
      return "#3b82f6";
    });

    if (compare && data.revenue[year - 1]) {
      const pm = toPositive(data.revenue[year - 1]);
      const sumPQ = q => {
        const slice = pm.slice((q - 1) * 3, q * 3);
        return slice.length > 0 ? slice.reduce((a,b) => a + b, 0) : 0;
      };

      const priorQ = [sumPQ(1), sumPQ(2), sumPQ(3), sumPQ(4)];

      // Prior year FIRST
      datasets.push({
        label: `${year - 1}`,
        data: priorQ,
        backgroundColor: "#ef4444"
      });
    }

    // Current year SECOND
    datasets.push({
      label: `${year}`,
      data: currentQ,
      backgroundColor: barColors
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
    const annualTotals = [];
    const barColors = [];
    
    for (let y = start; y <= end; y++) {
      labels.push(y.toString());
      let yearData = toPositive(data.revenue[y]);
      
      if (excludeCurrent && y === currentYear && yearData) {
        yearData = yearData.map((v, i) => i === currentMonth ? 0 : v);
      }
      
      const total = yearData && yearData.length > 0 ? yearData.reduce((a,b) => a + b, 0) : 0;
      
      annualTotals.push(total);
      
      if (y === currentYear) {
        hasPartialPeriod = true;
        barColors.push("#f59e0b");
      } else {
        barColors.push("#3b82f6");
      }
    }

    datasets = [
      {
        label: "Annual Revenue",
        data: annualTotals,
        backgroundColor: barColors
      }
    ];

    setRevenueTitle(`Annual – ${start} to ${end}`);
  }

  /* ============================================================
     ADD TRENDLINES IF ENABLED
  ============================================================= */
  const showTrendline = document.getElementById("revTrendline").checked;
  if (showTrendline) {
    const trendColors = ["#10b981", "#f59e0b"];
    const barDatasets = [...datasets];
    barDatasets.forEach((ds, idx) => {
      const trendData = calculateTrendline(ds.data);
      datasets.push({
        label: `${ds.label} Trend`,
        data: trendData,
        type: "line",
        borderColor: trendColors[idx % trendColors.length],
        backgroundColor: "transparent",
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0,
        datalabels: { display: false }
      });
    });
  }

  /* ============================================================
     APPLY UPDATES
  ============================================================= */
  const tableDatasets = datasets.filter(ds => ds.type !== "line");
  currentTableData = { labels, datasets: tableDatasets };
  
  renderRevenueChart(labels, datasets);
  renderRevenueTable(labels, tableDatasets);
  updateTimestamp();
  
  const currentYearDataset = tableDatasets.find(ds => ds.label === String(year)) || tableDatasets[tableDatasets.length - 1];
  const currentValues = currentYearDataset ? currentYearDataset.data : [];
  updateSummaryTiles("rev", currentValues, labels);
  
  const partialLegend = document.getElementById("revPartialLegend");
  if (hasPartialPeriod) {
    partialLegend.classList.remove("hidden");
  } else {
    partialLegend.classList.add("hidden");
  }
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
   CHART RENDERING (SOLID BARS + RESPONSIVE)
------------------------------------------------------------ */
function renderRevenueChart(labels, datasets) {
  console.log("renderRevenueChart called", { labels, datasets });
  
  try {
    const canvas = document.getElementById("revChart");
    console.log("Canvas element:", canvas);
    
    if (!canvas) {
      console.error("Chart canvas not found");
      showChartError("Canvas element not found");
      return;
    }
    
    if (revChartInstance) {
      revChartInstance.destroy();
      revChartInstance = null;
    }

    const ctx = canvas.getContext("2d");
    console.log("2D context:", ctx);
    
    if (!ctx) {
      console.error("Could not get 2D context");
      showChartError("Could not initialize chart");
      return;
    }
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
      console.error("Chart.js not loaded");
      showChartError("Chart library not loaded");
      return;
    }
    
    console.log("Creating Chart instance...");

    revChartInstance = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      plugins: [ChartDataLabels],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 600,
          easing: "easeOutQuart"
        },
        layout: {
          padding: { top: 30 }
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            titleFont: { size: 14 },
            bodyFont: { size: 13 },
            padding: 12,
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                return context.dataset.label + ": $" + value.toLocaleString();
              }
            }
          },
          datalabels: {
            anchor: "end",
            align: "top",
            offset: 4,
            font: {
              size: 10,
              weight: "600"
            },
            color: function(context) {
              return context.dataset.borderColor || "#374151";
            },
            formatter: function(value) {
              if (value === 0 || value === null) return "";
              if (Math.abs(value) >= 1000000) {
                return "$" + (value / 1000000).toFixed(1) + "M";
              } else if (Math.abs(value) >= 1000) {
                return "$" + (value / 1000).toFixed(0) + "K";
              }
              return "$" + value.toLocaleString();
            }
          }
        },
        scales: {
          x: {
            ticks: {
              padding: 10,
              font: { size: 12 }
            },
            grid: {
              drawOnChartArea: false
            }
          },
          y: {
            ticks: {
              font: { size: 11 },
              callback: v => "$" + (v / 1000000).toFixed(1) + "M"
            }
          }
        }
      }
    });
    
    console.log("Chart created successfully:", revChartInstance);
    hideChartError();
  } catch (err) {
    console.error("Chart render error:", err);
    showChartError("Error: " + err.message);
  }
}

function showChartError(msg) {
  let errDiv = document.getElementById("chartErrorMsg");
  if (!errDiv) {
    errDiv = document.createElement("div");
    errDiv.id = "chartErrorMsg";
    errDiv.style.cssText = "padding:40px;text-align:center;color:#ef4444;font-weight:600;";
    const chartBox = document.getElementById("revChartBox");
    if (chartBox) chartBox.appendChild(errDiv);
  }
  errDiv.textContent = msg;
  errDiv.style.display = "block";
}

function hideChartError() {
  const errDiv = document.getElementById("chartErrorMsg");
  if (errDiv) errDiv.style.display = "none";
}

/* ------------------------------------------------------------
   TABLE RENDERING WITH GROWTH INDICATORS
------------------------------------------------------------ */
function renderRevenueTable(labels, datasets) {
  const head = document.getElementById("revTableHead");
  const body = document.getElementById("revTableBody");

  head.innerHTML = "";
  body.innerHTML = "";

  const hasComparison = datasets.length > 1;

  let header = "<tr><th>Period</th>";
  datasets.forEach(ds => {
    header += `<th>${ds.label}</th>`;
  });
  if (hasComparison) {
    header += "<th>Change</th>";
  }
  header += "</tr>";
  head.innerHTML = header;

  labels.forEach((lbl, i) => {
    let row = `<tr><td>${lbl}</td>`;
    
    const values = datasets.map(ds => ds.data[i] || 0);
    
    datasets.forEach(ds => {
      const v = ds.data[i] || 0;
      row += `<td>$${v.toLocaleString()}</td>`;
    });
    
    if (hasComparison && values.length >= 2) {
      const prior = values[0];
      const current = values[1];
      const change = prior > 0 ? ((current - prior) / prior * 100) : 0;
      const sign = change >= 0 ? "+" : "";
      const colorClass = change > 0 ? "growth-positive" : change < 0 ? "growth-negative" : "growth-neutral";
      row += `<td class="${colorClass}">${sign}${change.toFixed(1)}%</td>`;
    }
    
    row += "</tr>";
    body.innerHTML += row;
  });
}

/* ============================================================
   ACCOUNT VIEW MODULE — GL ACCOUNT DRILLDOWN
============================================================ */

let acctChartInstance = null;
let acctDataCache = null;
let acctUIInitialized = false;

async function initAccountModule() {
  const spinner = document.getElementById("acctLoadingSpinner");
  
  try {
    spinner.classList.remove("hidden");
    
    if (!acctDataCache) {
      if (revenueDataCache) {
        acctDataCache = revenueDataCache;
      } else {
        const response = await fetch("https://ftg-dashboard.netlify.app/data/financials.json");
        acctDataCache = await response.json();
        revenueDataCache = acctDataCache;
      }
    }

    if (!acctUIInitialized) {
      setupAccountUI(acctDataCache);
      acctUIInitialized = true;
    }
    
    spinner.classList.add("hidden");
    updateAccountView(acctDataCache);

  } catch (err) {
    console.error("Account module error:", err);
    spinner.classList.add("hidden");
  }
}

function setupAccountUI(data) {
  const acctSelect = document.getElementById("acctSelect");
  const yearSelect = document.getElementById("acctYear");
  
  if (!data.gl_history_all || data.gl_history_all.length === 0) {
    acctSelect.innerHTML = '<option value="">No accounts available</option>';
    return;
  }
  
  const accounts = data.gl_history_all
    .map(row => ({
      num: row.Account_Num || "",
      desc: row.Account_Description || ""
    }))
    .filter(a => {
      const numVal = parseInt(a.num) || 0;
      return numVal >= 4000;
    });
  
  accounts.sort((a, b) => {
    const numA = parseInt(a.num) || 0;
    const numB = parseInt(b.num) || 0;
    return numA - numB;
  });
  
  acctSelect.innerHTML = accounts.map(a => 
    `<option value="${a.num}">${a.num} – ${a.desc}</option>`
  ).join("");
  
  if (accounts.length > 0) {
    acctSelect.value = accounts[0].num;
  }
  
  const years = Object.keys(data.revenue).map(Number).sort((a, b) => a - b);
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = Math.max(...years);
  
  const s = document.getElementById("acctRangeStart");
  const e = document.getElementById("acctRangeEnd");
  s.min = e.min = years[0];
  s.max = e.max = years[years.length - 1];
  s.value = years[0];
  e.value = years[years.length - 1];
  document.getElementById("acctRangeStartLabel").innerText = s.value;
  document.getElementById("acctRangeEndLabel").innerText = e.value;
  
  s.oninput = () => {
    if (+s.value > +e.value) s.value = e.value;
    document.getElementById("acctRangeStartLabel").innerText = s.value;
    updateAccountView(data);
  };
  e.oninput = () => {
    if (+e.value < +s.value) e.value = s.value;
    document.getElementById("acctRangeEndLabel").innerText = e.value;
    updateAccountView(data);
  };
  
  document.getElementById("acctViewType").onchange = () => {
    const view = document.getElementById("acctViewType").value;
    const yearWrap = document.getElementById("acctYearWrapper");
    const compareWrap = document.getElementById("acctCompareWrapper");
    const rangeWrap = document.getElementById("acctRangeWrapper");
    const excludeLabel = document.getElementById("acctExcludeLabel");
    
    if (view === "annual") {
      yearWrap.style.display = "none";
      compareWrap.style.display = "none";
      rangeWrap.classList.remove("hidden");
      excludeLabel.textContent = "Exclude Current Year";
    } else if (view === "quarterly") {
      yearWrap.style.display = "flex";
      compareWrap.style.display = "flex";
      rangeWrap.classList.add("hidden");
      excludeLabel.textContent = "Exclude Current Quarter";
    } else {
      yearWrap.style.display = "flex";
      compareWrap.style.display = "flex";
      rangeWrap.classList.add("hidden");
      excludeLabel.textContent = "Exclude Current Month";
    }
    updateAccountView(data);
  };
  
  acctSelect.onchange = () => updateAccountView(data);
  yearSelect.onchange = () => updateAccountView(data);
  document.getElementById("acctCompare").onchange = () => updateAccountView(data);
  document.getElementById("acctTrendline").onchange = () => updateAccountView(data);
  document.getElementById("acctExcludeCurrent").onchange = () => updateAccountView(data);
}

function isIncomeAccount(accountNum) {
  const num = parseInt(accountNum) || 0;
  return (num >= 4000 && num < 5000) || (num >= 8000 && num < 9000);
}

function getAccountMonthlyValues(accountNum, year, data) {
  if (!data.gl_history_all) return Array(12).fill(0);
  
  const row = data.gl_history_all.find(r => r.Account_Num === accountNum);
  if (!row) return Array(12).fill(0);
  
  const flipSign = isIncomeAccount(accountNum);
  
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const rawVal = row[key];
    let val = (rawVal === "" || rawVal === null || rawVal === undefined) ? 0 : parseFloat(rawVal);
    if (isNaN(val)) val = 0;
    months.push(flipSign ? Math.abs(val) : val);
  }
  return months;
}

function getAccountQuarterlyValues(accountNum, year, data) {
  const monthly = getAccountMonthlyValues(accountNum, year, data);
  return [
    monthly.slice(0, 3).reduce((a, b) => a + b, 0),
    monthly.slice(3, 6).reduce((a, b) => a + b, 0),
    monthly.slice(6, 9).reduce((a, b) => a + b, 0),
    monthly.slice(9, 12).reduce((a, b) => a + b, 0)
  ];
}

function getAccountAnnualValue(accountNum, year, data) {
  const monthly = getAccountMonthlyValues(accountNum, year, data);
  return monthly.reduce((a, b) => a + b, 0);
}

function updateAccountView(data) {
  if (!data.gl_history_all || data.gl_history_all.length === 0) {
    document.getElementById("acctChartTitleLine1").innerText = "No Account Data";
    document.getElementById("acctChartTitleLine2").innerText = "GL history not available";
    return;
  }
  
  const acctNum = document.getElementById("acctSelect").value;
  if (!acctNum) return;
  
  const view = document.getElementById("acctViewType").value;
  const year = parseInt(document.getElementById("acctYear").value);
  const compare = document.getElementById("acctCompare").checked;
  const excludeCurrent = document.getElementById("acctExcludeCurrent").checked;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);
  
  const row = data.gl_history_all.find(r => r.Account_Num === acctNum);
  const acctDesc = row ? row.Account_Description : "";
  
  let labels = [];
  let datasets = [];
  let subtitle = "";
  let hasPartialPeriod = false;
  
  if (view === "monthly") {
    labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let currentValues = getAccountMonthlyValues(acctNum, year, data);
    const isCurrentYear = year === currentYear;
    
    if (excludeCurrent && isCurrentYear) {
      currentValues = currentValues.map((v, i) => i === currentMonth ? null : v);
    }
    
    const barColors = currentValues.map((v, i) => {
      if (isCurrentYear && i === currentMonth && !excludeCurrent) {
        hasPartialPeriod = true;
        return "#f59e0b";
      }
      return "#3b82f6";
    });
    
    if (compare) {
      const priorValues = getAccountMonthlyValues(acctNum, year - 1, data);
      datasets.push({
        label: `${year - 1}`,
        data: priorValues,
        backgroundColor: "#ef4444"
      });
    }
    
    datasets.push({
      label: `${year}`,
      data: currentValues,
      backgroundColor: barColors
    });
    
    subtitle = `Monthly – ${year}`;
  } else if (view === "quarterly") {
    labels = ["Q1","Q2","Q3","Q4"];
    const isCurrentYear = year === currentYear;
    
    let monthly = getAccountMonthlyValues(acctNum, year, data);
    if (excludeCurrent && isCurrentYear) {
      monthly = monthly.map((v, i) => i === currentMonth ? 0 : v);
    }
    
    let currentValues = [
      monthly.slice(0, 3).reduce((a, b) => a + b, 0),
      monthly.slice(3, 6).reduce((a, b) => a + b, 0),
      monthly.slice(6, 9).reduce((a, b) => a + b, 0),
      monthly.slice(9, 12).reduce((a, b) => a + b, 0)
    ];
    
    const barColors = currentValues.map((v, i) => {
      if (isCurrentYear && i === currentQuarter) {
        hasPartialPeriod = true;
        return "#f59e0b";
      }
      return "#3b82f6";
    });
    
    if (compare) {
      const priorValues = getAccountQuarterlyValues(acctNum, year - 1, data);
      datasets.push({
        label: `${year - 1}`,
        data: priorValues,
        backgroundColor: "#ef4444"
      });
    }
    
    datasets.push({
      label: `${year}`,
      data: currentValues,
      backgroundColor: barColors
    });
    
    subtitle = `Quarterly – ${year}`;
  } else if (view === "annual") {
    const start = +document.getElementById("acctRangeStart").value;
    const end = +document.getElementById("acctRangeEnd").value;
    const annualValues = [];
    const barColors = [];
    
    for (let y = start; y <= end; y++) {
      labels.push(y.toString());
      
      let monthly = getAccountMonthlyValues(acctNum, y, data);
      if (excludeCurrent && y === currentYear) {
        monthly = monthly.map((v, i) => i === currentMonth ? 0 : v);
      }
      const annualTotal = monthly.reduce((a, b) => a + b, 0);
      annualValues.push(annualTotal);
      
      if (y === currentYear) {
        hasPartialPeriod = true;
        barColors.push("#f59e0b");
      } else {
        barColors.push("#3b82f6");
      }
    }
    
    datasets.push({
      label: `Account ${acctNum}`,
      data: annualValues,
      backgroundColor: barColors
    });
    subtitle = `Annual – ${start} to ${end}`;
  }
  
  document.getElementById("acctChartTitleLine1").innerText = `${acctNum}: ${acctDesc}`;
  document.getElementById("acctChartTitleLine2").innerText = subtitle;
  
  const showTrendline = document.getElementById("acctTrendline").checked;
  if (showTrendline && datasets.length > 0) {
    const trendColors = ["#10b981", "#f59e0b"];
    const barDatasets = datasets.filter(ds => ds.type !== "line");
    barDatasets.forEach((ds, idx) => {
      if (ds.data.length > 1) {
        const trendData = calculateTrendline(ds.data);
        datasets.push({
          label: `${ds.label} Trend`,
          data: trendData,
          type: "line",
          borderColor: trendColors[idx % trendColors.length],
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          datalabels: { display: false }
        });
      }
    });
  }
  
  renderAccountChart(labels, datasets);
  const tableDatasets = datasets.filter(ds => ds.type !== "line");
  renderAccountTable(labels, tableDatasets);
  
  const currentYearDataset = tableDatasets.find(ds => ds.label === String(year)) || tableDatasets[tableDatasets.length - 1];
  const currentValues = currentYearDataset ? currentYearDataset.data : [];
  updateSummaryTiles("acct", currentValues, labels);
  
  const partialLegend = document.getElementById("acctPartialLegend");
  if (hasPartialPeriod) {
    partialLegend.classList.remove("hidden");
  } else {
    partialLegend.classList.add("hidden");
  }
  
  const timestamp = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  document.getElementById("acctChartUpdated").innerText = `Updated: ${timestamp}`;
}

function renderAccountChart(labels, datasets) {
  const canvas = document.getElementById("acctChart");
  if (!canvas) return;
  
  if (acctChartInstance) {
    acctChartInstance.destroy();
    acctChartInstance = null;
  }
  
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  acctChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    plugins: [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
        easing: "easeOutQuart"
      },
      layout: {
        padding: { top: 30 }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          backgroundColor: "rgba(31, 41, 55, 0.95)",
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return context.dataset.label + ": $" + value.toLocaleString();
            }
          }
        },
        datalabels: {
          anchor: "end",
          align: "top",
          offset: 4,
          font: {
            size: 10,
            weight: "600"
          },
          color: function(context) {
            return context.dataset.borderColor || "#374151";
          },
          formatter: function(value) {
            if (value === 0 || value === null) return "";
            if (Math.abs(value) >= 1000000) {
              return "$" + (value / 1000000).toFixed(1) + "M";
            } else if (Math.abs(value) >= 1000) {
              return "$" + (value / 1000).toFixed(0) + "K";
            }
            return "$" + value.toLocaleString();
          }
        }
      },
      scales: {
        x: {
          grid: { drawOnChartArea: false }
        },
        y: {
          ticks: {
            callback: v => {
              if (Math.abs(v) >= 1000000) {
                return "$" + (v / 1000000).toFixed(1) + "M";
              } else if (Math.abs(v) >= 1000) {
                return "$" + (v / 1000).toFixed(0) + "K";
              }
              return "$" + v.toLocaleString();
            }
          }
        }
      }
    }
  });
}

function renderAccountTable(labels, datasets) {
  const head = document.getElementById("acctTableHead");
  const body = document.getElementById("acctTableBody");
  
  const hasComparison = datasets.length > 1;
  
  let header = "<tr><th>Period</th>";
  datasets.forEach(ds => {
    header += `<th>${ds.label}</th>`;
  });
  if (hasComparison) {
    header += "<th>Change</th>";
  }
  header += "</tr>";
  head.innerHTML = header;
  
  body.innerHTML = labels.map((lbl, i) => {
    let row = `<tr><td>${lbl}</td>`;
    
    const values = datasets.map(ds => ds.data[i] || 0);
    
    datasets.forEach(ds => {
      const v = ds.data[i] || 0;
      const formatted = v < 0 
        ? `<span class="growth-negative">($${Math.abs(v).toLocaleString()})</span>`
        : `$${v.toLocaleString()}`;
      row += `<td>${formatted}</td>`;
    });
    
    if (hasComparison && values.length >= 2) {
      const prior = values[0];
      const current = values[1];
      const change = prior > 0 ? ((current - prior) / prior * 100) : 0;
      const sign = change >= 0 ? "+" : "";
      const colorClass = change > 0 ? "growth-positive" : change < 0 ? "growth-negative" : "growth-neutral";
      row += `<td class="${colorClass}">${sign}${change.toFixed(1)}%</td>`;
    }
    
    row += "</tr>";
    return row;
  }).join("");
}

/* ============================================================
   INCOME STATEMENT MODULE
============================================================ */

let isData = null;
let isAccountGroups = null;
let isGLLookup = {};
let isRowStates = {};

async function loadIncomeStatement() {
  if (!isData || !isAccountGroups) {
    try {
      const [financialsRes, groupsRes] = await Promise.all([
        fetch("/data/financials.json"),
        fetch("/data/account_groups.json")
      ]);
      isData = await financialsRes.json();
      isAccountGroups = await groupsRes.json();
      buildGLLookup();
      initIncomeStatementControls();
    } catch (err) {
      console.error("Failed to load Income Statement data:", err);
      return;
    }
  }
  renderIncomeStatement();
}

function buildGLLookup() {
  isGLLookup = {};
  const glHistory = isData.gl_history_all || [];
  
  glHistory.forEach(row => {
    const acctNum = parseInt(row.Account_Num || row.Account, 10);
    if (isNaN(acctNum)) return;
    
    if (!isGLLookup[acctNum]) {
      isGLLookup[acctNum] = {};
    }
    
    Object.keys(row).forEach(key => {
      if (/^\d{4}-\d{2}$/.test(key)) {
        const val = parseFloat(row[key]) || 0;
        isGLLookup[acctNum][key] = val;
      }
    });
  });
}

function initIncomeStatementControls() {
  const viewMode = document.getElementById("isViewMode");
  const singleControls = document.getElementById("isSingleControls");
  const matrixControls = document.getElementById("isMatrixControls");
  const periodType = document.getElementById("isPeriodType");
  const periodSelect = document.getElementById("isPeriodSelect");
  const compare = document.getElementById("isCompare");
  const showSubtotal = document.getElementById("isShowSubtotal");
  const matrixYearStart = document.getElementById("isMatrixYearStart");
  const matrixYearEnd = document.getElementById("isMatrixYearEnd");
  
  populatePeriodOptions();
  setupMatrixYearSliders();
  
  viewMode.onchange = () => {
    updateMatrixControlsVisibility();
    renderIncomeStatement();
  };
  
  periodType.onchange = () => {
    populatePeriodOptions();
    updateMatrixControlsVisibility();
    renderIncomeStatement();
  };
  
  periodSelect.onchange = () => renderIncomeStatement();
  compare.onchange = () => renderIncomeStatement();
  showSubtotal.onchange = () => renderIncomeStatement();
  
  const showThousands = document.getElementById("isShowThousands");
  showThousands.onchange = () => renderIncomeStatement();
  
  matrixYearStart.oninput = () => {
    document.getElementById("isMatrixYearStartLabel").textContent = matrixYearStart.value;
    if (parseInt(matrixYearStart.value) > parseInt(matrixYearEnd.value)) {
      matrixYearEnd.value = matrixYearStart.value;
      document.getElementById("isMatrixYearEndLabel").textContent = matrixYearEnd.value;
    }
    renderIncomeStatement();
  };
  
  matrixYearEnd.oninput = () => {
    document.getElementById("isMatrixYearEndLabel").textContent = matrixYearEnd.value;
    if (parseInt(matrixYearEnd.value) < parseInt(matrixYearStart.value)) {
      matrixYearStart.value = matrixYearEnd.value;
      document.getElementById("isMatrixYearStartLabel").textContent = matrixYearStart.value;
    }
    renderIncomeStatement();
  };
}

function updateMatrixControlsVisibility() {
  const viewMode = document.getElementById("isViewMode").value;
  const periodType = document.getElementById("isPeriodType").value;
  const periodTypeSelect = document.getElementById("isPeriodType");
  const yearControls = document.getElementById("isMatrixYearControls");
  const singleControls = document.getElementById("isSingleControls");
  const matrixControls = document.getElementById("isMatrixControls");
  const periodSelectLabel = document.getElementById("isPeriodSelectLabel");
  const periodSelect = document.getElementById("isPeriodSelect");
  
  const ytdOption = periodTypeSelect.querySelector('option[value="ytd"]');
  const ttmOption = periodTypeSelect.querySelector('option[value="ttm"]');
  
  if (viewMode === "matrix") {
    singleControls.classList.add("hidden");
    matrixControls.classList.remove("hidden");
    
    if (ytdOption) ytdOption.disabled = true;
    if (ttmOption) ttmOption.disabled = true;
    
    if (periodType === "ytd" || periodType === "ttm") {
      periodTypeSelect.value = "month";
      populatePeriodOptions();
    }
    
    if (periodType === "year") {
      yearControls.classList.remove("hidden");
      periodSelect.classList.add("hidden");
      if (periodSelectLabel) periodSelectLabel.classList.add("hidden");
    } else {
      yearControls.classList.add("hidden");
      periodSelect.classList.remove("hidden");
      if (periodSelectLabel) periodSelectLabel.classList.remove("hidden");
      
      if (periodType === "quarter" || periodType === "month") {
        populateMatrixYearOptions();
      }
    }
  } else {
    singleControls.classList.remove("hidden");
    matrixControls.classList.add("hidden");
    periodSelect.classList.remove("hidden");
    if (periodSelectLabel) periodSelectLabel.classList.remove("hidden");
    
    if (ytdOption) ytdOption.disabled = false;
    if (ttmOption) ttmOption.disabled = false;
  }
}

function populateMatrixYearOptions() {
  const periodSelect = document.getElementById("isPeriodSelect");
  const months = getAvailableMonths();
  const years = new Set();
  months.forEach(m => years.add(m.split("-")[0]));
  
  periodSelect.innerHTML = Array.from(years).sort().reverse().map(y => 
    `<option value="${y}">${y}</option>`
  ).join("");
}

function setupMatrixYearSliders() {
  const months = getAvailableMonths();
  const years = new Set();
  months.forEach(m => years.add(m.split("-")[0]));
  const sortedYears = Array.from(years).sort();
  
  if (sortedYears.length > 0) {
    const minYear = sortedYears[0];
    const maxYear = sortedYears[sortedYears.length - 1];
    
    const startSlider = document.getElementById("isMatrixYearStart");
    const endSlider = document.getElementById("isMatrixYearEnd");
    
    startSlider.min = minYear;
    startSlider.max = maxYear;
    startSlider.value = Math.max(minYear, maxYear - 5);
    
    endSlider.min = minYear;
    endSlider.max = maxYear;
    endSlider.value = maxYear;
    
    document.getElementById("isMatrixYearStartLabel").textContent = startSlider.value;
    document.getElementById("isMatrixYearEndLabel").textContent = endSlider.value;
  }
}

function populatePeriodOptions() {
  const periodType = document.getElementById("isPeriodType").value;
  const periodSelect = document.getElementById("isPeriodSelect");
  
  const months = getAvailableMonths();
  if (months.length === 0) return;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  let options = [];
  
  if (periodType === "month") {
    months.slice().reverse().forEach(m => {
      const [y, mo] = m.split("-");
      const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
      options.push({ value: m, label: `${monthName} ${y}` });
    });
  } else if (periodType === "quarter") {
    const quarters = new Set();
    months.forEach(m => {
      const [y, mo] = m.split("-").map(Number);
      const q = Math.ceil(mo / 3);
      quarters.add(`${y}-Q${q}`);
    });
    Array.from(quarters).sort().reverse().forEach(q => {
      options.push({ value: q, label: q });
    });
  } else if (periodType === "year") {
    const years = new Set();
    months.forEach(m => years.add(m.split("-")[0]));
    Array.from(years).sort().reverse().forEach(y => {
      options.push({ value: y, label: y });
    });
  } else if (periodType === "ytd") {
    const years = new Set();
    months.forEach(m => years.add(m.split("-")[0]));
    Array.from(years).sort().reverse().forEach(y => {
      for (let mo = 12; mo >= 1; mo--) {
        const key = `${y}-${String(mo).padStart(2, "0")}`;
        if (months.includes(key)) {
          const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
          options.push({ value: `${y}-YTD-${mo}`, label: `YTD ${monthName} ${y}` });
          break;
        }
      }
    });
  } else if (periodType === "ttm") {
    months.slice(-24).reverse().forEach(m => {
      const [y, mo] = m.split("-");
      const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
      options.push({ value: `TTM-${m}`, label: `TTM ending ${monthName} ${y}` });
    });
  }
  
  periodSelect.innerHTML = options.map(o => 
    `<option value="${o.value}">${o.label}</option>`
  ).join("");
}

function getAvailableMonths() {
  const allMonths = new Set();
  Object.values(isGLLookup).forEach(acctData => {
    Object.keys(acctData).forEach(k => {
      if (/^\d{4}-\d{2}$/.test(k)) allMonths.add(k);
    });
  });
  return Array.from(allMonths).sort();
}

function getPeriodMonths(periodValue, periodType) {
  const months = getAvailableMonths();
  
  if (periodType === "month") {
    return [periodValue];
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    const q = parseInt(qStr);
    const startMonth = (q - 1) * 3 + 1;
    const result = [];
    for (let m = startMonth; m < startMonth + 3; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) result.push(key);
    }
    return result;
  } else if (periodType === "year") {
    return months.filter(m => m.startsWith(periodValue + "-"));
  } else if (periodType === "ytd") {
    const parts = periodValue.split("-YTD-");
    const y = parts[0];
    const endMonth = parseInt(parts[1]);
    const result = [];
    for (let m = 1; m <= endMonth; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) result.push(key);
    }
    return result;
  } else if (periodType === "ttm") {
    const endMonth = periodValue.replace("TTM-", "");
    const endIdx = months.indexOf(endMonth);
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - 11);
    return months.slice(startIdx, endIdx + 1);
  }
  return [];
}

function getMatrixPeriods(matrixCount) {
  const months = getAvailableMonths();
  const periods = [];
  
  if (matrixCount.endsWith("m")) {
    const count = parseInt(matrixCount);
    const recent = months.slice(-count);
    recent.forEach(m => {
      periods.push({ label: formatMonthLabel(m), months: [m] });
    });
  } else if (matrixCount === "4q") {
    const quarters = [];
    months.forEach(m => {
      const [y, mo] = m.split("-").map(Number);
      const q = Math.ceil(mo / 3);
      const qKey = `${y}-Q${q}`;
      if (!quarters.find(x => x.key === qKey)) {
        quarters.push({ key: qKey, months: [] });
      }
      quarters.find(x => x.key === qKey).months.push(m);
    });
    quarters.slice(-4).forEach(q => {
      periods.push({ label: q.key, months: q.months });
    });
  } else if (matrixCount === "5y") {
    const years = [...new Set(months.map(m => m.split("-")[0]))];
    years.slice(-5).forEach(y => {
      const yMonths = months.filter(m => m.startsWith(y + "-"));
      periods.push({ label: y, months: yMonths });
    });
  }
  
  return periods;
}

function formatMonthLabel(m) {
  const [y, mo] = m.split("-");
  const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
  return `${monthName} ${y}`;
}

function sumAccountsForPeriod(accounts, periodMonths, isRange = false) {
  let total = 0;
  
  let acctList = [];
  if (isRange && accounts.length === 2) {
    const [start, end] = accounts;
    Object.keys(isGLLookup).forEach(acct => {
      const num = parseInt(acct);
      if (num >= start && num <= end) acctList.push(num);
    });
  } else {
    acctList = accounts;
  }
  
  acctList.forEach(acct => {
    const acctData = isGLLookup[acct];
    if (acctData) {
      periodMonths.forEach(m => {
        total += acctData[m] || 0;
      });
    }
  });
  
  return total;
}

function buildIncomeStatementRows(periodMonths, groups, computedValues = {}) {
  const rows = [];
  
  groups.forEach((group, idx) => {
    const rowId = `is-row-${group.label.replace(/\s+/g, '_')}`;
    let value = null;
    
    if (group.accounts) {
      value = sumAccountsForPeriod(group.accounts, periodMonths, false);
      if (isIncomeAccountGroup(group)) {
        value = Math.abs(value);
      }
      if (group.negate) {
        value = -value;
      }
    } else if (group.accounts_range) {
      value = sumAccountsForPeriod(group.accounts_range, periodMonths, true);
      if (isIncomeAccountGroup(group)) {
        value = Math.abs(value);
      }
      if (group.negate) {
        value = -value;
      }
    } else if (group.formula) {
      value = evaluateFormula(group.formula, computedValues);
    }
    
    computedValues[group.label] = value;
    
    if (group.expandable) {
      if (isRowStates[rowId] === undefined) {
        isRowStates[rowId] = false;
      }
    }
    
    if (group.type === "spacer") {
      rows.push({
        id: `spacer-${idx}`,
        label: "",
        level: 0,
        type: "spacer",
        value: null,
        expandable: false,
        parent: null,
        highlight: null,
        isIncome: false
      });
    } else {
      rows.push({
        id: rowId,
        label: group.label,
        level: group.level || 0,
        type: group.type,
        value: value,
        expandable: group.expandable || false,
        parent: group.parent || null,
        highlight: group.highlight || null,
        isIncome: group.isIncome || false
      });
      
      if (group.label === "Revenue" || group.label === "Total Cost of Sales") {
        rows.push({
          id: `spacer-after-${group.label.replace(/\s+/g, '_')}`,
          label: "",
          level: 0,
          type: "spacer",
          value: null,
          expandable: false,
          parent: null,
          highlight: null,
          isIncome: false
        });
      }
    }
  });
  
  return rows;
}

function isIncomeAccountGroup(group) {
  if (group.accounts) {
    return group.accounts.some(a => (a >= 4000 && a < 5000) || (a >= 8000 && a < 9000));
  }
  if (group.accounts_range) {
    const [start, end] = group.accounts_range;
    return (start >= 4000 && end < 5000) || (start >= 8000 && end < 9000);
  }
  return false;
}

function hasChildRows(groups, idx) {
  const currentLevel = groups[idx].level;
  for (let i = idx + 1; i < groups.length; i++) {
    if (groups[i].level <= currentLevel) return false;
    if (groups[i].level > currentLevel) return true;
  }
  return false;
}

function evaluateFormula(formula, computedValues) {
  let expr = formula;
  
  Object.keys(computedValues).sort((a, b) => b.length - a.length).forEach(label => {
    const val = computedValues[label] || 0;
    expr = expr.split(label).join(`(${val})`);
  });
  
  try {
    expr = expr.replace(/[^0-9+\-*/().]/g, "");
    return eval(expr) || 0;
  } catch (e) {
    console.error("Formula eval error:", formula, e);
    return 0;
  }
}

function getPriorPeriod(periodValue, periodType) {
  const months = getAvailableMonths();
  
  if (periodType === "month") {
    const idx = months.indexOf(periodValue);
    return idx > 0 ? months[idx - 1] : null;
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    const q = parseInt(qStr);
    if (q > 1) return `${y}-Q${q - 1}`;
    return `${parseInt(y) - 1}-Q4`;
  } else if (periodType === "year") {
    return String(parseInt(periodValue) - 1);
  } else if (periodType === "ytd") {
    const parts = periodValue.split("-YTD-");
    return `${parseInt(parts[0]) - 1}-YTD-${parts[1]}`;
  } else if (periodType === "ttm") {
    const endMonth = periodValue.replace("TTM-", "");
    const idx = months.indexOf(endMonth);
    if (idx >= 12) {
      return `TTM-${months[idx - 1]}`;
    }
    return null;
  }
  return null;
}

function getPriorYearPeriod(periodValue, periodType) {
  if (periodType === "month") {
    const [y, mo] = periodValue.split("-");
    return `${parseInt(y) - 1}-${mo}`;
  } else if (periodType === "quarter") {
    const [y, q] = periodValue.split("-Q");
    return `${parseInt(y) - 1}-Q${q}`;
  } else if (periodType === "year") {
    return String(parseInt(periodValue) - 1);
  } else if (periodType === "ytd") {
    const parts = periodValue.split("-YTD-");
    return `${parseInt(parts[0]) - 1}-YTD-${parts[1]}`;
  } else if (periodType === "ttm") {
    const endMonth = periodValue.replace("TTM-", "");
    const [y, mo] = endMonth.split("-");
    return `TTM-${parseInt(y) - 1}-${mo}`;
  }
  return null;
}

function formatAccountingNumber(value) {
  if (value === null || value === undefined) return "";
  const showThousands = document.getElementById("isShowThousands")?.checked;
  const rounded = Math.round(value);
  
  if (showThousands) {
    const inK = Math.round(rounded / 1000);
    if (rounded < 0) {
      return `<span class="is-negative">($${Math.abs(inK).toLocaleString()}K)</span>`;
    }
    return `$${inK.toLocaleString()}K`;
  } else {
    if (rounded < 0) {
      return `<span class="is-negative">($${Math.abs(rounded).toLocaleString()})</span>`;
    }
    return `$${rounded.toLocaleString()}`;
  }
}

function formatPercent(value) {
  if (value === null || value === undefined || !isFinite(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

function formatVariance(current, prior, isIncome) {
  const showThousands = document.getElementById("isShowThousands")?.checked;
  const diff = current - prior;
  const pct = prior !== 0 ? ((current - prior) / Math.abs(prior)) * 100 : 0;
  
  const isPositiveVariance = isIncome ? diff >= 0 : diff <= 0;
  const colorClass = isPositiveVariance ? "is-variance-positive" : "is-variance-negative";
  
  let diffFormatted;
  if (showThousands) {
    const diffK = Math.round(Math.abs(Math.round(diff)) / 1000);
    diffFormatted = diff < 0 
      ? `<span class="${colorClass}">($${diffK.toLocaleString()}K)</span>`
      : `<span class="${colorClass}">$${diffK.toLocaleString()}K</span>`;
  } else {
    diffFormatted = diff < 0 
      ? `<span class="${colorClass}">($${Math.abs(Math.round(diff)).toLocaleString()})</span>`
      : `<span class="${colorClass}">$${Math.round(diff).toLocaleString()}</span>`;
  }
  
  const pctFormatted = `<span class="${colorClass}">${pct.toFixed(1)}%</span>`;
  
  return { diff: diffFormatted, pct: pctFormatted };
}

function formatPeriodLabel(periodValue, periodType, includePartialIndicator = false) {
  let label = "";
  let isPartial = false;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);
  
  if (periodType === "month") {
    const [y, mo] = periodValue.split("-").map(Number);
    const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
    label = `${monthName} ${y}`;
    isPartial = (y === currentYear && mo === currentMonth);
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    const q = parseInt(qStr);
    label = periodValue;
    isPartial = (parseInt(y) === currentYear && q === currentQuarter);
  } else if (periodType === "year") {
    label = `FY ${periodValue}`;
    isPartial = (parseInt(periodValue) === currentYear);
  } else if (periodType === "ytd") {
    const parts = periodValue.split("-YTD-");
    const monthName = new Date(parts[0], parseInt(parts[1]) - 1).toLocaleString("default", { month: "short" });
    label = `YTD ${monthName} ${parts[0]}`;
    isPartial = (parseInt(parts[0]) === currentYear);
  } else if (periodType === "ttm") {
    const endMonth = periodValue.replace("TTM-", "");
    const [y, mo] = endMonth.split("-").map(Number);
    const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
    label = `TTM ${monthName} ${y}`;
    isPartial = (y === currentYear && mo === currentMonth);
  } else {
    label = periodValue;
  }
  
  if (includePartialIndicator && isPartial) {
    return `${label}<span class="is-partial-indicator">*</span>`;
  }
  return label;
}

function isPartialPeriod(periodValue, periodType) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);
  
  if (periodType === "month") {
    const [y, mo] = periodValue.split("-").map(Number);
    return (y === currentYear && mo === currentMonth);
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    return (parseInt(y) === currentYear && parseInt(qStr) === currentQuarter);
  } else if (periodType === "year") {
    return (parseInt(periodValue) === currentYear);
  }
  return false;
}

function renderIncomeStatement() {
  const viewMode = document.getElementById("isViewMode").value;
  const periodType = document.getElementById("isPeriodType").value;
  const periodValue = document.getElementById("isPeriodSelect").value;
  const groups = isAccountGroups.income_statement.groups;
  const thead = document.getElementById("isTableHead");
  const tbody = document.getElementById("isTableBody");
  
  if (viewMode === "matrix") {
    const showSubtotal = document.getElementById("isShowSubtotal").checked;
    const yearStart = document.getElementById("isMatrixYearStart").value;
    const yearEnd = document.getElementById("isMatrixYearEnd").value;
    
    let selectedYear = periodValue;
    
    renderMatrixView(groups, periodType, selectedYear, yearStart, yearEnd, showSubtotal, thead, tbody);
  } else {
    const compare = document.getElementById("isCompare").value;
    renderSinglePeriodView(groups, periodType, periodValue, compare, thead, tbody);
  }
}

function renderSinglePeriodView(groups, periodType, periodValue, compare, thead, tbody) {
  const periodMonths = getPeriodMonths(periodValue, periodType);
  const rows = buildIncomeStatementRows(periodMonths, groups);
  const currentLabel = formatPeriodLabel(periodValue, periodType, true);
  
  let comparisonRows = null;
  let compPeriodLabel = "";
  let compPeriod = null;
  
  if (compare !== "none") {
    if (compare === "prior_period") {
      compPeriod = getPriorPeriod(periodValue, periodType);
    } else {
      compPeriod = getPriorYearPeriod(periodValue, periodType);
    }
    
    if (compPeriod) {
      compPeriodLabel = formatPeriodLabel(compPeriod, periodType, true);
      const compMonths = getPeriodMonths(compPeriod, periodType);
      comparisonRows = buildIncomeStatementRows(compMonths, groups);
    }
  }
  
  let headerHtml = "<tr><th>Account</th>";
  if (comparisonRows) {
    headerHtml += `<th>${compPeriodLabel}</th><th>${currentLabel}</th><th>$ Var</th><th>% Var</th>`;
  } else {
    headerHtml += `<th>${currentLabel}</th>`;
  }
  headerHtml += "</tr>";
  thead.innerHTML = headerHtml;
  
  let bodyHtml = "";
  const colCount = comparisonRows ? 5 : 2;
  
  rows.forEach((row, i) => {
    if (row.type === "spacer") {
      bodyHtml += `<tr class="is-spacer-row"><td colspan="${colCount}"></td></tr>`;
      return;
    }
    
    const isVisible = isRowVisibleByParent(row, rows);
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const highlightClass = row.highlight ? `is-highlight-${row.highlight}` : "";
    const isIncome = row.isIncome || false;
    const noBoldLabels = ["Direct Labor", "Vehicle Expense", "Indirect Labor"];
    const noBoldClass = noBoldLabels.includes(row.label) ? "is-no-bold" : "";
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = isRowStates[row.id] === true;
      toggleHtml = `<span class="is-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    }
    
    let valueHtml = "";
    if (row.type === "header") {
      valueHtml = "";
    } else if (row.type === "ratio") {
      valueHtml = formatPercent(row.value);
    } else {
      valueHtml = formatAccountingNumber(row.value);
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${noBoldClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    if (comparisonRows) {
      const compRow = comparisonRows[i];
      let compValueHtml = "";
      
      if (row.type === "header") {
        bodyHtml += `<td></td><td></td><td></td><td></td>`;
      } else if (row.type === "ratio") {
        compValueHtml = formatPercent(compRow.value);
        const diffPct = (row.value - compRow.value) * 100;
        const isPositiveVar = isIncome ? diffPct >= 0 : diffPct <= 0;
        const pctClass = isPositiveVar ? "is-variance-positive" : "is-variance-negative";
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td>-</td>`;
        bodyHtml += `<td class="${pctClass}">${diffPct.toFixed(1)}%</td>`;
      } else {
        compValueHtml = formatAccountingNumber(compRow.value);
        const variance = formatVariance(row.value, compRow.value, isIncome);
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td>${variance.diff}</td>`;
        bodyHtml += `<td>${variance.pct}</td>`;
      }
    } else {
      bodyHtml += `<td>${valueHtml}</td>`;
    }
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachToggleListeners();
}

function renderMatrixView(groups, periodType, selectedYear, yearStart, yearEnd, showSubtotal, thead, tbody) {
  if (periodType === "ytd" || periodType === "ttm") {
    thead.innerHTML = "<tr><th colspan='2'>Matrix view is not available for YTD or TTM period types</th></tr>";
    tbody.innerHTML = "";
    return;
  }
  
  const periods = getMatrixPeriodsNew(periodType, selectedYear, yearStart, yearEnd);
  
  if (periods.length === 0) {
    thead.innerHTML = "<tr><th>No data available for selected period</th></tr>";
    tbody.innerHTML = "";
    return;
  }
  
  let headerHtml = "<tr><th>Account</th>";
  periods.forEach(p => {
    const partialIndicator = p.isPartial ? '<span class="is-partial-indicator">*</span>' : '';
    headerHtml += `<th>${p.label}${partialIndicator}</th>`;
  });
  if (showSubtotal) {
    headerHtml += "<th class=\"is-subtotal-col\">Subtotal</th>";
  }
  headerHtml += "</tr>";
  thead.innerHTML = headerHtml;
  
  const allPeriodRows = periods.map(p => {
    return buildIncomeStatementRows(p.months, groups);
  });
  
  const firstRows = allPeriodRows[0];
  let bodyHtml = "";
  const colCount = periods.length + 1 + (showSubtotal ? 1 : 0);
  
  firstRows.forEach((row, i) => {
    if (row.type === "spacer") {
      bodyHtml += `<tr class="is-spacer-row"><td colspan="${colCount}"></td></tr>`;
      return;
    }
    
    const isVisible = isRowVisibleByParent(row, firstRows);
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const highlightClass = row.highlight ? `is-highlight-${row.highlight}` : "";
    const noBoldLabels = ["Direct Labor", "Vehicle Expense", "Indirect Labor"];
    const noBoldClass = noBoldLabels.includes(row.label) ? "is-no-bold" : "";
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = isRowStates[row.id] === true;
      toggleHtml = `<span class="is-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${noBoldClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    let rowSubtotal = 0;
    allPeriodRows.forEach(periodRows => {
      const pRow = periodRows[i];
      let valueHtml = "";
      if (pRow.type === "header" || pRow.type === "spacer") {
        valueHtml = "";
      } else if (pRow.type === "ratio") {
        valueHtml = formatPercent(pRow.value);
      } else {
        valueHtml = formatAccountingNumber(pRow.value);
        rowSubtotal += pRow.value || 0;
      }
      bodyHtml += `<td>${valueHtml}</td>`;
    });
    
    if (showSubtotal) {
      if (row.type === "header" || row.type === "ratio") {
        bodyHtml += "<td class=\"is-subtotal-col\"></td>";
      } else {
        bodyHtml += `<td class="is-subtotal-col"><strong>${formatAccountingNumber(rowSubtotal)}</strong></td>`;
      }
    }
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachToggleListeners();
}

function getMatrixPeriodsNew(periodType, selectedYear, yearStart, yearEnd) {
  const months = getAvailableMonths();
  const periods = [];
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);
  
  if (periodType === "year") {
    const startYr = parseInt(yearStart);
    const endYr = parseInt(yearEnd);
    for (let y = startYr; y <= endYr; y++) {
      const yearMonths = months.filter(m => m.startsWith(y + "-"));
      if (yearMonths.length > 0) {
        periods.push({
          label: String(y),
          months: yearMonths,
          isPartial: y === currentYear
        });
      }
    }
  } else if (periodType === "quarter") {
    const selYear = parseInt(selectedYear);
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3 + 1;
      const quarterMonths = [];
      for (let m = startMonth; m < startMonth + 3; m++) {
        const key = `${selectedYear}-${String(m).padStart(2, "0")}`;
        if (months.includes(key)) quarterMonths.push(key);
      }
      if (quarterMonths.length > 0) {
        periods.push({
          label: `Q${q}`,
          months: quarterMonths,
          isPartial: selYear === currentYear && q === currentQuarter
        });
      }
    }
  } else if (periodType === "month") {
    const selYear = parseInt(selectedYear);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      const key = `${selectedYear}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) {
        periods.push({
          label: monthNames[m - 1],
          months: [key],
          isPartial: selYear === currentYear && m === currentMonth
        });
      }
    }
  } else if (periodType === "ytd" || periodType === "ttm") {
    return [];
  }
  
  return periods;
}

function isRowVisible(groups, idx) {
  const currentLevel = groups[idx].level;
  if (currentLevel === 0) return true;
  
  for (let i = idx - 1; i >= 0; i--) {
    if (groups[i].level < currentLevel) {
      const parentId = `is-row-${i}`;
      if (isRowStates[parentId] === false) return false;
      if (groups[i].level === 0) return true;
    }
  }
  return true;
}

function isRowVisibleByParent(row, rows) {
  if (!row.parent) return true;
  
  const parentRow = rows.find(r => r.label === row.parent);
  if (!parentRow) return true;
  
  const parentExpanded = isRowStates[parentRow.id] === true;
  return parentExpanded;
}

function attachToggleListeners() {
  document.querySelectorAll(".is-toggle").forEach(toggle => {
    toggle.onclick = (e) => {
      e.stopPropagation();
      const rowId = toggle.dataset.row;
      isRowStates[rowId] = !isRowStates[rowId];
      renderIncomeStatement();
    };
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



