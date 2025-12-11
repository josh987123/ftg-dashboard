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
  setupExportButtons();
  updateDataAsOfDates();
});

function updateDataAsOfDates() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const revEl = document.getElementById("revDataAsOf");
  const acctEl = document.getElementById("acctDataAsOf");
  const isEl = document.getElementById("isDataAsOf");
  const overviewEl = document.getElementById("overviewDataAsOf");
  
  if (revEl) revEl.textContent = dateStr;
  if (acctEl) acctEl.textContent = dateStr;
  if (isEl) isEl.textContent = dateStr;
  if (overviewEl) overviewEl.textContent = dateStr;
}

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
   EXECUTIVE OVERVIEW MODULE
------------------------------------------------------------ */
document.getElementById("currentUser").innerText = "";

let overviewDataCache = null;
let overviewChartInstances = {};
let isData = null;
let isAccountGroups = null;
let isGLLookup = {};
let isRowStates = {};

async function initOverviewModule() {
  try {
    const fetchPromises = [];
    
    if (!overviewDataCache) {
      fetchPromises.push(
        fetch("/data/financials.json").then(r => r.json()).then(data => { overviewDataCache = data; })
      );
    }
    
    if (!isAccountGroups) {
      fetchPromises.push(
        fetch("/data/account_groups.json").then(r => r.json()).then(data => { isAccountGroups = data; })
      );
    }
    
    if (!isData) {
      fetchPromises.push(
        fetch("/data/financials.json").then(r => r.json()).then(data => { 
          isData = data;
          buildGLLookup();
        })
      );
    }
    
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }
    
    setupOverviewUI();
    updateOverviewCharts();
  } catch (err) {
    console.error("Overview data load error:", err);
  }
}

function setupOverviewUI() {
  const viewType = document.getElementById("overviewViewType");
  const yearSelect = document.getElementById("overviewYear");
  const yearWrapper = document.getElementById("overviewYearWrapper");
  const rangeWrapper = document.getElementById("overviewRangeWrapper");
  const compareCheck = document.getElementById("overviewCompare");
  const rangeStart = document.getElementById("overviewRangeStart");
  const rangeEnd = document.getElementById("overviewRangeEnd");
  
  if (!overviewDataCache || !overviewDataCache.revenue) return;
  
  const years = Object.keys(overviewDataCache.revenue).map(Number).sort((a, b) => a - b);
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = Math.max(...years);
  
  rangeStart.min = rangeEnd.min = years[0];
  rangeStart.max = rangeEnd.max = years[years.length - 1];
  rangeStart.value = years[0];
  rangeEnd.value = years[years.length - 1];
  document.getElementById("overviewRangeStartLabel").textContent = rangeStart.value;
  document.getElementById("overviewRangeEndLabel").textContent = rangeEnd.value;
  
  const trendCheck = document.getElementById("overviewTrend");
  
  viewType.onchange = () => {
    const v = viewType.value;
    if (v === "annual") {
      yearWrapper.classList.add("hidden");
      rangeWrapper.classList.remove("hidden");
    } else {
      yearWrapper.classList.remove("hidden");
      rangeWrapper.classList.add("hidden");
    }
    updateOverviewCharts();
  };
  
  const excludeCheck = document.getElementById("overviewExclude");
  
  yearSelect.onchange = () => updateOverviewCharts();
  compareCheck.onchange = () => updateOverviewCharts();
  trendCheck.onchange = () => updateOverviewCharts();
  excludeCheck.onchange = () => updateOverviewCharts();
  
  rangeStart.oninput = () => {
    if (+rangeStart.value > +rangeEnd.value) rangeStart.value = rangeEnd.value;
    document.getElementById("overviewRangeStartLabel").textContent = rangeStart.value;
    updateOverviewCharts();
  };
  
  rangeEnd.oninput = () => {
    if (+rangeEnd.value < +rangeStart.value) rangeEnd.value = rangeStart.value;
    document.getElementById("overviewRangeEndLabel").textContent = rangeEnd.value;
    updateOverviewCharts();
  };
}

