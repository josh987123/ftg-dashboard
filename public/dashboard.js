/* ============================================================
   FTG DASHBOARD — COMPLETE RESPONSIVE SCRIPT (PART 1 OF 3)
============================================================ */

/* ------------------------------------------------------------
   CHART FULLSCREEN FUNCTIONALITY
------------------------------------------------------------ */
let fullscreenChartInstance = null;

function setupChartExpandButtons() {
  document.querySelectorAll(".chart-expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const chartId = btn.dataset.chart;
      const title = btn.dataset.title;
      openChartFullscreen(chartId, title);
    });
  });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeChartFullscreen();
    }
  });
}

function openChartFullscreen(chartId, title) {
  const sourceChart = overviewChartInstances[chartId];
  if (!sourceChart) return;
  
  const modal = document.getElementById("chartFullscreenModal");
  const titleEl = document.getElementById("chartFullscreenTitle");
  const canvas = document.getElementById("chartFullscreenCanvas");
  const statsEl = document.getElementById("chartFullscreenStats");
  
  titleEl.textContent = title;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  
  const sourceStatsEl = sourceChart.canvas.closest(".overview-metric-tile")?.querySelector(".metric-stats");
  if (sourceStatsEl) {
    statsEl.innerHTML = sourceStatsEl.innerHTML;
  }
  
  if (fullscreenChartInstance) {
    fullscreenChartInstance.destroy();
  }
  
  const ctx = canvas.getContext("2d");
  const config = JSON.parse(JSON.stringify(sourceChart.config));
  
  config.data = {
    labels: [...sourceChart.data.labels],
    datasets: sourceChart.data.datasets.map(ds => ({
      ...ds,
      backgroundColor: ds.type === "line" ? "transparent" : ds.backgroundColor,
      borderColor: ds.borderColor,
      data: [...ds.data]
    }))
  };
  
  config.options = {
    ...sourceChart.options,
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 30 } },
    plugins: {
      ...sourceChart.options.plugins,
      legend: { 
        display: true, 
        position: "bottom",
        labels: { color: "#fff", font: { size: 14 } }
      },
      datalabels: {
        display: true,
        anchor: "end",
        align: "top",
        offset: 4,
        font: { size: 12, weight: "600" },
        color: "#fff",
        formatter: (value) => {
          if (value === 0 || value === null) return "";
          const isPercent = title.includes("%");
          if (isPercent) return value.toFixed(1) + "%";
          if (Math.abs(value) >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
          if (Math.abs(value) >= 1000) return "$" + (value / 1000).toFixed(0) + "K";
          return "$" + value.toFixed(0);
        }
      }
    },
    scales: {
      x: { 
        grid: { color: "rgba(255,255,255,0.1)" },
        ticks: { color: "#fff", font: { size: 14 } }
      },
      y: {
        grid: { color: "rgba(255,255,255,0.1)" },
        ticks: { 
          color: "#fff",
          font: { size: 12 },
          callback: v => {
            const isPercent = title.includes("%");
            if (isPercent) return v.toFixed(0) + "%";
            if (Math.abs(v) >= 1000000) return "$" + (v / 1000000).toFixed(1) + "M";
            return "$" + (v / 1000).toFixed(0) + "K";
          }
        }
      }
    }
  };
  
  fullscreenChartInstance = new Chart(ctx, {
    type: "bar",
    data: config.data,
    plugins: [ChartDataLabels],
    options: config.options
  });
}

function closeChartFullscreen() {
  const modal = document.getElementById("chartFullscreenModal");
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  
  if (fullscreenChartInstance) {
    fullscreenChartInstance.destroy();
    fullscreenChartInstance = null;
  }
}

/* ------------------------------------------------------------
   USER SESSION MANAGEMENT
------------------------------------------------------------ */
function initAuth() {
  const loginScreen = document.getElementById("loginScreen");
  const logoutBtn = document.getElementById("logoutBtn");
  const currentUserEl = document.getElementById("currentUser");
  
  const isAuthenticated = localStorage.getItem("ftg_authenticated");
  const currentUser = localStorage.getItem("ftg_current_user");
  
  if (isAuthenticated === "true" && currentUser) {
    loginScreen.classList.add("hidden");
    if (currentUserEl) {
      const displayName = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
      currentUserEl.textContent = displayName;
    }
  }
  
  if (logoutBtn) {
    logoutBtn.onclick = function() {
      localStorage.removeItem("ftg_authenticated");
      localStorage.removeItem("ftg_current_user");
      if (currentUserEl) currentUserEl.textContent = "";
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
  setupChartExpandButtons();
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
      if (id === "balanceSheet") initBalanceSheet();
    });
  });
}

/* ------------------------------------------------------------
   EXECUTIVE OVERVIEW MODULE
------------------------------------------------------------ */
document.getElementById("currentUser").innerText = "";

let overviewDataCache = null;
let overviewChartInstances = {};

/* ------------------------------------------------------------
   USER PREFERENCES SYSTEM
------------------------------------------------------------ */
const metricTileMapping = {
  revenue: "overviewRevenueChart",
  grossProfit: "overviewGrossProfitChart",
  grossMargin: "overviewGrossMarginChart",
  opExpenses: "overviewOpexChart",
  opProfit: "overviewOpProfitChart",
  opMargin: "overviewOpMarginChart"
};

function getCurrentUser() {
  try {
    return localStorage.getItem("ftg_current_user") || null;
  } catch (e) {
    console.warn("Unable to access localStorage:", e);
    return null;
  }
}