function updateOverviewCharts() {
  if (!overviewDataCache || !isAccountGroups) return;
  
  const viewType = document.getElementById("overviewViewType").value;
  const year = parseInt(document.getElementById("overviewYear").value);
  const compare = document.getElementById("overviewCompare").checked;
  const excludeCurrent = document.getElementById("overviewExclude").checked;
  const rangeStart = parseInt(document.getElementById("overviewRangeStart").value);
  const rangeEnd = parseInt(document.getElementById("overviewRangeEnd").value);
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  
  let labels = [];
  let periods = [];
  let priorPeriods = [];
  
  if (viewType === "monthly") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      labels.push(monthNames[m - 1]);
      periods.push([key]);
      if (compare) {
        priorPeriods.push([`${year - 1}-${String(m).padStart(2, "0")}`]);
      }
    }
  } else if (viewType === "quarterly") {
    for (let q = 1; q <= 4; q++) {
      labels.push(`Q${q}`);
      const qMonths = [];
      const priorQMonths = [];
      for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) {
        qMonths.push(`${year}-${String(m).padStart(2, "0")}`);
        if (compare) priorQMonths.push(`${year - 1}-${String(m).padStart(2, "0")}`);
      }
      periods.push(qMonths);
      if (compare) priorPeriods.push(priorQMonths);
    }
  } else {
    for (let y = rangeStart; y <= rangeEnd; y++) {
      labels.push(String(y));
      const yearMonths = [];
      const priorYearMonths = [];
      for (let m = 1; m <= 12; m++) {
        yearMonths.push(`${y}-${String(m).padStart(2, "0")}`);
        if (compare) priorYearMonths.push(`${y - 1}-${String(m).padStart(2, "0")}`);
      }
      periods.push(yearMonths);
      if (compare) priorPeriods.push(priorYearMonths);
    }
  }
  
  const groups = isAccountGroups.income_statement.groups;
  
  const metrics = {
    revenue: { label: "Revenue", values: [], priorValues: [] },
    grossProfit: { label: "Gross Profit", values: [], priorValues: [] },
    grossMargin: { label: "Gross Profit Margin %", values: [], priorValues: [], isPercent: true },
    opex: { label: "Operating Expenses", values: [], priorValues: [] },
    opProfit: { label: "Operating Profit", values: [], priorValues: [] },
    opMargin: { label: "Operating Profit %", values: [], priorValues: [], isPercent: true }
  };
  
  periods.forEach((periodMonths, idx) => {
    let filteredPeriodMonths = periodMonths;
    if (excludeCurrent) {
      filteredPeriodMonths = periodMonths.filter(m => m !== currentMonthKey);
    }
    const rows = buildIncomeStatementRows(filteredPeriodMonths, groups);
    const revenueRow = rows.find(r => r.label === "Revenue");
    const grossProfitRow = rows.find(r => r.label === "Gross Profit");
    const opexRow = rows.find(r => r.label === "Operating Expenses");
    const opIncomeRow = rows.find(r => r.label === "Operating Income");
    
    const rev = revenueRow ? revenueRow.value : 0;
    const gp = grossProfitRow ? grossProfitRow.value : 0;
    const opex = opexRow ? opexRow.value : 0;
    const opInc = opIncomeRow ? opIncomeRow.value : 0;
    
    metrics.revenue.values.push(rev);
    metrics.grossProfit.values.push(gp);
    metrics.grossMargin.values.push(rev ? (gp / rev) * 100 : 0);
    metrics.opex.values.push(opex);
    metrics.opProfit.values.push(opInc);
    metrics.opMargin.values.push(rev ? (opInc / rev) * 100 : 0);
    
    if (compare && priorPeriods[idx]) {
      const priorRows = buildIncomeStatementRows(priorPeriods[idx], groups);
      const pRevRow = priorRows.find(r => r.label === "Revenue");
      const pGpRow = priorRows.find(r => r.label === "Gross Profit");
      const pOpexRow = priorRows.find(r => r.label === "Operating Expenses");
      const pOpIncRow = priorRows.find(r => r.label === "Operating Income");
      
      const pRev = pRevRow ? pRevRow.value : 0;
      const pGp = pGpRow ? pGpRow.value : 0;
      const pOpex = pOpexRow ? pOpexRow.value : 0;
      const pOpInc = pOpIncRow ? pOpIncRow.value : 0;
      
      metrics.revenue.priorValues.push(pRev);
      metrics.grossProfit.priorValues.push(pGp);
      metrics.grossMargin.priorValues.push(pRev ? (pGp / pRev) * 100 : 0);
      metrics.opex.priorValues.push(pOpex);
      metrics.opProfit.priorValues.push(pOpInc);
      metrics.opMargin.priorValues.push(pRev ? (pOpInc / pRev) * 100 : 0);
    }
  });
  
  const showTrend = document.getElementById("overviewTrend").checked;
  
  const chartConfigs = [
    { id: "overviewRevenueChart", data: metrics.revenue },
    { id: "overviewGrossProfitChart", data: metrics.grossProfit },
    { id: "overviewGrossMarginChart", data: metrics.grossMargin },
    { id: "overviewOpexChart", data: metrics.opex },
    { id: "overviewOpProfitChart", data: metrics.opProfit },
    { id: "overviewOpMarginChart", data: metrics.opMargin }
  ];
  
  chartConfigs.forEach(cfg => {
    renderOverviewChart(cfg.id, labels, cfg.data, compare, showTrend);
  });
  
  updateOverviewStats(metrics, labels);
}

function updateOverviewStats(metrics, labels) {
  const statConfigs = [
    { key: "revenue", avgId: "revenueAvg", highId: "revenueHigh", lowId: "revenueLow", cagrId: "revenueCagr", isPercent: false },
    { key: "grossProfit", avgId: "grossProfitAvg", highId: "grossProfitHigh", lowId: "grossProfitLow", cagrId: "grossProfitCagr", isPercent: false },
    { key: "grossMargin", avgId: "grossMarginAvg", highId: "grossMarginHigh", lowId: "grossMarginLow", cagrId: "grossMarginCagr", isPercent: true },
    { key: "opex", avgId: "opexAvg", highId: "opexHigh", lowId: "opexLow", cagrId: "opexCagr", isPercent: false },
    { key: "opProfit", avgId: "opProfitAvg", highId: "opProfitHigh", lowId: "opProfitLow", cagrId: "opProfitCagr", isPercent: false },
    { key: "opMargin", avgId: "opMarginAvg", highId: "opMarginHigh", lowId: "opMarginLow", cagrId: "opMarginCagr", isPercent: true }
  ];
  
  statConfigs.forEach(cfg => {
    const values = metrics[cfg.key].values.filter(v => v !== 0);
    
    if (values.length === 0) {
      document.getElementById(cfg.avgId).textContent = "-";
      document.getElementById(cfg.highId).textContent = "-";
      document.getElementById(cfg.lowId).textContent = "-";
      document.getElementById(cfg.cagrId).textContent = "-";
      return;
    }
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const high = Math.max(...values);
    const low = Math.min(...values);
    
    let cagr = 0;
    const firstNonZeroIdx = metrics[cfg.key].values.findIndex(v => v !== 0);
    const lastNonZeroIdx = metrics[cfg.key].values.length - 1 - [...metrics[cfg.key].values].reverse().findIndex(v => v !== 0);
    
    if (firstNonZeroIdx !== -1 && lastNonZeroIdx !== -1 && firstNonZeroIdx !== lastNonZeroIdx) {
      const startVal = metrics[cfg.key].values[firstNonZeroIdx];
      const endVal = metrics[cfg.key].values[lastNonZeroIdx];
      const periods = lastNonZeroIdx - firstNonZeroIdx;
      if (startVal > 0 && endVal > 0 && periods > 0) {
        cagr = (Math.pow(endVal / startVal, 1 / periods) - 1) * 100;
      }
    }
    
    const formatValue = (val, isPercent) => {
      if (isPercent) return val.toFixed(1) + "%";
      if (Math.abs(val) >= 1000000) return "$" + (val / 1000000).toFixed(1) + "M";
      if (Math.abs(val) >= 1000) return "$" + (val / 1000).toFixed(0) + "K";
      return "$" + val.toFixed(0);
    };
    
    document.getElementById(cfg.avgId).textContent = formatValue(avg, cfg.isPercent);
    document.getElementById(cfg.highId).textContent = formatValue(high, cfg.isPercent);
    document.getElementById(cfg.lowId).textContent = formatValue(low, cfg.isPercent);
    
    const cagrEl = document.getElementById(cfg.cagrId);
    cagrEl.textContent = cagr.toFixed(1) + "%";
    cagrEl.className = cagr < 0 ? "stat-value negative" : "stat-value";
  });
}

function renderOverviewChart(canvasId, labels, metricData, showPrior, showTrend) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  if (overviewChartInstances[canvasId]) {
    overviewChartInstances[canvasId].destroy();
  }
  
  const datasets = [];
  
  if (showPrior && metricData.priorValues.length > 0) {
    datasets.push({
      label: "Prior Year",
      data: metricData.priorValues,
      backgroundColor: "#ef4444",
      borderRadius: 4,
      barPercentage: 0.9,
      categoryPercentage: 0.85
    });
  }
  
  datasets.push({
    label: "Current",
    data: metricData.values,
    backgroundColor: "#3b82f6",
    borderRadius: 4,
    barPercentage: 0.9,
    categoryPercentage: 0.85
  });
  
  if (showTrend && metricData.values.length > 1) {
    const trendData = calculateTrendline(metricData.values);
    datasets.push({
      label: "Trendline",
      data: trendData,
      type: "line",
      borderColor: "#10b981",
      borderWidth: 2,
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      tension: 0
    });
  }
  
  overviewChartInstances[canvasId] = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: showPrior || showTrend, position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: {
          ticks: {
            font: { size: 9 },
            callback: v => metricData.isPercent ? v.toFixed(0) + "%" : (Math.abs(v) >= 1000000 ? "$" + (v / 1000000).toFixed(1) + "M" : "$" + (v / 1000).toFixed(0) + "K")
          }
        }
      }
    }
  });
}

initOverviewModule();

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
    
    spinner.classList.add("hidden");
    updateRevenueView(revenueDataCache);

  } catch (err) {
    console.error("Revenue module error:", err);
    spinner.classList.add("hidden");
  }
}

/* ------------------------------------------------------------
   EXPORT DROPDOWN & FUNCTIONALITY (Universal for all views)
------------------------------------------------------------ */
function setupExportButtons() {
  const dropdown = document.getElementById("exportDropdownMenu");
  const dropdownBtn = document.getElementById("exportDropdownBtn");
  
  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-dropdown")) {
      dropdown.classList.add("hidden");
    }
  });
  
  document.getElementById("exportPrintBtn").onclick = () => {
    dropdown.classList.add("hidden");
    universalPrint();
  };
  
  document.getElementById("exportPdfBtn").onclick = () => {
    dropdown.classList.add("hidden");
    universalExportToPdf();
  };
  
  document.getElementById("exportCsvBtn").onclick = () => {
    dropdown.classList.add("hidden");
    universalExportToCsv();
  };
  
  document.getElementById("exportEmailBtn").onclick = () => {
    dropdown.classList.add("hidden");
    openEmailModal();
  };
}

function getCurrentView() {
  const sections = ["overview", "revenue", "accounts", "incomeStatement"];
  for (const s of sections) {
    const el = document.getElementById(s);
    if (el && el.classList.contains("visible")) return s;
  }
  return "overview";
}

function getReportData() {
  const view = getCurrentView();
  
  if (view === "overview") {
    return {
      title: "Executive Overview",
      subtitle: getOverviewSubtitle(),
      tableHtml: getOverviewTableHtml(),
      csvData: getOverviewCsvData(),
      isWide: true
    };
  } else if (view === "revenue") {
    return {
      title: "Revenue Report",
      subtitle: getRevenueSubtitle(),
      tableHtml: getRevenueTableHtml(),
      csvData: getRevenueCsvData(),
      isWide: isRevenueWide()
    };
  } else if (view === "accounts") {
    return {
      title: "Account Detail Report",
      subtitle: getAccountSubtitle(),
      tableHtml: getAccountTableHtml(),
      csvData: getAccountCsvData(),
      isWide: isAccountWide()
    };
  } else if (view === "incomeStatement") {
    return {
      title: "Income Statement",
      subtitle: getIncomeStatementSubtitle(),
      tableHtml: getIncomeStatementTableHtml(),
      csvData: getIncomeStatementCsvData(),
      isWide: isIncomeStatementWide()
    };
  }
  return null;
}