function getUserPreferences() {
  try {
    const user = getCurrentUser();
    if (!user) return {};
    const stored = localStorage.getItem(`ftg_prefs_${user}`);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (e) {
    console.warn("Error reading preferences:", e);
    return {};
  }
}

function saveUserPreferences(prefs) {
  try {
    const user = getCurrentUser();
    if (!user) return;
    const existing = getUserPreferences();
    const merged = { ...existing, ...prefs };
    localStorage.setItem(`ftg_prefs_${user}`, JSON.stringify(merged));
  } catch (e) {
    console.warn("Error saving preferences:", e);
  }
}

/* ------------------------------------------------------------
   SAVED VIEWS MANAGER - Named view configurations per page
------------------------------------------------------------ */
const SavedViewManager = {
  getStorageKey() {
    const user = getCurrentUser();
    return user ? `ftg_views_${user}` : null;
  },
  
  getAllViews() {
    try {
      const key = this.getStorageKey();
      if (!key) return {};
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.warn("Error reading saved views:", e);
      return {};
    }
  },
  
  saveAllViews(data) {
    try {
      const key = this.getStorageKey();
      if (!key) return false;
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn("Error saving views:", e);
      return false;
    }
  },
  
  getPageViews(page) {
    const all = this.getAllViews();
    return all[page] || { selectedId: null, views: {} };
  },
  
  saveView(page, name, config) {
    const all = this.getAllViews();
    if (!all[page]) all[page] = { selectedId: null, views: {} };
    const id = "view_" + Date.now();
    all[page].views[id] = { name, config, createdAt: new Date().toISOString() };
    all[page].selectedId = id;
    this.saveAllViews(all);
    return id;
  },
  
  deleteView(page, viewId) {
    const all = this.getAllViews();
    if (all[page] && all[page].views[viewId]) {
      delete all[page].views[viewId];
      if (all[page].selectedId === viewId) {
        all[page].selectedId = null;
      }
      this.saveAllViews(all);
      return true;
    }
    return false;
  },
  
  selectView(page, viewId) {
    const all = this.getAllViews();
    if (!all[page]) all[page] = { selectedId: null, views: {} };
    all[page].selectedId = viewId;
    this.saveAllViews(all);
  },
  
  getSelectedView(page) {
    const pageData = this.getPageViews(page);
    if (pageData.selectedId && pageData.views[pageData.selectedId]) {
      return { id: pageData.selectedId, ...pageData.views[pageData.selectedId] };
    }
    return null;
  }
};

function generateViewId() {
  return "view_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

let isLoadingPreferences = false;

function loadUserPreferences() {
  const user = getCurrentUser();
  if (!user) return;
  
  isLoadingPreferences = true;
  
  try {
    const prefs = getUserPreferences();
    
    if (prefs.overviewMetrics) {
      Object.keys(metricTileMapping).forEach(metric => {
        const checkbox = document.querySelector(`[data-metric="${metric}"]`);
        if (checkbox) {
          checkbox.checked = prefs.overviewMetrics[metric] !== false;
        }
      });
    }
    
    const viewEl = document.getElementById("overviewViewType");
    const yearWrapper = document.getElementById("overviewYearWrapper");
    const rangeWrapper = document.getElementById("overviewRangeWrapper");
    
    if (yearWrapper) yearWrapper.classList.remove("hidden");
    if (rangeWrapper) rangeWrapper.classList.add("hidden");
    if (viewEl) viewEl.value = "monthly";
    
    if (prefs.overviewConfig) {
      const cfg = prefs.overviewConfig;
      
      if (cfg.viewType && viewEl) {
        viewEl.value = cfg.viewType;
        if (cfg.viewType === "annual") {
          if (yearWrapper) yearWrapper.classList.add("hidden");
          if (rangeWrapper) rangeWrapper.classList.remove("hidden");
        }
      }
      if (cfg.year) {
        const yearEl = document.getElementById("overviewYear");
        if (yearEl) yearEl.value = cfg.year;
      }
      if (typeof cfg.compare === "boolean") {
        const compareEl = document.getElementById("overviewCompare");
        if (compareEl) compareEl.checked = cfg.compare;
      }
      if (typeof cfg.trendline === "boolean") {
        const trendEl = document.getElementById("overviewTrend");
        if (trendEl) trendEl.checked = cfg.trendline;
      }
      if (typeof cfg.dataLabels === "boolean") {
        const dataLabelsEl = document.getElementById("overviewDataLabels");
        if (dataLabelsEl) dataLabelsEl.checked = cfg.dataLabels;
      }
      if (typeof cfg.excludeCurrent === "boolean") {
        const excludeEl = document.getElementById("overviewExclude");
        if (excludeEl) excludeEl.checked = cfg.excludeCurrent;
      }
    }
    
    applyMetricVisibility();
    updateShowAllCheckbox();
  } finally {
    isLoadingPreferences = false;
  }
}

function applyMetricVisibility() {
  const metricCheckboxes = document.querySelectorAll("[data-metric]");
  metricCheckboxes.forEach(cb => {
    const metric = cb.dataset.metric;
    const chartId = metricTileMapping[metric];
    const canvas = document.getElementById(chartId);
    if (canvas) {
      const tile = canvas.closest(".overview-metric-tile");
      if (tile) {
        tile.style.display = cb.checked ? "" : "none";
      }
    }
  });
}

function updateMetricVisibility() {
  applyMetricVisibility();
  
  if (!isLoadingPreferences) {
    const metricCheckboxes = document.querySelectorAll("[data-metric]");
    const visiblePrefs = {};
    metricCheckboxes.forEach(cb => {
      visiblePrefs[cb.dataset.metric] = cb.checked;
    });
    saveUserPreferences({ overviewMetrics: visiblePrefs });
  }
}

function updateShowAllCheckbox() {
  const showAllCheck = document.getElementById("showAllMetrics");
  if (!showAllCheck) return;
  
  const metricCheckboxes = document.querySelectorAll("[data-metric]");
  const allChecked = Array.from(metricCheckboxes).every(cb => cb.checked);
  showAllCheck.checked = allChecked;
}

function saveOverviewConfig() {
  const cfg = {
    viewType: document.getElementById("overviewViewType")?.value,
    year: document.getElementById("overviewYear")?.value,
    compare: document.getElementById("overviewCompare")?.checked,
    trendline: document.getElementById("overviewTrend")?.checked,
    dataLabels: document.getElementById("overviewDataLabels")?.checked,
    excludeCurrent: document.getElementById("overviewExclude")?.checked
  };
  saveUserPreferences({ overviewConfig: cfg });
}

function saveRevenueConfig() {
  const cfg = {
    viewType: document.getElementById("revViewType")?.value,
    year: document.getElementById("revYear")?.value,
    compare: document.getElementById("revCompare")?.checked,
    trendline: document.getElementById("revTrendline")?.checked,
    dataLabels: document.getElementById("revDataLabels")?.checked,
    excludeCurrent: document.getElementById("revExcludeCurrent")?.checked,
    rangeStart: document.getElementById("revRangeStart")?.value,
    rangeEnd: document.getElementById("revRangeEnd")?.value
  };
  saveUserPreferences({ revenueConfig: cfg });
}

function saveAccountConfig() {
  const cfg = {
    account: document.getElementById("acctSelect")?.value,
    viewType: document.getElementById("acctViewType")?.value,
    year: document.getElementById("acctYear")?.value,
    trendline: document.getElementById("acctTrendline")?.checked,
    dataLabels: document.getElementById("acctDataLabels")?.checked,
    excludeCurrent: document.getElementById("acctExcludeCurrent")?.checked,
    rangeStart: document.getElementById("acctRangeStart")?.value,
    rangeEnd: document.getElementById("acctRangeEnd")?.value
  };
  saveUserPreferences({ accountConfig: cfg });
}

function saveIncomeStatementConfig() {
  const cfg = {
    viewMode: document.getElementById("isViewMode")?.value,
    periodType: document.getElementById("isPeriodType")?.value,
    periodSelect: document.getElementById("isPeriodSelect")?.value,
    compare: document.querySelector('input[name="isCompareRadio"]:checked')?.value,
    detailLevel: document.querySelector('input[name="isDetailLevel"]:checked')?.value,
    showThousands: document.getElementById("isShowThousands")?.checked,
    excludeCurrent: document.getElementById("isExcludeCurrent")?.checked,
    matrixMonths: document.getElementById("isMatrixMonths")?.value,
    matrixYearStart: document.getElementById("isMatrixYearStart")?.value,
    matrixYearEnd: document.getElementById("isMatrixYearEnd")?.value
  };
  saveUserPreferences({ incomeStatementConfig: cfg });
}

function saveBalanceSheetConfig() {
  const cfg = {
    viewMode: document.getElementById("bsViewMode")?.value,
    periodType: document.getElementById("bsPeriodType")?.value,
    periodSelect: document.getElementById("bsPeriodSelect")?.value,
    compare: document.querySelector('input[name="bsCompareRadio"]:checked')?.value,
    detailLevel: document.querySelector('input[name="bsDetailLevel"]:checked')?.value,
    showThousands: document.getElementById("bsShowThousands")?.checked,
    excludeCurrentMonth: document.getElementById("bsExcludeCurrentMonth")?.checked,
    matrixYear: document.getElementById("bsMatrixYear")?.value,
    matrixYearStart: document.getElementById("bsMatrixYearStart")?.value,
    matrixYearEnd: document.getElementById("bsMatrixYearEnd")?.value
  };
  saveUserPreferences({ balanceSheetConfig: cfg });
}

function loadRevenueConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.revenueConfig;
  if (!cfg) return;
  
  if (cfg.viewType) {
    const el = document.getElementById("revViewType");
    if (el) el.value = cfg.viewType;
  }
  if (cfg.year) {
    const el = document.getElementById("revYear");
    if (el && el.querySelector(`option[value="${cfg.year}"]`)) el.value = cfg.year;
  }
  if (cfg.compare !== undefined) {
    const el = document.getElementById("revCompare");
    if (el) el.checked = cfg.compare;
  }
  if (cfg.trendline !== undefined) {
    const el = document.getElementById("revTrendline");
    if (el) el.checked = cfg.trendline;
  }
  if (cfg.dataLabels !== undefined) {
    const el = document.getElementById("revDataLabels");
    if (el) el.checked = cfg.dataLabels;
  }
  if (cfg.excludeCurrent !== undefined) {
    const el = document.getElementById("revExcludeCurrent");
    if (el) el.checked = cfg.excludeCurrent;
  }
  if (cfg.rangeStart) {
    const el = document.getElementById("revRangeStart");
    if (el) {
      el.value = cfg.rangeStart;
      document.getElementById("revRangeStartLabel").textContent = cfg.rangeStart;
    }
  }
  if (cfg.rangeEnd) {
    const el = document.getElementById("revRangeEnd");
    if (el) {
      el.value = cfg.rangeEnd;
      document.getElementById("revRangeEndLabel").textContent = cfg.rangeEnd;
    }
  }
}

function loadAccountConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.accountConfig;
  if (!cfg) return;
  
  if (cfg.account) {
    const el = document.getElementById("acctSelect");
    if (el && el.querySelector(`option[value="${cfg.account}"]`)) el.value = cfg.account;
  }
  if (cfg.viewType) {
    const el = document.getElementById("acctViewType");
    if (el) el.value = cfg.viewType;
  }
  if (cfg.year) {
    const el = document.getElementById("acctYear");
    if (el && el.querySelector(`option[value="${cfg.year}"]`)) el.value = cfg.year;
  }
  if (cfg.trendline !== undefined) {
    const el = document.getElementById("acctTrendline");
    if (el) el.checked = cfg.trendline;
  }
  if (cfg.dataLabels !== undefined) {
    const el = document.getElementById("acctDataLabels");
    if (el) el.checked = cfg.dataLabels;
  }
  if (cfg.excludeCurrent !== undefined) {
    const el = document.getElementById("acctExcludeCurrent");
    if (el) el.checked = cfg.excludeCurrent;
  }
  if (cfg.rangeStart) {
    const el = document.getElementById("acctRangeStart");
    if (el) {
      el.value = cfg.rangeStart;
      document.getElementById("acctRangeStartLabel").textContent = cfg.rangeStart;
    }
  }
  if (cfg.rangeEnd) {
    const el = document.getElementById("acctRangeEnd");
    if (el) {
      el.value = cfg.rangeEnd;
      document.getElementById("acctRangeEndLabel").textContent = cfg.rangeEnd;
    }
  }
}

function loadIncomeStatementConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.incomeStatementConfig;
  if (!cfg) return;
  
  if (cfg.viewMode) {
    const el = document.getElementById("isViewMode");
    if (el) el.value = cfg.viewMode;
  }
  if (cfg.periodType) {
    const el = document.getElementById("isPeriodType");
    if (el) el.value = cfg.periodType;
  }
  if (cfg.periodSelect) {
    const el = document.getElementById("isPeriodSelect");
    if (el && el.querySelector(`option[value="${cfg.periodSelect}"]`)) el.value = cfg.periodSelect;
  }
  if (cfg.compare) {
    const radio = document.querySelector(`input[name="isCompareRadio"][value="${cfg.compare}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.detailLevel) {
    const radio = document.querySelector(`input[name="isDetailLevel"][value="${cfg.detailLevel}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.showThousands !== undefined) {
    const el = document.getElementById("isShowThousands");
    if (el) el.checked = cfg.showThousands;
  }
  if (cfg.excludeCurrent !== undefined) {
    const el = document.getElementById("isExcludeCurrent");
    if (el) el.checked = cfg.excludeCurrent;
  }
  if (cfg.matrixMonths) {
    const el = document.getElementById("isMatrixMonths");
    if (el) el.value = cfg.matrixMonths;
  }
  if (cfg.matrixYearStart) {
    const el = document.getElementById("isMatrixYearStart");
    if (el) {
      el.value = cfg.matrixYearStart;
      const label = document.getElementById("isMatrixYearStartLabel");
      if (label) label.textContent = cfg.matrixYearStart;
    }
  }
  if (cfg.matrixYearEnd) {
    const el = document.getElementById("isMatrixYearEnd");
    if (el) {
      el.value = cfg.matrixYearEnd;
      const label = document.getElementById("isMatrixYearEndLabel");
      if (label) label.textContent = cfg.matrixYearEnd;
    }
  }
}

function loadBalanceSheetConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.balanceSheetConfig;
  if (!cfg) return;
  
  if (cfg.viewMode) {
    const el = document.getElementById("bsViewMode");
    if (el) el.value = cfg.viewMode;
  }
  if (cfg.periodType) {
    const el = document.getElementById("bsPeriodType");
    if (el) el.value = cfg.periodType;
  }
  if (cfg.periodSelect) {
    const el = document.getElementById("bsPeriodSelect");
    if (el && el.querySelector(`option[value="${cfg.periodSelect}"]`)) el.value = cfg.periodSelect;
  }
  if (cfg.compare) {
    const radio = document.querySelector(`input[name="bsCompareRadio"][value="${cfg.compare}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.detailLevel) {
    const radio = document.querySelector(`input[name="bsDetailLevel"][value="${cfg.detailLevel}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.showThousands !== undefined) {
    const el = document.getElementById("bsShowThousands");
    if (el) el.checked = cfg.showThousands;
  }
  if (cfg.excludeCurrentMonth !== undefined) {
    const el = document.getElementById("bsExcludeCurrentMonth");
    if (el) el.checked = cfg.excludeCurrentMonth;
  }
  if (cfg.matrixYear) {
    const el = document.getElementById("bsMatrixYear");
    if (el && el.querySelector(`option[value="${cfg.matrixYear}"]`)) el.value = cfg.matrixYear;
  }
  if (cfg.matrixYearStart) {
    const el = document.getElementById("bsMatrixYearStart");
    if (el) {
      el.value = cfg.matrixYearStart;
      const label = document.getElementById("bsMatrixYearStartLabel");
      if (label) label.textContent = cfg.matrixYearStart;
    }
  }
  if (cfg.matrixYearEnd) {
    const el = document.getElementById("bsMatrixYearEnd");
    if (el) {
      el.value = cfg.matrixYearEnd;
      const label = document.getElementById("bsMatrixYearEndLabel");
      if (label) label.textContent = cfg.matrixYearEnd;
    }
  }
}

window.loadUserPreferences = loadUserPreferences;
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
  try {
    const viewType = document.getElementById("overviewViewType");
    const yearSelect = document.getElementById("overviewYear");
    const yearWrapper = document.getElementById("overviewYearWrapper");
    const rangeWrapper = document.getElementById("overviewRangeWrapper");
    const compareCheck = document.getElementById("overviewCompare");
    const rangeStart = document.getElementById("overviewRangeStart");
    const rangeEnd = document.getElementById("overviewRangeEnd");
    
    if (!viewType || !yearSelect || !rangeStart || !rangeEnd) {
      console.error("Overview UI elements not found");
      return;
    }
    
    if (!overviewDataCache || !overviewDataCache.revenue) {
      console.error("Overview data not loaded");
      return;
    }
    
    const years = Object.keys(overviewDataCache.revenue).map(Number).sort((a, b) => a - b);
    if (years.length === 0) {
      console.error("No years found in revenue data");
      return;
    }
    
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
    saveOverviewConfig();
  };
  
  const excludeCheck = document.getElementById("overviewExclude");
  const dataLabelsCheck = document.getElementById("overviewDataLabels");
  
  yearSelect.onchange = () => { updateOverviewCharts(); saveOverviewConfig(); };
  compareCheck.onchange = () => { updateOverviewCharts(); saveOverviewConfig(); };
  trendCheck.onchange = () => { updateOverviewCharts(); saveOverviewConfig(); };
  excludeCheck.onchange = () => { updateOverviewCharts(); saveOverviewConfig(); };
  dataLabelsCheck.onchange = () => { updateOverviewCharts(); saveOverviewConfig(); };
  
  rangeStart.oninput = () => {
    if (+rangeStart.value > +rangeEnd.value) rangeStart.value = rangeEnd.value;
    document.getElementById("overviewRangeStartLabel").textContent = rangeStart.value;
    updateOverviewCharts();
    saveOverviewConfig();
  };
  
  rangeEnd.oninput = () => {
    if (+rangeEnd.value < +rangeStart.value) rangeEnd.value = rangeStart.value;
    document.getElementById("overviewRangeEndLabel").textContent = rangeEnd.value;
    updateOverviewCharts();
    saveOverviewConfig();
  };
  
  document.querySelectorAll("[data-metric]").forEach(cb => {
    cb.onchange = () => {
      updateMetricVisibility();
      updateShowAllCheckbox();
    };
  });
  
  const showAllCheck = document.getElementById("showAllMetrics");
  if (showAllCheck) {
    showAllCheck.onchange = () => {
      const metricCheckboxes = document.querySelectorAll("[data-metric]");
      metricCheckboxes.forEach(cb => {
        cb.checked = showAllCheck.checked;
      });
      updateMetricVisibility();
    };
  }
  
  loadUserPreferences();
  
  } catch (err) {
    console.error("Error setting up overview UI:", err);
  }
}