function getOverviewSubtitle() {
  const viewType = document.getElementById("overviewViewType")?.value || "monthly";
  const year = document.getElementById("overviewYear")?.value || new Date().getFullYear();
  const compare = document.getElementById("overviewCompare")?.checked;
  let subtitle = `${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View`;
  if (viewType !== "annual") subtitle += ` - ${year}`;
  if (compare) subtitle += " (vs Prior Year)";
  return subtitle;
}

function getOverviewTableHtml() {
  const viewType = document.getElementById("overviewViewType")?.value || "monthly";
  const year = parseInt(document.getElementById("overviewYear")?.value) || new Date().getFullYear();
  const compare = document.getElementById("overviewCompare")?.checked;
  
  if (!isAccountGroups) return "<p>No data available</p>";
  
  const groups = isAccountGroups.income_statement.groups;
  let labels = [];
  let periods = [];
  
  if (viewType === "monthly") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      labels.push(monthNames[m - 1]);
      periods.push([`${year}-${String(m).padStart(2, "0")}`]);
    }
  } else if (viewType === "quarterly") {
    for (let q = 1; q <= 4; q++) {
      labels.push(`Q${q}`);
      const qMonths = [];
      for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) {
        qMonths.push(`${year}-${String(m).padStart(2, "0")}`);
      }
      periods.push(qMonths);
    }
  } else {
    const start = parseInt(document.getElementById("overviewRangeStart")?.value) || 2018;
    const end = parseInt(document.getElementById("overviewRangeEnd")?.value) || 2025;
    for (let y = start; y <= end; y++) {
      labels.push(String(y));
      const yearMonths = [];
      for (let m = 1; m <= 12; m++) {
        yearMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      }
      periods.push(yearMonths);
    }
  }
  
  const metrics = ["Revenue", "Gross Profit", "GP %", "Operating Expenses", "Operating Profit", "OP %"];
  
  let html = `<table><tr><th>Metric</th>${labels.map(l => `<th>${l}</th>`).join("")}</tr>`;
  
  metrics.forEach(metric => {
    html += `<tr><td><strong>${metric}</strong></td>`;
    periods.forEach(periodMonths => {
      const rows = buildIncomeStatementRows(periodMonths, groups);
      let value = 0;
      
      if (metric === "Revenue") {
        const row = rows.find(r => r.label === "Revenue");
        value = row ? row.value : 0;
      } else if (metric === "Gross Profit") {
        const row = rows.find(r => r.label === "Gross Profit");
        value = row ? row.value : 0;
      } else if (metric === "GP %") {
        const revRow = rows.find(r => r.label === "Revenue");
        const gpRow = rows.find(r => r.label === "Gross Profit");
        const rev = revRow ? revRow.value : 0;
        const gp = gpRow ? gpRow.value : 0;
        value = rev ? (gp / rev) * 100 : 0;
        html += `<td>${value.toFixed(1)}%</td>`;
        return;
      } else if (metric === "Operating Expenses") {
        const row = rows.find(r => r.label === "Operating Expenses");
        value = row ? row.value : 0;
      } else if (metric === "Operating Profit") {
        const row = rows.find(r => r.label === "Operating Income");
        value = row ? row.value : 0;
      } else if (metric === "OP %") {
        const revRow = rows.find(r => r.label === "Revenue");
        const opRow = rows.find(r => r.label === "Operating Income");
        const rev = revRow ? revRow.value : 0;
        const op = opRow ? opRow.value : 0;
        value = rev ? (op / rev) * 100 : 0;
        html += `<td>${value.toFixed(1)}%</td>`;
        return;
      }
      
      const formatted = Math.abs(value) >= 1000000 
        ? "$" + (value / 1000000).toFixed(1) + "M"
        : "$" + Math.round(value).toLocaleString();
      html += `<td>${formatted}</td>`;
    });
    html += "</tr>";
  });
  
  html += "</table>";
  return html;
}

function getOverviewCsvData() {
  const viewType = document.getElementById("overviewViewType")?.value || "monthly";
  const year = parseInt(document.getElementById("overviewYear")?.value) || new Date().getFullYear();
  
  if (!isAccountGroups) return "";
  
  const groups = isAccountGroups.income_statement.groups;
  let labels = [];
  let periods = [];
  
  if (viewType === "monthly") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      labels.push(monthNames[m - 1]);
      periods.push([`${year}-${String(m).padStart(2, "0")}`]);
    }
  } else if (viewType === "quarterly") {
    for (let q = 1; q <= 4; q++) {
      labels.push(`Q${q}`);
      const qMonths = [];
      for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) {
        qMonths.push(`${year}-${String(m).padStart(2, "0")}`);
      }
      periods.push(qMonths);
    }
  } else {
    const start = parseInt(document.getElementById("overviewRangeStart")?.value) || 2018;
    const end = parseInt(document.getElementById("overviewRangeEnd")?.value) || 2025;
    for (let y = start; y <= end; y++) {
      labels.push(String(y));
      const yearMonths = [];
      for (let m = 1; m <= 12; m++) {
        yearMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      }
      periods.push(yearMonths);
    }
  }
  
  const metrics = ["Revenue", "Gross Profit", "GP %", "Operating Expenses", "Operating Profit", "OP %"];
  
  let csv = "Metric," + labels.join(",") + "\n";
  
  metrics.forEach(metric => {
    let row = metric;
    periods.forEach(periodMonths => {
      const rows = buildIncomeStatementRows(periodMonths, groups);
      let value = 0;
      
      if (metric === "Revenue") {
        const r = rows.find(r => r.label === "Revenue");
        value = r ? r.value : 0;
      } else if (metric === "Gross Profit") {
        const r = rows.find(r => r.label === "Gross Profit");
        value = r ? r.value : 0;
      } else if (metric === "GP %") {
        const revRow = rows.find(r => r.label === "Revenue");
        const gpRow = rows.find(r => r.label === "Gross Profit");
        const rev = revRow ? revRow.value : 0;
        const gp = gpRow ? gpRow.value : 0;
        value = rev ? (gp / rev) * 100 : 0;
        row += "," + value.toFixed(1) + "%";
        return;
      } else if (metric === "Operating Expenses") {
        const r = rows.find(r => r.label === "Operating Expenses");
        value = r ? r.value : 0;
      } else if (metric === "Operating Profit") {
        const r = rows.find(r => r.label === "Operating Income");
        value = r ? r.value : 0;
      } else if (metric === "OP %") {
        const revRow = rows.find(r => r.label === "Revenue");
        const opRow = rows.find(r => r.label === "Operating Income");
        const rev = revRow ? revRow.value : 0;
        const op = opRow ? opRow.value : 0;
        value = rev ? (op / rev) * 100 : 0;
        row += "," + value.toFixed(1) + "%";
        return;
      }
      
      row += "," + value;
    });
    csv += row + "\n";
  });
  
  return csv;
}

function getRevenueSubtitle() {
  const viewType = document.getElementById("revViewType")?.value || "monthly";
  const year = document.getElementById("revYear")?.value || new Date().getFullYear();
  return `${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View - ${year}`;
}

function getRevenueTableHtml() {
  const { labels, datasets } = currentTableData;
  if (!labels.length) return "<p>No data available</p>";
  
  let html = `<table><tr><th>Period</th>${datasets.map(ds => `<th>${ds.label}</th>`).join("")}</tr>`;
  labels.forEach((lbl, i) => {
    html += `<tr><td>${lbl}</td>`;
    datasets.forEach(ds => {
      const v = ds.data[i] || 0;
      html += `<td>$${v.toLocaleString()}</td>`;
    });
    html += "</tr>";
  });
  html += "</table>";
  return html;
}

function getRevenueCsvData() {
  const { labels, datasets } = currentTableData;
  if (!labels.length) return "";
  
  let csv = "Period," + datasets.map(ds => ds.label).join(",") + "\n";
  labels.forEach((lbl, i) => {
    let row = lbl;
    datasets.forEach(ds => {
      row += "," + (ds.data[i] || 0);
    });
    csv += row + "\n";
  });
  return csv;
}

function isRevenueWide() {
  const { datasets } = currentTableData;
  return datasets && datasets.length > 3;
}

function getAccountSubtitle() {
  const accountSelect = document.getElementById("acctSelect");
  const viewType = document.getElementById("acctViewType")?.value || "monthly";
  const accountName = accountSelect?.options[accountSelect.selectedIndex]?.text || "Account";
  return `${accountName} - ${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View`;
}

function getAccountTableHtml() {
  const table = document.querySelector("#accounts .acct-table");
  if (!table) return "<p>No data available</p>";
  return table.outerHTML;
}

function getAccountCsvData() {
  const table = document.querySelector("#accounts .acct-table");
  if (!table) return "";
  
  let csv = "";
  const rows = table.querySelectorAll("tr");
  rows.forEach(row => {
    const cells = row.querySelectorAll("th, td");
    csv += Array.from(cells).map(c => `"${c.textContent.trim()}"`).join(",") + "\n";
  });
  return csv;
}

function isAccountWide() {
  const viewType = document.getElementById("acctViewType")?.value;
  return viewType === "annual";
}

function getIncomeStatementSubtitle() {
  const periodType = document.getElementById("isPeriodType")?.value || "month";
  const viewMode = document.getElementById("isViewMode")?.value || "single";
  const compare = document.querySelector('input[name="isCompareRadio"]:checked')?.value || "none";
  
  let subtitle = `${periodType.charAt(0).toUpperCase() + periodType.slice(1)}`;
  if (viewMode === "matrix") subtitle += " - Matrix View";
  if (compare !== "none") subtitle += ` (vs ${compare === "prior_period" ? "Prior Period" : "Prior Year"})`;
  
  return subtitle;
}

function getIncomeStatementTableHtml() {
  const table = document.querySelector("#incomeStatement .is-table");
  if (!table) return "<p>No data available</p>";
  
  const clone = table.cloneNode(true);
  clone.querySelectorAll(".is-row-hidden").forEach(r => r.remove());
  clone.querySelectorAll(".is-spacer-row").forEach(r => r.remove());
  
  return clone.outerHTML;
}

function getIncomeStatementCsvData() {
  const table = document.querySelector("#incomeStatement .is-table");
  if (!table) return "";
  
  let csv = "";
  const rows = table.querySelectorAll("tr:not(.is-row-hidden):not(.is-spacer-row)");
  rows.forEach(row => {
    const cells = row.querySelectorAll("th, td");
    csv += Array.from(cells).map(c => `"${c.textContent.trim()}"`).join(",") + "\n";
  });
  return csv;
}

function isIncomeStatementWide() {
  const viewMode = document.getElementById("isViewMode")?.value;
  return viewMode === "matrix";
}