function updateOverviewCharts() {
  try {
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
  
  const needPriorForYoY = viewType === "monthly" || viewType === "quarterly";
  
  let labels = [];
  let periods = [];
  let priorPeriods = [];
  
  if (viewType === "monthly") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      labels.push(monthNames[m - 1]);
      periods.push([key]);
      if (compare || needPriorForYoY) {
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
        if (compare || needPriorForYoY) priorQMonths.push(`${year - 1}-${String(m).padStart(2, "0")}`);
      }
      periods.push(qMonths);
      if (compare || needPriorForYoY) priorPeriods.push(priorQMonths);
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
    
    if ((compare || needPriorForYoY) && priorPeriods[idx]) {
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
  } catch (err) {
    console.error("Error updating overview charts:", err);
  }
}

function updateOverviewStats(metrics, labels) {
  try {
  const statConfigs = [
    { key: "revenue", avgId: "revenueAvg", highId: "revenueHigh", lowId: "revenueLow", cagrId: "revenueCagr", highPeriodId: "revenueHighPeriod", lowPeriodId: "revenueLowPeriod", growthLabelId: "revenueGrowthLabel", isPercent: false },
    { key: "grossProfit", avgId: "grossProfitAvg", highId: "grossProfitHigh", lowId: "grossProfitLow", cagrId: "grossProfitCagr", highPeriodId: "grossProfitHighPeriod", lowPeriodId: "grossProfitLowPeriod", growthLabelId: "grossProfitGrowthLabel", isPercent: false },
    { key: "grossMargin", avgId: "grossMarginAvg", highId: "grossMarginHigh", lowId: "grossMarginLow", cagrId: "grossMarginCagr", highPeriodId: "grossMarginHighPeriod", lowPeriodId: "grossMarginLowPeriod", growthLabelId: "grossMarginGrowthLabel", isPercent: true },
    { key: "opex", avgId: "opexAvg", highId: "opexHigh", lowId: "opexLow", cagrId: "opexCagr", highPeriodId: "opexHighPeriod", lowPeriodId: "opexLowPeriod", growthLabelId: "opexGrowthLabel", isPercent: false },
    { key: "opProfit", avgId: "opProfitAvg", highId: "opProfitHigh", lowId: "opProfitLow", cagrId: "opProfitCagr", highPeriodId: "opProfitHighPeriod", lowPeriodId: "opProfitLowPeriod", growthLabelId: "opProfitGrowthLabel", isPercent: false },
    { key: "opMargin", avgId: "opMarginAvg", highId: "opMarginHigh", lowId: "opMarginLow", cagrId: "opMarginCagr", highPeriodId: "opMarginHighPeriod", lowPeriodId: "opMarginLowPeriod", growthLabelId: "opMarginGrowthLabel", isPercent: true }
  ];
  
  const viewType = document.getElementById("overviewViewType").value;
  const year = parseInt(document.getElementById("overviewYear").value);
  
  const growthLabel = viewType === "annual" ? "CAGR" : "YoY";
  
  statConfigs.forEach(cfg => {
    document.getElementById(cfg.growthLabelId).textContent = growthLabel;
    
    const allValues = metrics[cfg.key].values;
    const priorValues = metrics[cfg.key].priorValues || [];
    const values = allValues.filter(v => v !== 0);
    
    if (values.length === 0) {
      document.getElementById(cfg.avgId).textContent = "-";
      document.getElementById(cfg.highId).textContent = "-";
      document.getElementById(cfg.lowId).textContent = "-";
      document.getElementById(cfg.cagrId).textContent = "-";
      document.getElementById(cfg.highPeriodId).textContent = "";
      document.getElementById(cfg.lowPeriodId).textContent = "";
      return;
    }
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const high = Math.max(...allValues);
    const low = Math.min(...values);
    
    const highIdx = allValues.indexOf(high);
    const lowIdx = allValues.findIndex(v => v === low && v !== 0);
    
    let highPeriod = labels[highIdx] || "";
    let lowPeriod = labels[lowIdx] || "";
    
    if (viewType === "monthly") {
      highPeriod = highPeriod + " " + year;
      lowPeriod = lowPeriod + " " + year;
    } else if (viewType === "quarterly") {
      highPeriod = highPeriod + " " + year;
      lowPeriod = lowPeriod + " " + year;
    }
    
    let growthRate = 0;
    
    if (viewType === "annual") {
      const firstNonZeroIdx = allValues.findIndex(v => v !== 0);
      const lastNonZeroIdx = allValues.length - 1 - [...allValues].reverse().findIndex(v => v !== 0);
      
      if (firstNonZeroIdx !== -1 && lastNonZeroIdx !== -1 && firstNonZeroIdx !== lastNonZeroIdx) {
        const startVal = allValues[firstNonZeroIdx];
        const endVal = allValues[lastNonZeroIdx];
        const periods = lastNonZeroIdx - firstNonZeroIdx;
        if (startVal > 0 && endVal > 0 && periods > 0) {
          growthRate = (Math.pow(endVal / startVal, 1 / periods) - 1) * 100;
        }
      }
    } else {
      let totalCurrent = 0;
      let totalPrior = 0;
      
      for (let i = 0; i < allValues.length; i++) {
        const currVal = allValues[i] || 0;
        const priorVal = priorValues[i] || 0;
        totalCurrent += currVal;
        totalPrior += priorVal;
      }
      
      if (Math.abs(totalPrior) > 0) {
        growthRate = ((totalCurrent - totalPrior) / Math.abs(totalPrior)) * 100;
      }
    }
    
    const formatValue = (val, isPercent) => {
      if (isPercent) {
        const formatted = Math.abs(val) >= 1000 
          ? val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          : val.toFixed(1);
        return formatted + "%";
      }
      if (Math.abs(val) >= 1000000) return "$" + (val / 1000000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
      if (Math.abs(val) >= 1000) return "$" + Math.round(val / 1000).toLocaleString("en-US") + "K";
      return "$" + Math.round(val).toLocaleString("en-US");
    };
    
    const formatGrowth = (val) => {
      const formatted = Math.abs(val) >= 1000 
        ? val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : val.toFixed(1);
      return formatted + "%";
    };
    
    const avgEl = document.getElementById(cfg.avgId);
    avgEl.textContent = formatValue(avg, cfg.isPercent);
    avgEl.className = avg < 0 ? "stat-value negative" : "stat-value";
    
    const highEl = document.getElementById(cfg.highId);
    highEl.textContent = formatValue(high, cfg.isPercent);
    highEl.className = high < 0 ? "stat-value negative" : "stat-value";
    
    const lowEl = document.getElementById(cfg.lowId);
    lowEl.textContent = formatValue(low, cfg.isPercent);
    lowEl.className = low < 0 ? "stat-value negative" : "stat-value";
    
    document.getElementById(cfg.highPeriodId).textContent = highPeriod;
    document.getElementById(cfg.lowPeriodId).textContent = lowPeriod;
    
    const cagrEl = document.getElementById(cfg.cagrId);
    cagrEl.textContent = formatGrowth(growthRate);
    cagrEl.className = growthRate < 0 ? "stat-value negative" : "stat-value";
  });
  } catch (err) {
    console.error("Error updating overview stats:", err);
  }
}

function createBarGradient(ctx, chartArea, colorStart, colorEnd) {
  if (!chartArea) return colorStart;
  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  gradient.addColorStop(0, colorStart);
  gradient.addColorStop(1, colorEnd);
  return gradient;
}

const gradientColors = {
  blue: { start: "#2563eb", end: "#60a5fa" },
  red: { start: "#dc2626", end: "#f87171" },
  orange: { start: "#d97706", end: "#fbbf24" }
};

function renderOverviewChart(canvasId, labels, metricData, showPrior, showTrend) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error("Canvas not found:", canvasId);
      return;
    }
    
    if (overviewChartInstances[canvasId]) {
      overviewChartInstances[canvasId].destroy();
    }
    
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Could not get 2D context for:", canvasId);
      return;
    }
    
    const datasets = [];
  
  if (showPrior && metricData.priorValues.length > 0) {
    datasets.push({
      label: "Prior Year",
      data: metricData.priorValues,
      backgroundColor: (context) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        return createBarGradient(ctx, chartArea, gradientColors.red.start, gradientColors.red.end);
      },
      borderRadius: 4,
      barPercentage: 0.9,
      categoryPercentage: 0.85
    });
  }
  
  datasets.push({
    label: "Current",
    data: metricData.values,
    backgroundColor: (context) => {
      const chart = context.chart;
      const { ctx, chartArea } = chart;
      return createBarGradient(ctx, chartArea, gradientColors.blue.start, gradientColors.blue.end);
    },
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
  
  const dataLabelsCheckbox = document.getElementById("overviewDataLabels");
  const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : true;
  
  overviewChartInstances[canvasId] = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    plugins: [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
        delay: (context) => {
          let delay = 0;
          if (context.type === 'data' && context.mode === 'default') {
            delay = context.dataIndex * 50 + context.datasetIndex * 100;
          }
          return delay;
        }
      },
      transitions: {
        active: {
          animation: {
            duration: 200
          }
        }
      },
      layout: {
        padding: { top: showDataLabels ? 20 : 0 }
      },
      plugins: {
        legend: { display: showPrior || showTrend, position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          backgroundColor: "rgba(31, 41, 55, 0.95)",
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 10,
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              if (context.dataset.type === "line") return null;
              const value = context.parsed.y;
              const datasetLabel = context.dataset.label === "Current" ? "" : context.dataset.label + ": ";
              if (metricData.isPercent) {
                return datasetLabel + value.toFixed(1) + "%";
              }
              if (Math.abs(value) >= 1000000) {
                return datasetLabel + "$" + (value / 1000000).toFixed(2) + "M";
              }
              return datasetLabel + "$" + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
          }
        },
        datalabels: {
          display: (context) => {
            if (!showDataLabels) return false;
            if (context.dataset.type === "line") return false;
            return true;
          },
          anchor: "end",
          align: "top",
          offset: 2,
          font: { size: 8, weight: "500" },
          color: "#374151",
          formatter: (value) => {
            if (value === 0 || value === null) return "";
            if (metricData.isPercent) return value.toFixed(1) + "%";
            if (Math.abs(value) >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
            if (Math.abs(value) >= 1000) return "$" + (value / 1000).toFixed(0) + "K";
            return "$" + value.toFixed(0);
          }
        }
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
  } catch (err) {
    console.error("Error rendering chart " + canvasId + ":", err);
  }
}

initOverviewModule();

/* ============================================================
   FINANCIALS SECTION (STATIC CHARTS)
============================================================ */
async function loadFinancialCharts() {
  try {
    const response = await fetch("/data/financials.json");

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
    if (spinner) spinner.classList.remove("hidden");
    
    if (!revenueDataCache) {
      const response = await fetch("/data/financials.json");
      if (!response.ok) throw new Error("Failed to fetch revenue data");
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
  const sections = ["overview", "revenue", "accounts", "incomeStatement", "balanceSheet"];
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
  } else if (view === "balanceSheet") {
    return {
      title: "Balance Sheet",
      subtitle: getBalanceSheetSubtitle(),
      tableHtml: getBalanceSheetTableHtml(),
      csvData: getBalanceSheetCsvData(),
      isWide: isBalanceSheetWide()
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
  clone.querySelectorAll(".is-toggle").forEach(t => t.remove());
  
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

function getBalanceSheetSubtitle() {
  const periodValue = document.getElementById("bsPeriodSelect")?.value || "";
  const compare = document.querySelector('input[name="bsCompareRadio"]:checked')?.value || "none";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  let subtitle = "As of ";
  if (periodValue) {
    const [y, mo] = periodValue.split("-");
    subtitle += `${monthNames[parseInt(mo) - 1]} ${y}`;
  }
  if (compare === "prior_year") subtitle += " (vs Prior Year)";
  
  return subtitle;
}

function getBalanceSheetTableHtml() {
  const table = document.querySelector("#balanceSheet .is-table");
  if (!table) return "<p>No data available</p>";
  
  const clone = table.cloneNode(true);
  clone.querySelectorAll(".is-row-hidden").forEach(r => r.remove());
  clone.querySelectorAll(".is-spacer-row").forEach(r => r.remove());
  clone.querySelectorAll(".bs-toggle").forEach(t => t.remove());
  
  return clone.outerHTML;
}

function getBalanceSheetCsvData() {
  const table = document.querySelector("#balanceSheet .is-table");
  if (!table) return "";
  
  let csv = "";
  const rows = table.querySelectorAll("tr:not(.is-row-hidden):not(.is-spacer-row)");
  rows.forEach(row => {
    const cells = row.querySelectorAll("th, td");
    csv += Array.from(cells).map(c => `"${c.textContent.trim()}"`).join(",") + "\n";
  });
  return csv;
}

function isBalanceSheetWide() {
  const compare = document.querySelector('input[name="bsCompareRadio"]:checked')?.value;
  return compare === "prior_year";
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
  if (!data) return alert("Please navigate to a report view (Revenue, Account, Income Statement, or Balance Sheet) to export.");
  
  const html = generateReportHtml(data);
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

function universalExportToCsv() {
  const data = getReportData();
  if (!data) return alert("Please navigate to a report view (Revenue, Account, Income Statement, or Balance Sheet) to export.");
  
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
  if (!data) return alert("Please navigate to a report view (Revenue, Account, Income Statement, or Balance Sheet) to email.");
  
  document.getElementById("emailSubject").value = `FTG Dashboard - ${data.title} - ${new Date().toLocaleDateString()}`;
  document.getElementById("emailTo").value = "";
  document.getElementById("emailStatus").textContent = "";
  document.getElementById("emailModal").classList.remove("hidden");
}

function closeEmailModal() {
  document.getElementById("emailModal").classList.add("hidden");
}

// EmailJS Configuration
const EMAILJS_CONFIG = {
  publicKey: "g7M4wCTIOOn2D65le",
  serviceId: "service_x8zz5uy",
  templateId: "template_44g2s84"
};

async function captureRevenueAsImage() {
  try {
    if (!revChartInstance) {
      console.log("No revenue chart instance");
      return null;
    }
    
    // Get chart image
    const base64 = revChartInstance.toBase64Image("image/png", 1);
    
    // Load as image
    const img = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = base64;
    });
    
    if (!img) return null;
    
    // Get stats from the page
    const stats = {
      avg: document.getElementById("revAvgValue")?.textContent || "-",
      max: document.getElementById("revMaxValue")?.textContent || "-",
      maxPeriod: document.getElementById("revMaxPeriod")?.textContent || "",
      min: document.getElementById("revMinValue")?.textContent || "-",
      minPeriod: document.getElementById("revMinPeriod")?.textContent || "",
      cagr: document.getElementById("revCagrValue")?.textContent || "-"
    };
    
    // Get title info
    const title1 = document.getElementById("revChartTitleLine1")?.textContent || "Revenue";
    const title2 = document.getElementById("revChartTitleLine2")?.textContent || "";
    
    // Create composite canvas
    const chartWidth = img.width;
    const chartHeight = img.height;
    const headerHeight = 60;
    const statsHeight = 80;
    const padding = 20;
    
    const canvas = document.createElement("canvas");
    canvas.width = chartWidth + padding * 2;
    canvas.height = headerHeight + chartHeight + statsHeight + padding * 2;
    const ctx = canvas.getContext("2d");
    
    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(title1, canvas.width / 2, padding + 25);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(title2, canvas.width / 2, padding + 45);
    
    // Chart
    ctx.drawImage(img, padding, headerHeight + padding, chartWidth, chartHeight);
    
    // Stats row
    const statsY = headerHeight + chartHeight + padding + 20;
    const statLabels = ["AVERAGE", "HIGHEST", "LOWEST", "CAGR"];
    const statValues = [stats.avg, stats.max, stats.min, stats.cagr];
    const statWidth = chartWidth / 4;
    
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    
    for (let i = 0; i < 4; i++) {
      const x = padding + i * statWidth + statWidth / 2;
      ctx.fillStyle = "#6b7280";
      ctx.fillText(statLabels[i], x, statsY);
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 14px Arial";
      ctx.fillText(statValues[i], x, statsY + 20);
      ctx.font = "bold 10px Arial";
    }
    
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return dataUrl.split(",")[1];
  } catch (err) {
    console.error("Revenue capture error:", err);
    return null;
  }
}

async function captureAccountAsImage() {
  try {
    if (!acctChartInstance) {
      console.log("No account chart instance");
      return null;
    }
    
    // Get chart image
    const base64 = acctChartInstance.toBase64Image("image/png", 1);
    
    // Load as image
    const img = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = base64;
    });
    
    if (!img) return null;
    
    // Get stats from the page
    const stats = {
      avg: document.getElementById("acctAvgValue")?.textContent || "-",
      max: document.getElementById("acctMaxValue")?.textContent || "-",
      maxPeriod: document.getElementById("acctMaxPeriod")?.textContent || "",
      min: document.getElementById("acctMinValue")?.textContent || "-",
      minPeriod: document.getElementById("acctMinPeriod")?.textContent || "",
      cagr: document.getElementById("acctCagrValue")?.textContent || "-"
    };
    
    // Get title info
    const title1 = document.getElementById("acctChartTitleLine1")?.textContent || "Account Detail";
    const title2 = document.getElementById("acctChartTitleLine2")?.textContent || "";
    
    // Create composite canvas
    const chartWidth = img.width;
    const chartHeight = img.height;
    const headerHeight = 60;
    const statsHeight = 80;
    const padding = 20;
    
    const canvas = document.createElement("canvas");
    canvas.width = chartWidth + padding * 2;
    canvas.height = headerHeight + chartHeight + statsHeight + padding * 2;
    const ctx = canvas.getContext("2d");
    
    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(title1, canvas.width / 2, padding + 25);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(title2, canvas.width / 2, padding + 45);
    
    // Chart
    ctx.drawImage(img, padding, headerHeight + padding, chartWidth, chartHeight);
    
    // Stats row
    const statsY = headerHeight + chartHeight + padding + 20;
    const statLabels = ["AVERAGE", "HIGHEST", "LOWEST", "CAGR"];
    const statValues = [stats.avg, stats.max, stats.min, stats.cagr];
    const statWidth = chartWidth / 4;
    
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    
    for (let i = 0; i < 4; i++) {
      const x = padding + i * statWidth + statWidth / 2;
      ctx.fillStyle = "#6b7280";
      ctx.fillText(statLabels[i], x, statsY);
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 14px Arial";
      ctx.fillText(statValues[i], x, statsY + 20);
      ctx.font = "bold 10px Arial";
    }
    
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return dataUrl.split(",")[1];
  } catch (err) {
    console.error("Account capture error:", err);
    return null;
  }
}

async function captureOverviewAsImage() {
  try {
    // Chart configurations with their chart instance keys
    const chartConfigs = [
      { id: "overviewRevenueChart", title: "Revenue" },
      { id: "overviewGrossProfitChart", title: "Gross Profit" },
      { id: "overviewGrossMarginChart", title: "Gross Margin %" },
      { id: "overviewOpexChart", title: "Operating Expenses" },
      { id: "overviewOpProfitChart", title: "Operating Profit" },
      { id: "overviewOpMarginChart", title: "Operating Margin %" }
    ];
    
    // Load chart images using Chart.js toBase64Image
    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    
    const chartImages = [];
    for (const cfg of chartConfigs) {
      const chartInstance = overviewChartInstances[cfg.id];
      if (chartInstance) {
        try {
          const base64 = chartInstance.toBase64Image("image/png", 1);
          const img = await loadImage(base64);
          chartImages.push({ img, title: cfg.title });
        } catch (e) {
          console.log("Error getting chart image:", cfg.id, e);
        }
      }
    }
    
    console.log("Captured", chartImages.length, "chart images");
    
    if (chartImages.length === 0) {
      console.log("No chart images captured");
      return null;
    }
    
    // Create composite canvas (2x3 grid)
    const chartWidth = 350;
    const chartHeight = 200;
    const titleHeight = 25;
    const cols = 3;
    const rows = 2;
    const padding = 12;
    const tileHeight = titleHeight + chartHeight;
    
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = cols * chartWidth + (cols + 1) * padding;
    compositeCanvas.height = rows * tileHeight + (rows + 1) * padding;
    const ctx = compositeCanvas.getContext("2d");
    
    // Fill background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    
    // Draw each chart with title
    for (let i = 0; i < chartImages.length && i < 6; i++) {
      const { img, title } = chartImages[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (chartWidth + padding);
      const y = padding + row * (tileHeight + padding);
      
      // Draw title
      ctx.fillStyle = "#374151";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "left";
      ctx.fillText(title, x, y + 16);
      
      // Draw chart image
      if (img) {
        ctx.drawImage(img, x, y + titleHeight, chartWidth, chartHeight);
      }
    }
    
    // Convert to JPEG
    const dataUrl = compositeCanvas.toDataURL("image/jpeg", 0.85);
    const base64Data = dataUrl.split(",")[1];
    const sizeKB = Math.round(base64Data.length / 1024);
    console.log("Composite chart image size:", sizeKB, "KB");
    
    return base64Data;
  } catch (err) {
    console.error("Chart capture error:", err.message);
    return null;
  }
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
  
  if (!EMAILJS_CONFIG.publicKey || !EMAILJS_CONFIG.serviceId || !EMAILJS_CONFIG.templateId) {
    statusEl.textContent = "Email service not configured. Please set up EmailJS.";
    statusEl.className = "email-status error";
    return;
  }
  
  const data = getReportData();
  if (!data) {
    statusEl.textContent = "No report data available.";
    statusEl.className = "email-status error";
    return;
  }
  
  statusEl.textContent = "Preparing report...";
  statusEl.className = "email-status";
  sendBtn.disabled = true;
  
  try {
    emailjs.init(EMAILJS_CONFIG.publicKey);
    
    const view = getCurrentView();
    console.log("Current view:", view);
    let messageHtml = "";
    let chartImage = "";
    
    // Capture chart image based on current view
    if (view === "overview" || view === "revenue" || view === "account") {
      statusEl.textContent = "Capturing chart...";
      try {
        if (view === "overview") {
          chartImage = await captureOverviewAsImage();
        } else if (view === "revenue") {
          chartImage = await captureRevenueAsImage();
        } else if (view === "account") {
          chartImage = await captureAccountAsImage();
        }
        
        if (chartImage) {
          statusEl.textContent = "Sending with chart attachment...";
        } else {
          statusEl.textContent = "Using table format...";
        }
      } catch (captureErr) {
        console.error("Capture error:", captureErr);
        chartImage = null;
      }
    }
    
    // Generate simple text message for email body
    messageHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1 style="color: #1f2937; margin: 0 0 5px 0;">FTG Builders - ${data.title}</h1>
        <p style="color: #6b7280; margin: 0 0 20px 0;">${data.subtitle}</p>
        ${chartImage ? '<p>Please see the attached chart image.</p>' : generateReportHtml(data, true)}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()} | FTG Dashboard</p>
      </div>
    `;
    
    statusEl.textContent = "Sending...";
    
    // Use EmailJS with variable attachment for chart image
    if (chartImage) {
      // Include chart as variable attachment (configured in EmailJS template)
      const templateParams = {
        to_email: toEmail,
        subject: subject,
        message_html: messageHtml,
        report_title: data.title,
        chart_attachment: "data:image/png;base64," + chartImage
      };
      
      const response = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );
      
      if (response.status === 200) {
        statusEl.textContent = "Email sent with chart!";
        statusEl.className = "email-status success";
        setTimeout(closeEmailModal, 2000);
      } else {
        throw new Error("Failed to send email");
      }
    } else {
      // Fallback to regular emailjs.send for table format
      const templateParams = {
        to_email: toEmail,
        subject: subject,
        message_html: messageHtml,
        report_title: data.title
      };
      
      const response = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );
      
      if (response.status === 200) {
        statusEl.textContent = "Email sent successfully!";
        statusEl.className = "email-status success";
        setTimeout(closeEmailModal, 2000);
      } else {
        throw new Error("Failed to send email");
      }
    }
  } catch (err) {
    console.error("EmailJS error:", err);
    statusEl.textContent = "Error sending email: " + (err.text || err.message || "Please try again");
    statusEl.className = "email-status error";
  } finally {
    sendBtn.disabled = false;
  }
}

/* ------------------------------------------------------------
   UI SETUP: YEAR DROPDOWN, RANGE SLIDERS, VIEW SWITCHING
------------------------------------------------------------ */
function setupRevenueUI(data) {
  try {
    if (!data || !data.revenue) {
      console.error("Revenue data not available");
      return;
    }
    
    const years = Object.keys(data.revenue)
      .map(Number)
      .sort((a, b) => a - b);

    if (years.length === 0) {
      console.error("No years found in revenue data");
      return;
    }

    /* ------------------ YEAR DROPDOWN ------------------ */
    const yearSelect = document.getElementById("revYear");
    if (!yearSelect) {
      console.error("Revenue year select not found");
      return;
    }
    
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    yearSelect.value = Math.max(...years);

    /* ------------------ SLIDER SETUP ------------------ */
    const s = document.getElementById("revRangeStart");
    const e = document.getElementById("revRangeEnd");

    if (s && e) {
      s.min = e.min = years[0];
      s.max = e.max = years[years.length - 1];
      s.value = years[0];
      e.value = years[years.length - 1];
    }

    const startLabel = document.getElementById("revRangeStartLabel");
    const endLabel = document.getElementById("revRangeEndLabel");
    if (startLabel && s) startLabel.innerText = s.value;
    if (endLabel && e) endLabel.innerText = e.value;

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

    const compareCheckbox = document.getElementById("revCompare");
    const compareLabel = compareCheckbox ? compareCheckbox.closest("label") : null;
    const yearWrap = document.getElementById("revYearWrapper");
    const rangeWrap = document.getElementById("revRangeWrapper");
    const excludeLabel = document.getElementById("revExcludeLabel");

    if (view === "annual") {
      if (compareLabel) compareLabel.style.display = "none";
      if (yearWrap) yearWrap.style.display = "none";
      if (rangeWrap) rangeWrap.classList.remove("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Year";
    } else if (view === "quarterly") {
      if (compareLabel) compareLabel.style.display = "";
      if (yearWrap) yearWrap.style.display = "flex";
      if (rangeWrap) rangeWrap.classList.add("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Quarter";
    } else {
      if (compareLabel) compareLabel.style.display = "";
      if (yearWrap) yearWrap.style.display = "flex";
      if (rangeWrap) rangeWrap.classList.add("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Month";
    }
    
    updateRevenueView(data);
    saveRevenueConfig();
  };
  
  document.getElementById("revYear").onchange = () => {
    updateRevenueView(data);
    saveRevenueConfig();
  };
  
  document.getElementById("revCompare").onchange = () => {
    updateRevenueView(data);
    saveRevenueConfig();
  };
  
  document.getElementById("revTrendline").onchange = () => {
    updateRevenueView(data);
    saveRevenueConfig();
  };
  document.getElementById("revDataLabels").onchange = () => {
    updateRevenueView(data);
    saveRevenueConfig();
  };
  document.getElementById("revExcludeCurrent").onchange = () => {
    updateRevenueView(data);
    saveRevenueConfig();
  };
  
  document.getElementById("revRangeStart").oninput = () => {
    const start = parseInt(document.getElementById("revRangeStart").value);
    const end = parseInt(document.getElementById("revRangeEnd").value);
    if (start > end) document.getElementById("revRangeEnd").value = start;
    document.getElementById("revRangeStartLabel").textContent = start;
    document.getElementById("revRangeEndLabel").textContent = document.getElementById("revRangeEnd").value;
    updateRevenueView(data);
    saveRevenueConfig();
  };
  
  document.getElementById("revRangeEnd").oninput = () => {
    const start = parseInt(document.getElementById("revRangeStart").value);
    const end = parseInt(document.getElementById("revRangeEnd").value);
    if (end < start) document.getElementById("revRangeStart").value = end;
    document.getElementById("revRangeStartLabel").textContent = document.getElementById("revRangeStart").value;
    document.getElementById("revRangeEndLabel").textContent = end;
    updateRevenueView(data);
    saveRevenueConfig();
  };
  } catch (err) {
    console.error("Error setting up revenue UI:", err);
  }
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
    const currentYearLabel = String(year);
    barDatasets.forEach((ds) => {
      if (compare && ds.label !== currentYearLabel && ds.label !== "Annual Revenue") return;
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
function applyGradientToDatasets(datasets, chart) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return;
  
  datasets.forEach(ds => {
    if (ds.type === "line") return;
    
    const origBg = ds._originalBg || ds.backgroundColor;
    ds._originalBg = origBg;
    
    if (Array.isArray(origBg)) {
      ds.backgroundColor = origBg.map(color => {
        if (color === "#3b82f6") return createBarGradient(ctx, chartArea, gradientColors.blue.start, gradientColors.blue.end);
        if (color === "#ef4444") return createBarGradient(ctx, chartArea, gradientColors.red.start, gradientColors.red.end);
        if (color === "#f59e0b") return createBarGradient(ctx, chartArea, gradientColors.orange.start, gradientColors.orange.end);
        return color;
      });
    } else if (typeof origBg === "string") {
      if (origBg === "#3b82f6") ds.backgroundColor = createBarGradient(ctx, chartArea, gradientColors.blue.start, gradientColors.blue.end);
      else if (origBg === "#ef4444") ds.backgroundColor = createBarGradient(ctx, chartArea, gradientColors.red.start, gradientColors.red.end);
      else if (origBg === "#f59e0b") ds.backgroundColor = createBarGradient(ctx, chartArea, gradientColors.orange.start, gradientColors.orange.end);
    }
  });
}

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
    
    const gradientPlugin = {
      id: 'gradientPlugin',
      beforeDraw: (chart) => applyGradientToDatasets(chart.data.datasets, chart)
    };
    
    const dataLabelsCheckbox = document.getElementById("revDataLabels");
    const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : true;

    revChartInstance = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      plugins: [ChartDataLabels, gradientPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 800,
          easing: "easeOutQuart",
          delay: (context) => {
            let delay = 0;
            if (context.type === 'data' && context.mode === 'default') {
              delay = context.dataIndex * 40 + context.datasetIndex * 80;
            }
            return delay;
          }
        },
        transitions: {
          active: { animation: { duration: 200 } }
        },
        layout: {
          padding: { top: showDataLabels ? 30 : 0 }
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            titleFont: { size: 14 },
            bodyFont: { size: 13 },
            padding: 12,
            callbacks: {
              title: function(tooltipItems) {
                return tooltipItems[0].label;
              },
              label: function(context) {
                if (context.dataset.type === "line") return null;
                const value = context.parsed.y;
                const prefix = context.dataset.label === selectedYear.toString() ? "" : context.dataset.label + ": ";
                return prefix + "$" + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
              }
            }
          },
          datalabels: {
            display: (context) => {
              if (!showDataLabels) return false;
              if (context.dataset.type === "line") return false;
              return true;
            },
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
      const v = Math.round(ds.data[i] || 0);
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
        const response = await fetch("/data/financials.json");
        if (!response.ok) throw new Error("Failed to fetch account data");
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
  try {
    const acctSelect = document.getElementById("acctSelect");
    const yearSelect = document.getElementById("acctYear");
    
    if (!acctSelect || !yearSelect) {
      console.error("Account UI elements not found");
      return;
    }
    
    if (!data || !data.gl_history_all || data.gl_history_all.length === 0) {
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
    saveAccountConfig();
  };
  e.oninput = () => {
    if (+e.value < +s.value) e.value = s.value;
    document.getElementById("acctRangeEndLabel").innerText = e.value;
    updateAccountView(data);
    saveAccountConfig();
  };
  
  document.getElementById("acctViewType").onchange = () => {
    const view = document.getElementById("acctViewType").value;
    const yearWrap = document.getElementById("acctYearWrapper");
    const compareCheckbox = document.getElementById("acctCompare");
    const compareLabel = compareCheckbox ? compareCheckbox.closest("label") : null;
    const rangeWrap = document.getElementById("acctRangeWrapper");
    const excludeLabel = document.getElementById("acctExcludeLabel");
    
    if (view === "annual") {
      if (yearWrap) yearWrap.style.display = "none";
      if (compareLabel) compareLabel.style.display = "none";
      if (rangeWrap) rangeWrap.classList.remove("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Year";
    } else if (view === "quarterly") {
      if (yearWrap) yearWrap.style.display = "flex";
      if (compareLabel) compareLabel.style.display = "";
      if (rangeWrap) rangeWrap.classList.add("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Quarter";
    } else {
      if (yearWrap) yearWrap.style.display = "flex";
      if (compareLabel) compareLabel.style.display = "";
      if (rangeWrap) rangeWrap.classList.add("hidden");
      if (excludeLabel) excludeLabel.textContent = "Exclude Current Month";
    }
    updateAccountView(data);
    saveAccountConfig();
  };
  
  acctSelect.onchange = () => { updateAccountView(data); saveAccountConfig(); };
  yearSelect.onchange = () => { updateAccountView(data); saveAccountConfig(); };
  document.getElementById("acctCompare").onchange = () => { updateAccountView(data); saveAccountConfig(); };
  document.getElementById("acctTrendline").onchange = () => { updateAccountView(data); saveAccountConfig(); };
  document.getElementById("acctDataLabels").onchange = () => { updateAccountView(data); saveAccountConfig(); };
  document.getElementById("acctExcludeCurrent").onchange = () => { updateAccountView(data); saveAccountConfig(); };
  } catch (err) {
    console.error("Error setting up account UI:", err);
  }
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
    const currentYearLabel = String(year);
    barDatasets.forEach((ds) => {
      if (compare && ds.label !== currentYearLabel && ds.label !== `Account ${acctNum}`) return;
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
  
  const gradientPlugin = {
    id: 'gradientPlugin',
    beforeDraw: (chart) => applyGradientToDatasets(chart.data.datasets, chart)
  };
  
  const dataLabelsCheckbox = document.getElementById("acctDataLabels");
  const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : true;
  
  acctChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    plugins: [ChartDataLabels, gradientPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: "easeOutQuart",
        delay: (context) => {
          let delay = 0;
          if (context.type === 'data' && context.mode === 'default') {
            delay = context.dataIndex * 40 + context.datasetIndex * 80;
          }
          return delay;
        }
      },
      transitions: {
        active: { animation: { duration: 200 } }
      },
      layout: {
        padding: { top: showDataLabels ? 30 : 0 }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          backgroundColor: "rgba(31, 41, 55, 0.95)",
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 10,
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              if (context.dataset.type === "line") return null;
              const value = context.parsed.y;
              const prefix = context.dataset.label === acctSelectedYear.toString() ? "" : context.dataset.label + ": ";
              return prefix + "$" + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
          }
        },
        datalabels: {
          display: (context) => {
            if (!showDataLabels) return false;
            if (context.dataset.type === "line") return false;
            return true;
          },
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
      const v = Math.round(ds.data[i] || 0);
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
    saveIncomeStatementConfig();
  };
  
  periodType.onchange = () => {
    populatePeriodOptions();
    updateMatrixControlsVisibility();
    renderIncomeStatement();
    saveIncomeStatementConfig();
  };
  
  periodSelect.onchange = () => { renderIncomeStatement(); saveIncomeStatementConfig(); };
  
  const compareRadios = document.querySelectorAll('input[name="isCompareRadio"]');
  compareRadios.forEach(radio => {
    radio.onchange = () => { renderIncomeStatement(); saveIncomeStatementConfig(); };
  });
  
  showSubtotal.onchange = () => { renderIncomeStatement(); saveIncomeStatementConfig(); };
  
  const showThousands = document.getElementById("isShowThousands");
  showThousands.onchange = () => { renderIncomeStatement(); saveIncomeStatementConfig(); };
  
  const excludeCurrent = document.getElementById("isExcludeCurrent");
  excludeCurrent.onchange = () => { renderIncomeStatement(); saveIncomeStatementConfig(); };
  
  const detailRadios = document.querySelectorAll('input[name="isDetailLevel"]');
  detailRadios.forEach(radio => {
    radio.onchange = () => {
      applyDetailLevel(radio.value);
      renderIncomeStatement();
      saveIncomeStatementConfig();
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
    const profitRowLabels = ["Revenue", "Gross Profit", "Operating Income", "Net Profit Before Taxes", "Net Profit After Taxes"];
    const expenseSectionLabels = ["Total Cost of Sales", "Operating Expenses", "Taxes", "Other Income/Expense"];
    const graySectionLabels = ["Total Direct Expenses", "Total Indirect Expenses"];
    const tanSectionLabels = ["Direct Labor", "Indirect Labor", "Vehicle Expense"];
    const opExpenseGrayLabels = ["Salaries & Benefits", "Facility", "Travel & Entertainment", "Insurance", "Professional Services", "Administrative & Other"];
    const isProfitRow = profitRowLabels.includes(row.label);
    const isExpenseSection = expenseSectionLabels.includes(row.label);
    const isGraySection = graySectionLabels.includes(row.label);
    const isTanSection = tanSectionLabels.includes(row.label);
    const isOpExpenseGray = opExpenseGrayLabels.includes(row.label);
    
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
    const profitRowClass = isProfitRow ? "is-profit-row" : "";
    
    let expandedSubtotalClass = "";
    let childRowClass = "";
    let expenseSectionClass = "";
    let graySectionClass = "";
    let tanSectionClass = "";
    let opExpenseGrayClass = "";
    
    if (row.expandable && isRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
      if (isExpenseSection) {
        expenseSectionClass = "is-expense-section-expanded";
      }
      if (isGraySection) {
        graySectionClass = "is-gray-section-expanded";
      }
      if (isTanSection) {
        tanSectionClass = "is-tan-section-expanded";
      }
      if (isOpExpenseGray) {
        opExpenseGrayClass = "is-opexp-gray-expanded";
      }
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
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${profitRowClass} ${expenseSectionClass} ${graySectionClass} ${tanSectionClass} ${opExpenseGrayClass} ${expandedSubtotalClass} ${childRowClass}" data-row-id="${row.id}">`;
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
    const profitRowLabels = ["Revenue", "Gross Profit", "Operating Income", "Net Profit Before Taxes", "Net Profit After Taxes"];
    const expenseSectionLabels = ["Total Cost of Sales", "Operating Expenses", "Taxes", "Other Income/Expense"];
    const graySectionLabels = ["Total Direct Expenses", "Total Indirect Expenses"];
    const tanSectionLabels = ["Direct Labor", "Indirect Labor", "Vehicle Expense"];
    const opExpenseGrayLabels = ["Salaries & Benefits", "Facility", "Travel & Entertainment", "Insurance", "Professional Services", "Administrative & Other"];
    const isProfitRow = profitRowLabels.includes(row.label);
    const isExpenseSection = expenseSectionLabels.includes(row.label);
    const isGraySection = graySectionLabels.includes(row.label);
    const isTanSection = tanSectionLabels.includes(row.label);
    const isOpExpenseGray = opExpenseGrayLabels.includes(row.label);
    
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
    const profitRowClass = isProfitRow ? "is-profit-row" : "";
    
    let expandedSubtotalClass = "";
    let childRowClass = "";
    let expenseSectionClass = "";
    let graySectionClass = "";
    let tanSectionClass = "";
    let opExpenseGrayClass = "";
    
    if (row.expandable && isRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
      if (isExpenseSection) {
        expenseSectionClass = "is-expense-section-expanded";
      }
      if (isGraySection) {
        graySectionClass = "is-gray-section-expanded";
      }
      if (isTanSection) {
        tanSectionClass = "is-tan-section-expanded";
      }
      if (isOpExpenseGray) {
        opExpenseGrayClass = "is-opexp-gray-expanded";
      }
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
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${profitRowClass} ${expenseSectionClass} ${graySectionClass} ${tanSectionClass} ${opExpenseGrayClass} ${expandedSubtotalClass} ${childRowClass}" data-row-id="${row.id}">`;
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
  if (!parentExpanded) return false;
  
  return isRowVisibleByParent(parentRow, rows);
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
   BALANCE SHEET
------------------------------------------------------------ */
let bsData = null;
let bsAccountGroups = null;
let bsGLLookup = {};
let bsRowStates = {};
let bsInceptionDate = "2015-01";

function initBalanceSheet() {
  if (bsData && bsAccountGroups) {
    initBalanceSheetControls();
    renderBalanceSheet();
    return;
  }
  
  Promise.all([
    fetch("data/financials.json").then(r => r.json()),
    fetch("data/account_groups.json").then(r => r.json())
  ]).then(([financials, accountGroups]) => {
    bsData = financials;
    bsAccountGroups = accountGroups;
    buildBSGLLookup();
    initBalanceSheetControls();
    renderBalanceSheet();
  }).catch(err => {
    console.error("Balance Sheet data load error:", err);
  });
}

function buildBSGLLookup() {
  bsGLLookup = {};
  const glHistory = bsData.gl_history_all || [];
  
  glHistory.forEach(row => {
    const acctNum = parseInt(row.Account_Num || row.Account, 10);
    if (isNaN(acctNum)) return;
    
    if (!bsGLLookup[acctNum]) {
      bsGLLookup[acctNum] = {};
    }
    
    Object.keys(row).forEach(key => {
      if (/^\d{4}-\d{2}$/.test(key)) {
        const val = parseFloat(row[key]) || 0;
        bsGLLookup[acctNum][key] = val;
      }
    });
  });
}

function initBalanceSheetControls() {
  populateBSPeriodOptions();
  populateBSMatrixYearOptions();
  
  const viewMode = document.getElementById("bsViewMode");
  const periodType = document.getElementById("bsPeriodType");
  const periodSelect = document.getElementById("bsPeriodSelect");
  const matrixYear = document.getElementById("bsMatrixYear");
  const matrixYearStart = document.getElementById("bsMatrixYearStart");
  const matrixYearEnd = document.getElementById("bsMatrixYearEnd");
  
  viewMode.onchange = () => {
    updateBSControlVisibility();
    renderBalanceSheet();
    saveBalanceSheetConfig();
  };
  
  periodType.onchange = () => {
    updateBSControlVisibility();
    renderBalanceSheet();
    saveBalanceSheetConfig();
  };
  
  periodSelect.onchange = () => { renderBalanceSheet(); saveBalanceSheetConfig(); };
  matrixYear.onchange = () => { renderBalanceSheet(); saveBalanceSheetConfig(); };
  
  matrixYearStart.oninput = () => {
    const startVal = parseInt(matrixYearStart.value);
    const endVal = parseInt(matrixYearEnd.value);
    if (startVal > endVal) {
      matrixYearEnd.value = startVal;
    }
    document.getElementById("bsMatrixYearStartLabel").textContent = matrixYearStart.value;
    document.getElementById("bsMatrixYearEndLabel").textContent = matrixYearEnd.value;
    renderBalanceSheet();
    saveBalanceSheetConfig();
  };
  
  matrixYearEnd.oninput = () => {
    const startVal = parseInt(matrixYearStart.value);
    const endVal = parseInt(matrixYearEnd.value);
    if (endVal < startVal) {
      matrixYearStart.value = endVal;
    }
    document.getElementById("bsMatrixYearStartLabel").textContent = matrixYearStart.value;
    document.getElementById("bsMatrixYearEndLabel").textContent = matrixYearEnd.value;
    renderBalanceSheet();
    saveBalanceSheetConfig();
  };
  
  const compareRadios = document.querySelectorAll('input[name="bsCompareRadio"]');
  compareRadios.forEach(radio => {
    radio.onchange = () => { renderBalanceSheet(); saveBalanceSheetConfig(); };
  });
  
  const detailRadios = document.querySelectorAll('input[name="bsDetailLevel"]');
  detailRadios.forEach(radio => {
    radio.onchange = () => { renderBalanceSheet(); saveBalanceSheetConfig(); };
  });
  
  const showThousands = document.getElementById("bsShowThousands");
  if (showThousands) {
    showThousands.onchange = () => { renderBalanceSheet(); saveBalanceSheetConfig(); };
  }
  
  const excludeCurrentMonth = document.getElementById("bsExcludeCurrentMonth");
  if (excludeCurrentMonth) {
    excludeCurrentMonth.onchange = () => {
      populateBSPeriodOptions();
      renderBalanceSheet();
      saveBalanceSheetConfig();
    };
  }
  
  const configHeader = document.querySelector('#balanceSheet .config-header');
  if (configHeader) {
    configHeader.onclick = () => {
      const target = document.getElementById("bsConfigBody");
      const toggle = configHeader.querySelector('.config-toggle');
      if (target) {
        target.classList.toggle("collapsed");
        if (toggle) toggle.textContent = target.classList.contains("collapsed") ? "▶" : "▼";
      }
    };
  }
  
  updateBSControlVisibility();
}

function updateBSControlVisibility() {
  const viewMode = document.getElementById("bsViewMode").value;
  const periodType = document.getElementById("bsPeriodType").value;
  
  const periodTypeRow = document.getElementById("bsPeriodTypeRow");
  const singlePeriodRow = document.getElementById("bsSinglePeriodRow");
  const matrixYearRow = document.getElementById("bsMatrixYearRow");
  const matrixRangeControls = document.getElementById("bsMatrixRangeControls");
  const singleCompareBox = document.getElementById("bsSingleCompareBox");
  
  if (viewMode === "single") {
    periodTypeRow.style.display = "none";
    singlePeriodRow.style.display = "";
    matrixYearRow.style.display = "none";
    matrixRangeControls.style.display = "none";
    singleCompareBox.style.display = "";
  } else {
    periodTypeRow.style.display = "";
    singlePeriodRow.style.display = "none";
    singleCompareBox.style.display = "none";
    
    if (periodType === "annual") {
      matrixYearRow.style.display = "none";
      matrixRangeControls.style.display = "";
    } else {
      matrixYearRow.style.display = "";
      matrixRangeControls.style.display = "none";
    }
  }
}

function populateBSMatrixYearOptions() {
  const yearSelect = document.getElementById("bsMatrixYear");
  const months = getBSAvailableMonths();
  const years = [...new Set(months.map(m => m.split("-")[0]))].sort().reverse();
  
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
}

function populateBSPeriodOptions() {
  const periodSelect = document.getElementById("bsPeriodSelect");
  let months = getBSAvailableMonths();
  
  if (months.length === 0) return;
  
  const excludeCurrentMonth = document.getElementById("bsExcludeCurrentMonth")?.checked || false;
  if (excludeCurrentMonth && months.length > 0) {
    months = months.slice(0, -1);
  }
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  periodSelect.innerHTML = months.slice().reverse().map(m => {
    const [y, mo] = m.split("-");
    const label = `${monthNames[parseInt(mo) - 1]} ${y}`;
    return `<option value="${m}">${label}</option>`;
  }).join("");
}

function getBSAvailableMonths() {
  const months = new Set();
  Object.values(bsGLLookup).forEach(acct => {
    Object.keys(acct).forEach(key => {
      if (/^\d{4}-\d{2}$/.test(key)) {
        months.add(key);
      }
    });
  });
  return Array.from(months).sort();
}

function getCumulativeBalance(accounts, asOfMonth, isDebit) {
  const allMonths = getBSAvailableMonths();
  const monthsUpTo = allMonths.filter(m => m <= asOfMonth);
  
  let total = 0;
  
  accounts.forEach(acct => {
    const acctData = bsGLLookup[acct];
    if (acctData) {
      monthsUpTo.forEach(m => {
        total += acctData[m] || 0;
      });
    }
  });
  
  if (isDebit) {
    return total;
  } else {
    return -total;
  }
}

function getIncomeExpenseAccounts() {
  const accounts = [];
  for (let acct = 4000; acct <= 8999; acct++) {
    if (bsGLLookup[acct]) {
      accounts.push(acct);
    }
  }
  return accounts;
}

function calculateRetainedEarnings(asOfMonth) {
  const [asOfYear] = asOfMonth.split("-").map(Number);
  const priorYearEnd = `${asOfYear - 1}-12`;
  
  const incomeExpenseAccounts = getIncomeExpenseAccounts();
  const allMonths = getBSAvailableMonths();
  const monthsUpToPriorYearEnd = allMonths.filter(m => m <= priorYearEnd);
  
  let total = 0;
  incomeExpenseAccounts.forEach(acct => {
    const acctData = bsGLLookup[acct];
    if (acctData) {
      monthsUpToPriorYearEnd.forEach(m => {
        total += acctData[m] || 0;
      });
    }
  });
  
  return -total;
}

function calculateCurrentYearNetIncome(asOfMonth) {
  const [asOfYear, asOfMo] = asOfMonth.split("-").map(Number);
  const currentYearStart = `${asOfYear}-01`;
  
  const incomeExpenseAccounts = getIncomeExpenseAccounts();
  const allMonths = getBSAvailableMonths();
  const monthsInCurrentYear = allMonths.filter(m => m >= currentYearStart && m <= asOfMonth);
  
  let total = 0;
  incomeExpenseAccounts.forEach(acct => {
    const acctData = bsGLLookup[acct];
    if (acctData) {
      monthsInCurrentYear.forEach(m => {
        total += acctData[m] || 0;
      });
    }
  });
  
  return -total;
}

function buildBalanceSheetRows(asOfMonth, groups, computedValues = {}) {
  const rows = [];
  
  groups.forEach((group, idx) => {
    const rowId = `bs-row-${group.label.replace(/\s+/g, '_')}`;
    let value = null;
    
    if (group.specialCalc === "retained_earnings") {
      value = calculateRetainedEarnings(asOfMonth);
    } else if (group.specialCalc === "current_year_net_income") {
      value = calculateCurrentYearNetIncome(asOfMonth);
    } else if (group.accounts) {
      value = getCumulativeBalance(group.accounts, asOfMonth, group.isDebit);
    } else if (group.formula) {
      value = evaluateBSFormula(group.formula, computedValues);
    }
    
    computedValues[group.label] = value;
    
    if (group.expandable) {
      if (bsRowStates[rowId] === undefined) {
        bsRowStates[rowId] = false;
      }
    }
    
    if (group.type === "spacer") {
      rows.push({
        id: `bs-spacer-${idx}`,
        label: "",
        level: 0,
        type: "spacer",
        value: null,
        expandable: false,
        parent: null,
        highlight: null
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
        note: group.note || null
      });
    }
  });
  
  return rows;
}

function evaluateBSFormula(formula, computedValues) {
  let expr = formula;
  
  Object.keys(computedValues).sort((a, b) => b.length - a.length).forEach(label => {
    const val = computedValues[label] || 0;
    expr = expr.split(label).join(`(${val})`);
  });
  
  try {
    expr = expr.replace(/[^0-9+\-*/().]/g, "");
    return eval(expr) || 0;
  } catch (e) {
    console.error("BS Formula eval error:", formula, e);
    return 0;
  }
}

function renderBalanceSheet() {
  if (!bsAccountGroups || !bsAccountGroups.balance_sheet) {
    console.log("Balance sheet groups not loaded yet");
    return;
  }
  
  const viewMode = document.getElementById("bsViewMode")?.value || "single";
  const detailLevel = document.querySelector('input[name="bsDetailLevel"]:checked')?.value || "summary";
  const groups = bsAccountGroups.balance_sheet.groups;
  const thead = document.getElementById("bsTableHead");
  const tbody = document.getElementById("bsTableBody");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const excludeCurrentMonth = document.getElementById("bsExcludeCurrentMonth")?.checked || false;
  
  if (viewMode === "matrix") {
    renderBalanceSheetMatrix();
    return;
  }
  
  const periodValue = document.getElementById("bsPeriodSelect").value;
  if (!periodValue) return;
  
  const compare = document.querySelector('input[name="bsCompareRadio"]:checked')?.value || "none";
  
  const [y, mo] = periodValue.split("-");
  const currentLabel = `${monthNames[parseInt(mo) - 1]} ${y}`;
  
  document.getElementById("bsDataAsOf").textContent = currentLabel;
  
  const rows = buildBalanceSheetRows(periodValue, groups);
  
  let comparisonRows = null;
  let compPeriodLabel = "";
  const availableMonths = getBSAvailableMonths();
  
  if (compare === "prior_year") {
    const priorYear = parseInt(y) - 1;
    const priorPeriod = `${priorYear}-${mo}`;
    
    if (availableMonths.includes(priorPeriod)) {
      compPeriodLabel = `${monthNames[parseInt(mo) - 1]} ${priorYear}`;
      comparisonRows = buildBalanceSheetRows(priorPeriod, groups);
    }
  } else if (compare === "prior_month") {
    const periodIdx = availableMonths.indexOf(periodValue);
    if (periodIdx > 0) {
      const priorPeriod = availableMonths[periodIdx - 1];
      const [py, pm] = priorPeriod.split("-");
      compPeriodLabel = `${monthNames[parseInt(pm) - 1]} ${py}`;
      comparisonRows = buildBalanceSheetRows(priorPeriod, groups);
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
    
    const isHeaderRow = row.type === "header";
    const isDetailRow = row.type === "detail";
    const isSubtotal = row.type === "subtotal";
    
    let isVisible;
    if (detailLevel === "detail") {
      isVisible = true;
    } else {
      isVisible = isBSRowVisibleByParent(row, rows);
    }
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const highlightClass = row.highlight === "total" ? "is-major-total" : "";
    
    let expandedSubtotalClass = "";
    let childRowClass = "";
    
    if (row.expandable && bsRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
    }
    
    if (row.parent) {
      const parentRow = rows.find(r => r.label === row.parent);
      if (parentRow && bsRowStates[parentRow.id] === true) {
        childRowClass = "is-child-row";
      }
    }
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = bsRowStates[row.id] === true;
      toggleHtml = `<span class="bs-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    } else if (row.parent && detailLevel !== "detail") {
      toggleHtml = `<span class="bs-toggle-placeholder"></span>`;
    }
    
    let valueHtml = "";
    if (row.type === "header") {
      valueHtml = "";
    } else {
      valueHtml = formatBSNumber(row.value);
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${expandedSubtotalClass} ${childRowClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    if (comparisonRows) {
      const compRow = comparisonRows[i];
      
      if (row.type === "header") {
        bodyHtml += `<td></td><td></td><td></td><td></td>`;
      } else {
        const compValueHtml = formatBSNumber(compRow.value);
        const variance = formatBSVariance(row.value, compRow.value);
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td>${variance.diff}</td>`;
        bodyHtml += `<td>${variance.pct}</td>`;
      }
    } else {
      if (row.type !== "header") {
        bodyHtml += `<td>${valueHtml}</td>`;
      } else {
        bodyHtml += `<td></td>`;
      }
    }
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachBSToggleListeners();
}

function formatBSNumber(value) {
  const showThousands = document.getElementById("bsShowThousands")?.checked || false;
  
  if (value === null || value === undefined) return "";
  
  let displayValue = value;
  let suffix = "";
  
  if (showThousands) {
    displayValue = value / 1000;
    suffix = "K";
  }
  
  const absVal = Math.abs(displayValue);
  const formatted = absVal.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  if (value < 0) {
    return `<span class="bs-negative">($${formatted}${suffix})</span>`;
  }
  return `$${formatted}${suffix}`;
}

function formatBSVariance(current, prior) {
  if (current === null || prior === null) {
    return { diff: "-", pct: "-" };
  }
  
  const diff = current - prior;
  const showThousands = document.getElementById("bsShowThousands")?.checked || false;
  let displayDiff = diff;
  let suffix = "";
  
  if (showThousands) {
    displayDiff = diff / 1000;
    suffix = "K";
  }
  
  const absDiff = Math.abs(displayDiff);
  const diffFormatted = absDiff.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  let pctStr = "-";
  if (prior !== 0) {
    const pctChange = ((current - prior) / Math.abs(prior)) * 100;
    if (pctChange > 1000) {
      pctStr = "1,000%+";
    } else if (pctChange < -1000) {
      pctStr = "-1,000%+";
    } else {
      pctStr = pctChange.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }) + "%";
    }
  } else if (current !== 0) {
    pctStr = "N/A";
  } else {
    pctStr = "0.0%";
  }
  
  const isPositive = diff >= 0;
  const pctClass = isPositive ? "is-variance-positive" : "is-variance-negative";
  
  return {
    diff: diff < 0 ? `($${diffFormatted}${suffix})` : `$${diffFormatted}${suffix}`,
    pct: `<span class="${pctClass}">${pctStr}</span>`
  };
}

function isBSRowVisibleByParent(row, rows) {
  if (!row.parent) return true;
  
  const parentRow = rows.find(r => r.label === row.parent);
  if (!parentRow) return true;
  
  const parentExpanded = bsRowStates[parentRow.id] === true;
  if (!parentExpanded) return false;
  
  return isBSRowVisibleByParent(parentRow, rows);
}

function attachBSToggleListeners() {
  document.querySelectorAll(".bs-toggle").forEach(toggle => {
    toggle.onclick = (e) => {
      e.stopPropagation();
      const rowId = toggle.dataset.row;
      bsRowStates[rowId] = !bsRowStates[rowId];
      renderBalanceSheet();
    };
  });
}

function renderBalanceSheetMatrix() {
  const periodType = document.getElementById("bsPeriodType").value;
  const detailLevel = document.querySelector('input[name="bsDetailLevel"]:checked')?.value || "summary";
  const groups = bsAccountGroups.balance_sheet.groups;
  const thead = document.getElementById("bsTableHead");
  const tbody = document.getElementById("bsTableBody");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const excludeCurrentMonth = document.getElementById("bsExcludeCurrentMonth")?.checked || false;
  
  let periods = [];
  let periodLabels = [];
  const availableMonths = getBSAvailableMonths();
  const currentMonth = availableMonths[availableMonths.length - 1];
  
  if (periodType === "month") {
    const selectedYear = document.getElementById("bsMatrixYear").value;
    for (let m = 1; m <= 12; m++) {
      const period = `${selectedYear}-${String(m).padStart(2, '0')}`;
      if (availableMonths.includes(period)) {
        if (excludeCurrentMonth && period === currentMonth) continue;
        periods.push(period);
        periodLabels.push(monthNames[m - 1]);
      }
    }
    document.getElementById("bsDataAsOf").textContent = `${selectedYear} Monthly`;
  } else if (periodType === "quarter") {
    const selectedYear = document.getElementById("bsMatrixYear").value;
    const quarterEnds = [`${selectedYear}-03`, `${selectedYear}-06`, `${selectedYear}-09`, `${selectedYear}-12`];
    const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
    quarterEnds.forEach((period, idx) => {
      if (availableMonths.includes(period)) {
        if (excludeCurrentMonth && period === currentMonth) return;
        periods.push(period);
        periodLabels.push(`${quarterLabels[idx]} ${selectedYear}`);
      }
    });
    document.getElementById("bsDataAsOf").textContent = `${selectedYear} Quarterly`;
  } else if (periodType === "annual") {
    const startYear = parseInt(document.getElementById("bsMatrixYearStart").value);
    const endYear = parseInt(document.getElementById("bsMatrixYearEnd").value);
    for (let y = startYear; y <= endYear; y++) {
      const period = `${y}-12`;
      if (availableMonths.includes(period)) {
        if (excludeCurrentMonth && period === currentMonth) continue;
        periods.push(period);
        periodLabels.push(String(y));
      }
    }
    document.getElementById("bsDataAsOf").textContent = `${startYear} - ${endYear} Annual`;
  }
  
  if (periods.length === 0) {
    thead.innerHTML = "<tr><th>No data available for selected period</th></tr>";
    tbody.innerHTML = "";
    return;
  }
  
  const allRowsData = periods.map(period => buildBalanceSheetRows(period, groups));
  const baseRows = allRowsData[0];
  
  let headerHtml = "<tr><th>Account</th>";
  periodLabels.forEach(label => {
    headerHtml += `<th>${label}</th>`;
  });
  headerHtml += "</tr>";
  thead.innerHTML = headerHtml;
  
  let bodyHtml = "";
  const colCount = periods.length + 1;
  
  baseRows.forEach((row, rowIdx) => {
    if (row.type === "spacer") {
      bodyHtml += `<tr class="is-spacer-row"><td colspan="${colCount}"></td></tr>`;
      return;
    }
    
    const isHeaderRow = row.type === "header";
    const isDetailRow = row.type === "detail";
    
    let isVisible;
    if (detailLevel === "detail") {
      isVisible = true;
    } else {
      isVisible = isBSRowVisibleByParent(row, baseRows);
    }
    
    const hiddenClass = isVisible ? "" : "is-row-hidden";
    const typeClass = `is-row-${row.type}`;
    const indentClass = `is-indent-${row.level}`;
    const highlightClass = row.highlight === "total" ? "is-major-total" : "";
    
    let expandedSubtotalClass = "";
    if (row.expandable && bsRowStates[row.id] === true) {
      expandedSubtotalClass = "is-expanded-subtotal";
    }
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = bsRowStates[row.id] === true;
      toggleHtml = `<span class="bs-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    } else if (row.parent && detailLevel !== "detail") {
      toggleHtml = `<span class="bs-toggle-placeholder"></span>`;
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${expandedSubtotalClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    allRowsData.forEach(rows => {
      const periodRow = rows[rowIdx];
      if (row.type === "header") {
        bodyHtml += `<td></td>`;
      } else {
        bodyHtml += `<td>${formatBSNumber(periodRow?.value)}</td>`;
      }
    });
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachBSToggleListeners();
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