function generateReportHtml(data, forEmail = false) {
  const orientation = data.isWide ? "landscape" : "portrait";
  const pageSize = data.isWide ? "11in 8.5in" : "8.5in 11in";
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>FTG Builders - ${data.title}</title>
      <style>
        @page { size: ${pageSize}; margin: 0.5in; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        body { 
          font-family: Arial, sans-serif; 
          padding: ${forEmail ? "20px" : "0.5in"}; 
          margin: 0;
          font-size: ${data.isWide ? "9pt" : "10pt"};
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          border-bottom: 2px solid #1f2937; 
          padding-bottom: 10px; 
          margin-bottom: 15px; 
        }
        .header h1 { color: #1f2937; margin: 0; font-size: ${data.isWide ? "16pt" : "18pt"}; }
        .header h2 { color: #6b7280; margin: 5px 0 0 0; font-weight: normal; font-size: ${data.isWide ? "11pt" : "12pt"}; }
        .logo-section { text-align: right; }
        .logo-section img { height: 40px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { 
          border: 1px solid #d1d5db; 
          padding: ${data.isWide ? "4px 6px" : "6px 10px"}; 
          text-align: left; 
          font-size: ${data.isWide ? "8pt" : "9pt"};
        }
        th { background: #f3f4f6; font-weight: 600; }
        tr:nth-child(even) { background: #f9fafb; }
        .is-major-total td, .is-major-total th { background: #e5e7eb; font-weight: bold; }
        .footer { 
          margin-top: 20px; 
          padding-top: 10px; 
          border-top: 1px solid #e5e7eb; 
          color: #9ca3af; 
          font-size: 9pt; 
          display: flex; 
          justify-content: space-between; 
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>FTG Builders - ${data.title}</h1>
          <h2>${data.subtitle}</h2>
        </div>
        <div class="logo-section">
          <div style="font-weight: bold; color: #1f2937;">FTG BUILDERS</div>
        </div>
      </div>
      ${data.tableHtml}
      <div class="footer">
        <span>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</span>
        <span>FTG Dashboard</span>
      </div>
    </body>
    </html>
  `;
}

function universalPrint() {
  const data = getReportData();
  if (!data) return alert("Please navigate to Revenue, Account, or Income Statement view to print.");
  
  const html = generateReportHtml(data);
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

function universalExportToPdf() {
  const data = getReportData();
  if (!data) return alert("Please navigate to Revenue, Account, or Income Statement view to export.");
  
  const html = generateReportHtml(data);
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

function universalExportToCsv() {
  const data = getReportData();
  if (!data) return alert("Please navigate to Revenue, Account, or Income Statement view to export.");
  
  const view = getCurrentView();
  const filename = `ftg_${view}_${new Date().toISOString().split("T")[0]}.csv`;
  
  const blob = new Blob([data.csvData], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openEmailModal() {
  const data = getReportData();
  if (!data) return alert("Please navigate to Revenue, Account, or Income Statement view to email.");
  
  document.getElementById("emailSubject").value = `FTG Dashboard - ${data.title} - ${new Date().toLocaleDateString()}`;
  document.getElementById("emailTo").value = "";
  document.getElementById("emailStatus").textContent = "";
  document.getElementById("emailModal").classList.remove("hidden");
}

function closeEmailModal() {
  document.getElementById("emailModal").classList.add("hidden");
}

async function sendReportEmail() {
  const toEmail = document.getElementById("emailTo").value.trim();
  const subject = document.getElementById("emailSubject").value.trim();
  const statusEl = document.getElementById("emailStatus");
  const sendBtn = document.getElementById("sendEmailBtn");
  
  if (!toEmail) {
    statusEl.textContent = "Please enter a recipient email address.";
    statusEl.className = "email-status error";
    return;
  }
  
  const data = getReportData();
  if (!data) {
    statusEl.textContent = "No report data available.";
    statusEl.className = "email-status error";
    return;
  }
  
  const html = generateReportHtml(data, true);
  
  statusEl.textContent = "Sending...";
  statusEl.className = "email-status";
  sendBtn.disabled = true;
  
  try {
    const apiUrl = window.location.origin + "/api/send-email";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: toEmail, subject: subject, html: html })
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusEl.textContent = "Email sent successfully!";
      statusEl.className = "email-status success";
      setTimeout(closeEmailModal, 2000);
    } else {
      statusEl.textContent = result.error || "Failed to send email.";
      statusEl.className = "email-status error";
    }
  } catch (err) {
    statusEl.textContent = "Error sending email: " + err.message;
    statusEl.className = "email-status error";
  } finally {
    sendBtn.disabled = false;
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
  const cagrEl = document.getElementById(prefix + "CagrValue");
  cagrEl.innerText = (cagr >= 0 ? "+" : "") + cagr.toFixed(1) + "%";
  cagrEl.style.color = cagr < 0 ? "#dc2626" : "";
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
    const barDatasets = [...datasets];
    barDatasets.forEach((ds) => {
      if (ds.label === "Prior Year") return;
      const trendData = calculateTrendline(ds.data);
      datasets.push({
        label: `${ds.label} Trend`,
        data: trendData,
        type: "line",
        borderColor: "#10b981",
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
  
  let tileLabels = labels;
  if (view === "monthly") {
    tileLabels = labels.map(l => `${l} ${year}`);
  } else if (view === "quarterly") {
    tileLabels = labels.map(l => `${l} ${year}`);
  }
  updateSummaryTiles("rev", currentValues, tileLabels);
  
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
              size: 12,
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
    const barDatasets = datasets.filter(ds => ds.type !== "line");
    barDatasets.forEach((ds) => {
      if (ds.label === "Prior Year") return;
      if (ds.data.length > 1) {
        const trendData = calculateTrendline(ds.data);
        datasets.push({
          label: `${ds.label} Trend`,
          data: trendData,
          type: "line",
          borderColor: "#10b981",
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
  
  let tileLabels = labels;
  if (view === "monthly") {
    tileLabels = labels.map(l => `${l} ${year}`);
  } else if (view === "quarterly") {
    tileLabels = labels.map(l => `${l} ${year}`);
  }
  updateSummaryTiles("acct", currentValues, tileLabels);
  
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
            size: 12,
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

function applyDetailLevel(level) {
  const summaryExpanded = [];
  
  const mediumExpanded = [
    "Revenue",
    "Total Cost of Sales",
    "Total Direct Expenses",
    "Total Indirect Expenses",
    "Operating Expenses",
    "Other Income/(Expense)",
    "Taxes"
  ];
  
  const accountExpanded = [
    "Revenue",
    "Total Cost of Sales",
    "Total Direct Expenses",
    "Total Indirect Expenses",
    "Direct Labor",
    "Indirect Labor",
    "Vehicle Expense",
    "Operating Expenses",
    "Salaries & Benefits",
    "Facility",
    "Travel & Entertainment",
    "Insurance",
    "Professional Services",
    "Administrative & Other",
    "Other Income/(Expense)",
    "Taxes"
  ];
  
  let expandedLabels = [];
  if (level === "summary") {
    expandedLabels = summaryExpanded;
  } else if (level === "medium") {
    expandedLabels = mediumExpanded;
  } else if (level === "account") {
    expandedLabels = accountExpanded;
  }
  
  Object.keys(isRowStates).forEach(key => {
    isRowStates[key] = false;
  });
  
  expandedLabels.forEach(label => {
    const rowId = `is-row-${label.replace(/\s+/g, '_')}`;
    isRowStates[rowId] = true;
  });
}

let isControlsInitialized = false;

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
    } catch (err) {
      console.error("Failed to load Income Statement data:", err);
      return;
    }
  }
  
  if (!isControlsInitialized) {
    initIncomeStatementControls();
    isControlsInitialized = true;
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
  
  const compareRadios = document.querySelectorAll('input[name="isCompareRadio"]');
  compareRadios.forEach(radio => {
    radio.onchange = () => renderIncomeStatement();
  });
  
  showSubtotal.onchange = () => renderIncomeStatement();
  
  const showThousands = document.getElementById("isShowThousands");
  showThousands.onchange = () => renderIncomeStatement();
  
  const excludeCurrent = document.getElementById("isExcludeCurrent");
  excludeCurrent.onchange = () => renderIncomeStatement();
  
  const detailRadios = document.querySelectorAll('input[name="isDetailLevel"]');
  detailRadios.forEach(radio => {
    radio.onchange = () => {
      applyDetailLevel(radio.value);
      renderIncomeStatement();
    };
  });
  
  const initialDetail = document.querySelector('input[name="isDetailLevel"]:checked');
  applyDetailLevel(initialDetail ? initialDetail.value : 'summary');
  
  updateMatrixControlsVisibility();
  
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
  const showSubtotalWrapper = document.getElementById("isShowSubtotalWrapper");
  
  const ytdOption = periodTypeSelect.querySelector('option[value="ytd"]');
  const ttmOption = periodTypeSelect.querySelector('option[value="ttm"]');
  
  if (viewMode === "matrix") {
    singleControls.classList.add("hidden");
    matrixControls.classList.remove("hidden");
    if (showSubtotalWrapper) showSubtotalWrapper.classList.remove("hidden");
    
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
    if (showSubtotalWrapper) showSubtotalWrapper.classList.add("hidden");
    
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

function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function getPeriodMonths(periodValue, periodType) {
  const months = getAvailableMonths();
  const excludeCurrent = document.getElementById("isExcludeCurrent")?.checked;
  const currentMonthKey = getCurrentMonthKey();
  
  let result = [];
  
  if (periodType === "month") {
    result = [periodValue];
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    const q = parseInt(qStr);
    const startMonth = (q - 1) * 3 + 1;
    for (let m = startMonth; m < startMonth + 3; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) result.push(key);
    }
  } else if (periodType === "year") {
    result = months.filter(m => m.startsWith(periodValue + "-"));
  } else if (periodType === "ytd") {
    const parts = periodValue.split("-YTD-");
    const y = parts[0];
    const endMonth = parseInt(parts[1]);
    for (let m = 1; m <= endMonth; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) result.push(key);
    }
  } else if (periodType === "ttm") {
    const endMonth = periodValue.replace("TTM-", "");
    const endIdx = months.indexOf(endMonth);
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - 11);
    result = months.slice(startIdx, endIdx + 1);
  }
  
  if (excludeCurrent) {
    result = result.filter(m => m !== currentMonthKey);
  }
  
  return result;
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
      if (group.negate) {
        value = -value;
      } else if (isIncomeAccountGroup(group)) {
        value = Math.abs(value);
      }
    } else if (group.accounts_range) {
      value = sumAccountsForPeriod(group.accounts_range, periodMonths, true);
      if (group.negate) {
        value = -value;
      } else if (isIncomeAccountGroup(group)) {
        value = Math.abs(value);
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
  
  const pctFormatted = `<span class="${colorClass}">${pct.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}%</span>`;
  
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
  const footnote = document.getElementById("isPartialFootnote");
  
  let hasPartialPeriod = false;
  
  if (viewMode === "matrix") {
    const showSubtotal = document.getElementById("isShowSubtotal").checked;
    const yearStart = document.getElementById("isMatrixYearStart").value;
    const yearEnd = document.getElementById("isMatrixYearEnd").value;
    
    let selectedYear = periodValue;
    
    hasPartialPeriod = renderMatrixView(groups, periodType, selectedYear, yearStart, yearEnd, showSubtotal, thead, tbody);
  } else {
    const compare = document.querySelector('input[name="isCompareRadio"]:checked')?.value || "none";
    hasPartialPeriod = renderSinglePeriodView(groups, periodType, periodValue, compare, thead, tbody);
  }
  
  if (footnote) {
    if (hasPartialPeriod) {
      footnote.classList.remove("hidden");
    } else {
      footnote.classList.add("hidden");
    }
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
    
    const majorTotalLabels = ["Revenue", "Total Cost of Sales", "Gross Profit", "Operating Expenses", "Operating Income", "Net Profit Before Taxes", "Net Profit After Taxes"];
    const isMajorTotal = majorTotalLabels.includes(row.label);
    const isBlueSubtotal = row.label === "Total Cost of Sales" || row.label === "Operating Expenses";
    
    if (!isMajorTotal && row.type !== "ratio" && row.type !== "header") {
      const currentZero = row.value === 0 || row.value === null;
      const compZero = !comparisonRows || comparisonRows[i].value === 0 || comparisonRows[i].value === null;
      if (currentZero && compZero) {
        return;
      }
    }
    
    const isVisible = isRowVisibleByParent(row, rows);
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const isIncome = row.isIncome || false;
    const majorTotalClass = isMajorTotal && !isBlueSubtotal ? "is-major-total" : "";
    const blueSubtotalClass = isBlueSubtotal ? "is-blue-subtotal" : "";
    
    let expandedSubtotalClass = "";
    let childRowClass = "";
    
    if (row.expandable && isRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
    }
    
    if (row.parent) {
      const parentRow = rows.find(r => r.label === row.parent);
      if (parentRow && isRowStates[parentRow.id] === true) {
        childRowClass = "is-child-row";
      }
    }
    
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
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${majorTotalClass} ${blueSubtotalClass} ${expandedSubtotalClass} ${childRowClass}" data-row-id="${row.id}">`;
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
        bodyHtml += `<td class="${pctClass}">${diffPct.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}%</td>`;
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
  
  return isPartialPeriod(periodValue, periodType);
}

function renderMatrixView(groups, periodType, selectedYear, yearStart, yearEnd, showSubtotal, thead, tbody) {
  if (periodType === "ytd" || periodType === "ttm") {
    thead.innerHTML = "<tr><th colspan='2'>Matrix view is not available for YTD or TTM period types</th></tr>";
    tbody.innerHTML = "";
    return false;
  }
  
  const periods = getMatrixPeriodsNew(periodType, selectedYear, yearStart, yearEnd);
  
  if (periods.length === 0) {
    thead.innerHTML = "<tr><th>No data available for selected period</th></tr>";
    tbody.innerHTML = "";
    return false;
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
    
    const majorTotalLabels = ["Revenue", "Total Cost of Sales", "Gross Profit", "Operating Expenses", "Operating Income", "Net Profit Before Taxes", "Net Profit After Taxes"];
    const isMajorTotal = majorTotalLabels.includes(row.label);
    const isBlueSubtotal = row.label === "Total Cost of Sales" || row.label === "Operating Expenses";
    
    if (!isMajorTotal && row.type !== "ratio" && row.type !== "header") {
      const allZero = allPeriodRows.every(periodRows => {
        const pRow = periodRows[i];
        return pRow.value === 0 || pRow.value === null;
      });
      if (allZero) {
        return;
      }
    }
    
    const isVisible = isRowVisibleByParent(row, firstRows);
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const majorTotalClass = isMajorTotal && !isBlueSubtotal ? "is-major-total" : "";
    const blueSubtotalClass = isBlueSubtotal ? "is-blue-subtotal" : "";
    
    let expandedSubtotalClass = "";
    let childRowClass = "";
    
    if (row.expandable && isRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
    }
    
    if (row.parent) {
      const parentRow = firstRows.find(r => r.label === row.parent);
      if (parentRow && isRowStates[parentRow.id] === true) {
        childRowClass = "is-child-row";
      }
    }
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = isRowStates[row.id] === true;
      toggleHtml = `<span class="is-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${majorTotalClass} ${blueSubtotalClass} ${expandedSubtotalClass} ${childRowClass}" data-row-id="${row.id}">`;
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
  
  return periods.some(p => p.isPartial);
}

function getMatrixPeriodsNew(periodType, selectedYear, yearStart, yearEnd) {
  const months = getAvailableMonths();
  const periods = [];
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);
  const currentMonthKey = getCurrentMonthKey();
  const excludeCurrent = document.getElementById("isExcludeCurrent")?.checked;
  
  if (periodType === "year") {
    const startYr = parseInt(yearStart);
    const endYr = parseInt(yearEnd);
    for (let y = startYr; y <= endYr; y++) {
      let yearMonths = months.filter(m => m.startsWith(y + "-"));
      if (excludeCurrent) {
        yearMonths = yearMonths.filter(m => m !== currentMonthKey);
      }
      if (yearMonths.length > 0) {
        periods.push({
          label: String(y),
          months: yearMonths,
          isPartial: y === currentYear && !excludeCurrent
        });
      }
    }
  } else if (periodType === "quarter") {
    const selYear = parseInt(selectedYear);
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3 + 1;
      let quarterMonths = [];
      for (let m = startMonth; m < startMonth + 3; m++) {
        const key = `${selectedYear}-${String(m).padStart(2, "0")}`;
        if (months.includes(key)) quarterMonths.push(key);
      }
      if (excludeCurrent) {
        quarterMonths = quarterMonths.filter(m => m !== currentMonthKey);
      }
      if (quarterMonths.length > 0) {
        periods.push({
          label: `Q${q}`,
          months: quarterMonths,
          isPartial: selYear === currentYear && q === currentQuarter && !excludeCurrent
        });
      }
    }
  } else if (periodType === "month") {
    const selYear = parseInt(selectedYear);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      const key = `${selectedYear}-${String(m).padStart(2, "0")}`;
      if (excludeCurrent && key === currentMonthKey) continue;
      if (months.includes(key)) {
        periods.push({
          label: monthNames[m - 1],
          months: [key],
          isPartial: selYear === currentYear && m === currentMonth && !excludeCurrent
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



