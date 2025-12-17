/* ============================================================
   FTG DASHBOARD — COMPLETE RESPONSIVE SCRIPT (PART 1 OF 3)
============================================================ */

/* ------------------------------------------------------------
   SAFE DOM UTILITIES - Prevent null reference errors
------------------------------------------------------------ */
function getEl(id) {
  return document.getElementById(id);
}

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setElValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getElValue(id, defaultValue = '') {
  const el = document.getElementById(id);
  return el ? el.value : defaultValue;
}

function getElChecked(id, defaultValue = false) {
  const el = document.getElementById(id);
  return el ? el.checked : defaultValue;
}

function setElClass(id, className) {
  const el = document.getElementById(id);
  if (el) el.className = className;
}

/* ------------------------------------------------------------
   DEBOUNCE UTILITY - Prevent excessive function calls
------------------------------------------------------------ */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/* ------------------------------------------------------------
   DEBOUNCED CHART UPDATE FUNCTIONS
   Prevents excessive chart redraws during rapid user interaction
------------------------------------------------------------ */
const debouncedUpdateOverviewCharts = debounce(() => {
  if (typeof updateOverviewCharts === 'function') {
    updateOverviewCharts();
  }
}, 150);

const debouncedRenderCashChart = debounce(() => {
  if (typeof renderCashChart === 'function') {
    renderCashChart();
  }
}, 150);

/* ------------------------------------------------------------
   AUTO-SIZE FIRST COLUMN ON MOBILE
   Dynamically sizes sticky first column based on content width
   Note: On mobile (<768px), CSS handles column widths via table-layout: fixed
------------------------------------------------------------ */
function autoSizeFirstColumn(tableId) {
  // Let CSS handle mobile layout with fixed percentages
  if (window.innerWidth <= 768) return;
  
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const firstCells = table.querySelectorAll("tbody tr td:first-child");
  if (firstCells.length === 0) return;
  
  let maxWidth = 0;
  const tempSpan = document.createElement("span");
  tempSpan.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:inherit;padding:0;";
  document.body.appendChild(tempSpan);
  
  firstCells.forEach(cell => {
    const text = cell.textContent.trim();
    const indent = cell.style.paddingLeft ? parseInt(cell.style.paddingLeft) : 0;
    tempSpan.style.font = window.getComputedStyle(cell).font;
    tempSpan.textContent = text;
    const textWidth = tempSpan.offsetWidth + indent + 24;
    maxWidth = Math.max(maxWidth, textWidth);
  });
  
  document.body.removeChild(tempSpan);
  
  const finalWidth = Math.min(Math.max(maxWidth, 100), 300);
  
  table.querySelectorAll("th:first-child, td:first-child").forEach(cell => {
    cell.style.minWidth = finalWidth + "px";
    cell.style.maxWidth = finalWidth + "px";
    cell.style.width = finalWidth + "px";
  });
}

/* ------------------------------------------------------------
   AUTO-SCALE FONT SIZE TO FILL CONTAINER WIDTH ON MOBILE
   Note: On mobile, CSS clamp() handles responsive font sizing
------------------------------------------------------------ */
function autoScaleFontSize(tableId, containerId) {
  // CSS clamp() handles font scaling on mobile now
  return;
}

/* ------------------------------------------------------------
   ANIMATED NUMBER COUNTER UTILITY
------------------------------------------------------------ */
function animateValue(element, start, end, duration, formatter) {
  if (!element) return;
  
  // Ensure we have valid numbers
  const startVal = typeof start === 'number' && !isNaN(start) ? start : 0;
  const endVal = typeof end === 'number' && !isNaN(end) ? end : 0;
  
  // If values are the same or very small difference, just set it
  if (Math.abs(endVal - startVal) < 0.01) {
    element.textContent = formatter ? formatter(endVal) : endVal;
    return;
  }
  
  const startTime = performance.now();
  const range = endVal - startVal;
  
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuart(progress);
    const currentValue = startVal + (range * easedProgress);
    
    element.textContent = formatter ? formatter(currentValue) : currentValue.toFixed(0);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

function animateCurrency(element, endValue, duration = 600) {
  const currentText = element?.textContent || '$0';
  const currentValue = parseFloat(currentText.replace(/[$,KM%()]/g, '')) || 0;
  // Handle K and M suffixes
  let multiplier = 1;
  if (currentText.includes('M')) multiplier = 1000000;
  else if (currentText.includes('K')) multiplier = 1000;
  const startValue = currentValue * multiplier;
  
  animateValue(element, startValue, endValue, duration, (val) => {
    if (Math.abs(val) >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
    if (Math.abs(val) >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
    return '$' + Math.round(val).toLocaleString();
  });
}

function animatePercent(element, endValue, duration = 600, showPlusSign = true) {
  const currentText = element?.textContent || '0%';
  const currentValue = parseFloat(currentText.replace(/[%+]/g, '')) || 0;
  
  animateValue(element, currentValue, endValue, duration, (val) => {
    const prefix = showPlusSign && val >= 0 ? '+' : '';
    return prefix + val.toFixed(1) + '%';
  });
}

function animateRatio(element, endValue, duration = 600) {
  const currentText = element?.textContent || '0.00';
  const currentValue = parseFloat(currentText.replace('x', '')) || 0;
  
  animateValue(element, currentValue, endValue, duration, (val) => val.toFixed(2) + 'x');
}

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
  
  document.querySelectorAll(".chart-close-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const metricCheckboxId = btn.dataset.metric;
      const checkbox = document.getElementById(metricCheckboxId);
      if (checkbox) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
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
  if (!sourceChart) {
    // Fall back to page charts (revChart, acctChart, cashChart)
    openPageChartFullscreen(chartId, title);
    return;
  }
  
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
        labels: { color: "#fff", font: { size: 10 }, boxWidth: 12, padding: 8 }
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
        ticks: { color: "#fff", font: { size: 12 } }
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

function setupPageChartExpandButtons() {
  document.querySelectorAll(".page-chart-expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const chartId = btn.dataset.chart;
      const title = btn.dataset.title;
      openPageChartFullscreen(chartId, title);
    });
  });
}

function openPageChartFullscreen(chartId, title) {
  let sourceChart = null;
  let statsHtml = "";
  
  if (chartId === "revChart" && revChartInstance) {
    sourceChart = revChartInstance;
    const summaryTiles = document.getElementById("revSummaryTiles");
    if (summaryTiles) {
      statsHtml = `
        <div class="stat-box"><div class="stat-label">Average</div><div class="stat-value">${document.getElementById("revAvgValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">Largest</div><div class="stat-value">${document.getElementById("revMaxValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">Smallest</div><div class="stat-value">${document.getElementById("revMinValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">CAGR</div><div class="stat-value">${document.getElementById("revCagrValue")?.textContent || "-"}</div></div>
      `;
    }
  } else if (chartId === "acctChart" && acctChartInstance) {
    sourceChart = acctChartInstance;
    const summaryTiles = document.getElementById("acctSummaryTiles");
    if (summaryTiles) {
      statsHtml = `
        <div class="stat-box"><div class="stat-label">Average</div><div class="stat-value">${document.getElementById("acctAvgValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">Largest</div><div class="stat-value">${document.getElementById("acctMaxValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">Smallest</div><div class="stat-value">${document.getElementById("acctMinValue")?.textContent || "-"}</div></div>
        <div class="stat-box"><div class="stat-label">CAGR</div><div class="stat-value">${document.getElementById("acctCagrValue")?.textContent || "-"}</div></div>
      `;
    }
  } else if (chartId === "cashChart" && cashChartInstance) {
    sourceChart = cashChartInstance;
    statsHtml = `
      <div class="stat-box"><div class="stat-label">Average</div><div class="stat-value">${document.getElementById("cashAvgValue")?.textContent || "-"}</div></div>
      <div class="stat-box"><div class="stat-label">Highest</div><div class="stat-value">${document.getElementById("cashMaxValue")?.textContent || "-"}</div></div>
      <div class="stat-box"><div class="stat-label">Lowest</div><div class="stat-value">${document.getElementById("cashMinValue")?.textContent || "-"}</div></div>
      <div class="stat-box"><div class="stat-label">Growth</div><div class="stat-value">${document.getElementById("cashGrowthValue")?.textContent || "-"}</div></div>
    `;
  }
  
  if (!sourceChart) return;
  
  const modal = document.getElementById("chartFullscreenModal");
  const titleEl = document.getElementById("chartFullscreenTitle");
  const canvas = document.getElementById("chartFullscreenCanvas");
  const statsEl = document.getElementById("chartFullscreenStats");
  
  titleEl.textContent = title;
  statsEl.innerHTML = statsHtml;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  
  if (fullscreenChartInstance) {
    fullscreenChartInstance.destroy();
  }
  
  const ctx = canvas.getContext("2d");
  
  // Determine if this is the cash chart - disable data labels for it
  const isCashChart = chartId === "cashChart";
  
  // Get Y-axis min/max from source chart to maintain consistent scale
  const sourceYScale = sourceChart.options?.scales?.y || {};
  const yMin = sourceYScale.min;
  const yMax = sourceYScale.max;
  const isStacked = sourceChart.options?.scales?.x?.stacked || false;
  
  fullscreenChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [...sourceChart.data.labels],
      datasets: sourceChart.data.datasets.map(ds => ({
        ...ds,
        backgroundColor: ds.type === "line" ? "transparent" : ds.backgroundColor,
        borderColor: ds.borderColor,
        data: [...ds.data]
      }))
    },
    plugins: isCashChart ? [] : [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 30 } },
      plugins: {
        legend: { 
          display: true, 
          position: "bottom",
          labels: { color: "#fff", font: { size: 10 }, boxWidth: 12, padding: 8 }
        },
        datalabels: isCashChart ? { display: false } : {
          display: true,
          anchor: "end",
          align: "top",
          offset: 4,
          font: { size: 12, weight: "600" },
          color: "#fff",
          formatter: (value) => {
            if (value === 0 || value === null) return "";
            if (Math.abs(value) >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
            if (Math.abs(value) >= 1000) return "$" + (value / 1000).toFixed(0) + "K";
            return "$" + value.toFixed(0);
          }
        }
      },
      scales: {
        x: { 
          stacked: isStacked,
          grid: { color: "rgba(255,255,255,0.1)" },
          ticks: { color: "#fff", font: { size: 14 } }
        },
        y: {
          stacked: isStacked,
          min: yMin,
          max: yMax,
          grid: { color: "rgba(255,255,255,0.1)" },
          ticks: { 
            color: "#fff",
            font: { size: 12 },
            callback: v => {
              if (Math.abs(v) >= 1000000) return "$" + (v / 1000000).toFixed(1) + "M";
              return "$" + (v / 1000).toFixed(0) + "K";
            }
          }
        }
      }
    }
  });
}

/* ------------------------------------------------------------
   USER SESSION MANAGEMENT
------------------------------------------------------------ */
function initAuth() {
  const loginScreen = document.getElementById("loginScreen");
  const logoutBtn = document.getElementById("logoutBtn");
  const currentUserEl = document.getElementById("currentUser");
  const userDropdownBtn = document.getElementById("userDropdownBtn");
  const userDropdownMenu = document.getElementById("userDropdownMenu");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  
  const isAuthenticated = localStorage.getItem("ftg_authenticated");
  const currentUser = localStorage.getItem("ftg_current_user");
  const cachedIsAdmin = localStorage.getItem("ftg_is_admin") === "true";
  const cachedRole = localStorage.getItem("ftg_user_role") || '';
  
  console.log('[DEBUG] initAuth - isAuthenticated:', isAuthenticated, 'currentUser:', currentUser);
  console.log('[DEBUG] initAuth - ftg_is_admin raw:', localStorage.getItem("ftg_is_admin"), 'cachedIsAdmin:', cachedIsAdmin, 'cachedRole:', cachedRole);
  
  if (isAuthenticated === "true" && currentUser) {
    loginScreen.classList.add("hidden");
    if (currentUserEl) {
      const displayName = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
      currentUserEl.textContent = displayName;
    }
    
    // IMMEDIATELY show overview section to prevent blank screen on page refresh
    // This runs synchronously before async checkAdminAccess completes
    const overviewEl = document.getElementById('overview');
    const overviewNav = document.querySelector('.nav-item[data-section="overview"]');
    if (overviewEl && !document.querySelector('.dashboard-section.visible')) {
      overviewEl.classList.add('visible');
      if (overviewNav) overviewNav.classList.add('active');
      // Initialize overview data
      if (typeof initOverviewModule === 'function') initOverviewModule();
      if (typeof loadFinancialCharts === 'function') loadFinancialCharts();
    }
    
    // IMMEDIATELY show admin nav if user was previously identified as admin
    // This uses cached localStorage value before async API call completes
    console.log('[DEBUG] initAuth - checking cachedIsAdmin:', cachedIsAdmin);
    if (cachedIsAdmin) {
      const adminNavItem = document.getElementById('adminNavItem');
      console.log('[DEBUG] initAuth - adminNavItem found:', !!adminNavItem);
      if (adminNavItem) {
        adminNavItem.classList.remove('hidden');
        console.log('[DEBUG] initAuth - Removed hidden class from adminNavItem');
      }
      window.isAdminUser = true;
    }
    window.userRole = cachedRole;
  } else {
    // Not authenticated - show login screen, but also show overview as background content
    const overviewEl = document.getElementById('overview');
    if (overviewEl) overviewEl.classList.add('visible');
  }
  
  // User dropdown toggle
  if (userDropdownBtn && userDropdownMenu) {
    userDropdownBtn.onclick = function(e) {
      e.stopPropagation();
      userDropdownMenu.classList.toggle("hidden");
    };
    
    document.addEventListener("click", function(e) {
      if (!userDropdownBtn.contains(e.target) && !userDropdownMenu.contains(e.target)) {
        userDropdownMenu.classList.add("hidden");
      }
    });
  }
  
  if (logoutBtn) {
    logoutBtn.onclick = function() {
      localStorage.removeItem("ftg_authenticated");
      localStorage.removeItem("ftg_current_user");
      localStorage.removeItem("ftg_session_token");
      localStorage.removeItem("ftg_is_admin");
      localStorage.removeItem("ftg_user_role");
      if (currentUserEl) currentUserEl.textContent = "";
      if (userDropdownMenu) userDropdownMenu.classList.add("hidden");
      window.userPermissions = [];
      window.isAdminUser = false;
      window.userRole = '';
      const adminNavItem = document.getElementById('adminNavItem');
      if (adminNavItem) adminNavItem.classList.add('hidden');
      loginScreen.classList.remove("hidden");
    };
  }
  
  // Change password functionality
  if (changePasswordBtn) {
    changePasswordBtn.onclick = function() {
      if (userDropdownMenu) userDropdownMenu.classList.add("hidden");
      showChangePasswordModal();
    };
  }
  
  // Security settings (2FA)
  const securitySettingsBtn = document.getElementById("securitySettingsBtn");
  if (securitySettingsBtn) {
    securitySettingsBtn.onclick = function() {
      if (userDropdownMenu) userDropdownMenu.classList.add("hidden");
      showSecuritySettingsModal();
    };
  }
}

function showChangePasswordModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById("changePasswordModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "changePasswordModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Change Password</h3>
          <button class="modal-close" id="changePasswordClose">&times;</button>
        </div>
        <div class="modal-body">
          <label>Current Password:</label>
          <input type="password" id="currentPasswordInput" placeholder="Enter current password">
          <label>New Password:</label>
          <input type="password" id="newPasswordInput" placeholder="Enter new password">
          <label>Confirm New Password:</label>
          <input type="password" id="confirmPasswordInput" placeholder="Confirm new password">
          <div id="changePasswordStatus" class="email-status"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="changePasswordCancelBtn">Cancel</button>
          <button class="btn-primary" id="changePasswordSaveBtn">Save Password</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Event handlers
    document.getElementById("changePasswordClose").onclick = () => modal.classList.add("hidden");
    document.getElementById("changePasswordCancelBtn").onclick = () => modal.classList.add("hidden");
    document.getElementById("changePasswordSaveBtn").onclick = function() {
      const current = document.getElementById("currentPasswordInput").value;
      const newPass = document.getElementById("newPasswordInput").value;
      const confirm = document.getElementById("confirmPasswordInput").value;
      const status = document.getElementById("changePasswordStatus");
      
      const email = localStorage.getItem("ftg_current_user");
      if (!email) {
        status.textContent = "Please log in again.";
        status.className = "email-status error";
        return;
      }
      
      // Get current password (custom or default)
      const defaultPassword = "Ftgb2025$";
      const storedPassword = localStorage.getItem("ftg_pwd_" + email) || defaultPassword;
      
      if (current !== storedPassword) {
        status.textContent = "Current password is incorrect.";
        status.className = "email-status error";
        return;
      }
      
      if (newPass.length < 6) {
        status.textContent = "New password must be at least 6 characters.";
        status.className = "email-status error";
        return;
      }
      
      if (newPass !== confirm) {
        status.textContent = "New passwords do not match.";
        status.className = "email-status error";
        return;
      }
      
      // Save new password to localStorage
      localStorage.setItem("ftg_pwd_" + email, newPass);
      
      status.textContent = "Password changed successfully!";
      status.className = "email-status success";
      
      // Close modal after delay
      setTimeout(() => {
        const modal = getEl("changePasswordModal");
        if (modal) modal.classList.add("hidden");
      }, 1500);
    };
    
    modal.onclick = function(e) {
      if (e.target === modal) modal.classList.add("hidden");
    };
  }
  
  // Reset form and show
  setElValue("currentPasswordInput", "");
  setElValue("newPasswordInput", "");
  setElValue("confirmPasswordInput", "");
  setElText("changePasswordStatus", "");
  setElClass("changePasswordStatus", "email-status");
  modal.classList.remove("hidden");
}

async function showSecuritySettingsModal() {
  let modal = document.getElementById("securitySettingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "securitySettingsModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h3>Security Settings</h3>
          <button class="modal-close" id="securitySettingsClose">&times;</button>
        </div>
        <div class="modal-body">
          <div id="twoFAStatusSection">
            <h4 style="margin-bottom:12px;">Two-Factor Authentication (2FA)</h4>
            <p id="twoFAStatusText" style="color:#6b7280;margin-bottom:16px;">Loading...</p>
            <div id="twoFAActions"></div>
          </div>
          <div id="twoFASetupSection" class="hidden" style="margin-top:20px;">
            <h4>Set Up 2FA</h4>
            <p style="color:#6b7280;font-size:14px;margin:12px 0;">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            <div style="text-align:center;margin:16px 0;">
              <img id="twoFAQRCode" src="" alt="2FA QR Code" style="max-width:200px;">
            </div>
            <p style="color:#6b7280;font-size:12px;margin:8px 0;">Or enter this code manually: <code id="twoFASecretCode" style="background:#f3f4f6;padding:4px 8px;border-radius:4px;"></code></p>
            <label style="margin-top:16px;display:block;">Enter verification code:</label>
            <input type="text" id="twoFASetupCode" placeholder="000000" maxlength="6" style="text-align:center;font-size:18px;">
            <div id="twoFASetupStatus" class="email-status" style="margin-top:8px;"></div>
            <div style="margin-top:16px;display:flex;gap:8px;">
              <button class="btn-secondary" id="twoFASetupCancelBtn">Cancel</button>
              <button class="btn-primary" id="twoFASetupConfirmBtn">Enable 2FA</button>
            </div>
          </div>
          <div id="twoFADisableSection" class="hidden" style="margin-top:20px;">
            <h4>Disable 2FA</h4>
            <p style="color:#6b7280;font-size:14px;margin:12px 0;">Enter your password to confirm:</p>
            <input type="password" id="twoFADisablePassword" placeholder="Your password">
            <div id="twoFADisableStatus" class="email-status" style="margin-top:8px;"></div>
            <div style="margin-top:16px;display:flex;gap:8px;">
              <button class="btn-secondary" id="twoFADisableCancelBtn">Cancel</button>
              <button class="btn-primary" id="twoFADisableConfirmBtn" style="background:#dc2626;">Disable 2FA</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById("securitySettingsClose").onclick = () => modal.classList.add("hidden");
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };
  }
  
  modal.classList.remove("hidden");
  await load2FAStatus();
}

async function load2FAStatus() {
  const token = localStorage.getItem("ftg_session_token");
  const statusText = document.getElementById("twoFAStatusText");
  const actions = document.getElementById("twoFAActions");
  
  try {
    const response = await fetch("/api/2fa/status", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await response.json();
    
    if (data.enabled) {
      statusText.innerHTML = `<span style="color:#10b981;">✓ 2FA is enabled</span>`;
      actions.innerHTML = `
        <button class="btn-secondary" id="disable2FABtn" style="background:#fee2e2;color:#dc2626;">Disable 2FA</button>
      `;
      document.getElementById("disable2FABtn").onclick = () => showDisable2FASection();
    } else {
      statusText.textContent = "2FA is not enabled. Enable it for extra security.";
      actions.innerHTML = `<button class="btn-primary" id="enable2FABtn">Enable 2FA</button>`;
      document.getElementById("enable2FABtn").onclick = () => start2FASetup();
    }
  } catch (e) {
    statusText.textContent = "Error loading 2FA status";
  }
}

async function start2FASetup() {
  const token = localStorage.getItem("ftg_session_token");
  document.getElementById("twoFAStatusSection").classList.add("hidden");
  document.getElementById("twoFASetupSection").classList.remove("hidden");
  
  try {
    const response = await fetch("/api/2fa/setup", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const data = await response.json();
    
    if (data.success) {
      document.getElementById("twoFAQRCode").src = data.qr_code;
      document.getElementById("twoFASecretCode").textContent = data.secret;
      
      document.getElementById("twoFASetupCancelBtn").onclick = () => {
        document.getElementById("twoFASetupSection").classList.add("hidden");
        document.getElementById("twoFAStatusSection").classList.remove("hidden");
      };
      
      document.getElementById("twoFASetupConfirmBtn").onclick = async () => {
        const code = document.getElementById("twoFASetupCode").value.trim();
        const status = document.getElementById("twoFASetupStatus");
        
        if (!code) { status.textContent = "Enter the code"; status.className = "email-status error"; return; }
        
        const confirmRes = await fetch("/api/2fa/confirm", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        const confirmData = await confirmRes.json();
        
        if (confirmData.success) {
          document.getElementById("twoFASetupSection").classList.add("hidden");
          document.getElementById("twoFAStatusSection").classList.remove("hidden");
          load2FAStatus();
        } else {
          status.textContent = confirmData.error || "Verification failed";
          status.className = "email-status error";
        }
      };
    }
  } catch (e) {
    console.error("2FA setup error:", e);
  }
}

function showDisable2FASection() {
  document.getElementById("twoFAStatusSection").classList.add("hidden");
  document.getElementById("twoFADisableSection").classList.remove("hidden");
  document.getElementById("twoFADisablePassword").value = "";
  document.getElementById("twoFADisableStatus").textContent = "";
  
  document.getElementById("twoFADisableCancelBtn").onclick = () => {
    document.getElementById("twoFADisableSection").classList.add("hidden");
    document.getElementById("twoFAStatusSection").classList.remove("hidden");
  };
  
  document.getElementById("twoFADisableConfirmBtn").onclick = async () => {
    const password = document.getElementById("twoFADisablePassword").value;
    const status = document.getElementById("twoFADisableStatus");
    const token = localStorage.getItem("ftg_session_token");
    
    if (!password) { status.textContent = "Enter your password"; status.className = "email-status error"; return; }
    
    const response = await fetch("/api/2fa/disable", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json();
    
    if (data.success) {
      document.getElementById("twoFADisableSection").classList.add("hidden");
      document.getElementById("twoFAStatusSection").classList.remove("hidden");
      load2FAStatus();
    } else {
      status.textContent = data.error || "Failed to disable 2FA";
      status.className = "email-status error";
    }
  };
}

document.addEventListener("DOMContentLoaded", function() {
  initAuth();
  initSidebar();
  initNavigation();
  initConfigPanels();
  setupExportButtons();
  setupChartExpandButtons();
  setupPageChartExpandButtons();
  setupMetricInfoButtons();
  setupDarkModeToggle();
  updateDataAsOfDates();
  initAllSavedViewsHandlers();
});

/* ------------------------------------------------------------
   DARK MODE TOGGLE FUNCTIONALITY
------------------------------------------------------------ */
function setupDarkModeToggle() {
  const toggle = document.getElementById("darkModeToggle");
  const themeSelect = document.getElementById("themeSelect");
  
  // Load saved theme preference and apply immediately
  const savedTheme = localStorage.getItem("ftg_theme") || "light";
  applyTheme(savedTheme);
  
  // Sync dropdown with current theme
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      applyTheme(newTheme);
      localStorage.setItem("ftg_theme", newTheme);
      updateChartColorsForTheme(newTheme);
    });
  }
  
  // Header toggle button
  if (toggle) {
    toggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(newTheme);
      localStorage.setItem("ftg_theme", newTheme);
      updateChartColorsForTheme(newTheme);
      if (themeSelect) themeSelect.value = newTheme;
    });
  }
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("dark-mode");
    initChartJsThemeDefaults("dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("dark-mode");
    initChartJsThemeDefaults("light");
  }
}

function applyJobBudgetsDarkModeStyles(theme) {
  // This function is now a no-op - styles handled by CSS
  // Keeping function to avoid errors from existing calls
}

function getChartThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    gridColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)",
    textColor: isDark ? "#ffffff" : "#374151",
    legendColor: isDark ? "#ffffff" : "#374151"
  };
}

function initChartJsThemeDefaults(theme) {
  if (typeof Chart === "undefined") return;
  
  const isDark = theme === "dark";
  const textColor = isDark ? "#ffffff" : "#374151";
  const gridColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
  
  // Set global Chart.js defaults
  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;
  
  // Set scale defaults
  if (Chart.defaults.scales) {
    if (Chart.defaults.scales.linear) {
      Chart.defaults.scales.linear.ticks = Chart.defaults.scales.linear.ticks || {};
      Chart.defaults.scales.linear.ticks.color = textColor;
      Chart.defaults.scales.linear.grid = Chart.defaults.scales.linear.grid || {};
      Chart.defaults.scales.linear.grid.color = gridColor;
    }
    if (Chart.defaults.scales.category) {
      Chart.defaults.scales.category.ticks = Chart.defaults.scales.category.ticks || {};
      Chart.defaults.scales.category.ticks.color = textColor;
      Chart.defaults.scales.category.grid = Chart.defaults.scales.category.grid || {};
      Chart.defaults.scales.category.grid.color = gridColor;
    }
  }
  
  // Set legend defaults
  if (Chart.defaults.plugins && Chart.defaults.plugins.legend) {
    Chart.defaults.plugins.legend.labels = Chart.defaults.plugins.legend.labels || {};
    Chart.defaults.plugins.legend.labels.color = textColor;
  }
}

function updateChartColorsForTheme(theme) {
  const isDark = theme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#ffffff" : "#374151";
  
  // Set Chart.js global defaults for future charts
  initChartJsThemeDefaults(theme);
  
  // Update all Chart.js instances if they exist
  if (typeof Chart !== "undefined" && Chart.instances) {
    Object.values(Chart.instances).forEach(chart => {
      if (chart.options && chart.options.scales) {
        if (chart.options.scales.x) {
          chart.options.scales.x.grid = chart.options.scales.x.grid || {};
          chart.options.scales.x.grid.color = gridColor;
          chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
          chart.options.scales.x.ticks.color = textColor;
        }
        if (chart.options.scales.y) {
          chart.options.scales.y.grid = chart.options.scales.y.grid || {};
          chart.options.scales.y.grid.color = gridColor;
          chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
          chart.options.scales.y.ticks.color = textColor;
        }
      }
      // Update legend colors
      if (chart.options && chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels = chart.options.plugins.legend.labels || {};
        chart.options.plugins.legend.labels.color = textColor;
      }
      chart.update("none");
    });
  }
  
  // Re-render cash chart to update Total line color
  if (typeof renderCashChart === 'function' && cashChartInstance) {
    renderCashChart();
  }
  
  // Re-render job budgets donut charts if they exist
  if (typeof renderPmDonutChart === 'function' && typeof pmDonutChart !== 'undefined' && pmDonutChart) {
    renderPmDonutChart();
  }
  if (typeof renderCustomerDonutChart === 'function' && typeof customerDonutChart !== 'undefined' && customerDonutChart) {
    renderCustomerDonutChart();
  }
}

function setupMetricInfoButtons() {
  document.querySelectorAll(".metric-info-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const infoText = btn.dataset.info;
      if (infoText) {
        showMetricInfoPopup(infoText);
      }
    });
  });
}

function showMetricInfoPopup(text) {
  closeMetricInfoPopup();
  
  const overlay = document.createElement("div");
  overlay.className = "metric-info-popup-overlay";
  overlay.id = "metricInfoOverlay";
  overlay.addEventListener("click", closeMetricInfoPopup);
  
  const popup = document.createElement("div");
  popup.className = "metric-info-popup";
  popup.id = "metricInfoPopup";
  popup.innerHTML = `
    <div class="metric-info-popup-text">${text}</div>
    <button class="metric-info-popup-close">Got it</button>
  `;
  
  document.body.appendChild(overlay);
  document.body.appendChild(popup);
  
  popup.querySelector(".metric-info-popup-close").addEventListener("click", closeMetricInfoPopup);
}

function closeMetricInfoPopup() {
  const overlay = document.getElementById("metricInfoOverlay");
  const popup = document.getElementById("metricInfoPopup");
  if (overlay) overlay.remove();
  if (popup) popup.remove();
}

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
    header.addEventListener("click", (e) => {
      // Ignore clicks on the expand button itself - it will handle its own click
      if (e.target.classList.contains('config-expand-btn')) return;
      
      const targetId = header.dataset.target;
      const body = document.getElementById(targetId);
      if (body) {
        body.classList.toggle("collapsed");
        header.classList.toggle("collapsed");
        updateConfigExpandBtn(header);
      }
    });
    
    // Handle expand button click
    const expandBtn = header.querySelector('.config-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = header.dataset.target;
        const body = document.getElementById(targetId);
        if (body) {
          body.classList.toggle("collapsed");
          header.classList.toggle("collapsed");
          updateConfigExpandBtn(header);
        }
      });
    }
  });
}

function updateConfigExpandBtn(header) {
  const expandBtn = header.querySelector('.config-expand-btn');
  if (expandBtn) {
    const isCollapsed = header.classList.contains('collapsed');
    expandBtn.textContent = isCollapsed ? 'Expand ▼' : 'Collapse ▲';
  }
}

function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const mobileBtn = document.getElementById("mobileMenuButton");

  if (mobileBtn) {
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.remove("hidden");
      document.body.classList.add("menu-open");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      closeMobileSidebar();
    });
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.add("hidden");
  document.body.classList.remove("menu-open");
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".dashboard-section");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  // Handle expandable Financial Statements parent
  const finStatementsParent = document.getElementById("navFinancialStatements");
  const finStatementsChildren = document.getElementById("navFinancialStatementsChildren");
  
  if (finStatementsParent && finStatementsChildren) {
    finStatementsParent.addEventListener("click", () => {
      finStatementsParent.classList.toggle("expanded");
      finStatementsChildren.classList.toggle("expanded");
    });
  }

  // Handle expandable Jobs parent
  const jobsParent = document.getElementById("navJobs");
  const jobsChildren = document.getElementById("navJobsChildren");
  
  if (jobsParent && jobsChildren) {
    jobsParent.addEventListener("click", () => {
      jobsParent.classList.toggle("expanded");
      jobsChildren.classList.toggle("expanded");
    });
  }

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const id = item.dataset.section;
      
      // Check permission before allowing navigation
      if (typeof sectionToPermission !== 'undefined' && typeof window.userPermissions !== 'undefined') {
        const permKey = sectionToPermission[id];
        if (permKey && !window.isAdminUser && !window.userPermissions.includes(permKey)) {
          console.warn('Access denied to section:', id);
          return; // Block navigation
        }
      }
      
      // Remove old states
      navItems.forEach(i => i.classList.remove("active"));
      sections.forEach(s => s.classList.remove("visible"));

      // Activate clicked
      item.classList.add("active");
      const section = document.getElementById(id);
      if (section) section.classList.add("visible");
      
      // Hide export ribbon on admin page
      const exportArea = document.querySelector('.content-export-area');
      if (exportArea) {
        exportArea.style.display = id === 'admin' ? 'none' : '';
      }

      // Auto-expand Financials if child is clicked
      if (item.classList.contains("nav-child") && finStatementsParent && finStatementsChildren) {
        const fsChildren = ['overview', 'revenue', 'incomeStatement', 'balanceSheet', 'cashFlows', 'cashReports', 'accounts', 'receivablesPayables'];
        if (fsChildren.includes(id)) {
          finStatementsParent.classList.add("expanded");
          finStatementsChildren.classList.add("expanded");
        }
      }
      
      // Auto-expand Jobs if child is clicked
      if (item.classList.contains("nav-child") && jobsParent && jobsChildren) {
        const jobsChildItems = ['jobOverview', 'jobBudgets', 'jobActuals', 'costDetail', 'missingBudgets', 'jobAnalytics'];
        if (jobsChildItems.includes(id)) {
          jobsParent.classList.add("expanded");
          jobsChildren.classList.add("expanded");
        }
      }

      // Auto-close sidebar on mobile
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }

      // Section-specific loaders
      if (id === "overview") {
        initOverviewModule();
        loadFinancialCharts();
      }
      if (id === "financials") loadFinancialCharts();
      if (id === "revenue") initRevenueModule();
      if (id === "accounts") initAccountModule();
      if (id === "incomeStatement") loadIncomeStatement();
      if (id === "balanceSheet") initBalanceSheet();
      if (id === "cashFlows") loadCashFlowStatement();
      if (id === "cashReports") initCashReports();
      if (id === "jobOverview") initJobOverview();
      if (id === "jobBudgets") initJobBudgets();
      if (id === "jobActuals") initJobActuals();
      if (id === "missingBudgets") initMissingBudgets();
    });
  });
  
  initAllAiPanelToggles();
}

function initAllAiPanelToggles() {
  ['overview', 'rev', 'acct', 'bs', 'jo'].forEach(prefix => {
    const panel = document.getElementById(`${prefix}AiAnalysisPanel`);
    const header = document.getElementById(`${prefix}AiAnalysisHeader`);
    const analyzeBtn = document.getElementById(`${prefix}AiAnalyzeBtn`);
    if (header && panel) header.addEventListener("click", (e) => {
      if (analyzeBtn && (e.target === analyzeBtn || analyzeBtn.contains(e.target))) return;
      panel.classList.toggle("collapsed");
    });
  });
  
  const overviewBtn = document.getElementById('overviewAiAnalyzeBtn');
  if (overviewBtn) overviewBtn.addEventListener('click', performOverviewAiAnalysis);
  
  const revBtn = document.getElementById('revAiAnalyzeBtn');
  if (revBtn) revBtn.addEventListener('click', performRevenueAiAnalysis);
  
  const acctBtn = document.getElementById('acctAiAnalyzeBtn');
  if (acctBtn) acctBtn.addEventListener('click', performAccountAiAnalysis);
  
  const bsBtn = document.getElementById('bsAiAnalyzeBtn');
  if (bsBtn) bsBtn.addEventListener('click', performBalanceSheetAiAnalysis);
  
  const joBtn = document.getElementById('joAiAnalyzeBtn');
  if (joBtn) joBtn.addEventListener('click', performJobOverviewAiAnalysis);
}

async function performOverviewAiAnalysis() {
  const btn = document.getElementById('overviewAiAnalyzeBtn');
  const panel = document.getElementById('overviewAiAnalysisPanel');
  const content = document.getElementById('overviewAiAnalysisContent');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  panel.classList.remove('collapsed');
  content.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing overview...</div>';
  try {
    const statementData = extractOverviewChartData();
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/analyze-overview' : '/.netlify/functions/analyze-overview';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({statementData, periodInfo: 'Executive Overview'})
    });
    const result = await response.json();
    content.innerHTML = result.success ? formatMarkdown(result.analysis) : `<div style="color: #dc2626;">Error: ${result.error}</div>`;
  } catch (e) {
    content.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Analysis';
  }
}

function extractOverviewChartData() {
  let text = "Executive Overview Metrics:\n\n";
  
  const tiles = document.querySelectorAll('.overview-metric-tile');
  tiles.forEach(tile => {
    const title = tile.querySelector('.metric-tile-title')?.textContent.trim() || 'Unknown';
    text += `${title}:\n`;
    
    const statsDiv = tile.querySelector('.metric-stats');
    if (statsDiv) {
      const statBoxes = statsDiv.querySelectorAll('.stat-box');
      statBoxes.forEach(box => {
        const label = box.querySelector('.stat-label')?.textContent.trim() || '';
        const value = box.querySelector('.stat-value')?.textContent.trim() || '-';
        if (label) {
          text += `  ${label}: ${value}\n`;
        }
      });
    }
    text += "\n";
  });
  
  return text || "No overview data available";
}

async function performJobOverviewAiAnalysis() {
  const btn = document.getElementById('joAiAnalyzeBtn');
  const panel = document.getElementById('joAiAnalysisPanel');
  const content = document.getElementById('joAiAnalysisContent');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  panel.classList.remove('collapsed');
  content.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing job data...</div>';
  try {
    const statementData = extractJobOverviewData();
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/analyze-jobs' : '/.netlify/functions/analyze-jobs';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({statementData, periodInfo: 'Job Overview Analysis'})
    });
    const result = await response.json();
    content.innerHTML = result.success ? formatMarkdown(result.analysis) : `<div style="color: #dc2626;">Error: ${result.error}</div>`;
  } catch (e) {
    content.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Analysis';
  }
}

function extractJobOverviewData() {
  let text = "Job Overview Analysis:\n\n";
  
  // Get filter selections
  const statusFilters = [];
  if (document.getElementById('joStatusActive')?.checked) statusFilters.push('Active');
  if (document.getElementById('joStatusInactive')?.checked) statusFilters.push('Inactive');
  if (document.getElementById('joStatusClosed')?.checked) statusFilters.push('Closed');
  if (document.getElementById('joStatusOverhead')?.checked) statusFilters.push('Overhead');
  text += `Filters: ${statusFilters.join(', ') || 'None'}\n`;
  
  const pmFilter = document.getElementById('joPmFilter')?.value || 'All';
  const clientFilter = document.getElementById('joCustomerFilter')?.value || 'All';
  text += `Project Manager: ${pmFilter || 'All'}\n`;
  text += `Client: ${clientFilter || 'All'}\n\n`;
  
  // Get key metrics
  text += "Key Metrics:\n";
  const metrics = [
    { id: 'joTotalJobs', label: 'Total Jobs' },
    { id: 'joContractValue', label: 'Contract Value' },
    { id: 'joBilledRevenue', label: 'Billed Revenue' },
    { id: 'joOverUnderValue', label: 'Over/(Under) Bill' },
    { id: 'joEstProfitMargin', label: 'Est. Profit Margin' }
  ];
  metrics.forEach(m => {
    const el = document.getElementById(m.id);
    if (el) text += `  ${m.label}: ${el.textContent.trim()}\n`;
  });
  text += "\n";
  
  // Get chart summary stats
  const chartSections = [
    { title: 'By Project Manager', charts: ['pmJobsChart', 'pmContractChart', 'pmMarginChart'] },
    { title: 'By Client', charts: ['customerJobsChart', 'customerContractChart', 'customerMarginChart'] }
  ];
  
  chartSections.forEach(section => {
    text += `${section.title}:\n`;
    section.charts.forEach(chartId => {
      const container = document.getElementById(chartId)?.closest('.jo-chart-container');
      if (container) {
        const title = container.querySelector('.jo-chart-title')?.textContent.trim() || chartId;
        text += `  ${title}:\n`;
        const statTiles = container.querySelectorAll('.jo-stat-tile');
        statTiles.forEach(tile => {
          const label = tile.querySelector('.jo-stat-label')?.textContent.trim() || '';
          const value = tile.querySelector('.jo-stat-value')?.textContent.trim() || '';
          const name = tile.querySelector('.jo-stat-name')?.textContent.trim() || '';
          if (label && value) {
            text += `    ${label}: ${value}${name ? ` (${name})` : ''}\n`;
          }
        });
      }
    });
    text += "\n";
  });
  
  return text || "No job overview data available";
}

async function performRevenueAiAnalysis() {
  const btn = document.getElementById('revAiAnalyzeBtn');
  const panel = document.getElementById('revAiAnalysisPanel');
  const content = document.getElementById('revAiAnalysisContent');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  panel.classList.remove('collapsed');
  content.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing revenue...</div>';
  try {
    const statementData = extractRevenueChartData();
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/analyze-revenue' : '/.netlify/functions/analyze-revenue';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({statementData, periodInfo: 'Revenue Analysis'})
    });
    const result = await response.json();
    content.innerHTML = result.success ? formatMarkdown(result.analysis) : `<div style="color: #dc2626;">Error: ${result.error}</div>`;
  } catch (e) {
    content.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Analysis';
  }
}

function extractRevenueChartData() {
  let text = "Revenue Analysis:\n\n";
  
  // Try to get revenue summary stats
  const summaryDiv = document.getElementById('revenueSummary');
  if (summaryDiv) {
    const stats = summaryDiv.querySelectorAll('.stat-item');
    stats.forEach(stat => {
      const label = stat.querySelector('.stat-label')?.textContent.trim() || '';
      const value = stat.querySelector('.stat-value')?.textContent.trim() || '';
      if (label && value) {
        text += `${label}: ${value}\n`;
      }
    });
  }
  
  // Try to get revenue table
  const table = document.getElementById('revenueTable');
  if (table) {
    text += "\nRevenue Table:\n";
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = [];
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim());
      });
      text += rowData.join("\t") + "\n";
    });
  }
  
  return text || "No revenue data available";
}

async function performAccountAiAnalysis() {
  const btn = document.getElementById('acctAiAnalyzeBtn');
  const panel = document.getElementById('acctAiAnalysisPanel');
  const content = document.getElementById('acctAiAnalysisContent');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  panel.classList.remove('collapsed');
  content.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing account...</div>';
  try {
    const statementData = extractAccountChartData();
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/analyze-account' : '/.netlify/functions/analyze-account';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({statementData, periodInfo: 'Account Detail'})
    });
    const result = await response.json();
    content.innerHTML = result.success ? formatMarkdown(result.analysis) : `<div style="color: #dc2626;">Error: ${result.error}</div>`;
  } catch (e) {
    content.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Analysis';
  }
}

function extractAccountChartData() {
  let text = "Account Detail:\n\n";
  
  // Get account info
  const acctSelector = document.getElementById('acctSelector');
  if (acctSelector) {
    const selectedText = acctSelector.options[acctSelector.selectedIndex]?.text || 'Unknown Account';
    text += `Account: ${selectedText}\n\n`;
  }
  
  // Get account detail table
  const table = document.getElementById('acctTable');
  if (table) {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = [];
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim());
      });
      text += rowData.join("\t") + "\n";
    });
  }
  
  return text || "No account data available";
}

async function performBalanceSheetAiAnalysis() {
  const btn = document.getElementById('bsAiAnalyzeBtn');
  const panel = document.getElementById('bsAiAnalysisPanel');
  const content = document.getElementById('bsAiAnalysisContent');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  panel.classList.remove('collapsed');
  content.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing balance sheet...</div>';
  try {
    const statementData = extractBalanceSheetData();
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/analyze-balance-sheet' : '/.netlify/functions/analyze-balance-sheet';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({statementData, periodInfo: 'Balance Sheet'})
    });
    const result = await response.json();
    content.innerHTML = result.success ? formatMarkdown(result.analysis) : `<div style="color: #dc2626;">Error: ${result.error}</div>`;
  } catch (e) {
    content.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Analysis';
  }
}

function extractBalanceSheetData() {
  let text = "Balance Sheet:\n\n";
  
  const table = document.getElementById('balanceSheetTable');
  if (table) {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = [];
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim());
      });
      text += rowData.join("\t") + "\n";
    });
  }
  
  return text || "No balance sheet data available";
}

/* ------------------------------------------------------------
   EXECUTIVE OVERVIEW MODULE
------------------------------------------------------------ */
const currentUserEl = document.getElementById("currentUser");
if (currentUserEl) currentUserEl.innerText = "";

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
  opMargin: "overviewOpMarginChart",
  cash: "overviewCashChart",
  receivables: "overviewReceivablesChart",
  payables: "overviewPayablesChart"
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

/* ------------------------------------------------------------
   SAVED VIEWS - Page-specific collect/apply functions
------------------------------------------------------------ */
const PageViewConfigs = {
  overview: {
    collect() {
      const metrics = {};
      document.querySelectorAll("[data-metric]").forEach(cb => {
        metrics[cb.dataset.metric] = cb.checked;
      });
      return {
        viewType: document.getElementById("overviewViewType")?.value,
        year: document.getElementById("overviewYear")?.value,
        compare: document.getElementById("overviewCompare")?.checked,
        trendline: document.getElementById("overviewTrend")?.checked,
        dataLabels: document.getElementById("overviewDataLabels")?.checked,
        excludeCurrent: document.getElementById("overviewExclude")?.checked,
        rangeStart: document.getElementById("overviewRangeStart")?.value,
        rangeEnd: document.getElementById("overviewRangeEnd")?.value,
        metrics
      };
    },
    apply(cfg) {
      if (!cfg) return;
      if (cfg.viewType) {
        const el = document.getElementById("overviewViewType");
        if (el) el.value = cfg.viewType;
      }
      if (cfg.year) {
        const el = document.getElementById("overviewYear");
        if (el && el.querySelector(`option[value="${cfg.year}"]`)) el.value = cfg.year;
      }
      if (cfg.compare !== undefined) {
        const el = document.getElementById("overviewCompare");
        if (el) el.checked = cfg.compare;
      }
      if (cfg.trendline !== undefined) {
        const el = document.getElementById("overviewTrend");
        if (el) el.checked = cfg.trendline;
      }
      if (cfg.dataLabels !== undefined) {
        const el = document.getElementById("overviewDataLabels");
        if (el) el.checked = cfg.dataLabels;
      }
      if (cfg.excludeCurrent !== undefined) {
        const el = document.getElementById("overviewExclude");
        if (el) el.checked = cfg.excludeCurrent;
      }
      if (cfg.rangeStart) {
        const el = document.getElementById("overviewRangeStart");
        if (el) {
          el.value = cfg.rangeStart;
          const label = document.getElementById("overviewRangeStartLabel");
          if (label) label.textContent = cfg.rangeStart;
        }
      }
      if (cfg.rangeEnd) {
        const el = document.getElementById("overviewRangeEnd");
        if (el) {
          el.value = cfg.rangeEnd;
          const label = document.getElementById("overviewRangeEndLabel");
          if (label) label.textContent = cfg.rangeEnd;
        }
      }
      if (cfg.metrics) {
        Object.keys(cfg.metrics).forEach(metric => {
          const cb = document.querySelector(`[data-metric="${metric}"]`);
          if (cb) cb.checked = cfg.metrics[metric];
        });
      }
      const viewType = document.getElementById("overviewViewType")?.value;
      const yearWrapper = document.getElementById("overviewYearWrapper");
      const rangeWrapper = document.getElementById("overviewRangeWrapper");
      if (viewType === "annual") {
        if (yearWrapper) yearWrapper.classList.add("hidden");
        if (rangeWrapper) rangeWrapper.classList.remove("hidden");
      } else {
        if (yearWrapper) yearWrapper.classList.remove("hidden");
        if (rangeWrapper) rangeWrapper.classList.add("hidden");
      }
    },
    refresh() {
      applyMetricVisibility();
      if (typeof updateOverviewCharts === "function") updateOverviewCharts();
    }
  },
  
  revenue: {
    collect() {
      return {
        viewType: document.getElementById("revViewType")?.value,
        year: document.getElementById("revYear")?.value,
        compare: document.getElementById("revCompare")?.checked,
        trendline: document.getElementById("revTrendline")?.checked,
        dataLabels: document.getElementById("revDataLabels")?.checked,
        excludeCurrent: document.getElementById("revExcludeCurrent")?.checked,
        rangeStart: document.getElementById("revRangeStart")?.value,
        rangeEnd: document.getElementById("revRangeEnd")?.value
      };
    },
    apply(cfg) {
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
          const label = document.getElementById("revRangeStartLabel");
          if (label) label.textContent = cfg.rangeStart;
        }
      }
      if (cfg.rangeEnd) {
        const el = document.getElementById("revRangeEnd");
        if (el) {
          el.value = cfg.rangeEnd;
          const label = document.getElementById("revRangeEndLabel");
          if (label) label.textContent = cfg.rangeEnd;
        }
      }
      const view = cfg.viewType || "monthly";
      const yearWrap = document.getElementById("revYearWrapper");
      const rangeWrap = document.getElementById("revRangeWrapper");
      const compareLabel = document.getElementById("revCompare")?.closest("label");
      if (view === "annual") {
        if (yearWrap) yearWrap.style.display = "none";
        if (rangeWrap) rangeWrap.classList.remove("hidden");
        if (compareLabel) compareLabel.style.display = "none";
      } else {
        if (yearWrap) yearWrap.style.display = "flex";
        if (rangeWrap) rangeWrap.classList.add("hidden");
        if (compareLabel) compareLabel.style.display = "";
      }
    },
    refresh() {
      if (revenueDataCache && typeof updateRevenueView === "function") updateRevenueView(revenueDataCache);
    }
  },
  
  accounts: {
    collect() {
      return {
        account: document.getElementById("acctSelect")?.value,
        viewType: document.getElementById("acctViewType")?.value,
        year: document.getElementById("acctYear")?.value,
        trendline: document.getElementById("acctTrendline")?.checked,
        dataLabels: document.getElementById("acctDataLabels")?.checked,
        excludeCurrent: document.getElementById("acctExcludeCurrent")?.checked,
        rangeStart: document.getElementById("acctRangeStart")?.value,
        rangeEnd: document.getElementById("acctRangeEnd")?.value
      };
    },
    apply(cfg) {
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
          const label = document.getElementById("acctRangeStartLabel");
          if (label) label.textContent = cfg.rangeStart;
        }
      }
      if (cfg.rangeEnd) {
        const el = document.getElementById("acctRangeEnd");
        if (el) {
          el.value = cfg.rangeEnd;
          const label = document.getElementById("acctRangeEndLabel");
          if (label) label.textContent = cfg.rangeEnd;
        }
      }
      const view = cfg.viewType || "monthly";
      const yearWrap = document.getElementById("acctYearWrapper");
      const rangeWrap = document.getElementById("acctRangeWrapper");
      const compareLabel = document.getElementById("acctCompare")?.closest("label");
      if (view === "annual") {
        if (yearWrap) yearWrap.style.display = "none";
        if (rangeWrap) rangeWrap.classList.remove("hidden");
        if (compareLabel) compareLabel.style.display = "none";
      } else {
        if (yearWrap) yearWrap.style.display = "flex";
        if (rangeWrap) rangeWrap.classList.add("hidden");
        if (compareLabel) compareLabel.style.display = "";
      }
    },
    refresh() {
      if (acctDataCache && typeof updateAccountView === "function") updateAccountView(acctDataCache);
    }
  },
  
  incomeStatement: {
    collect() {
      return {
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
    },
    apply(cfg) {
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
      if (typeof updateMatrixControlsVisibility === "function") updateMatrixControlsVisibility();
    },
    refresh() {
      if (typeof renderIncomeStatement === "function") renderIncomeStatement();
    }
  },
  
  balanceSheet: {
    collect() {
      return {
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
    },
    apply(cfg) {
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
      if (typeof updateBSControlVisibility === "function") updateBSControlVisibility();
    },
    refresh() {
      if (typeof renderBalanceSheet === "function") renderBalanceSheet();
    }
  },
  
  cashFlows: {
    collect() {
      return {
        viewMode: document.getElementById("cfViewMode")?.value,
        periodType: document.getElementById("cfPeriodType")?.value,
        periodSelect: document.getElementById("cfPeriodSelect")?.value,
        compare: document.querySelector('input[name="cfCompareRadio"]:checked')?.value,
        detailLevel: document.querySelector('input[name="cfDetailLevel"]:checked')?.value,
        showThousands: document.getElementById("cfShowThousands")?.checked,
        showSubtotal: document.getElementById("cfShowSubtotal")?.checked,
        excludeCurrent: document.getElementById("cfExcludeCurrent")?.checked,
        matrixYearStart: document.getElementById("cfMatrixYearStart")?.value,
        matrixYearEnd: document.getElementById("cfMatrixYearEnd")?.value
      };
    },
    apply(cfg) {
      if (!cfg) return;
      if (cfg.viewMode) {
        const el = document.getElementById("cfViewMode");
        if (el) el.value = cfg.viewMode;
      }
      if (cfg.periodType) {
        const el = document.getElementById("cfPeriodType");
        if (el) el.value = cfg.periodType;
      }
      if (cfg.periodSelect) {
        const el = document.getElementById("cfPeriodSelect");
        if (el && el.querySelector(`option[value="${cfg.periodSelect}"]`)) el.value = cfg.periodSelect;
      }
      if (cfg.compare) {
        const radio = document.querySelector(`input[name="cfCompareRadio"][value="${cfg.compare}"]`);
        if (radio) radio.checked = true;
      }
      if (cfg.detailLevel) {
        // Migrate old "medium" or "account" values to "detailed"
        let detailValue = cfg.detailLevel;
        if (detailValue === "medium" || detailValue === "account") {
          detailValue = "detailed";
        }
        const radio = document.querySelector(`input[name="cfDetailLevel"][value="${detailValue}"]`);
        if (radio) radio.checked = true;
      }
      if (cfg.showThousands !== undefined) {
        const el = document.getElementById("cfShowThousands");
        if (el) el.checked = cfg.showThousands;
      }
      if (cfg.showSubtotal !== undefined) {
        const el = document.getElementById("cfShowSubtotal");
        if (el) el.checked = cfg.showSubtotal;
      }
      if (cfg.excludeCurrent !== undefined) {
        const el = document.getElementById("cfExcludeCurrent");
        if (el) el.checked = cfg.excludeCurrent;
      }
      if (cfg.matrixYearStart) {
        const el = document.getElementById("cfMatrixYearStart");
        if (el) {
          el.value = cfg.matrixYearStart;
          const label = document.getElementById("cfMatrixYearStartLabel");
          if (label) label.textContent = cfg.matrixYearStart;
        }
      }
      if (cfg.matrixYearEnd) {
        const el = document.getElementById("cfMatrixYearEnd");
        if (el) {
          el.value = cfg.matrixYearEnd;
          const label = document.getElementById("cfMatrixYearEndLabel");
          if (label) label.textContent = cfg.matrixYearEnd;
        }
      }
      if (typeof updateCFMatrixControlsVisibility === "function") updateCFMatrixControlsVisibility();
    },
    refresh() {
      if (typeof renderCashFlowStatement === "function") renderCashFlowStatement();
    }
  }
};

/* ------------------------------------------------------------
   SAVED VIEWS - UI Helper Functions
------------------------------------------------------------ */
function populateSavedViewsDropdown(page, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const pageData = SavedViewManager.getPageViews(page);
  const views = pageData.views || {};
  const selectedId = pageData.selectedId;
  
  select.innerHTML = '<option value="">-- Current Settings --</option>';
  
  Object.keys(views).forEach(id => {
    const view = views[id];
    const option = document.createElement("option");
    option.value = id;
    option.textContent = view.name;
    select.appendChild(option);
  });
  
  // Always start at "Current Settings" on page load
  select.value = "";
  
  updateDeleteButtonState(page);
}

function updateDeleteButtonState(page) {
  const mapping = {
    overview: "overviewDeleteViewBtn",
    revenue: "revDeleteViewBtn",
    accounts: "acctDeleteViewBtn",
    incomeStatement: "isDeleteViewBtn",
    balanceSheet: "bsDeleteViewBtn",
    cashFlows: "cfDeleteViewBtn"
  };
  const selectMapping = {
    overview: "overviewSavedViews",
    revenue: "revSavedViews",
    cashFlows: "cfSavedViews",
    accounts: "acctSavedViews",
    incomeStatement: "isSavedViews",
    balanceSheet: "bsSavedViews"
  };
  
  const deleteBtn = document.getElementById(mapping[page]);
  const select = document.getElementById(selectMapping[page]);
  
  if (deleteBtn && select) {
    deleteBtn.disabled = !select.value;
  }
}

function setupSavedViewsHandlers(page, selectId, saveBtnId, deleteBtnId) {
  const select = document.getElementById(selectId);
  const saveBtn = document.getElementById(saveBtnId);
  const deleteBtn = document.getElementById(deleteBtnId);
  
  if (!select || !saveBtn || !deleteBtn) return;
  
  select.onchange = () => {
    const viewId = select.value;
    SavedViewManager.selectView(page, viewId || null);
    
    if (viewId) {
      const view = SavedViewManager.getSelectedView(page);
      if (view && view.config && PageViewConfigs[page]) {
        PageViewConfigs[page].apply(view.config);
        PageViewConfigs[page].refresh();
      }
    }
    updateDeleteButtonState(page);
  };
  
  saveBtn.onclick = () => {
    const name = prompt("Enter a name for this view:");
    if (!name || !name.trim()) return;
    
    const config = PageViewConfigs[page]?.collect();
    if (config) {
      const id = SavedViewManager.saveView(page, name.trim(), config);
      populateSavedViewsDropdown(page, selectId);
      select.value = id;
      updateDeleteButtonState(page);
    }
  };
  
  deleteBtn.onclick = () => {
    const viewId = select.value;
    if (!viewId) return;
    
    const view = SavedViewManager.getPageViews(page).views[viewId];
    if (!view) return;
    
    if (confirm(`Delete view "${view.name}"?`)) {
      SavedViewManager.deleteView(page, viewId);
      populateSavedViewsDropdown(page, selectId);
      updateDeleteButtonState(page);
    }
  };
  
  updateDeleteButtonState(page);
}

function initAllSavedViewsHandlers() {
  setupSavedViewsHandlers("overview", "overviewSavedViews", "overviewSaveViewBtn", "overviewDeleteViewBtn");
  setupSavedViewsHandlers("revenue", "revSavedViews", "revSaveViewBtn", "revDeleteViewBtn");
  setupSavedViewsHandlers("accounts", "acctSavedViews", "acctSaveViewBtn", "acctDeleteViewBtn");
  setupSavedViewsHandlers("incomeStatement", "isSavedViews", "isSaveViewBtn", "isDeleteViewBtn");
  setupSavedViewsHandlers("balanceSheet", "bsSavedViews", "bsSaveViewBtn", "bsDeleteViewBtn");
  setupSavedViewsHandlers("cashFlows", "cfSavedViews", "cfSaveViewBtn", "cfDeleteViewBtn");
  
  populateSavedViewsDropdown("overview", "overviewSavedViews");
  populateSavedViewsDropdown("revenue", "revSavedViews");
  populateSavedViewsDropdown("accounts", "acctSavedViews");
  populateSavedViewsDropdown("incomeStatement", "isSavedViews");
  populateSavedViewsDropdown("balanceSheet", "bsSavedViews");
  populateSavedViewsDropdown("cashFlows", "cfSavedViews");
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
      const excludeEl = document.getElementById("overviewExclude");
      if (excludeEl) excludeEl.checked = cfg.excludeCurrent !== false;
    } else {
      const excludeEl = document.getElementById("overviewExclude");
      if (excludeEl) excludeEl.checked = true;
    }
    
    applyMetricVisibility();
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
  const cfg = prefs.revenueConfig || {};
  
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
  const excludeEl = document.getElementById("revExcludeCurrent");
  if (excludeEl) excludeEl.checked = cfg.excludeCurrent !== false;
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
  
  // Update UI visibility based on view type
  const viewType = document.getElementById("revViewType")?.value;
  const yearWrapper = document.getElementById("revYearWrapper");
  const rangeWrapper = document.getElementById("revRangeWrapper");
  const compareCheck = document.getElementById("revCompare");
  const compareLabel = compareCheck?.closest("label");
  const excludeLabel = document.getElementById("revExcludeLabel");
  
  if (viewType === "annual") {
    if (yearWrapper) yearWrapper.style.display = "none";
    if (rangeWrapper) rangeWrapper.classList.remove("hidden");
    if (compareLabel) compareLabel.style.display = "none";
    if (excludeLabel) excludeLabel.textContent = "Exclude Current Year";
  } else if (viewType === "quarterly") {
    if (yearWrapper) yearWrapper.style.display = "flex";
    if (rangeWrapper) rangeWrapper.classList.add("hidden");
    if (compareLabel) compareLabel.style.display = "";
    if (excludeLabel) excludeLabel.textContent = "Exclude Current Quarter";
  } else {
    if (yearWrapper) yearWrapper.style.display = "flex";
    if (rangeWrapper) rangeWrapper.classList.add("hidden");
    if (compareLabel) compareLabel.style.display = "";
    if (excludeLabel) excludeLabel.textContent = "Exclude Current Month";
  }
}

function loadAccountConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.accountConfig || {};
  
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
  const excludeEl = document.getElementById("acctExcludeCurrent");
  if (excludeEl) excludeEl.checked = cfg.excludeCurrent !== false;
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
  
  // Update UI visibility based on view type
  const viewType = document.getElementById("acctViewType")?.value;
  const yearWrap = document.getElementById("acctYearWrapper");
  const compareCheckbox = document.getElementById("acctCompare");
  const compareLabel = compareCheckbox?.closest("label");
  const rangeWrap = document.getElementById("acctRangeWrapper");
  const excludeLabel = document.getElementById("acctExcludeLabel");
  
  if (viewType === "annual") {
    if (yearWrap) yearWrap.style.display = "none";
    if (compareLabel) compareLabel.style.display = "none";
    if (rangeWrap) rangeWrap.classList.remove("hidden");
    if (excludeLabel) excludeLabel.textContent = "Exclude Current Year";
  } else if (viewType === "quarterly") {
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
}

function loadIncomeStatementConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.incomeStatementConfig || {};
  
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
  const excludeEl = document.getElementById("isExcludeCurrent");
  if (excludeEl) excludeEl.checked = cfg.excludeCurrent !== false;
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
  
  // Update control visibility based on loaded config
  if (typeof updateMatrixControlsVisibility === 'function') {
    updateMatrixControlsVisibility();
  }
}

function loadBalanceSheetConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.balanceSheetConfig || {};
  
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
  const excludeEl = document.getElementById("bsExcludeCurrentMonth");
  if (excludeEl) excludeEl.checked = cfg.excludeCurrentMonth !== false;
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
  
  // Update control visibility based on loaded config
  if (typeof updateBSControlVisibility === 'function') {
    updateBSControlVisibility();
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
        fetch("/data/financials_gl.json").then(r => r.json()).then(data => { overviewDataCache = data; })
      );
    }
    
    if (!isAccountGroups) {
      fetchPromises.push(
        fetch("/data/account_groups.json").then(r => r.json()).then(data => { isAccountGroups = data; })
      );
    }
    
    if (!isData) {
      fetchPromises.push(
        fetch("/data/financials_gl.json").then(r => r.json()).then(data => { 
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
    debouncedUpdateOverviewCharts();
    saveOverviewConfig();
  };
  
  rangeEnd.oninput = () => {
    if (+rangeEnd.value < +rangeStart.value) rangeEnd.value = rangeStart.value;
    document.getElementById("overviewRangeEndLabel").textContent = rangeEnd.value;
    debouncedUpdateOverviewCharts();
    saveOverviewConfig();
  };
  
  document.querySelectorAll("[data-metric]").forEach(cb => {
    cb.onchange = () => {
      updateMetricVisibility();
    };
  });
  
  loadUserPreferences();
  
  } catch (err) {
    console.error("Error setting up overview UI:", err);
  }
}

function updateOverviewCharts() {
  try {
  if (!overviewDataCache || !isAccountGroups) return;
  
  if (Object.keys(bsGLLookup).length === 0 && overviewDataCache.gl_history_all) {
    overviewDataCache.gl_history_all.forEach(row => {
      const acctNum = parseInt(row.Account_Num || row.Account, 10);
      if (isNaN(acctNum)) return;
      if (!bsGLLookup[acctNum]) bsGLLookup[acctNum] = {};
      Object.keys(row).forEach(key => {
        if (/^\d{4}-\d{2}$/.test(key)) {
          bsGLLookup[acctNum][key] = parseFloat(row[key]) || 0;
        }
      });
    });
  }
  
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
      // Skip current month if exclude is checked
      if (excludeCurrent && key === currentMonthKey) continue;
      labels.push(monthNames[m - 1]);
      periods.push([key]);
      if (compare || needPriorForYoY) {
        priorPeriods.push([`${year - 1}-${String(m).padStart(2, "0")}`]);
      }
    }
  } else if (viewType === "quarterly") {
    for (let q = 1; q <= 4; q++) {
      const qMonths = [];
      const priorQMonths = [];
      for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) {
        qMonths.push(`${year}-${String(m).padStart(2, "0")}`);
        if (compare || needPriorForYoY) priorQMonths.push(`${year - 1}-${String(m).padStart(2, "0")}`);
      }
      // Skip current quarter if exclude is checked and it contains current month
      if (excludeCurrent && qMonths.includes(currentMonthKey)) continue;
      labels.push(`Q${q}`);
      periods.push(qMonths);
      if (compare || needPriorForYoY) priorPeriods.push(priorQMonths);
    }
  } else {
    for (let y = rangeStart; y <= rangeEnd; y++) {
      // Skip current year if exclude is checked
      if (excludeCurrent && y === currentYear) continue;
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
    opMargin: { label: "Operating Profit %", values: [], priorValues: [], isPercent: true },
    cash: { label: "Cash", values: [], priorValues: [], isBalance: true },
    receivables: { label: "Receivables", values: [], priorValues: [], isBalance: true },
    payables: { label: "Accounts Payable", values: [], priorValues: [], isBalance: true },
    currentRatio: { label: "Current Ratio", values: [], priorValues: [], isRatio: true }
  };
  
  const cashAccounts = [1001, 1003, 1004, 1005, 1006, 1007, 1040, 1090];
  const receivablesAccounts = [1100, 1105, 1110, 1120, 1130, 1050];
  const payablesAccounts = [2000, 2005, 2010, 2015, 2016, 2017, 2018];
  const currentAssetAccounts = [1001, 1003, 1004, 1005, 1006, 1007, 1040, 1090, 1100, 1105, 1110, 1120, 1130, 1050, 1030];
  const currentLiabilityAccounts = [2000, 2005, 2010, 2015, 2016, 2017, 2018, 2021, 2023, 2025, 2028, 2030, 2070, 2100, 2110, 2120, 2130, 2140, 2200, 2250];
  
  periods.forEach((periodMonths, idx) => {
    const rows = buildIncomeStatementRows(periodMonths, groups);
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
    
    const endOfPeriod = periodMonths[periodMonths.length - 1];
    
    if (typeof getCumulativeBalance === 'function' && typeof bsGLLookup !== 'undefined') {
      const cashBal = getCumulativeBalance(cashAccounts, endOfPeriod, true);
      const recBal = getCumulativeBalance(receivablesAccounts, endOfPeriod, true);
      const payBal = getCumulativeBalance(payablesAccounts, endOfPeriod, false);
      metrics.cash.values.push(cashBal);
      metrics.receivables.values.push(recBal);
      metrics.payables.values.push(payBal);
      
      const caBal = getCumulativeBalance(currentAssetAccounts, endOfPeriod, true);
      const clBal = getCumulativeBalance(currentLiabilityAccounts, endOfPeriod, false);
      metrics.currentRatio.values.push(clBal !== 0 ? caBal / Math.abs(clBal) : 0);
    } else {
      metrics.cash.values.push(0);
      metrics.receivables.values.push(0);
      metrics.payables.values.push(0);
      metrics.currentRatio.values.push(0);
    }
    
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
      
      const priorEndOfPeriod = priorPeriods[idx][priorPeriods[idx].length - 1];
      if (typeof getCumulativeBalance === 'function' && typeof bsGLLookup !== 'undefined') {
        const pCashBal = getCumulativeBalance(cashAccounts, priorEndOfPeriod, true);
        const pRecBal = getCumulativeBalance(receivablesAccounts, priorEndOfPeriod, true);
        const pPayBal = getCumulativeBalance(payablesAccounts, priorEndOfPeriod, false);
        metrics.cash.priorValues.push(pCashBal);
        metrics.receivables.priorValues.push(pRecBal);
        metrics.payables.priorValues.push(pPayBal);
        
        const pCaBal = getCumulativeBalance(currentAssetAccounts, priorEndOfPeriod, true);
        const pClBal = getCumulativeBalance(currentLiabilityAccounts, priorEndOfPeriod, false);
        metrics.currentRatio.priorValues.push(pClBal !== 0 ? pCaBal / Math.abs(pClBal) : 0);
      } else {
        metrics.cash.priorValues.push(0);
        metrics.receivables.priorValues.push(0);
        metrics.payables.priorValues.push(0);
        metrics.currentRatio.priorValues.push(0);
      }
    }
  });
  
  const showTrend = document.getElementById("overviewTrend").checked;
  
  // Track which indices contain the current month (for coloring)
  const currentMonthIndices = [];
  if (!excludeCurrent) {
    if (viewType === "monthly") {
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, "0")}`;
        if (key === currentMonthKey) {
          // Count only non-excluded months before this one
          let idx = 0;
          for (let i = 1; i < m; i++) {
            idx++;
          }
          currentMonthIndices.push(idx);
        }
      }
    } else if (viewType === "quarterly") {
      const currentMonth = currentMonthKey.split("-")[1];
      const currentQuarter = Math.ceil(parseInt(currentMonth) / 3) - 1;
      if (parseInt(currentMonthKey.split("-")[0]) === year) {
        currentMonthIndices.push(currentQuarter);
      }
    } else if (viewType === "annual") {
      let yearIdx = 0;
      for (let y = rangeStart; y <= rangeEnd; y++) {
        if (y === currentYear) {
          currentMonthIndices.push(yearIdx);
          break;
        }
        yearIdx++;
      }
    }
  }
  
  const chartConfigs = [
    { id: "overviewRevenueChart", data: metrics.revenue },
    { id: "overviewGrossProfitChart", data: metrics.grossProfit },
    { id: "overviewGrossMarginChart", data: metrics.grossMargin },
    { id: "overviewOpexChart", data: metrics.opex },
    { id: "overviewOpProfitChart", data: metrics.opProfit },
    { id: "overviewOpMarginChart", data: metrics.opMargin },
    { id: "overviewCashChart", data: metrics.cash },
    { id: "overviewReceivablesChart", data: metrics.receivables },
    { id: "overviewPayablesChart", data: metrics.payables },
    { id: "overviewCurrentRatioChart", data: metrics.currentRatio }
  ];
  
  chartConfigs.forEach(cfg => {
    renderOverviewChart(cfg.id, labels, cfg.data, compare, showTrend, currentMonthIndices);
  });
  
  updateOverviewStats(metrics, labels, excludeCurrent, currentMonthIndices);
  } catch (err) {
    console.error("Error updating overview charts:", err);
  }
}

function updateOverviewStats(metrics, labels, excludeCurrent, currentMonthIndices) {
  try {
  const statConfigs = [
    { key: "revenue", avgId: "revenueAvg", highId: "revenueHigh", lowId: "revenueLow", cagrId: "revenueCagr", highPeriodId: "revenueHighPeriod", lowPeriodId: "revenueLowPeriod", growthLabelId: "revenueGrowthLabel", isPercent: false },
    { key: "grossProfit", avgId: "grossProfitAvg", highId: "grossProfitHigh", lowId: "grossProfitLow", cagrId: "grossProfitCagr", highPeriodId: "grossProfitHighPeriod", lowPeriodId: "grossProfitLowPeriod", growthLabelId: "grossProfitGrowthLabel", isPercent: false },
    { key: "grossMargin", avgId: "grossMarginAvg", highId: "grossMarginHigh", lowId: "grossMarginLow", cagrId: "grossMarginCagr", highPeriodId: "grossMarginHighPeriod", lowPeriodId: "grossMarginLowPeriod", growthLabelId: "grossMarginGrowthLabel", isPercent: true },
    { key: "opex", avgId: "opexAvg", highId: "opexHigh", lowId: "opexLow", cagrId: "opexCagr", highPeriodId: "opexHighPeriod", lowPeriodId: "opexLowPeriod", growthLabelId: "opexGrowthLabel", isPercent: false },
    { key: "opProfit", avgId: "opProfitAvg", highId: "opProfitHigh", lowId: "opProfitLow", cagrId: "opProfitCagr", highPeriodId: "opProfitHighPeriod", lowPeriodId: "opProfitLowPeriod", growthLabelId: "opProfitGrowthLabel", isPercent: false },
    { key: "opMargin", avgId: "opMarginAvg", highId: "opMarginHigh", lowId: "opMarginLow", cagrId: "opMarginCagr", highPeriodId: "opMarginHighPeriod", lowPeriodId: "opMarginLowPeriod", growthLabelId: "opMarginGrowthLabel", isPercent: true },
    { key: "cash", avgId: "cashAvg", highId: "cashHigh", lowId: "cashLow", cagrId: "cashCagr", highPeriodId: "cashHighPeriod", lowPeriodId: "cashLowPeriod", growthLabelId: "cashGrowthLabel", isPercent: false },
    { key: "receivables", avgId: "receivablesAvg", highId: "receivablesHigh", lowId: "receivablesLow", cagrId: "receivablesCagr", highPeriodId: "receivablesHighPeriod", lowPeriodId: "receivablesLowPeriod", growthLabelId: "receivablesGrowthLabel", isPercent: false },
    { key: "payables", avgId: "payablesAvg", highId: "payablesHigh", lowId: "payablesLow", cagrId: "payablesCagr", highPeriodId: "payablesHighPeriod", lowPeriodId: "payablesLowPeriod", growthLabelId: "payablesGrowthLabel", isPercent: false },
    { key: "currentRatio", avgId: "currentRatioAvg", highId: "currentRatioHigh", lowId: "currentRatioLow", cagrId: "currentRatioCagr", highPeriodId: "currentRatioHighPeriod", lowPeriodId: "currentRatioLowPeriod", growthLabelId: "currentRatioGrowthLabel", isPercent: false, isRatio: true }
  ];
  
  const viewType = document.getElementById("overviewViewType").value;
  const year = parseInt(document.getElementById("overviewYear").value);
  
  const growthLabel = viewType === "annual" ? "CAGR" : "YoY";
  
  statConfigs.forEach(cfg => {
    const growthLabelEl = document.getElementById(cfg.growthLabelId);
    if (growthLabelEl) growthLabelEl.textContent = growthLabel;
    
    let allValues = metrics[cfg.key]?.values || [];
    let priorValues = metrics[cfg.key]?.priorValues || [];
    
    // Filter out current month if exclude is checked
    if (excludeCurrent && currentMonthIndices.length > 0) {
      const filteredValues = [];
      const filteredPriorValues = [];
      allValues.forEach((v, idx) => {
        if (!currentMonthIndices.includes(idx)) {
          filteredValues.push(v);
          if (priorValues[idx] !== undefined) filteredPriorValues.push(priorValues[idx]);
        }
      });
      allValues = filteredValues;
      priorValues = filteredPriorValues;
    }
    
    const values = allValues.filter(v => v !== 0);
    
    if (values.length === 0) {
      const avgEl = document.getElementById(cfg.avgId);
      const highEl = document.getElementById(cfg.highId);
      const lowEl = document.getElementById(cfg.lowId);
      const cagrEl = document.getElementById(cfg.cagrId);
      const highPeriodEl = document.getElementById(cfg.highPeriodId);
      const lowPeriodEl = document.getElementById(cfg.lowPeriodId);
      if (avgEl) avgEl.textContent = "-";
      if (highEl) highEl.textContent = "-";
      if (lowEl) lowEl.textContent = "-";
      if (cagrEl) cagrEl.textContent = "-";
      if (highPeriodEl) highPeriodEl.textContent = "";
      if (lowPeriodEl) lowPeriodEl.textContent = "";
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
    
    const formatValue = (val, isPercent, isRatio) => {
      if (isRatio) {
        return val.toFixed(2) + "x";
      }
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
      const sign = val >= 0 ? "+" : "";
      const formatted = Math.abs(val) >= 1000 
        ? val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : val.toFixed(1);
      return sign + formatted + "%";
    };
    
    const avgEl = document.getElementById(cfg.avgId);
    if (avgEl) {
      avgEl.className = avg < 0 ? "stat-value negative" : "stat-value";
      if (cfg.isRatio) {
        animateRatio(avgEl, avg, 600);
      } else if (cfg.isPercent) {
        animatePercent(avgEl, avg, 600, false);
      } else {
        animateCurrency(avgEl, avg, 600);
      }
    }
    
    const highEl = document.getElementById(cfg.highId);
    if (highEl) {
      highEl.className = high < 0 ? "stat-value negative" : "stat-value";
      if (cfg.isRatio) {
        animateRatio(highEl, high, 600);
      } else if (cfg.isPercent) {
        animatePercent(highEl, high, 600, false);
      } else {
        animateCurrency(highEl, high, 600);
      }
    }
    
    const lowEl = document.getElementById(cfg.lowId);
    if (lowEl) {
      lowEl.className = low < 0 ? "stat-value negative" : "stat-value";
      if (cfg.isRatio) {
        animateRatio(lowEl, low, 600);
      } else if (cfg.isPercent) {
        animatePercent(lowEl, low, 600, false);
      } else {
        animateCurrency(lowEl, low, 600);
      }
    }
    
    const highPeriodEl = document.getElementById(cfg.highPeriodId);
    if (highPeriodEl) highPeriodEl.textContent = highPeriod;
    const lowPeriodEl = document.getElementById(cfg.lowPeriodId);
    if (lowPeriodEl) lowPeriodEl.textContent = lowPeriod;
    
    const cagrEl = document.getElementById(cfg.cagrId);
    if (cagrEl) {
      cagrEl.className = growthRate < 0 ? "stat-value negative" : "stat-value";
      animatePercent(cagrEl, growthRate, 600, true);
    }
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

function renderOverviewChart(canvasId, labels, metricData, showPrior, showTrend, currentMonthIndices) {
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
      const datasetIndex = context.datasetIndex;
      const dataIndex = context.dataIndex;
      
      // Use orange for current month if not excluding it
      if (currentMonthIndices && currentMonthIndices.length > 0 && currentMonthIndices.includes(dataIndex)) {
        return createBarGradient(ctx, chartArea, gradientColors.orange.start, gradientColors.orange.end);
      }
      
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
  const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : false;
  
  // Calculate Y-axis minimum based on data
  let allValues = [...metricData.values];
  if (showPrior && metricData.priorValues.length > 0) {
    allValues = allValues.concat(metricData.priorValues);
  }
  const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
  const dataMin = validValues.length > 0 ? Math.min(...validValues) : 0;
  const dataMax = validValues.length > 0 ? Math.max(...validValues) : 0;
  
  // Calculate appropriate Y-axis min (start just below the lowest value)
  let yMin = undefined;
  if (dataMin > 0) {
    const range = dataMax - dataMin;
    // Use 15% of range as padding, or 10% of dataMin if flat data
    const padding = range > 0 ? range * 0.15 : dataMin * 0.1;
    
    if (metricData.isRatio) {
      // For ratios, round to nearest 0.1
      yMin = Math.floor((dataMin - padding) * 10) / 10;
      if (yMin < 0) yMin = 0;
    } else if (metricData.isPercent) {
      // For percentages, round to nearest 1%
      yMin = Math.floor(dataMin - padding);
      if (yMin < 0) yMin = 0;
    } else {
      // For currency, round to a nice number
      let step;
      if (dataMin >= 1000000) {
        step = 100000;
      } else if (dataMin >= 100000) {
        step = 10000;
      } else if (dataMin >= 10000) {
        step = 5000;
      } else if (dataMin >= 1000) {
        step = 500;
      } else {
        step = 100;
      }
      yMin = Math.floor((dataMin - padding) / step) * step;
      if (yMin < 0) yMin = 0;
    }
  }
  
  const themeColors = getChartThemeColors();
  
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
        legend: { display: showPrior || showTrend, position: "bottom", labels: { boxWidth: 12, font: { size: 10 }, color: themeColors.legendColor } },
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
              if (metricData.isRatio) {
                return datasetLabel + value.toFixed(2) + "x";
              }
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
          color: themeColors.textColor,
          formatter: (value) => {
            if (value === 0 || value === null) return "";
            if (metricData.isRatio) return value.toFixed(2) + "x";
            if (metricData.isPercent) return value.toFixed(1) + "%";
            if (Math.abs(value) >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
            if (Math.abs(value) >= 1000) return "$" + (value / 1000).toFixed(0) + "K";
            return "$" + value.toFixed(0);
          }
        }
      },
      scales: {
        x: { grid: { display: false, color: themeColors.gridColor }, ticks: { font: { size: 9 }, color: themeColors.textColor } },
        y: {
          min: yMin,
          grid: { color: themeColors.gridColor },
          ticks: {
            font: { size: 9 },
            color: themeColors.textColor,
            callback: v => metricData.isRatio ? v.toFixed(1) + "x" : (metricData.isPercent ? v.toFixed(0) + "%" : (Math.abs(v) >= 1000000 ? "$" + (v / 1000000).toFixed(1) + "M" : "$" + (v / 1000).toFixed(0) + "K"))
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
    const response = await fetch("/data/financials_gl.json");

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
    } else if (base === "#dc2626") {
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
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
        delay: (context) => {
          let delay = 0;
          if (context.type === 'data' && context.mode === 'default') {
            delay = context.dataIndex * 50;
          }
          return delay;
        }
      },
      transitions: {
        active: { animation: { duration: 200 } }
      },
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
      const response = await fetch("/data/financials_gl.json");
      if (!response.ok) throw new Error("Failed to fetch revenue data");
      revenueDataCache = await response.json();
    }

    setupRevenueUI(revenueDataCache);
    loadRevenueConfig();
    
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
  
  document.getElementById("exportExcelBtn").onclick = () => {
    dropdown.classList.add("hidden");
    universalExportToExcel();
  };
  
  document.getElementById("exportEmailBtn").onclick = () => {
    dropdown.classList.add("hidden");
    openEmailModal();
  };
  
  const scheduleEmailBtn = document.getElementById("scheduleEmailBtn");
  if (scheduleEmailBtn) {
    scheduleEmailBtn.onclick = () => {
      dropdown.classList.add("hidden");
      openScheduleEmailModal();
    };
  }
  
  // Desktop ribbon buttons
  const ribbonPrint = document.getElementById("exportPrintBtnRibbon");
  const ribbonPdf = document.getElementById("exportPdfBtnRibbon");
  const ribbonCsv = document.getElementById("exportCsvBtnRibbon");
  const ribbonExcel = document.getElementById("exportExcelBtnRibbon");
  const ribbonEmail = document.getElementById("exportEmailBtnRibbon");
  const ribbonSchedule = document.getElementById("scheduleEmailBtnRibbon");
  
  if (ribbonPrint) ribbonPrint.onclick = () => universalPrint();
  if (ribbonPdf) ribbonPdf.onclick = () => universalExportToPdf();
  if (ribbonCsv) ribbonCsv.onclick = () => universalExportToCsv();
  if (ribbonExcel) ribbonExcel.onclick = () => universalExportToExcel();
  if (ribbonEmail) ribbonEmail.onclick = () => openEmailModal();
  if (ribbonSchedule) ribbonSchedule.onclick = () => openScheduleEmailModal();
}

/* ------------------------------------------------------------
   SCHEDULE EMAIL FUNCTIONS
------------------------------------------------------------ */
function openScheduleEmailModal() {
  const modal = getEl("scheduleEmailModal");
  if (!modal) return;
  
  resetScheduleForm();
  setupScheduleTabs();
  updateFrequencyFields();
  loadScheduledReports();
  modal.classList.remove("hidden");
}

function closeScheduleEmailModal() {
  const modal = getEl("scheduleEmailModal");
  if (modal) modal.classList.add("hidden");
}

function setupScheduleTabs() {
  const tabs = document.querySelectorAll(".schedule-tab");
  const createTab = getEl("createScheduleTab");
  const manageTab = getEl("manageSchedulesTab");
  const saveBtn = getEl("saveScheduleBtn");
  
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      const tabName = tab.dataset.tab;
      if (tabName === "create") {
        createTab.classList.remove("hidden");
        manageTab.classList.add("hidden");
        saveBtn.style.display = "";
      } else {
        createTab.classList.add("hidden");
        manageTab.classList.remove("hidden");
        saveBtn.style.display = "none";
      }
    };
  });
  
  const frequencySelect = getEl("scheduleFrequency");
  if (frequencySelect) {
    frequencySelect.onchange = updateFrequencyFields;
  }
}

function updateFrequencyFields() {
  const frequency = getElValue("scheduleFrequency", "weekly");
  const dayOfWeekRow = getEl("scheduleDayOfWeekRow");
  const dayOfMonthRow = getEl("scheduleDayOfMonthRow");
  
  if (frequency === "daily") {
    if (dayOfWeekRow) dayOfWeekRow.classList.add("hidden");
    if (dayOfMonthRow) dayOfMonthRow.classList.add("hidden");
  } else if (frequency === "weekly") {
    if (dayOfWeekRow) dayOfWeekRow.classList.remove("hidden");
    if (dayOfMonthRow) dayOfMonthRow.classList.add("hidden");
  } else if (frequency === "monthly") {
    if (dayOfWeekRow) dayOfWeekRow.classList.add("hidden");
    if (dayOfMonthRow) dayOfMonthRow.classList.remove("hidden");
  }
}

function resetScheduleForm() {
  setElValue("scheduleReportName", "");
  setElValue("scheduleRecipients", "");
  setElValue("scheduleFrequency", "weekly");
  setElValue("scheduleDayOfWeek", "1");
  setElValue("scheduleDayOfMonth", "1");
  setElValue("scheduleSendTime", "08:00");
  setElValue("scheduleEditId", "");
  
  const activeCheckbox = getEl("scheduleActive");
  if (activeCheckbox) activeCheckbox.checked = true;
  
  setElText("scheduleStatus", "");
  if (getEl("scheduleStatus")) getEl("scheduleStatus").className = "email-status";
  
  const tabs = document.querySelectorAll(".schedule-tab");
  tabs.forEach((t, i) => {
    if (i === 0) t.classList.add("active");
    else t.classList.remove("active");
  });
  
  const createTab = getEl("createScheduleTab");
  const manageTab = getEl("manageSchedulesTab");
  const saveBtn = getEl("saveScheduleBtn");
  
  if (createTab) createTab.classList.remove("hidden");
  if (manageTab) manageTab.classList.add("hidden");
  if (saveBtn) saveBtn.style.display = "";
  
  setElText("scheduleModalTitle", "Schedule Email Report");
}

function getAuthToken() {
  return localStorage.getItem("ftg_session_token") || "";
}

async function loadScheduledReports() {
  const listEl = getEl("scheduledReportsList");
  if (!listEl) return;
  
  listEl.innerHTML = '<p class="loading-message">Loading scheduled reports...</p>';
  
  try {
    const token = getAuthToken();
    const response = await fetch("/api/scheduled-reports", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error("Failed to load scheduled reports");
    }
    
    const data = await response.json();
    const reports = data.reports || [];
    
    if (reports.length === 0) {
      listEl.innerHTML = '<p class="empty-message">No scheduled reports yet. Create one using the form above.</p>';
      return;
    }
    
    let html = "";
    for (const report of reports) {
      const frequencyText = formatFrequency(report);
      const recipientCount = report.recipients ? report.recipients.length : 0;
      
      html += `
        <div class="scheduled-report-item ${report.is_active ? '' : 'inactive'}" data-id="${report.id}">
          <div class="scheduled-report-info">
            <div class="scheduled-report-name">${escapeHtml(report.report_name)}</div>
            <div class="scheduled-report-details">
              ${escapeHtml(report.report_type)} | ${frequencyText} | ${recipientCount} recipient(s)
            </div>
          </div>
          <div class="scheduled-report-actions">
            <button class="btn-edit" onclick="editScheduledReport(${report.id})">Edit</button>
            <button class="btn-delete" onclick="deleteScheduledReport(${report.id})">Delete</button>
          </div>
        </div>
      `;
    }
    
    listEl.innerHTML = html;
  } catch (error) {
    console.error("Error loading scheduled reports:", error);
    listEl.innerHTML = '<p class="empty-message">Error loading scheduled reports. Please try again.</p>';
  }
}

function formatFrequency(report) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const time = report.send_time ? report.send_time.slice(0, 5) : "08:00";
  
  if (report.frequency === "daily") {
    return `Daily at ${time}`;
  } else if (report.frequency === "weekly") {
    const dayName = days[report.day_of_week] || "Mon";
    return `Weekly on ${dayName} at ${time}`;
  } else if (report.frequency === "monthly") {
    const dayNum = report.day_of_month || 1;
    const suffix = dayNum === 1 ? "st" : dayNum === 15 ? "th" : "th";
    return `Monthly on ${dayNum}${suffix} at ${time}`;
  }
  return report.frequency;
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getCurrentViewConfig() {
  const view = getCurrentView();
  const config = { view };
  
  if (view === "overview") {
    config.viewType = getElValue("overviewViewType", "monthly");
    config.year = getElValue("overviewYear", new Date().getFullYear());
    config.compare = getElChecked("overviewCompare");
    config.trendline = getElChecked("overviewTrend");
    config.dataLabels = getElChecked("overviewDataLabels");
    config.exclude = getElChecked("overviewExclude");
  } else if (view === "revenue") {
    config.viewType = getElValue("revViewType", "monthly");
    config.year = getElValue("revYear", new Date().getFullYear());
    config.compare = getElChecked("revCompare");
    config.trendline = getElChecked("revTrend");
  } else if (view === "incomeStatement") {
    config.periodType = getElValue("isPeriodType", "month");
    config.year = getElValue("isYear", new Date().getFullYear());
    config.month = getElValue("isMonth", 12);
    config.compareMode = getElValue("isCompareMode", "none");
  } else if (view === "balanceSheet") {
    config.viewMode = getElValue("bsViewMode", "single");
    config.year = getElValue("bsYear", new Date().getFullYear());
    config.month = getElValue("bsMonth", 12);
  } else if (view === "cashFlows") {
    config.periodType = getElValue("cfPeriodType", "month");
    config.year = getElValue("cfYear", new Date().getFullYear());
    config.month = getElValue("cfMonth", 12);
  }
  
  return config;
}

async function saveScheduledReport() {
  const status = getEl("scheduleStatus");
  const reportName = getElValue("scheduleReportName", "").trim();
  const recipientsStr = getElValue("scheduleRecipients", "").trim();
  const frequency = getElValue("scheduleFrequency", "weekly");
  const dayOfWeek = parseInt(getElValue("scheduleDayOfWeek", "1"));
  const dayOfMonth = parseInt(getElValue("scheduleDayOfMonth", "1"));
  const sendTime = getElValue("scheduleSendTime", "08:00");
  const isActive = getElChecked("scheduleActive", true);
  const editId = getElValue("scheduleEditId", "");
  
  if (!reportName) {
    if (status) {
      status.textContent = "Please enter a report name.";
      status.className = "email-status error";
    }
    return;
  }
  
  if (!recipientsStr) {
    if (status) {
      status.textContent = "Please enter at least one recipient email.";
      status.className = "email-status error";
    }
    return;
  }
  
  const recipients = recipientsStr.split(",").map(e => e.trim()).filter(e => e);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of recipients) {
    if (!emailRegex.test(email)) {
      if (status) {
        status.textContent = `Invalid email address: ${email}`;
        status.className = "email-status error";
      }
      return;
    }
  }
  
  const view = getCurrentView();
  const viewConfig = getCurrentViewConfig();
  
  const payload = {
    report_type: view,
    report_name: reportName,
    view_config: viewConfig,
    recipients: recipients,
    frequency: frequency,
    day_of_week: frequency === "weekly" ? dayOfWeek : null,
    day_of_month: frequency === "monthly" ? dayOfMonth : null,
    send_time: sendTime,
    is_active: isActive
  };
  
  try {
    if (status) {
      status.textContent = "Saving...";
      status.className = "email-status";
    }
    
    const token = getAuthToken();
    const url = editId ? `/api/scheduled-reports/${editId}` : "/api/scheduled-reports";
    const method = editId ? "PUT" : "POST";
    
    const response = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to save scheduled report");
    }
    
    if (status) {
      status.textContent = editId ? "Schedule updated successfully!" : "Schedule created successfully!";
      status.className = "email-status success";
    }
    
    setTimeout(() => {
      loadScheduledReports();
      
      const tabs = document.querySelectorAll(".schedule-tab");
      tabs.forEach(t => {
        if (t.dataset.tab === "manage") t.click();
      });
    }, 1000);
    
  } catch (error) {
    console.error("Error saving scheduled report:", error);
    if (status) {
      status.textContent = error.message || "Failed to save scheduled report.";
      status.className = "email-status error";
    }
  }
}

async function editScheduledReport(id) {
  try {
    const token = getAuthToken();
    const response = await fetch("/api/scheduled-reports", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error("Failed to load report");
    
    const data = await response.json();
    const report = (data.reports || []).find(r => r.id === id);
    
    if (!report) {
      alert("Report not found.");
      return;
    }
    
    setElValue("scheduleReportName", report.report_name || "");
    setElValue("scheduleRecipients", (report.recipients || []).join(", "));
    setElValue("scheduleFrequency", report.frequency || "weekly");
    setElValue("scheduleDayOfWeek", String(report.day_of_week || 1));
    setElValue("scheduleDayOfMonth", String(report.day_of_month || 1));
    setElValue("scheduleSendTime", (report.send_time || "08:00:00").slice(0, 5));
    setElValue("scheduleEditId", String(id));
    
    const activeCheckbox = getEl("scheduleActive");
    if (activeCheckbox) activeCheckbox.checked = report.is_active !== false;
    
    updateFrequencyFields();
    
    setElText("scheduleModalTitle", "Edit Scheduled Report");
    
    const tabs = document.querySelectorAll(".schedule-tab");
    tabs.forEach(t => {
      if (t.dataset.tab === "create") t.click();
    });
    
  } catch (error) {
    console.error("Error loading report for edit:", error);
    alert("Failed to load report for editing.");
  }
}

async function deleteScheduledReport(id) {
  if (!confirm("Are you sure you want to delete this scheduled report?")) {
    return;
  }
  
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/scheduled-reports/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error("Failed to delete scheduled report");
    }
    
    loadScheduledReports();
  } catch (error) {
    console.error("Error deleting scheduled report:", error);
    alert("Failed to delete scheduled report.");
  }
}

function getCurrentView() {
  const sections = ["overview", "revenue", "accounts", "incomeStatement", "balanceSheet", "cashFlows", "cashReports", "jobOverview", "jobBudgets", "receivablesPayables", "jobAnalytics", "admin"];
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
      isWide: isIncomeStatementWide(),
      aiAnalysis: getIncomeStatementAiAnalysis()
    };
  } else if (view === "balanceSheet") {
    return {
      title: "Balance Sheet",
      subtitle: getBalanceSheetSubtitle(),
      tableHtml: getBalanceSheetTableHtml(),
      csvData: getBalanceSheetCsvData(),
      isWide: isBalanceSheetWide(),
      aiAnalysis: getBalanceSheetAiAnalysis()
    };
  } else if (view === "cashFlows") {
    return {
      title: "Statement of Cash Flows",
      subtitle: getCashFlowSubtitle(),
      tableHtml: getCashFlowTableHtml(),
      csvData: getCashFlowCsvData(),
      isWide: isCashFlowWide(),
      aiAnalysis: getCashFlowAiAnalysis()
    };
  } else if (view === "cashReports") {
    return {
      title: "Cash Balances",
      subtitle: getCashBalancesSubtitle(),
      tableHtml: getCashBalancesTableHtml(),
      csvData: getCashBalancesCsvData(),
      isWide: true
    };
  } else if (view === "jobOverview") {
    return {
      title: "Job Overview Report",
      subtitle: getJobOverviewSubtitle(),
      tableHtml: getJobOverviewTableHtml(),
      csvData: getJobOverviewCsvData(),
      isWide: true,
      captureCharts: captureJobOverviewCharts
    };
  } else if (view === "jobBudgets") {
    return {
      title: "Job Budgets Report",
      subtitle: getJobBudgetsSubtitle(),
      tableHtml: getJobBudgetsTableHtml(),
      csvData: getJobBudgetsCsvData(),
      isWide: true
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
  const table = document.getElementById("revTable");
  if (table && table.querySelector("tbody tr")) {
    return table.outerHTML;
  }
  
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
  const periodEl = document.getElementById("isReportPeriod");
  if (periodEl?.textContent) return periodEl.textContent;
  
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
  const periodEl = document.getElementById("bsReportPeriod");
  if (periodEl?.textContent) return periodEl.textContent;
  
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
  const viewMode = document.getElementById("bsViewMode")?.value;
  const compare = document.querySelector('input[name="bsCompareRadio"]:checked')?.value;
  return viewMode === "matrix" || compare !== "none";
}

function getBalanceSheetAiAnalysis() {
  return null;
}

function getCashFlowSubtitle() {
  const periodEl = document.getElementById("cfReportPeriod");
  return periodEl?.textContent || "";
}

function getCashFlowTableHtml() {
  const table = document.querySelector("#cashFlows .is-table");
  if (!table) return "<p>No data available</p>";
  
  const clone = table.cloneNode(true);
  clone.querySelectorAll(".is-row-hidden").forEach(r => r.remove());
  clone.querySelectorAll(".is-spacer-row").forEach(r => r.remove());
  clone.querySelectorAll(".cf-toggle").forEach(t => t.remove());
  
  return clone.outerHTML;
}

function getCashFlowCsvData() {
  const table = document.querySelector("#cashFlows .is-table");
  if (!table) return "";
  
  let csv = "";
  const rows = table.querySelectorAll("tr:not(.is-row-hidden):not(.is-spacer-row)");
  rows.forEach(row => {
    const cells = row.querySelectorAll("th, td");
    csv += Array.from(cells).map(c => `"${c.textContent.trim()}"`).join(",") + "\n";
  });
  return csv;
}

function isCashFlowWide() {
  const viewMode = document.getElementById("cfViewMode")?.value;
  const compare = document.querySelector('input[name="cfCompareRadio"]:checked')?.value;
  return viewMode === "matrix" || compare !== "none";
}

function getCashFlowAiAnalysis() {
  const panel = document.getElementById("cfAiAnalysisPanel");
  if (!panel || panel.classList.contains("collapsed")) return null;
  const content = document.getElementById("cfAiAnalysisContent");
  if (!content || !content.innerHTML.trim()) return null;
  return content.innerHTML;
}

function getCashBalancesSubtitle() {
  const rangeValue = document.getElementById("cashDaysRange")?.value || "30";
  const selectedCount = cashSelectedAccounts?.length || 0;
  const totalAccounts = cashData?.accounts?.length || 0;
  
  let rangeText = "";
  if (rangeValue === "custom") {
    const startDate = document.getElementById("cashStartDate")?.value;
    const endDate = document.getElementById("cashEndDate")?.value;
    if (startDate && endDate) {
      rangeText = `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
    } else {
      rangeText = "Custom Range";
    }
  } else {
    rangeText = `Last ${rangeValue} Days`;
  }
  
  return `${rangeText} | ${selectedCount} of ${totalAccounts} accounts selected`;
}

function getCashBalancesTableHtml() {
  if (!cashData?.accounts || cashSelectedAccounts?.length === 0) {
    return "<p>No accounts selected</p>";
  }
  
  const selectedAccounts = cashData.accounts
    .filter(a => cashSelectedAccounts.includes(a.name))
    .sort((a, b) => b.balance - a.balance);
  
  const dates = getCashDateRange();
  const total = selectedAccounts.reduce((sum, a) => sum + a.balance, 0);
  
  let html = `<div style="margin-bottom:15px;"><strong>Current Total Balance: ${formatCurrency(total)}</strong></div>`;
  html += `<table><tr><th>Account</th><th style="text-align:right;">Current Balance</th></tr>`;
  
  selectedAccounts.forEach(acct => {
    html += `<tr><td>${acct.name}</td><td style="text-align:right;">${formatCurrency(acct.balance)}</td></tr>`;
  });
  
  html += `<tr style="font-weight:bold;border-top:2px solid #000;"><td>Total</td><td style="text-align:right;">${formatCurrency(total)}</td></tr>`;
  html += `</table>`;
  
  const dailyTableContainer = document.getElementById("dailyBalanceTableContainer");
  if (dailyTableContainer) {
    const dailyTable = dailyTableContainer.querySelector(".daily-balance-table");
    if (dailyTable) {
      const tableClone = dailyTable.cloneNode(true);
      tableClone.classList.add("expanded");
      html += `<h3 style="margin-top:25px;margin-bottom:10px;font-size:16px;color:#1f2937;">Daily Balances</h3>`;
      html += tableClone.outerHTML;
    }
  }
  
  const transactionContainer = document.getElementById("transactionTableContainer");
  if (transactionContainer) {
    const transactionTable = transactionContainer.querySelector(".transaction-table");
    if (transactionTable && transactionTable.querySelector("tbody tr")) {
      html += `<h3 style="margin-top:25px;margin-bottom:10px;font-size:16px;color:#1f2937;">Transactions</h3>`;
      html += transactionTable.outerHTML;
    }
  }
  
  return html;
}

function getCashBalancesCsvData() {
  if (!cashData?.accounts || cashSelectedAccounts?.length === 0) {
    return "";
  }
  
  const selectedAccounts = cashData.accounts
    .filter(a => cashSelectedAccounts.includes(a.name))
    .sort((a, b) => b.balance - a.balance);
  
  const dates = getCashDateRange();
  let csv = "Account,Current Balance\n";
  
  selectedAccounts.forEach(acct => {
    csv += `"${acct.name}",${acct.balance}\n`;
  });
  
  const total = selectedAccounts.reduce((sum, a) => sum + a.balance, 0);
  csv += `"TOTAL",${total}\n`;
  
  return csv;
}

function getJobBudgetsSubtitle() {
  const filters = [];
  const statusFilters = Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value);
  if (statusFilters.length > 0 && statusFilters.length < 4) {
    filters.push(`Status: ${statusFilters.join(', ')}`);
  }
  const pm = document.getElementById('pmFilter')?.value;
  if (pm) filters.push(`PM: ${pm}`);
  const customer = document.getElementById('customerFilter')?.value;
  if (customer) filters.push(`Client: ${customer}`);
  
  const total = jobBudgetsFiltered?.length || 0;
  let subtitle = `${total} Job${total !== 1 ? 's' : ''}`;
  if (filters.length > 0) subtitle += ` | ${filters.join(' | ')}`;
  return subtitle;
}

function getJobBudgetsTableHtml() {
  if (!jobBudgetsFiltered || jobBudgetsFiltered.length === 0) {
    return "<p>No job data available</p>";
  }
  
  // Calculate totals first
  let totalContract = 0, totalCost = 0, totalProfit = 0;
  jobBudgetsFiltered.forEach(job => {
    totalContract += job.revised_contract || 0;
    totalCost += job.revised_cost || 0;
    totalProfit += job.estimated_profit || 0;
  });
  const totalMargin = totalContract ? (totalProfit / totalContract) * 100 : 0;
  const totalProfitColor = totalProfit >= 0 ? '#10b981' : '#dc2626';
  
  // Summary metrics section
  let html = `<div style="margin-bottom:20px;">
    <h3 style="margin:0 0 12px 0;font-size:14px;color:#374151;">Summary</h3>
    <table style="border-collapse:collapse;font-size:12px;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Total Jobs:</td>
        <td style="padding:6px 0;font-weight:600;">${jobBudgetsFiltered.length}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Total Contract:</td>
        <td style="padding:6px 0;font-weight:600;">${formatCurrency(totalContract)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Total Cost:</td>
        <td style="padding:6px 0;font-weight:600;">${formatCurrency(totalCost)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Total Est. Profit:</td>
        <td style="padding:6px 0;font-weight:600;color:${totalProfitColor};">${formatCurrency(totalProfit)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Avg Margin:</td>
        <td style="padding:6px 0;font-weight:600;">${totalMargin.toFixed(1)}%</td>
      </tr>
    </table>
  </div>`;
  
  // Top 10 jobs by contract value
  const topJobs = [...jobBudgetsFiltered]
    .sort((a, b) => (b.revised_contract || 0) - (a.revised_contract || 0))
    .slice(0, 10);
  
  html += `<h3 style="margin:20px 0 12px 0;font-size:14px;color:#374151;">Top ${Math.min(10, jobBudgetsFiltered.length)} Jobs by Contract Value</h3>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px;text-align:left;border:1px solid #e5e7eb;">Job #</th>
        <th style="padding:8px;text-align:left;border:1px solid #e5e7eb;">Description</th>
        <th style="padding:8px;text-align:left;border:1px solid #e5e7eb;">Client</th>
        <th style="padding:8px;text-align:right;border:1px solid #e5e7eb;">Contract</th>
        <th style="padding:8px;text-align:right;border:1px solid #e5e7eb;">Est. Profit</th>
        <th style="padding:8px;text-align:right;border:1px solid #e5e7eb;">Margin</th>
      </tr>
    </thead>
    <tbody>`;
  
  topJobs.forEach(job => {
    const margin = job.revised_contract ? (job.estimated_profit / job.revised_contract) * 100 : 0;
    const profitColor = job.estimated_profit >= 0 ? '#10b981' : '#dc2626';
    const desc = (job.job_description || '').substring(0, 40) + ((job.job_description || '').length > 40 ? '...' : '');
    
    html += `<tr>
      <td style="padding:6px 8px;border:1px solid #e5e7eb;">${job.job_no}</td>
      <td style="padding:6px 8px;border:1px solid #e5e7eb;">${desc}</td>
      <td style="padding:6px 8px;border:1px solid #e5e7eb;">${(job.customer_name || '').substring(0, 25)}</td>
      <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;">${formatCurrency(job.revised_contract)}</td>
      <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;color:${profitColor};">${formatCurrency(job.estimated_profit)}</td>
      <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;">${margin.toFixed(1)}%</td>
    </tr>`;
  });
  
  html += `</tbody></table>`;
  
  if (jobBudgetsFiltered.length > 10) {
    html += `<p style="margin-top:12px;font-size:11px;color:#6b7280;font-style:italic;">Showing top 10 of ${jobBudgetsFiltered.length} jobs. Use CSV or Excel export for complete data.</p>`;
  }
  
  return html;
}

function getJobBudgetsCsvData() {
  if (!jobBudgetsFiltered || jobBudgetsFiltered.length === 0) {
    return "";
  }
  
  let csv = "Job #,Description,Client,Status,Project Manager,Original Contract,Change Orders,Contract Value,Original Cost,Cost Adjustments,Projected Cost,Estimated Profit,Margin %\n";
  
  jobBudgetsFiltered.forEach(job => {
    const status = getJobStatusLabel(job.job_status);
    const margin = job.revised_contract ? (job.estimated_profit / job.revised_contract) * 100 : 0;
    
    csv += `"${job.job_no}","${(job.job_description || '').replace(/"/g, '""')}","${(job.customer_name || '').replace(/"/g, '""')}","${status.label}","${(job.project_manager_name || '').replace(/"/g, '""')}",${job.original_contract || 0},${job.tot_income_adj || 0},${job.revised_contract || 0},${job.original_cost || 0},${job.tot_cost_adj || 0},${job.revised_cost || 0},${job.estimated_profit || 0},${margin.toFixed(1)}\n`;
  });
  
  return csv;
}

function getIncomeStatementAiAnalysis() {
  const panel = document.getElementById("isAiAnalysisPanel");
  if (!panel || panel.classList.contains("collapsed")) return null;
  const content = document.getElementById("isAiAnalysisContent");
  if (!content || !content.innerHTML.trim()) return null;
  return content.innerHTML;
}

function generateReportHtml(data, forEmail = false) {
  const orientation = data.isWide ? "landscape" : "portrait";
  const pageSize = data.isWide ? "11in 8.5in" : "8.5in 11in";
  
  const isFinancialStatement = ["Income Statement", "Balance Sheet", "Statement of Cash Flows"].includes(data.title);
  
  let aiAnalysisHtml = "";
  if (data.aiAnalysis) {
    aiAnalysisHtml = `
      <div class="ai-analysis-section">
        <div class="ai-analysis-header">AI ANALYSIS</div>
        <div class="ai-analysis-content">${data.aiAnalysis}</div>
      </div>
    `;
  }
  
  let headerHtml;
  if (isFinancialStatement) {
    headerHtml = `
      <div class="report-header">
        <div class="report-company">FTG Builders</div>
        <div class="report-title">${data.title}</div>
        <div class="report-period">${data.subtitle}</div>
      </div>
    `;
  } else {
    headerHtml = `
      <div class="header">
        <div>
          <h1>FTG Builders - ${data.title}</h1>
          <h2>${data.subtitle}</h2>
        </div>
        <div class="logo-section">
        </div>
      </div>
    `;
  }
  
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
        .report-header { text-align: center; margin-bottom: 20px; }
        .report-company { font-size: 16pt; font-weight: 600; color: #1f2937; margin-bottom: 4px; }
        .report-title { font-size: 14pt; font-weight: 500; color: #374151; margin-bottom: 4px; }
        .report-period { font-size: 11pt; color: #6b7280; }
        .ai-analysis-section { 
          background: #f9fafb; 
          border: 1px solid #e5e7eb; 
          border-radius: 6px; 
          padding: 15px; 
          margin-bottom: 20px;
        }
        .ai-analysis-header { 
          font-weight: 600; 
          color: #1f2937; 
          margin-bottom: 10px; 
          font-size: 11pt;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 8px;
        }
        .ai-analysis-content { font-size: 9pt; line-height: 1.5; color: #374151; }
        .ai-analysis-content h4 { margin: 12px 0 6px 0; font-size: 10pt; color: #1f2937; }
        .ai-analysis-content ul { margin: 6px 0; padding-left: 20px; }
        .ai-analysis-content li { margin-bottom: 4px; }
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
      ${aiAnalysisHtml}
      ${headerHtml}
      ${data.tableHtml}
      <div class="footer">
        <span>Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date().toLocaleTimeString()}</span>
        <span>FTG Dashboard</span>
      </div>
    </body>
    </html>
  `;
}

function universalPrint() {
  window.print();
}

function universalExportToPdf() {
  window.print();
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

async function universalExportToExcel() {
  const data = getReportData();
  if (!data) return alert("Please navigate to a report view to export to Excel.");
  
  if (typeof ExcelJS === "undefined") {
    return alert("Excel export library not loaded. Please refresh the page and try again.");
  }
  
  const view = getCurrentView();
  const filename = `ftg_${view}_${new Date().toISOString().split("T")[0]}.xlsx`;
  
  const tableSelectors = {
    "revenue": "#revTable",
    "accounts": "#accounts .acct-table",
    "incomeStatement": "#incomeStatement .is-table",
    "balanceSheet": "#balanceSheet .bs-table",
    "cashFlows": "#cashFlowTable",
    "cashReports": ".daily-balance-table"
  };
  
  let rows = [];
  let headerRowCount = 1;
  const tableSelector = tableSelectors[view];
  
  if (tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (tableEl) {
      const headerRows = tableEl.querySelectorAll("thead tr");
      const bodyRows = tableEl.querySelectorAll("tbody tr");
      headerRowCount = headerRows.length || 1;
      
      headerRows.forEach(tr => {
        const cells = [];
        tr.querySelectorAll("th").forEach(th => cells.push(th.textContent.trim()));
        if (cells.length > 0) rows.push({ cells, isHeader: true });
      });
      
      bodyRows.forEach(tr => {
        const cells = [];
        const isGroupHeader = tr.classList.contains("is-group-header") || 
                              tr.classList.contains("bs-group-header") ||
                              tr.classList.contains("cf-group-header");
        const isTotalRow = tr.classList.contains("is-total") || 
                           tr.classList.contains("bs-total") ||
                           tr.classList.contains("cf-total") ||
                           tr.classList.contains("grand-total");
        tr.querySelectorAll("td").forEach(td => cells.push(td.textContent.trim()));
        if (cells.length > 0) rows.push({ cells, isHeader: false, isGroupHeader, isTotalRow });
      });
    }
  }
  
  if (rows.length === 0) {
    const csvRows = data.csvData.split("\n").map(row => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
        else current += char;
      }
      result.push(current.trim());
      return result;
    }).filter(r => r.length > 0 && r.some(c => c !== ""));
    
    rows = csvRows.map((cells, idx) => ({ cells, isHeader: idx === 0 }));
  }
  
  if (rows.length === 0) return alert("No data to export.");
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FTG Dashboard";
  workbook.created = new Date();
  
  const sheetName = data.title.substring(0, 31);
  const worksheet = workbook.addWorksheet(sheetName);
  
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const groupHeaderFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  const groupHeaderFont = { bold: true, color: { argb: "FF374151" }, size: 11 };
  const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  const totalFont = { bold: true, color: { argb: "FF111827" }, size: 11 };
  const borderStyle = { style: "thin", color: { argb: "FFD1D5DB" } };
  const allBorders = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };
  
  const currencyColumns = new Set();
  rows.forEach((row, idx) => {
    if (row.isHeader) return;
    row.cells.forEach((cell, colIdx) => {
      if (cell.includes("$")) currencyColumns.add(colIdx);
    });
  });
  
  rows.forEach((row, rowIdx) => {
    const excelRow = worksheet.addRow(row.cells.map((cell, colIdx) => {
      if (row.isHeader) return cell;
      const cleanValue = cell.replace(/[$,]/g, "").replace(/\(([^)]+)\)/g, "-$1");
      const numValue = parseFloat(cleanValue);
      if (!isNaN(numValue) && cleanValue !== "" && !cell.includes("%")) return numValue;
      return cell;
    }));
    
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
      
      if (row.isHeader) {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (row.isGroupHeader) {
        cell.fill = groupHeaderFill;
        cell.font = groupHeaderFont;
      } else if (row.isTotalRow) {
        cell.fill = totalFill;
        cell.font = totalFont;
      }
      
      if (!row.isHeader && currencyColumns.has(colNumber - 1) && typeof cell.value === "number") {
        cell.numFmt = '"$"#,##0';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
  });
  
  const colCount = rows[0]?.cells.length || 0;
  for (let i = 1; i <= colCount; i++) {
    let maxWidth = 12;
    worksheet.getColumn(i).eachCell({ includeEmpty: false }, cell => {
      const len = String(cell.value || "").length;
      maxWidth = Math.max(maxWidth, len + 2);
    });
    worksheet.getColumn(i).width = Math.min(maxWidth, 45);
  }
  
  worksheet.views = [{ state: "frozen", ySplit: headerRowCount }];
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
  
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  setElValue("emailSubject", `FTG Dashboard - ${data.title} - ${dateStr}`);
  setElValue("emailTo", "");
  setElText("emailStatus", "");
  const modal = getEl("emailModal");
  if (modal) modal.classList.remove("hidden");
}

function closeEmailModal() {
  const modal = getEl("emailModal");
  if (modal) modal.classList.add("hidden");
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

async function captureCashAsImage() {
  try {
    if (!cashChartInstance) {
      console.log("No cash chart instance");
      return null;
    }
    
    // Get chart image
    const base64 = cashChartInstance.toBase64Image("image/png", 1);
    
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
      avg: document.getElementById("cashAvgValue")?.textContent || "-",
      max: document.getElementById("cashMaxValue")?.textContent || "-",
      min: document.getElementById("cashMinValue")?.textContent || "-",
      growth: document.getElementById("cashGrowthValue")?.textContent || "-"
    };
    
    // Get title info
    const title1 = "Cash Balances";
    const periodSelect = document.getElementById("cashPeriodType");
    const title2 = periodSelect ? periodSelect.options[periodSelect.selectedIndex]?.text || "" : "";
    
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
    const statLabels = ["AVERAGE", "HIGHEST", "LOWEST", "GROWTH"];
    const statValues = [stats.avg, stats.max, stats.min, stats.growth];
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
    console.error("Cash capture error:", err);
    return null;
  }
}

async function captureOverviewAsImage() {
  try {
    // Chart configurations with their chart instance keys and metric keys (all 10 metrics)
    const allChartConfigs = [
      { id: "overviewRevenueChart", title: "Revenue", metric: "revenue" },
      { id: "overviewGrossProfitChart", title: "Gross Profit", metric: "grossProfit" },
      { id: "overviewGrossMarginChart", title: "Gross Margin %", metric: "grossMargin" },
      { id: "overviewOpexChart", title: "Operating Expenses", metric: "opExpenses" },
      { id: "overviewOpProfitChart", title: "Operating Profit", metric: "opProfit" },
      { id: "overviewOpMarginChart", title: "Operating Margin %", metric: "opMargin" },
      { id: "overviewCashChart", title: "Cash", metric: "cash" },
      { id: "overviewReceivablesChart", title: "Receivables", metric: "receivables" },
      { id: "overviewPayablesChart", title: "Payables", metric: "payables" },
      { id: "overviewCurrentRatioChart", title: "Current Ratio", metric: "currentRatio" }
    ];
    
    // Filter to only visible metrics based on checkbox state
    const chartConfigs = allChartConfigs.filter(cfg => {
      const checkbox = document.querySelector(`[data-metric="${cfg.metric}"]`);
      return checkbox && checkbox.checked;
    });
    
    if (chartConfigs.length === 0) {
      console.log("No visible metrics to capture");
      return null;
    }
    
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
    
    // Create composite canvas with dynamic grid based on visible charts
    const chartWidth = 350;
    const chartHeight = 200;
    const titleHeight = 25;
    const padding = 12;
    const tileHeight = titleHeight + chartHeight;
    
    // Determine grid layout based on number of visible charts (supports up to 10)
    let cols, rows;
    const count = chartImages.length;
    if (count <= 1) {
      cols = 1; rows = 1;
    } else if (count <= 2) {
      cols = 2; rows = 1;
    } else if (count <= 4) {
      cols = 2; rows = 2;
    } else if (count <= 6) {
      cols = 3; rows = 2;
    } else if (count <= 8) {
      cols = 4; rows = 2;
    } else {
      cols = 5; rows = 2;
    }
    
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = cols * chartWidth + (cols + 1) * padding;
    compositeCanvas.height = rows * tileHeight + (rows + 1) * padding;
    const ctx = compositeCanvas.getContext("2d");
    
    // Fill background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    
    // Draw all visible charts with title (no limit)
    for (let i = 0; i < chartImages.length; i++) {
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
    if (view === "overview" || view === "revenue" || view === "accounts" || view === "cashReports" || view === "jobOverview") {
      statusEl.textContent = "Capturing chart...";
      try {
        if (view === "overview") {
          chartImage = await captureOverviewAsImage();
        } else if (view === "revenue") {
          chartImage = await captureRevenueAsImage();
        } else if (view === "accounts") {
          chartImage = await captureAccountAsImage();
        } else if (view === "cashReports") {
          chartImage = await captureCashAsImage();
        } else if (view === "jobOverview" && data.captureCharts) {
          chartImage = await data.captureCharts();
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
    
    // Generate email body with both chart reference AND data table
    const tableContent = generateReportHtml(data, true);
    messageHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1 style="color: #1f2937; margin: 0 0 5px 0;">FTG Builders - ${data.title}</h1>
        <p style="color: #6b7280; margin: 0 0 20px 0;">${data.subtitle}</p>
        ${chartImage ? '<p style="margin-bottom: 20px;"><strong>Chart:</strong> Please see the attached chart image.</p>' : ''}
        ${tableContent}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date().toLocaleTimeString()} | FTG Dashboard</p>
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

function formatCurrency(value) {
  if (value === null || value === undefined) return "-";
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  if (value < 0) {
    return `($${formatted})`;
  }
  return `$${formatted}`;
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
        backgroundColor: "#dc2626"
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
        backgroundColor: "#dc2626"
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
        if (color === "#dc2626") return createBarGradient(ctx, chartArea, gradientColors.red.start, gradientColors.red.end);
        if (color === "#f59e0b") return createBarGradient(ctx, chartArea, gradientColors.orange.start, gradientColors.orange.end);
        return color;
      });
    } else if (typeof origBg === "string") {
      if (origBg === "#3b82f6") ds.backgroundColor = createBarGradient(ctx, chartArea, gradientColors.blue.start, gradientColors.blue.end);
      else if (origBg === "#dc2626") ds.backgroundColor = createBarGradient(ctx, chartArea, gradientColors.red.start, gradientColors.red.end);
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
    const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : false;
    
    // Calculate Y-axis minimum based on data
    let allValues = [];
    datasets.forEach(ds => {
      if (ds.type !== 'line' && ds.data) {
        allValues = allValues.concat(ds.data.filter(v => v !== null && v !== undefined && !isNaN(v)));
      }
    });
    const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
    const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
    
    // Calculate appropriate Y-axis min (start just below the lowest value)
    let yMin = undefined;
    if (dataMin > 0) {
      const range = dataMax - dataMin;
      // Use 15% of range as padding, or 10% of dataMin if flat data
      const padding = range > 0 ? range * 0.15 : dataMin * 0.1;
      
      let step;
      if (dataMin >= 1000000) {
        step = 100000;
      } else if (dataMin >= 100000) {
        step = 10000;
      } else if (dataMin >= 10000) {
        step = 5000;
      } else if (dataMin >= 1000) {
        step = 500;
      } else {
        step = 100;
      }
      yMin = Math.floor((dataMin - padding) / step) * step;
      if (yMin < 0) yMin = 0;
    }

    const themeColors = getChartThemeColors();
    
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
          legend: { position: "bottom", labels: { color: themeColors.legendColor } },
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
              return context.dataset.borderColor || themeColors.textColor;
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
              font: { size: 12 },
              color: themeColors.textColor
            },
            grid: {
              drawOnChartArea: false,
              color: themeColors.gridColor
            }
          },
          y: {
            min: yMin,
            grid: { color: themeColors.gridColor },
            ticks: {
              font: { size: 11 },
              color: themeColors.textColor,
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
    errDiv.style.cssText = "padding:40px;text-align:center;color:#dc2626;font-weight:600;";
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
  
  const exportBtn = document.getElementById("revTableExportBtn");
  if (exportBtn) {
    exportBtn.onclick = () => exportTableToCSV("revTable", "revenue-breakdown");
  }
}

function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  let csv = [];
  const rows = table.querySelectorAll("tr");
  
  rows.forEach(row => {
    const cols = row.querySelectorAll("td, th");
    const csvRow = [];
    cols.forEach(col => {
      csvRow.push('"' + col.textContent.trim().replace(/"/g, '""') + '"');
    });
    csv.push(csvRow.join(","));
  });
  
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csv.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", filename + ".csv");
  link.click();
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
        const response = await fetch("/data/financials_gl.json");
        if (!response.ok) throw new Error("Failed to fetch account data");
        acctDataCache = await response.json();
        revenueDataCache = acctDataCache;
      }
    }

    if (!acctUIInitialized) {
      setupAccountUI(acctDataCache);
      loadAccountConfig();
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
        backgroundColor: "#dc2626"
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
        backgroundColor: "#dc2626"
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
  const showDataLabels = dataLabelsCheckbox ? dataLabelsCheckbox.checked : false;
  
  // Calculate Y-axis minimum based on data
  let allValues = [];
  datasets.forEach(ds => {
    if (ds.type !== 'line' && ds.data) {
      allValues = allValues.concat(ds.data.filter(v => v !== null && v !== undefined && !isNaN(v)));
    }
  });
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  
  // Calculate appropriate Y-axis min (start just below the lowest value)
  let yMin = undefined;
  if (dataMin > 0) {
    const range = dataMax - dataMin;
    // Use 15% of range as padding, or 10% of dataMin if flat data
    const padding = range > 0 ? range * 0.15 : dataMin * 0.1;
    
    let step;
    if (dataMin >= 1000000) {
      step = 100000;
    } else if (dataMin >= 100000) {
      step = 10000;
    } else if (dataMin >= 10000) {
      step = 5000;
    } else if (dataMin >= 1000) {
      step = 500;
    } else {
      step = 100;
    }
    yMin = Math.floor((dataMin - padding) / step) * step;
    if (yMin < 0) yMin = 0;
  }
  
  const themeColors = getChartThemeColors();
  
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
        legend: { position: "bottom", labels: { color: themeColors.legendColor } },
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
            return context.dataset.borderColor || themeColors.textColor;
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
          grid: { drawOnChartArea: false, color: themeColors.gridColor },
          ticks: { color: themeColors.textColor }
        },
        y: {
          min: yMin,
          grid: { color: themeColors.gridColor },
          ticks: {
            color: themeColors.textColor,
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
  
  const exportBtn = document.getElementById("acctTableExportBtn");
  if (exportBtn) {
    exportBtn.onclick = () => exportTableToCSV("acctTable", "account-breakdown");
  }
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
        fetch("/data/financials_gl.json"),
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
    loadIncomeStatementConfig();
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
  excludeCurrent.onchange = () => { 
    populatePeriodOptions();
    renderIncomeStatement(); 
    saveIncomeStatementConfig(); 
  };
  
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
  
  // Initialize AI Analysis button
  initAiAnalysis();
}

function initAiAnalysis() {
  const analyzeBtn = document.getElementById("isAiAnalyzeBtn");
  const panel = document.getElementById("isAiAnalysisPanel");
  const header = document.getElementById("isAiAnalysisHeader");
  
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      performAiAnalysis();
    });
  }
  
  if (header) {
    header.addEventListener("click", (e) => {
      if (e.target === analyzeBtn || analyzeBtn.contains(e.target)) return;
      panel.classList.toggle("collapsed");
    });
  }
}

async function performAiAnalysis() {
  const analyzeBtn = document.getElementById("isAiAnalyzeBtn");
  const panel = document.getElementById("isAiAnalysisPanel");
  const contentContainer = document.getElementById("isAiAnalysisContent");
  
  // Show loading state
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  panel.classList.remove("collapsed");
  contentContainer.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing your financial data...</div>';
  
  try {
    // Extract the current Income Statement data
    const statementData = extractIncomeStatementData();
    const periodInfo = getIncomeStatementPeriodInfo();
    
    // Detect environment: use Netlify Functions if on Netlify or custom domain (not Replit), otherwise use local Flask API
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit 
      ? "/api/analyze-income-statement"
      : "/.netlify/functions/analyze-income-statement";
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statementData, periodInfo })
    });
    
    const result = await response.json();
    
    if (result.success && result.analysis) {
      contentContainer.innerHTML = formatMarkdown(result.analysis);
    } else {
      contentContainer.innerHTML = `<div style="color: #dc2626;">Error: ${result.error || "Failed to get analysis"}</div>`;
    }
  } catch (error) {
    console.error("AI Analysis error:", error);
    contentContainer.innerHTML = `<div style="color: #dc2626;">Error: ${error.message || "Failed to connect to AI service"}</div>`;
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Run Analysis';
  }
}

function extractIncomeStatementData() {
  const table = document.getElementById("incomeStatementTable");
  if (!table) return "";
  
  let text = "";
  const rows = table.querySelectorAll("tr");
  
  rows.forEach(row => {
    if (row.classList.contains("is-spacer-row")) return;
    if (row.classList.contains("is-row-hidden")) return;
    
    const cells = row.querySelectorAll("th, td");
    const rowData = [];
    cells.forEach(cell => {
      let cellText = cell.textContent.trim();
      rowData.push(cellText);
    });
    text += rowData.join("\t") + "\n";
  });
  
  return text;
}

function getIncomeStatementPeriodInfo() {
  const viewMode = document.getElementById("isViewMode").value;
  const periodType = document.getElementById("isPeriodType").value;
  const periodSelect = document.getElementById("isPeriodSelect");
  const compare = document.querySelector('input[name="isCompareRadio"]:checked');
  
  let info = "";
  
  if (viewMode === "single") {
    info = `${periodType.toUpperCase()}: ${periodSelect.options[periodSelect.selectedIndex]?.text || ""}`;
  } else {
    if (periodType === "year") {
      const startYear = document.getElementById("isMatrixYearStart").value;
      const endYear = document.getElementById("isMatrixYearEnd").value;
      info = `Annual Matrix: ${startYear} - ${endYear}`;
    } else {
      info = `${periodType.toUpperCase()} Matrix: ${periodSelect.options[periodSelect.selectedIndex]?.text || ""}`;
    }
  }
  
  if (compare && compare.value !== "none") {
    info += ` (compared to ${compare.value.replace("_", " ")})`;
  }
  
  return info;
}

function formatMarkdown(text) {
  // Format dollar amounts to use K and M notation
  text = formatDollarAmounts(text);
  
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    // Apply inline formatting
    line = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Headers
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h3>' + line.slice(4) + '</h3>';
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h2>' + line.slice(3) + '</h2>';
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h1>' + line.slice(2) + '</h1>';
    }
    // Bullet points
    else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + line.replace(/^[-*]\s+/, '') + '</li>';
    }
    // Numbered lists
    else if (/^\d+\.\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
    }
    // Regular text - skip if empty or just whitespace
    else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + line + '</p>';
    }
  }
  
  if (inList) html += '</ul>';
  
  return html;
}

function formatDollarAmounts(text) {
  // Match dollar amounts with optional K/M/B suffix
  // Handles: $3,844K, $3.8K, $50,310K, $1,234,567, $1234, etc.
  return text.replace(/\$\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb])?(?![KkMmBb])/g, (match, numStr, suffix) => {
    // Remove commas and parse
    let num = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(num)) return match;
    
    // Convert to actual value based on existing suffix
    if (suffix) {
      const s = suffix.toUpperCase();
      if (s === 'K') num *= 1000;
      else if (s === 'M') num *= 1000000;
      else if (s === 'B') num *= 1000000000;
    }
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 1000000) {
      return sign + '$' + (absNum / 1000000).toFixed(1) + 'M';
    } else if (absNum >= 1000) {
      return sign + '$' + (absNum / 1000).toFixed(1) + 'K';
    }
    return sign + '$' + Math.round(absNum);
  });
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
  
  // Get months with exclude filter applied for dropdowns
  const months = getAvailableMonths(true);
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

function getAvailableMonths(respectExclude = false) {
  const allMonths = new Set();
  Object.values(isGLLookup).forEach(acctData => {
    Object.keys(acctData).forEach(k => {
      if (/^\d{4}-\d{2}$/.test(k)) allMonths.add(k);
    });
  });
  let months = Array.from(allMonths).sort();
  
  // Filter out current month if exclude is checked
  if (respectExclude) {
    const excludeCurrent = document.getElementById("isExcludeCurrent")?.checked;
    if (excludeCurrent) {
      const currentMonthKey = getCurrentMonthKey();
      months = months.filter(m => m !== currentMonthKey);
    }
  }
  return months;
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

function updateReportHeader(statementType) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let periodText = "";
  
  if (statementType === "is") {
    const viewMode = document.getElementById("isViewMode")?.value || "single";
    const periodType = document.getElementById("isPeriodType")?.value || "month";
    const periodValue = document.getElementById("isPeriodSelect")?.value || "";
    const compare = document.querySelector('input[name="isCompareRadio"]:checked')?.value || "none";
    
    if (viewMode === "matrix") {
      const yearStart = document.getElementById("isMatrixYearStart")?.value;
      const yearEnd = document.getElementById("isMatrixYearEnd")?.value;
      const year = periodValue;
      
      if (periodType === "year") {
        periodText = `Annual, ${yearStart} - ${yearEnd}`;
      } else if (periodType === "quarter") {
        periodText = `Quarterly, ${year}`;
      } else {
        periodText = `Monthly, ${year}`;
      }
    } else {
      const currentLabel = formatPeriodLabel(periodValue, periodType, false);
      if (compare !== "none") {
        let compPeriod;
        if (compare === "prior_period") {
          compPeriod = getPriorPeriod(periodValue, periodType);
        } else {
          compPeriod = getPriorYearPeriod(periodValue, periodType);
        }
        if (compPeriod) {
          const compLabel = formatPeriodLabel(compPeriod, periodType, false);
          periodText = `${currentLabel} vs ${compLabel}`;
        } else {
          periodText = currentLabel;
        }
      } else {
        periodText = currentLabel;
      }
    }
    
    const periodEl = document.getElementById("isReportPeriod");
    if (periodEl) periodEl.textContent = periodText;
    
  } else if (statementType === "bs") {
    const viewMode = document.getElementById("bsViewMode")?.value || "single";
    const periodValue = document.getElementById("bsPeriodSelect")?.value || "";
    const compare = document.querySelector('input[name="bsCompareRadio"]:checked')?.value || "none";
    const periodType = document.getElementById("bsPeriodType")?.value || "month";
    
    if (viewMode === "matrix") {
      const yearStart = document.getElementById("bsMatrixYearStart")?.value;
      const yearEnd = document.getElementById("bsMatrixYearEnd")?.value;
      const year = document.getElementById("bsMatrixYear")?.value;
      
      if (periodType === "annual") {
        periodText = `Annual, ${yearStart} - ${yearEnd}`;
      } else if (periodType === "quarter") {
        periodText = `Quarterly, ${year}`;
      } else {
        periodText = `Monthly, ${year}`;
      }
    } else {
      if (periodValue) {
        const [y, mo] = periodValue.split("-");
        const currentLabel = `As of ${monthNames[parseInt(mo) - 1]} ${y}`;
        
        if (compare === "prior_year") {
          const priorYear = parseInt(y) - 1;
          periodText = `${currentLabel} vs ${monthNames[parseInt(mo) - 1]} ${priorYear}`;
        } else if (compare === "prior_month") {
          const availableMonths = getBSAvailableMonths();
          const periodIdx = availableMonths.indexOf(periodValue);
          if (periodIdx > 0) {
            const priorPeriod = availableMonths[periodIdx - 1];
            const [py, pm] = priorPeriod.split("-");
            periodText = `${currentLabel} vs ${monthNames[parseInt(pm) - 1]} ${py}`;
          } else {
            periodText = currentLabel;
          }
        } else {
          periodText = currentLabel;
        }
      }
    }
    
    const periodEl = document.getElementById("bsReportPeriod");
    if (periodEl) periodEl.textContent = periodText;
    
  } else if (statementType === "cf") {
    const viewMode = document.getElementById("cfViewMode")?.value || "single";
    const periodType = document.getElementById("cfPeriodType")?.value || "month";
    const periodValue = document.getElementById("cfPeriodSelect")?.value || "";
    const compare = document.querySelector('input[name="cfCompareRadio"]:checked')?.value || "none";
    
    if (viewMode === "matrix") {
      const yearStart = document.getElementById("cfMatrixYearStart")?.value;
      const yearEnd = document.getElementById("cfMatrixYearEnd")?.value;
      const year = periodValue;
      
      if (periodType === "year") {
        periodText = `Annual, ${yearStart} - ${yearEnd}`;
      } else if (periodType === "quarter") {
        periodText = `Quarterly, ${year}`;
      } else {
        periodText = `Monthly, ${year}`;
      }
    } else {
      const currentLabel = formatPeriodLabel(periodValue, periodType, false);
      if (compare !== "none" && currentLabel) {
        let compPeriod;
        if (compare === "prior_period") {
          compPeriod = getCFPriorPeriod(periodValue, periodType);
        } else {
          compPeriod = getCFPriorYearPeriod(periodValue, periodType);
        }
        if (compPeriod) {
          const compLabel = formatPeriodLabel(compPeriod, periodType, false);
          periodText = `${currentLabel} vs ${compLabel}`;
        } else {
          periodText = currentLabel;
        }
      } else {
        periodText = currentLabel;
      }
    }
    
    const periodEl = document.getElementById("cfReportPeriod");
    if (periodEl) periodEl.textContent = periodText;
  }
}

function showTableLoading(tableId, message = 'Loading...') {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const container = table.closest('.is-table-box, .bs-table-box, .cf-table-box') || table.parentElement;
  if (!container) return;
  
  container.style.position = 'relative';
  
  // Remove existing overlay if present
  const existing = container.querySelector('.table-loading-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'table-loading-overlay';
  overlay.innerHTML = `<div class="spinner"></div><div class="loading-text">${message}</div>`;
  container.appendChild(overlay);
}

function hideTableLoading(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const container = table.closest('.is-table-box, .bs-table-box, .cf-table-box') || table.parentElement;
  if (!container) return;
  
  const overlay = container.querySelector('.table-loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 300);
  }
}

function renderIncomeStatement() {
  showTableLoading('incomeStatementTable', 'Updating...');
  
  // Use requestAnimationFrame to allow loading indicator to show
  requestAnimationFrame(() => {
    const viewMode = document.getElementById("isViewMode").value;
    const periodType = document.getElementById("isPeriodType").value;
    const periodValue = document.getElementById("isPeriodSelect").value;
    const groups = isAccountGroups.income_statement.groups;
    const thead = document.getElementById("isTableHead");
    const tbody = document.getElementById("isTableBody");
    const footnote = document.getElementById("isPartialFootnote");
    
    updateReportHeader("is");
    
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
    
    setTimeout(() => {
      autoSizeFirstColumn("incomeStatementTable");
      addResizeHandlesToTable("incomeStatementTable");
      autoScaleFontSize("incomeStatementTable", "isTableBox");
      hideTableLoading('incomeStatementTable');
    }, 50);
  });
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
    headerHtml += `<th>${compPeriodLabel}</th><th>${currentLabel}</th><th class="var-col-left">$ Var</th><th>% Var</th>`;
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
        bodyHtml += `<td></td><td></td><td class="var-col-left"></td><td></td>`;
      } else if (row.type === "ratio") {
        compValueHtml = formatPercent(compRow.value);
        const diffPct = (row.value - compRow.value) * 100;
        const isPositiveVar = isIncome ? diffPct >= 0 : diffPct <= 0;
        const pctClass = isPositiveVar ? "is-variance-positive" : "is-variance-negative";
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td class="var-col-left">-</td>`;
        bodyHtml += `<td class="${pctClass}">${diffPct.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}%</td>`;
      } else {
        compValueHtml = formatAccountingNumber(compRow.value);
        const variance = formatVariance(row.value, compRow.value, isIncome);
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td class="var-col-left">${variance.diff}</td>`;
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
let bsLastDetailLevel = null;
let bsInceptionDate = "2015-01";

let bsControlsInitialized = false;

function initBalanceSheet() {
  if (bsData && bsAccountGroups) {
    if (!bsControlsInitialized) {
      initBalanceSheetControls();
      loadBalanceSheetConfig();
      bsControlsInitialized = true;
    }
    renderBalanceSheet();
    return;
  }
  
  Promise.all([
    fetch("data/financials_gl.json").then(r => r.json()),
    fetch("data/account_groups.json").then(r => r.json())
  ]).then(([financials, accountGroups]) => {
    bsData = financials;
    bsAccountGroups = accountGroups;
    buildBSGLLookup();
    if (!bsControlsInitialized) {
      initBalanceSheetControls();
      loadBalanceSheetConfig();
      bsControlsInitialized = true;
    }
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
  
  // Filter out current month if exclude is checked
  const excludeCurrentMonth = document.getElementById("bsExcludeCurrentMonth")?.checked || false;
  if (excludeCurrentMonth) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    months = months.filter(m => m !== currentMonthKey);
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
  const monthsUpToSelected = allMonths.filter(m => m <= asOfMonth);
  
  let total = 0;
  incomeExpenseAccounts.forEach(acct => {
    const acctData = bsGLLookup[acct];
    if (acctData) {
      monthsUpToPriorYearEnd.forEach(m => {
        total += acctData[m] || 0;
      });
    }
  });
  
  let acct3020Total = 0;
  const acct3020Data = bsGLLookup[3020];
  if (acct3020Data) {
    monthsUpToSelected.forEach(m => {
      acct3020Total += acct3020Data[m] || 0;
    });
  }
  
  return -total - acct3020Total;
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

function setBSDetailLevelStates(detailLevel) {
  const summaryRows = [
    "bs-row-Current_Assets",
    "bs-row-Long-Term_Assets",
    "bs-row-Current_Liabilities",
    "bs-row-Long-Term_Liabilities",
    "bs-row-Equity"
  ];
  
  const mediumExpandRows = [
    "bs-row-Current_Assets",
    "bs-row-Long-Term_Assets",
    "bs-row-Current_Liabilities",
    "bs-row-Equity"
  ];
  
  const allExpandableRows = [
    "bs-row-Current_Assets",
    "bs-row-Cash_&_Cash_Equivalents",
    "bs-row-Checking",
    "bs-row-Savings_&_Investments",
    "bs-row-Receivables",
    "bs-row-Other_Current_Assets",
    "bs-row-Long-Term_Assets",
    "bs-row-Fixed_Assets",
    "bs-row-Intangible_Assets",
    "bs-row-Prepaid_Assets",
    "bs-row-Other_Long-Term_Assets",
    "bs-row-Current_Liabilities",
    "bs-row-Accounts_Payable",
    "bs-row-Accrued_Expenses",
    "bs-row-Other_Current_Liabilities",
    "bs-row-Long-Term_Liabilities",
    "bs-row-Equity",
    "bs-row-Capital_Contributions",
    "bs-row-Distributions"
  ];
  
  if (detailLevel === "summary") {
    allExpandableRows.forEach(rowId => {
      bsRowStates[rowId] = false;
    });
  } else if (detailLevel === "medium") {
    allExpandableRows.forEach(rowId => {
      bsRowStates[rowId] = false;
    });
    mediumExpandRows.forEach(rowId => {
      bsRowStates[rowId] = true;
    });
  } else if (detailLevel === "account") {
    allExpandableRows.forEach(rowId => {
      bsRowStates[rowId] = true;
    });
  }
}

function renderBalanceSheet() {
  if (!bsAccountGroups || !bsAccountGroups.balance_sheet) {
    console.log("Balance sheet groups not loaded yet");
    return;
  }
  
  showTableLoading('balanceSheetTable', 'Updating...');
  
  requestAnimationFrame(() => {
    renderBalanceSheetContent();
  });
}

function renderBalanceSheetContent() {
  const viewMode = document.getElementById("bsViewMode")?.value || "single";
  const detailLevel = document.querySelector('input[name="bsDetailLevel"]:checked')?.value || "summary";
  
  if (detailLevel !== bsLastDetailLevel) {
    setBSDetailLevelStates(detailLevel);
    bsLastDetailLevel = detailLevel;
  }
  updateReportHeader("bs");
  
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
    headerHtml += `<th>${compPeriodLabel}</th><th>${currentLabel}</th><th class="var-col-left">$ Var</th><th>% Var</th>`;
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
    if (detailLevel === "account") {
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
    } else if (row.parent && detailLevel !== "account") {
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
        bodyHtml += `<td></td><td></td><td class="var-col-left"></td><td></td>`;
      } else {
        const compValueHtml = formatBSNumber(compRow.value);
        const variance = formatBSVariance(row.value, compRow.value);
        bodyHtml += `<td>${compValueHtml}</td>`;
        bodyHtml += `<td>${valueHtml}</td>`;
        bodyHtml += `<td class="var-col-left">${variance.diff}</td>`;
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
  setTimeout(() => {
    autoSizeFirstColumn("balanceSheetTable");
    addResizeHandlesToTable("balanceSheetTable");
    autoScaleFontSize("balanceSheetTable", "bsTableBox");
    hideTableLoading('balanceSheetTable');
  }, 50);
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
  
  if (detailLevel !== bsLastDetailLevel) {
    setBSDetailLevelStates(detailLevel);
    bsLastDetailLevel = detailLevel;
  }
  
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
    if (detailLevel === "account") {
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
    } else if (row.parent && detailLevel !== "account") {
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
  setTimeout(() => {
    addResizeHandlesToTable("balanceSheetTable");
    autoScaleFontSize("balanceSheetTable", "bsTableBox");
    hideTableLoading('balanceSheetTable');
  }, 50);
}

/* ============================================================
   STATEMENT OF CASH FLOWS
============================================================ */
let cfData = null;
let cfAccountGroups = null;
let cfGLLookup = {};
let cfRowStates = {};
let cfControlsInitialized = false;
let cfInceptionDate = "2015-01";
let cfAvailableMonthsCache = null;
let cfCumulativeBalanceCache = {};

async function loadCashFlowStatement() {
  if (!cfData || !cfAccountGroups) {
    try {
      const [financialsRes, groupsRes] = await Promise.all([
        fetch("/data/financials_gl.json"),
        fetch("/data/account_groups.json")
      ]);
      cfData = await financialsRes.json();
      cfAccountGroups = await groupsRes.json();
      buildCFGLLookup();
    } catch (err) {
      console.error("Failed to load Cash Flow data:", err);
      return;
    }
  }
  
  if (!cfControlsInitialized) {
    initCashFlowControls();
    loadCashFlowConfig();
    cfControlsInitialized = true;
  }
  
  renderCashFlowStatement();
}

function buildCFGLLookup() {
  cfGLLookup = {};
  cfAvailableMonthsCache = null;
  cfCumulativeBalanceCache = {};
  const glHistory = cfData.gl_history_all || [];
  const monthSet = new Set();
  
  glHistory.forEach(row => {
    const acctNum = parseInt(row.Account_Num || row.Account, 10);
    if (isNaN(acctNum)) return;
    
    if (!cfGLLookup[acctNum]) {
      cfGLLookup[acctNum] = {};
    }
    
    Object.keys(row).forEach(key => {
      if (/^\d{4}-\d{2}$/.test(key)) {
        const val = parseFloat(row[key]) || 0;
        cfGLLookup[acctNum][key] = val;
        monthSet.add(key);
      }
    });
  });
  
  cfAvailableMonthsCache = Array.from(monthSet).sort();
  
  Object.keys(cfGLLookup).forEach(acctNum => {
    cfCumulativeBalanceCache[acctNum] = {};
    let cumulative = 0;
    cfAvailableMonthsCache.forEach(month => {
      cumulative += cfGLLookup[acctNum][month] || 0;
      cfCumulativeBalanceCache[acctNum][month] = cumulative;
    });
  });
}

function getCFAvailableMonths() {
  if (cfAvailableMonthsCache) return cfAvailableMonthsCache;
  const months = new Set();
  Object.values(cfGLLookup).forEach(acctData => {
    Object.keys(acctData).forEach(key => {
      if (/^\d{4}-\d{2}$/.test(key)) months.add(key);
    });
  });
  cfAvailableMonthsCache = Array.from(months).sort();
  return cfAvailableMonthsCache;
}

function initCashFlowControls() {
  const viewMode = document.getElementById("cfViewMode");
  const periodType = document.getElementById("cfPeriodType");
  const periodSelect = document.getElementById("cfPeriodSelect");
  const showThousands = document.getElementById("cfShowThousands");
  const excludeCurrent = document.getElementById("cfExcludeCurrent");
  const matrixYearStart = document.getElementById("cfMatrixYearStart");
  const matrixYearEnd = document.getElementById("cfMatrixYearEnd");
  
  populateCFPeriodOptions();
  
  viewMode.onchange = () => {
    updateCFMatrixControlsVisibility();
    renderCashFlowStatement();
    saveCashFlowConfig();
  };
  
  periodType.onchange = () => {
    populateCFPeriodOptions();
    updateCFMatrixControlsVisibility();
    renderCashFlowStatement();
    saveCashFlowConfig();
  };
  
  periodSelect.onchange = () => { renderCashFlowStatement(); saveCashFlowConfig(); };
  
  const compareRadios = document.querySelectorAll('input[name="cfCompareRadio"]');
  compareRadios.forEach(radio => {
    radio.onchange = () => { renderCashFlowStatement(); saveCashFlowConfig(); };
  });
  
  const detailRadios = document.querySelectorAll('input[name="cfDetailLevel"]');
  detailRadios.forEach(radio => {
    radio.onchange = () => {
      applyCFDetailLevel(radio.value);
      renderCashFlowStatement();
      saveCashFlowConfig();
    };
  });
  
  if (showThousands) {
    showThousands.onchange = () => { renderCashFlowStatement(); saveCashFlowConfig(); };
  }
  
  const showSubtotalCb = document.getElementById("cfShowSubtotal");
  if (showSubtotalCb) {
    showSubtotalCb.onchange = () => { renderCashFlowStatement(); saveCashFlowConfig(); };
  }
  
  if (excludeCurrent) {
    excludeCurrent.onchange = () => { 
      populateCFPeriodOptions();
      renderCashFlowStatement(); 
      saveCashFlowConfig(); 
    };
  }
  
  const excludeSchwab = document.getElementById("cfExcludeSchwab");
  if (excludeSchwab) {
    excludeSchwab.onchange = () => {
      renderCashFlowStatement();
      saveCashFlowConfig();
    };
  }
  
  if (matrixYearStart) {
    matrixYearStart.oninput = () => {
      document.getElementById("cfMatrixYearStartLabel").textContent = matrixYearStart.value;
      if (parseInt(matrixYearStart.value) > parseInt(matrixYearEnd.value)) {
        matrixYearEnd.value = matrixYearStart.value;
        document.getElementById("cfMatrixYearEndLabel").textContent = matrixYearEnd.value;
      }
      renderCashFlowStatement();
      saveCashFlowConfig();
    };
  }
  
  if (matrixYearEnd) {
    matrixYearEnd.oninput = () => {
      document.getElementById("cfMatrixYearEndLabel").textContent = matrixYearEnd.value;
      if (parseInt(matrixYearEnd.value) < parseInt(matrixYearStart.value)) {
        matrixYearStart.value = matrixYearEnd.value;
        document.getElementById("cfMatrixYearStartLabel").textContent = matrixYearStart.value;
      }
      renderCashFlowStatement();
      saveCashFlowConfig();
    };
  }
  
  const initialDetail = document.querySelector('input[name="cfDetailLevel"]:checked');
  applyCFDetailLevel(initialDetail ? initialDetail.value : 'summary');
  
  updateCFMatrixControlsVisibility();
  initCFAiAnalysis();
}

function updateCFMatrixControlsVisibility() {
  const viewMode = document.getElementById("cfViewMode").value;
  const periodType = document.getElementById("cfPeriodType").value;
  const singleControls = document.getElementById("cfSingleControls");
  const matrixControls = document.getElementById("cfMatrixControls");
  const yearControls = document.getElementById("cfMatrixYearControls");
  const periodSelect = document.getElementById("cfPeriodSelect");
  const periodSelectLabel = document.getElementById("cfPeriodSelectLabel");
  const showSubtotalWrapper = document.getElementById("cfShowSubtotalWrapper");
  const periodTypeSelect = document.getElementById("cfPeriodType");
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
      populateCFPeriodOptions();
    }
    
    if (periodType === "year") {
      yearControls.classList.remove("hidden");
      periodSelect.classList.add("hidden");
      if (periodSelectLabel) periodSelectLabel.classList.add("hidden");
    } else {
      yearControls.classList.add("hidden");
      periodSelect.classList.remove("hidden");
      if (periodSelectLabel) {
        periodSelectLabel.classList.remove("hidden");
        periodSelectLabel.textContent = "Year:";
      }
      
      if (periodType === "quarter" || periodType === "month") {
        populateCFMatrixYearOptions();
      }
    }
  } else {
    singleControls.classList.remove("hidden");
    matrixControls.classList.add("hidden");
    periodSelect.classList.remove("hidden");
    if (periodSelectLabel) {
      periodSelectLabel.classList.remove("hidden");
      periodSelectLabel.textContent = "Period:";
    }
    if (showSubtotalWrapper) showSubtotalWrapper.classList.add("hidden");
    
    if (ytdOption) ytdOption.disabled = false;
    if (ttmOption) ttmOption.disabled = false;
    
    populateCFPeriodOptions();
  }
}

function populateCFPeriodOptions() {
  const periodType = document.getElementById("cfPeriodType").value;
  const periodSelect = document.getElementById("cfPeriodSelect");
  const months = getCFAvailableMonths();
  const options = [];
  
  const excludeCurrent = document.getElementById("cfExcludeCurrent")?.checked || false;
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const filteredMonths = excludeCurrent ? months.filter(m => m !== currentMonthKey) : months;
  
  if (periodType === "month") {
    filteredMonths.slice(-24).reverse().forEach(m => {
      const [y, mo] = m.split("-");
      const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
      options.push({ value: m, label: `${monthName} ${y}` });
    });
  } else if (periodType === "quarter") {
    const quarters = new Set();
    filteredMonths.forEach(m => {
      const [y, mo] = m.split("-");
      const q = Math.ceil(mo / 3);
      quarters.add(`${y}-Q${q}`);
    });
    Array.from(quarters).sort().reverse().forEach(q => {
      options.push({ value: q, label: q });
    });
  } else if (periodType === "year") {
    const years = new Set();
    filteredMonths.forEach(m => years.add(m.split("-")[0]));
    Array.from(years).sort().reverse().forEach(y => {
      options.push({ value: y, label: y });
    });
  } else if (periodType === "ytd") {
    const years = new Set();
    filteredMonths.forEach(m => years.add(m.split("-")[0]));
    Array.from(years).sort().reverse().forEach(y => {
      for (let mo = 12; mo >= 1; mo--) {
        const key = `${y}-${String(mo).padStart(2, "0")}`;
        if (filteredMonths.includes(key)) {
          const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
          options.push({ value: `${y}-YTD-${mo}`, label: `YTD ${monthName} ${y}` });
          break;
        }
      }
    });
  } else if (periodType === "ttm") {
    filteredMonths.slice(-24).reverse().forEach(m => {
      const [y, mo] = m.split("-");
      const monthName = new Date(y, mo - 1).toLocaleString("default", { month: "short" });
      options.push({ value: `TTM-${m}`, label: `TTM ending ${monthName} ${y}` });
    });
  }
  
  periodSelect.innerHTML = options.map(o => 
    `<option value="${o.value}">${o.label}</option>`
  ).join("");
}

function populateCFMatrixYearOptions() {
  const periodSelect = document.getElementById("cfPeriodSelect");
  const months = getCFAvailableMonths();
  const years = new Set();
  months.forEach(m => years.add(m.split("-")[0]));
  
  periodSelect.innerHTML = Array.from(years).sort().reverse().map(y => 
    `<option value="${y}">${y}</option>`
  ).join("");
}

function applyCFDetailLevel(level) {
  const allExpandableRows = [
    "cf-row-Cash_from_Operating_Activities",
    "cf-row-Cash_from_Investing_Activities",
    "cf-row-Cash_from_Financing_Activities"
  ];
  
  if (level === "summary") {
    // Collapse all sections - only show subtotals
    allExpandableRows.forEach(rowId => {
      cfRowStates[rowId] = false;
    });
  } else if (level === "detailed") {
    // Expand all sections - show all components
    allExpandableRows.forEach(rowId => {
      cfRowStates[rowId] = true;
    });
  }
}

function getCFPriorPeriod(periodValue, periodType) {
  const months = getCFAvailableMonths();
  
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

function getCFPriorYearPeriod(periodValue, periodType) {
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

function getCFPeriodMonths(periodType, periodValue) {
  const months = getCFAvailableMonths();
  const excludeCurrent = document.getElementById("cfExcludeCurrent")?.checked || false;
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  if (periodType === "month") {
    if (excludeCurrent && periodValue === currentMonthKey) return [];
    return [periodValue];
  } else if (periodType === "quarter") {
    const [y, qStr] = periodValue.split("-Q");
    const q = parseInt(qStr);
    const startMonth = (q - 1) * 3 + 1;
    let result = [];
    for (let m = startMonth; m < startMonth + 3; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) {
        if (excludeCurrent && key === currentMonthKey) continue;
        result.push(key);
      }
    }
    return result;
  } else if (periodType === "year") {
    let result = months.filter(m => m.startsWith(periodValue + "-"));
    if (excludeCurrent) {
      result = result.filter(m => m !== currentMonthKey);
    }
    return result;
  } else if (periodType === "ytd") {
    const match = periodValue.match(/(\d{4})-YTD-(\d+)/);
    if (!match) return [];
    const year = match[1];
    const endMonth = parseInt(match[2]);
    let result = [];
    for (let m = 1; m <= endMonth; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      if (months.includes(key)) {
        if (excludeCurrent && key === currentMonthKey) continue;
        result.push(key);
      }
    }
    return result;
  } else if (periodType === "ttm") {
    const match = periodValue.match(/TTM-(\d{4}-\d{2})/);
    if (!match) return [];
    const endKey = match[1];
    const endIdx = months.indexOf(endKey);
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - 11);
    let result = months.slice(startIdx, endIdx + 1);
    if (excludeCurrent) {
      result = result.filter(m => m !== currentMonthKey);
    }
    return result;
  }
  return [];
}

function getCFAccountBalance(acctNum, period) {
  if (!cfGLLookup[acctNum]) return 0;
  return cfGLLookup[acctNum][period] || 0;
}

function getCFCumulativeBalance(acctNum, endPeriod) {
  if (cfCumulativeBalanceCache[acctNum] && cfCumulativeBalanceCache[acctNum][endPeriod] !== undefined) {
    return cfCumulativeBalanceCache[acctNum][endPeriod];
  }
  if (!cfGLLookup[acctNum]) return 0;
  const months = getCFAvailableMonths().filter(m => m <= endPeriod);
  return months.reduce((sum, m) => sum + (cfGLLookup[acctNum][m] || 0), 0);
}

function getCFPeriodActivity(acctNum, periodMonths) {
  if (!cfGLLookup[acctNum]) return 0;
  return periodMonths.reduce((sum, m) => sum + (cfGLLookup[acctNum][m] || 0), 0);
}

function getCFBalanceChange(accounts, periodMonths, changeType) {
  if (!accounts || accounts.length === 0 || periodMonths.length === 0) return 0;
  
  const allMonths = getCFAvailableMonths();
  const firstPeriodMonth = periodMonths[0];
  const lastPeriodMonth = periodMonths[periodMonths.length - 1];
  
  const firstMonthIdx = allMonths.indexOf(firstPeriodMonth);
  const priorMonth = firstMonthIdx > 0 ? allMonths[firstMonthIdx - 1] : null;
  
  let beginningBalance = 0;
  let endingBalance = 0;
  
  accounts.forEach(acctNum => {
    if (priorMonth) {
      beginningBalance += getCFCumulativeBalance(acctNum, priorMonth);
    }
    endingBalance += getCFCumulativeBalance(acctNum, lastPeriodMonth);
  });
  
  const change = endingBalance - beginningBalance;
  
  if (changeType === "decrease_is_positive") {
    return -change;
  } else if (changeType === "increase_is_positive") {
    return change;
  } else if (changeType === "increase_is_negative") {
    return -change;
  }
  
  return change;
}

function buildCashFlowRows(periodMonths, groups) {
  const calculatedValues = {};
  const rows = [];
  
  const allMonths = getCFAvailableMonths();
  const firstPeriodMonth = periodMonths[0];
  const firstMonthIdx = allMonths.indexOf(firstPeriodMonth);
  const priorMonth = firstMonthIdx > 0 ? allMonths[firstMonthIdx - 1] : null;
  
  groups.forEach((group, idx) => {
    const row = {
      label: group.label,
      level: group.level || 0,
      type: group.type,
      expandable: group.expandable || false,
      parent: group.parent || null,
      highlight: group.highlight || null,
      id: `cf-row-${group.label.replace(/[^a-zA-Z0-9]/g, "_")}`,
      value: 0
    };
    
    if (group.type === "spacer" || group.type === "header") {
      rows.push(row);
      return;
    }
    
    if (group.specialCalc === "net_income") {
      // Net Income = negative sum of all accounts 4000 and higher for the selected period
      let sumActivity = 0;
      const incomeExpenseAccounts = Object.keys(cfGLLookup).map(Number).filter(n => n >= 4000);
      incomeExpenseAccounts.forEach(acctNum => {
        sumActivity += getCFPeriodActivity(acctNum, periodMonths);
      });
      // Negate because revenues are credits (negative) and expenses are debits (positive)
      const netIncome = -sumActivity;
      row.value = netIncome;
      calculatedValues[group.label] = netIncome;
    } else if (group.specialCalc === "beginning_balance") {
      let balance = 0;
      if (priorMonth && group.accounts) {
        const excludeSchwab = document.getElementById("cfExcludeSchwab")?.checked ?? true;
        const filteredAccounts = excludeSchwab ? group.accounts.filter(a => a !== 1004) : group.accounts;
        filteredAccounts.forEach(acctNum => {
          balance += getCFCumulativeBalance(acctNum, priorMonth);
        });
      }
      row.value = balance;
      calculatedValues[group.label] = balance;
    } else if (group.accounts || group.accounts_range) {
      let accountList = group.accounts || [];
      if (group.accounts_range) {
        const [start, end] = group.accounts_range;
        const allAccounts = Object.keys(cfGLLookup).map(Number);
        accountList = allAccounts.filter(a => a >= start && a <= end);
      }
      if (group.changeCalc) {
        row.value = getCFBalanceChange(accountList, periodMonths, group.changeCalc);
      } else if (group.addBack) {
        let total = 0;
        accountList.forEach(acctNum => {
          total += getCFPeriodActivity(acctNum, periodMonths);
        });
        row.value = Math.abs(total);
      } else if (group.negate) {
        let total = 0;
        accountList.forEach(acctNum => {
          total += getCFPeriodActivity(acctNum, periodMonths);
        });
        row.value = -total;
      } else {
        let total = 0;
        accountList.forEach(acctNum => {
          total += getCFPeriodActivity(acctNum, periodMonths);
        });
        row.value = total;
      }
      calculatedValues[group.label] = row.value;
    } else if (group.formula) {
      const formula = group.formula;
      let value = 0;
      const parts = formula.split(/\s*([+-])\s*/);
      let op = "+";
      parts.forEach(part => {
        part = part.trim();
        if (part === "+" || part === "-") {
          op = part;
        } else if (part && calculatedValues.hasOwnProperty(part)) {
          if (op === "+") {
            value += calculatedValues[part];
          } else {
            value -= calculatedValues[part];
          }
        }
      });
      row.value = value;
      calculatedValues[group.label] = value;
    }
    
    rows.push(row);
  });
  
  return rows;
}

function isCFRowVisible(groups, idx) {
  const row = groups[idx];
  if (!row.parent) return true;
  
  // Search both backward and forward since parent subtotals come after children in cash flow
  for (let i = 0; i < groups.length; i++) {
    if (i === idx) continue;
    if (groups[i].label === row.parent) {
      if (!groups[i].expandable) return isCFRowVisible(groups, i);
      const parentId = `cf-row-${groups[i].label.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (cfRowStates[parentId] === true) {
        return isCFRowVisible(groups, i);
      }
      return false;
    }
  }
  return true;
}

function formatCFNumber(value, inThousands = false) {
  if (value === 0 || value === null || value === undefined) return "-";
  
  let displayValue = inThousands ? value / 1000 : value;
  const isNegative = displayValue < 0;
  const suffix = inThousands ? "K" : "";
  
  const absVal = Math.abs(displayValue);
  const formatted = absVal.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  if (isNegative) {
    return `<span class="cf-negative">($${formatted}${suffix})</span>`;
  }
  return `$${formatted}${suffix}`;
}

function formatCFVariance(current, prior, inThousands = false) {
  if (current === null || prior === null) {
    return { diff: "-", pct: "-" };
  }
  
  const diff = current - prior;
  let displayDiff = inThousands ? diff / 1000 : diff;
  const suffix = inThousands ? "K" : "";
  
  const absDiff = Math.abs(displayDiff);
  const diffFormatted = absDiff.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  let diffStr;
  if (diff < 0) {
    diffStr = `<span class="cf-negative">($${diffFormatted}${suffix})</span>`;
  } else if (diff === 0) {
    diffStr = "-";
  } else {
    diffStr = `$${diffFormatted}${suffix}`;
  }
  
  let pctStr = "-";
  if (prior !== 0) {
    const pctChange = ((current - prior) / Math.abs(prior)) * 100;
    if (pctChange > 1000) {
      pctStr = "1,000%+";
    } else if (pctChange < -1000) {
      pctStr = "<span class=\"cf-negative\">-1,000%+</span>";
    } else {
      const pctFormatted = pctChange.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });
      if (pctChange < 0) {
        pctStr = `<span class="cf-negative">${pctFormatted}%</span>`;
      } else {
        pctStr = `${pctFormatted}%`;
      }
    }
  }
  
  return { diff: diffStr, pct: pctStr };
}

function renderCashFlowStatement(skipDetailLevelReset = false) {
  if (!cfAccountGroups || !cfAccountGroups.cash_flow) {
    console.log("Cash flow groups not loaded yet");
    return;
  }
  
  showTableLoading('cashFlowTable', 'Updating...');
  
  requestAnimationFrame(() => {
    renderCashFlowContent(skipDetailLevelReset);
  });
}

function renderCashFlowContent(skipDetailLevelReset = false) {
  const viewMode = document.getElementById("cfViewMode").value;
  const periodType = document.getElementById("cfPeriodType").value;
  const periodValue = document.getElementById("cfPeriodSelect").value;
  const groups = cfAccountGroups.cash_flow.groups;
  const thead = document.getElementById("cfTableHead");
  const tbody = document.getElementById("cfTableBody");
  const footnote = document.getElementById("cfPartialFootnote");
  const showThousands = document.getElementById("cfShowThousands")?.checked || false;
  const detailLevel = document.querySelector('input[name="cfDetailLevel"]:checked')?.value || "summary";
  
  if (!skipDetailLevelReset) {
    applyCFDetailLevel(detailLevel);
  }
  updateReportHeader("cf");
  
  if (viewMode === "matrix") {
    renderCashFlowMatrix(skipDetailLevelReset);
    return;
  }
  
  if (!periodValue) return;
  
  const periodMonths = getCFPeriodMonths(periodType, periodValue);
  if (periodMonths.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">No data available for this period</td></tr>';
    return;
  }
  
  const compare = document.querySelector('input[name="cfCompareRadio"]:checked')?.value || "none";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  let currentLabel = "";
  if (periodType === "month") {
    const [y, mo] = periodValue.split("-");
    currentLabel = `${monthNames[parseInt(mo) - 1]} ${y}`;
  } else if (periodType === "quarter") {
    currentLabel = periodValue;
  } else if (periodType === "year") {
    currentLabel = periodValue;
  } else if (periodType === "ytd") {
    const match = periodValue.match(/(\d{4})-YTD-(\d+)/);
    if (match) {
      currentLabel = `YTD ${monthNames[parseInt(match[2]) - 1]} ${match[1]}`;
    }
  } else if (periodType === "ttm") {
    const match = periodValue.match(/TTM-(\d{4})-(\d{2})/);
    if (match) {
      currentLabel = `TTM ending ${monthNames[parseInt(match[2]) - 1]} ${match[1]}`;
    }
  }
  
  document.getElementById("cfDataAsOf").textContent = currentLabel;
  
  const rows = buildCashFlowRows(periodMonths, groups);
  
  let comparisonRows = null;
  let compPeriodLabel = "";
  
  if (compare !== "none") {
    let compPeriodMonths = [];
    if (compare === "prior_year") {
      if (periodType === "month") {
        const [y, mo] = periodValue.split("-");
        const priorYear = parseInt(y) - 1;
        compPeriodMonths = getCFPeriodMonths("month", `${priorYear}-${mo}`);
        compPeriodLabel = `${monthNames[parseInt(mo) - 1]} ${priorYear}`;
      } else if (periodType === "year") {
        const priorYear = parseInt(periodValue) - 1;
        compPeriodMonths = getCFPeriodMonths("year", String(priorYear));
        compPeriodLabel = String(priorYear);
      } else if (periodType === "quarter") {
        const match = periodValue.match(/(\d{4})-Q(\d)/);
        if (match) {
          const priorYear = parseInt(match[1]) - 1;
          const quarter = match[2];
          compPeriodMonths = getCFPeriodMonths("quarter", `${priorYear}-Q${quarter}`);
          compPeriodLabel = `${priorYear} Q${quarter}`;
        }
      } else if (periodType === "ytd") {
        const match = periodValue.match(/(\d{4})-YTD-(\d+)/);
        if (match) {
          const priorYear = parseInt(match[1]) - 1;
          const monthNum = match[2];
          compPeriodMonths = getCFPeriodMonths("ytd", `${priorYear}-YTD-${monthNum}`);
          compPeriodLabel = `YTD ${monthNames[parseInt(monthNum) - 1]} ${priorYear}`;
        }
      } else if (periodType === "ttm") {
        const match = periodValue.match(/TTM-(\d{4})-(\d{2})/);
        if (match) {
          const priorYear = parseInt(match[1]) - 1;
          const monthNum = match[2];
          compPeriodMonths = getCFPeriodMonths("ttm", `TTM-${priorYear}-${monthNum}`);
          compPeriodLabel = `TTM ending ${monthNames[parseInt(monthNum) - 1]} ${priorYear}`;
        }
      }
    } else if (compare === "prior_period") {
      const allMonths = getCFAvailableMonths();
      if (periodType === "month" && periodMonths.length > 0) {
        const idx = allMonths.indexOf(periodMonths[0]);
        if (idx > 0) {
          compPeriodMonths = [allMonths[idx - 1]];
          const [y, mo] = allMonths[idx - 1].split("-");
          compPeriodLabel = `${monthNames[parseInt(mo) - 1]} ${y}`;
        }
      } else if (periodType === "quarter") {
        const match = periodValue.match(/(\d{4})-Q(\d)/);
        if (match) {
          const year = parseInt(match[1]);
          const quarter = parseInt(match[2]);
          let priorYear = year;
          let priorQuarter = quarter - 1;
          if (priorQuarter < 1) {
            priorQuarter = 4;
            priorYear = year - 1;
          }
          compPeriodMonths = getCFPeriodMonths("quarter", `${priorYear}-Q${priorQuarter}`);
          compPeriodLabel = `${priorYear} Q${priorQuarter}`;
        }
      } else if (periodType === "year") {
        const priorYear = parseInt(periodValue) - 1;
        compPeriodMonths = getCFPeriodMonths("year", String(priorYear));
        compPeriodLabel = String(priorYear);
      }
    }
    
    if (compPeriodMonths.length > 0) {
      comparisonRows = buildCashFlowRows(compPeriodMonths, groups);
    }
  }
  
  let headerHtml = "<tr><th>Account</th>";
  if (comparisonRows) {
    headerHtml += `<th>${compPeriodLabel}</th><th>${currentLabel}</th><th class="var-col-left">$ Var</th><th>% Var</th>`;
  } else {
    headerHtml += `<th>${currentLabel}</th>`;
  }
  headerHtml += "</tr>";
  thead.innerHTML = headerHtml;
  
  let bodyHtml = "";
  
  rows.forEach((row, rowIdx) => {
    if (row.type === "spacer") {
      const colCount = comparisonRows ? 5 : 2;
      bodyHtml += `<tr class="is-spacer-row"><td colspan="${colCount}"></td></tr>`;
      return;
    }
    
    const visible = isCFRowVisible(groups, rowIdx);
    const hiddenClass = visible ? "" : "is-row-hidden";
    
    const typeClass = row.type === "header" ? "is-header" : 
                      row.type === "subtotal" ? "is-subtotal" : "is-detail";
    
    const indentClass = row.level > 0 ? `is-indent-${Math.min(row.level, 3)}` : "";
    
    let highlightClass = "";
    if (row.highlight === "operating") highlightClass = "cf-operating";
    else if (row.highlight === "investing") highlightClass = "cf-investing";
    else if (row.highlight === "financing") highlightClass = "cf-financing";
    else if (row.highlight === "netChange") highlightClass = "is-major-total";
    else if (row.highlight === "total") highlightClass = "is-major-total";
    
    let expandedClass = "";
    if (row.expandable && cfRowStates[row.id] === true) {
      expandedClass = "is-expanded-subtotal";
    }
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = cfRowStates[row.id] === true;
      toggleHtml = `<span class="cf-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    } else if (row.parent && detailLevel !== "detailed") {
      toggleHtml = `<span class="cf-toggle-placeholder"></span>`;
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${expandedClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    if (row.type === "header") {
      if (comparisonRows) {
        bodyHtml += `<td></td><td></td><td></td><td></td>`;
      } else {
        bodyHtml += `<td></td>`;
      }
    } else if (comparisonRows) {
      const compRow = comparisonRows[rowIdx];
      const currentVal = row.value;
      const compVal = compRow ? compRow.value : 0;
      const variance = formatCFVariance(currentVal, compVal, showThousands);
      
      bodyHtml += `<td>${formatCFNumber(compVal, showThousands)}</td>`;
      bodyHtml += `<td>${formatCFNumber(currentVal, showThousands)}</td>`;
      bodyHtml += `<td class="var-col-left">${variance.diff}</td>`;
      bodyHtml += `<td>${variance.pct}</td>`;
    } else {
      bodyHtml += `<td>${formatCFNumber(row.value, showThousands)}</td>`;
    }
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachCFToggleListeners();
  setTimeout(() => {
    autoSizeFirstColumn("cashFlowTable");
    addResizeHandlesToTable("cashFlowTable");
    autoScaleFontSize("cashFlowTable", "cfTableBox");
    hideTableLoading('cashFlowTable');
  }, 50);
  
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const hasPartial = periodMonths.includes(currentMonthKey);
  
  if (footnote) {
    if (hasPartial) {
      footnote.classList.remove("hidden");
    } else {
      footnote.classList.add("hidden");
    }
  }
}

function attachCFToggleListeners() {
  const toggles = document.querySelectorAll(".cf-toggle");
  toggles.forEach(toggle => {
    toggle.onclick = (e) => {
      e.stopPropagation();
      const rowId = toggle.dataset.row;
      cfRowStates[rowId] = !cfRowStates[rowId];
      
      // Re-render without resetting detail level states
      const viewMode = document.querySelector('input[name="cfViewMode"]:checked')?.value || "single";
      if (viewMode === "matrix") {
        renderCashFlowMatrix(true);
      } else {
        renderCashFlowStatement(true);
      }
    };
  });
}

function renderCashFlowMatrix(skipDetailLevelReset = false) {
  const periodType = document.getElementById("cfPeriodType").value;
  const periodSelect = document.getElementById("cfPeriodSelect");
  const yearStart = document.getElementById("cfMatrixYearStart")?.value;
  const yearEnd = document.getElementById("cfMatrixYearEnd")?.value;
  const showThousands = document.getElementById("cfShowThousands")?.checked || false;
  const showSubtotal = document.getElementById("cfShowSubtotal")?.checked || false;
  const groups = cfAccountGroups?.cash_flow?.groups;
  const thead = document.getElementById("cfTableHead");
  const tbody = document.getElementById("cfTableBody");
  const detailLevel = document.querySelector('input[name="cfDetailLevel"]:checked')?.value || "summary";
  
  if (!thead || !tbody || !groups) {
    console.error("Cash flow matrix: Missing required elements or groups");
    return;
  }
  
  if (!skipDetailLevelReset) {
    applyCFDetailLevel(detailLevel);
  }
  
  const periods = [];
  const allMonths = getCFAvailableMonths();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const excludeCurrent = document.getElementById("cfExcludeCurrent")?.checked || false;
  
  if (periodType === "year") {
    const startYr = parseInt(yearStart);
    const endYr = parseInt(yearEnd);
    for (let y = startYr; y <= endYr; y++) {
      let yearMonths = allMonths.filter(m => m.startsWith(y + "-"));
      if (excludeCurrent) {
        yearMonths = yearMonths.filter(m => m !== currentMonthKey);
      }
      if (yearMonths.length > 0) {
        periods.push({ label: String(y), months: yearMonths });
      }
    }
  } else if (periodType === "quarter") {
    const selYear = periodSelect.value || String(now.getFullYear());
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3 + 1;
      let quarterMonths = [];
      for (let m = startMonth; m < startMonth + 3; m++) {
        const key = `${selYear}-${String(m).padStart(2, "0")}`;
        if (allMonths.includes(key)) {
          if (excludeCurrent && key === currentMonthKey) continue;
          quarterMonths.push(key);
        }
      }
      if (quarterMonths.length > 0) {
        periods.push({ label: `Q${q}`, months: quarterMonths });
      }
    }
  } else if (periodType === "month") {
    const selYear = periodSelect.value || String(now.getFullYear());
    for (let m = 1; m <= 12; m++) {
      const key = `${selYear}-${String(m).padStart(2, "0")}`;
      if (excludeCurrent && key === currentMonthKey) continue;
      if (allMonths.includes(key)) {
        periods.push({ label: monthNames[m - 1], months: [key] });
      }
    }
  }
  
  if (periods.length === 0) {
    tbody.innerHTML = '<tr><td>No data available</td></tr>';
    return;
  }
  
  const allRowsData = periods.map(p => buildCashFlowRows(p.months, groups));
  
  const colCount = periods.length + 1 + (showSubtotal ? 1 : 0);
  
  let headerHtml = "<tr><th>Account</th>";
  periods.forEach(p => {
    headerHtml += `<th>${p.label}</th>`;
  });
  if (showSubtotal) {
    headerHtml += '<th class="is-subtotal-col">Subtotal</th>';
  }
  headerHtml += "</tr>";
  thead.innerHTML = headerHtml;
  
  let bodyHtml = "";
  const rows = allRowsData[0];
  
  rows.forEach((row, rowIdx) => {
    if (row.type === "spacer") {
      bodyHtml += `<tr class="is-spacer-row"><td colspan="${colCount}"></td></tr>`;
      return;
    }
    
    const visible = isCFRowVisible(groups, rowIdx);
    const hiddenClass = visible ? "" : "is-row-hidden";
    
    const typeClass = row.type === "header" ? "is-header" : 
                      row.type === "subtotal" ? "is-subtotal" : "is-detail";
    
    const indentClass = row.level > 0 ? `is-indent-${Math.min(row.level, 3)}` : "";
    
    let highlightClass = "";
    if (row.highlight === "operating") highlightClass = "cf-operating";
    else if (row.highlight === "investing") highlightClass = "cf-investing";
    else if (row.highlight === "financing") highlightClass = "cf-financing";
    else if (row.highlight === "netChange") highlightClass = "is-major-total";
    else if (row.highlight === "total") highlightClass = "is-major-total";
    
    let expandedClass = "";
    if (row.expandable && cfRowStates[row.id] === true) {
      expandedClass = "is-expanded-subtotal";
    }
    
    let toggleHtml = "";
    if (row.expandable) {
      const expanded = cfRowStates[row.id] === true;
      toggleHtml = `<span class="cf-toggle" data-row="${row.id}">${expanded ? "▼" : "▶"}</span>`;
    } else if (row.parent && detailLevel !== "detailed") {
      toggleHtml = `<span class="cf-toggle-placeholder"></span>`;
    }
    
    bodyHtml += `<tr class="${typeClass} ${indentClass} ${hiddenClass} ${highlightClass} ${expandedClass}" data-row-id="${row.id}">`;
    bodyHtml += `<td>${toggleHtml}${row.label}</td>`;
    
    let rowSubtotal = 0;
    allRowsData.forEach(periodRows => {
      const periodRow = periodRows[rowIdx];
      if (row.type === "header") {
        bodyHtml += `<td></td>`;
      } else {
        bodyHtml += `<td>${formatCFNumber(periodRow?.value, showThousands)}</td>`;
        rowSubtotal += periodRow?.value || 0;
      }
    });
    
    if (showSubtotal) {
      if (row.type === "header") {
        bodyHtml += '<td class="is-subtotal-col"></td>';
      } else {
        bodyHtml += `<td class="is-subtotal-col"><strong>${formatCFNumber(rowSubtotal, showThousands)}</strong></td>`;
      }
    }
    
    bodyHtml += "</tr>";
  });
  
  tbody.innerHTML = bodyHtml;
  attachCFToggleListeners();
  setTimeout(() => {
    addResizeHandlesToTable("cashFlowTable");
    autoScaleFontSize("cashFlowTable", "cfTableBox");
    hideTableLoading('cashFlowTable');
  }, 50);
}

function saveCashFlowConfig() {
  const config = {
    viewMode: document.getElementById("cfViewMode")?.value,
    periodType: document.getElementById("cfPeriodType")?.value,
    periodValue: document.getElementById("cfPeriodSelect")?.value,
    compare: document.querySelector('input[name="cfCompareRadio"]:checked')?.value,
    detailLevel: document.querySelector('input[name="cfDetailLevel"]:checked')?.value,
    showThousands: document.getElementById("cfShowThousands")?.checked,
    showSubtotal: document.getElementById("cfShowSubtotal")?.checked,
    excludeCurrent: document.getElementById("cfExcludeCurrent")?.checked,
    excludeSchwab: document.getElementById("cfExcludeSchwab")?.checked,
    matrixYearStart: document.getElementById("cfMatrixYearStart")?.value,
    matrixYearEnd: document.getElementById("cfMatrixYearEnd")?.value
  };
  saveUserPreferences({ cashFlow: config });
}

function loadCashFlowConfig() {
  const prefs = getUserPreferences();
  const cfg = prefs.cashFlow || {};
  
  if (cfg.viewMode) {
    const el = document.getElementById("cfViewMode");
    if (el) el.value = cfg.viewMode;
  }
  if (cfg.periodType) {
    const el = document.getElementById("cfPeriodType");
    if (el) el.value = cfg.periodType;
  }
  if (cfg.periodValue) {
    const el = document.getElementById("cfPeriodSelect");
    if (el && el.querySelector(`option[value="${cfg.periodValue}"]`)) el.value = cfg.periodValue;
  }
  if (cfg.compare) {
    const radio = document.querySelector(`input[name="cfCompareRadio"][value="${cfg.compare}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.detailLevel) {
    const radio = document.querySelector(`input[name="cfDetailLevel"][value="${cfg.detailLevel}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.showThousands !== undefined) {
    const el = document.getElementById("cfShowThousands");
    if (el) el.checked = cfg.showThousands;
  }
  if (cfg.showSubtotal !== undefined) {
    const el = document.getElementById("cfShowSubtotal");
    if (el) el.checked = cfg.showSubtotal;
  }
  const excludeEl = document.getElementById("cfExcludeCurrent");
  if (excludeEl) excludeEl.checked = cfg.excludeCurrent !== false;
  
  if (cfg.excludeSchwab !== undefined) {
    const el = document.getElementById("cfExcludeSchwab");
    if (el) el.checked = cfg.excludeSchwab;
  }
  if (cfg.matrixYearStart) {
    const el = document.getElementById("cfMatrixYearStart");
    if (el) {
      el.value = cfg.matrixYearStart;
      const label = document.getElementById("cfMatrixYearStartLabel");
      if (label) label.textContent = cfg.matrixYearStart;
    }
  }
  if (cfg.matrixYearEnd) {
    const el = document.getElementById("cfMatrixYearEnd");
    if (el) {
      el.value = cfg.matrixYearEnd;
      const label = document.getElementById("cfMatrixYearEndLabel");
      if (label) label.textContent = cfg.matrixYearEnd;
    }
  }
  
  // Update control visibility based on loaded config
  updateCFMatrixControlsVisibility();
}

function initCFAiAnalysis() {
  const analyzeBtn = document.getElementById("cfAiAnalyzeBtn");
  const panel = document.getElementById("cfAiAnalysisPanel");
  const header = document.getElementById("cfAiAnalysisHeader");
  
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      performCFAiAnalysis();
    });
  }
  
  if (header) {
    header.addEventListener("click", (e) => {
      if (e.target === analyzeBtn || analyzeBtn.contains(e.target)) return;
      panel.classList.toggle("collapsed");
    });
  }
}

async function performCFAiAnalysis() {
  const analyzeBtn = document.getElementById("cfAiAnalyzeBtn");
  const panel = document.getElementById("cfAiAnalysisPanel");
  const contentContainer = document.getElementById("cfAiAnalysisContent");
  
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  panel.classList.remove("collapsed");
  contentContainer.innerHTML = '<div class="ai-analysis-loading"><div class="ai-spinner"></div>Analyzing your cash flow data...</div>';
  
  try {
    const statementData = extractCashFlowData();
    const periodInfo = getCashFlowPeriodInfo();
    
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit 
      ? "/api/analyze-cash-flow"
      : "/.netlify/functions/analyze-cash-flow";
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statementData, periodInfo })
    });
    
    const result = await response.json();
    
    if (result.success && result.analysis) {
      contentContainer.innerHTML = formatMarkdown(result.analysis);
    } else {
      contentContainer.innerHTML = `<div style="color: #dc2626;">Error: ${result.error || "Failed to get analysis"}</div>`;
    }
  } catch (error) {
    console.error("AI Analysis error:", error);
    contentContainer.innerHTML = `<div style="color: #dc2626;">Error: ${error.message || "Failed to connect to AI service"}</div>`;
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Run Analysis';
  }
}

function extractCashFlowData() {
  const table = document.getElementById("cashFlowTable");
  if (!table) return "";
  
  let text = "";
  const rows = table.querySelectorAll("tr");
  
  rows.forEach(row => {
    if (row.classList.contains("is-spacer-row")) return;
    if (row.classList.contains("is-row-hidden")) return;
    
    const cells = row.querySelectorAll("th, td");
    const rowData = [];
    cells.forEach(cell => {
      let cellText = cell.textContent.trim();
      rowData.push(cellText);
    });
    text += rowData.join("\t") + "\n";
  });
  
  return text;
}

function getCashFlowPeriodInfo() {
  const viewMode = document.getElementById("cfViewMode").value;
  const periodType = document.getElementById("cfPeriodType").value;
  const periodSelect = document.getElementById("cfPeriodSelect");
  const compare = document.querySelector('input[name="cfCompareRadio"]:checked');
  
  let info = "";
  
  if (viewMode === "single") {
    info = `${periodType.toUpperCase()}: ${periodSelect.options[periodSelect.selectedIndex]?.text || ""}`;
  } else {
    if (periodType === "year") {
      const startYear = document.getElementById("cfMatrixYearStart").value;
      const endYear = document.getElementById("cfMatrixYearEnd").value;
      info = `Annual Matrix: ${startYear} - ${endYear}`;
    } else {
      info = `${periodType.toUpperCase()} Matrix: ${periodSelect.options[periodSelect.selectedIndex]?.text || ""}`;
    }
  }
  
  if (compare && compare.value !== "none") {
    info += ` (compared to ${compare.value.replace("_", " ")})`;
  }
  
  return info;
}

/* ------------------------------------------------------------
   PLACEHOLDER CONTENT
------------------------------------------------------------ */
const projectsEl = document.getElementById("projectsContent");
if (projectsEl) projectsEl.innerText = "Project data loads here.";

const operationsEl = document.getElementById("operationsContent");
if (operationsEl) operationsEl.innerText = "Operations metrics load here.";

const reportsEl = document.getElementById("reportsContent");
if (reportsEl) reportsEl.innerText = "Reports will appear here.";

/* ============================================================
   CASH BALANCES MODULE
============================================================ */
let cashReportsInitialized = false;
let cashData = { accounts: [], transactions: [] };
let cashChartInstance = null;
let cashSelectedAccounts = [];
let cashDailyBalances = {};
let cashTableExpanded = false;
let cashTransactionsNeedRefresh = true;

async function initCashReports() {
  const headerEl = document.getElementById("cashCurrentHeader");
  const dailyTableEl = document.getElementById("dailyBalanceTableContainer");
  
  if (headerEl) headerEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  if (dailyTableEl) dailyTableEl.innerHTML = '<div class="loading-spinner">Calculating daily balances...</div>';
  
  try {
    const hostname = window.location.hostname;
    const isReplit = hostname.includes('replit') || hostname.includes('127.0.0.1') || hostname === 'localhost';
    const apiUrl = isReplit ? '/api/cash-data' : '/.netlify/functions/cash-data';
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!data.success) {
      if (headerEl) headerEl.innerHTML = `<div class="error-message">Error: ${data.error}</div>`;
      return;
    }
    
    cashData = data;
    
    // Initialize selected accounts - use FTG_BUILDERS_LABEL for combined accounts
    const ftgAccounts = getFTGBuildersAccounts(data.accounts);
    const otherAccounts = getNonFTGBuildersAccounts(data.accounts);
    cashSelectedAccounts = [];
    if (ftgAccounts.length > 0) {
      cashSelectedAccounts.push(FTG_BUILDERS_LABEL);
    }
    cashSelectedAccounts.push(...otherAccounts.map(a => a.name));
    
    // Build account checkboxes
    renderCashAccountCheckboxes(data.accounts);
    
    // Calculate all daily balances
    cashDailyBalances = calculateDailyBalances(data.accounts, data.transactions);
    
    // Setup event listeners
    setupCashEventListeners();
    
    // Initial render
    updateCashDisplay();
    updateCashDataAsOf(data.accounts);
    cashReportsInitialized = true;
    
  } catch (error) {
    console.error("Cash Balances error:", error);
    if (headerEl) headerEl.innerHTML = `<div class="error-message">Failed to load: ${error.message}</div>`;
  }
}

// FTG Builders combined accounts (accounts ending in 1883, 2469, 7554)
const FTG_BUILDERS_ACCOUNT_SUFFIXES = ['1883', '2469', '7554'];
const FTG_BUILDERS_LABEL = 'FTG Builders accounts';

function isFTGBuildersAccount(accountName) {
  return FTG_BUILDERS_ACCOUNT_SUFFIXES.some(suffix => accountName.includes(suffix));
}

function getFTGBuildersAccounts(accounts) {
  return accounts.filter(a => isFTGBuildersAccount(a.name));
}

function getNonFTGBuildersAccounts(accounts) {
  return accounts.filter(a => !isFTGBuildersAccount(a.name));
}

function renderCashAccountCheckboxes(accounts) {
  const container = document.getElementById("cashAccountCheckboxes");
  if (!container) return;
  
  const ftgAccounts = getFTGBuildersAccounts(accounts);
  const otherAccounts = getNonFTGBuildersAccounts(accounts);
  
  // Sort other accounts by balance
  const sortedOtherAccounts = [...otherAccounts].sort((a, b) => b.balance - a.balance);
  
  let html = '';
  
  // Add FTG Builders combined option first if there are FTG accounts
  if (ftgAccounts.length > 0) {
    const ftgTotalBalance = ftgAccounts.reduce((sum, a) => sum + a.balance, 0);
    html += `
      <label>
        <input type="checkbox" class="cash-account-cb" value="${FTG_BUILDERS_LABEL}" data-combined="true" checked>
        ${FTG_BUILDERS_LABEL}
      </label>
    `;
  }
  
  // Add other accounts
  sortedOtherAccounts.forEach(acct => {
    html += `
      <label>
        <input type="checkbox" class="cash-account-cb" value="${acct.name}" checked>
        ${acct.name}
      </label>
    `;
  });
  
  container.innerHTML = html;
}

function setupCashEventListeners() {
  // Select All / None buttons
  document.getElementById("cashSelectAll")?.addEventListener("click", () => {
    document.querySelectorAll(".cash-account-cb").forEach(cb => cb.checked = true);
    // Build selected accounts list with FTG_BUILDERS_LABEL for combined accounts
    const ftgAccounts = getFTGBuildersAccounts(cashData.accounts);
    const otherAccounts = getNonFTGBuildersAccounts(cashData.accounts);
    cashSelectedAccounts = [];
    if (ftgAccounts.length > 0) {
      cashSelectedAccounts.push(FTG_BUILDERS_LABEL);
    }
    cashSelectedAccounts.push(...otherAccounts.map(a => a.name));
    updateCashDisplay();
  });
  
  document.getElementById("cashSelectNone")?.addEventListener("click", () => {
    document.querySelectorAll(".cash-account-cb").forEach(cb => cb.checked = false);
    cashSelectedAccounts = [];
    updateCashDisplay();
  });
  
  // Individual checkboxes
  document.getElementById("cashAccountCheckboxes")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("cash-account-cb")) {
      cashSelectedAccounts = Array.from(document.querySelectorAll(".cash-account-cb:checked")).map(cb => cb.value);
      updateCashDisplay();
    }
  });
  
  // Date range dropdown
  document.getElementById("cashDaysRange")?.addEventListener("change", (e) => {
    const customRangeDiv = document.getElementById("cashCustomDateRange");
    if (e.target.value === "custom") {
      customRangeDiv.style.display = "block";
      // Set default dates if not set
      const startInput = document.getElementById("cashStartDate");
      const endInput = document.getElementById("cashEndDate");
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (!endInput.value) {
        endInput.value = today.toISOString().split('T')[0];
      }
      if (!startInput.value) {
        startInput.value = thirtyDaysAgo.toISOString().split('T')[0];
      }
      
      // Set min date based on oldest transaction
      if (cashData.transactions && cashData.transactions.length > 0) {
        const dates = cashData.transactions.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
        if (dates.length > 0) {
          const oldestDate = new Date(Math.min(...dates));
          startInput.min = oldestDate.toISOString().split('T')[0];
          endInput.min = oldestDate.toISOString().split('T')[0];
        }
      }
      endInput.max = today.toISOString().split('T')[0];
      startInput.max = today.toISOString().split('T')[0];
    } else {
      customRangeDiv.style.display = "none";
    }
    updateCashDisplay();
  });
  
  // Custom date inputs with validation
  document.getElementById("cashStartDate")?.addEventListener("change", (e) => {
    const oldestDate = getOldestTransactionDate();
    const today = new Date().toISOString().split('T')[0];
    
    if (oldestDate && e.target.value < oldestDate) {
      alert(`Cannot select a date before ${formatDateForDisplay(oldestDate)} (oldest transaction date)`);
      e.target.value = oldestDate;
    }
    if (e.target.value > today) {
      e.target.value = today;
    }
    // Ensure start date is not after end date
    const endDate = document.getElementById("cashEndDate")?.value;
    if (endDate && e.target.value > endDate) {
      e.target.value = endDate;
    }
    updateCashDisplay();
  });
  
  document.getElementById("cashEndDate")?.addEventListener("change", (e) => {
    const oldestDate = getOldestTransactionDate();
    const today = new Date().toISOString().split('T')[0];
    
    if (oldestDate && e.target.value < oldestDate) {
      alert(`Cannot select a date before ${formatDateForDisplay(oldestDate)} (oldest transaction date)`);
      e.target.value = oldestDate;
    }
    if (e.target.value > today) {
      e.target.value = today;
    }
    // Ensure end date is not before start date
    const startDate = document.getElementById("cashStartDate")?.value;
    if (startDate && e.target.value < startDate) {
      e.target.value = startDate;
    }
    updateCashDisplay();
  });
  
  // Stack bars / Show total / Data labels
  document.getElementById("cashStackBars")?.addEventListener("change", updateCashDisplay);
  document.getElementById("cashShowTotal")?.addEventListener("change", updateCashDisplay);
  document.getElementById("cashDataLabels")?.addEventListener("change", updateCashDisplay);
  
  // Tab switching
  document.querySelectorAll(".cash-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      
      // Update tab buttons
      document.querySelectorAll(".cash-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      // Update tab content
      document.querySelectorAll(".cash-tab-content").forEach(c => c.classList.remove("active"));
      const content = document.getElementById(tabName === "balances" ? "cashTabBalances" : "cashTabTransactions");
      if (content) content.classList.add("active");
      
      // Render transaction table if switching to transactions tab
      if (tabName === "transactions") {
        renderCashTransactionTable();
        cashTransactionsNeedRefresh = false;
      }
    });
  });
}

let cashTxnByDateAccount = {};
let cashCurrentBalances = {};
let cashAccountNames = [];
let cashBalanceCache = {};
let cashOldestDate = null;

function initCashCalculations(accounts, transactions) {
  cashAccountNames = accounts.map(a => a.name);
  cashCurrentBalances = {};
  accounts.forEach(a => { cashCurrentBalances[a.name] = a.balance; });
  
  cashTxnByDateAccount = {};
  cashOldestDate = new Date();
  
  transactions.forEach(txn => {
    let dateKey = '';
    try {
      const d = new Date(txn.date);
      if (!isNaN(d.getTime())) {
        dateKey = d.toISOString().split('T')[0];
        if (d < cashOldestDate) cashOldestDate = d;
      }
    } catch (e) {}
    
    if (!dateKey) return;
    
    if (!cashTxnByDateAccount[dateKey]) cashTxnByDateAccount[dateKey] = {};
    if (!cashTxnByDateAccount[dateKey][txn.account]) cashTxnByDateAccount[dateKey][txn.account] = 0;
    cashTxnByDateAccount[dateKey][txn.account] += txn.amount;
  });
  
  cashBalanceCache = {};
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  cashBalanceCache[todayStr] = { ...cashCurrentBalances };
}

function getBalanceForDate(dateKey) {
  if (cashBalanceCache[dateKey]) {
    return cashBalanceCache[dateKey];
  }
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const targetDate = new Date(dateKey + 'T12:00:00');
  
  let nearestCachedDate = null;
  let nearestCachedBalances = null;
  
  const cachedDates = Object.keys(cashBalanceCache).sort().reverse();
  for (const cached of cachedDates) {
    const cachedDateObj = new Date(cached + 'T12:00:00');
    if (cachedDateObj >= targetDate) {
      nearestCachedDate = cached;
      nearestCachedBalances = { ...cashBalanceCache[cached] };
      break;
    }
  }
  
  if (!nearestCachedDate) {
    nearestCachedDate = todayStr;
    nearestCachedBalances = { ...cashCurrentBalances };
  }
  
  const runningBalances = nearestCachedBalances;
  let current = new Date(nearestCachedDate + 'T12:00:00');
  
  while (current.toISOString().split('T')[0] > dateKey) {
    current.setDate(current.getDate() - 1);
    const currentKey = current.toISOString().split('T')[0];
    
    const txnsOnDate = cashTxnByDateAccount[currentKey] || {};
    cashAccountNames.forEach(acctName => {
      const txnAmount = txnsOnDate[acctName] || 0;
      runningBalances[acctName] = (runningBalances[acctName] || 0) - txnAmount;
    });
    
    cashBalanceCache[currentKey] = { ...runningBalances };
  }
  
  return cashBalanceCache[dateKey] || runningBalances;
}

function calculateDailyBalances(accounts, transactions) {
  initCashCalculations(accounts, transactions);
  return cashBalanceCache;
}

function updateCashDisplay() {
  renderCashCurrentHeader();
  renderCashChart();
  renderCashDailyTable();
  // Mark transactions as needing refresh
  cashTransactionsNeedRefresh = true;
  // If transactions tab is active, refresh immediately
  const transactionsTab = document.querySelector('.cash-tab[data-tab="transactions"]');
  if (transactionsTab && transactionsTab.classList.contains('active')) {
    renderCashTransactionTable();
    cashTransactionsNeedRefresh = false;
  }
}

let cashHeaderExpanded = false;

function renderCashCurrentHeader() {
  const container = document.getElementById("cashCurrentHeader");
  if (!container) return;
  
  // Build display accounts list - FTG combined + individual accounts
  const ftgBuildersSelected = cashSelectedAccounts.includes(FTG_BUILDERS_LABEL);
  const ftgAccounts = getFTGBuildersAccounts(cashData.accounts);
  const individualSelectedAccounts = cashData.accounts
    .filter(a => cashSelectedAccounts.includes(a.name) && !isFTGBuildersAccount(a.name));
  
  // Build display entries
  const displayEntries = [];
  
  if (ftgBuildersSelected && ftgAccounts.length > 0) {
    const ftgTotalBalance = ftgAccounts.reduce((sum, a) => sum + a.balance, 0);
    displayEntries.push({
      name: FTG_BUILDERS_LABEL,
      balance: ftgTotalBalance
    });
  }
  
  individualSelectedAccounts.forEach(a => {
    displayEntries.push({
      name: a.name,
      balance: a.balance
    });
  });
  
  if (displayEntries.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.6;">Select accounts to view balances</div>';
    return;
  }
  
  const total = displayEntries.reduce((sum, a) => sum + a.balance, 0);
  
  let accountsHtml = '';
  if (displayEntries.length > 1) {
    const collapsedClass = cashHeaderExpanded ? '' : 'collapsed';
    const toggleIcon = cashHeaderExpanded ? '▲' : '▼';
    
    accountsHtml = `
      <div class="cash-header-toggle" id="cashHeaderToggle">
        <span class="toggle-text">${cashHeaderExpanded ? 'Hide Details' : 'Show Details'}</span>
        <span class="toggle-icon">${toggleIcon}</span>
      </div>
      <div class="cash-header-accounts ${collapsedClass}" id="cashHeaderAccounts">`;
    
    displayEntries.forEach(a => {
      let shortName = a.name;
      const acctMatch = a.name.match(/\((\d+)\)$/);
      if (acctMatch) {
        const acctNum = acctMatch[1];
        const namePart = a.name.replace(/\s*\(\d+\)$/, '');
        shortName = namePart.length > 12 ? namePart.substring(0, 12) + '..' : namePart;
        shortName += ' (' + acctNum + ')';
      }
      
      let balanceDisplay = formatCurrency(a.balance);
      if (Math.abs(a.balance) >= 1000000) {
        balanceDisplay = '$' + (a.balance / 1000000).toFixed(2) + 'M';
      } else if (Math.abs(a.balance) >= 1000) {
        balanceDisplay = '$' + (a.balance / 1000).toFixed(1) + 'K';
      }
      
      accountsHtml += `
        <div class="cash-header-account">
          <div class="cash-header-account-name" title="${a.name}">${shortName}</div>
          <div class="cash-header-account-value">${balanceDisplay}</div>
        </div>
      `;
    });
    accountsHtml += `</div>`;
  }
  
  container.innerHTML = `
    <div class="cash-header-title">Current Total${displayEntries.length > 1 ? ' (' + displayEntries.length + ' accounts)' : ''}</div>
    <div class="cash-header-total">${formatCurrency(total)}</div>
    ${accountsHtml}
  `;
  
  // Add toggle event listener
  const toggleBtn = document.getElementById("cashHeaderToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      cashHeaderExpanded = !cashHeaderExpanded;
      renderCashCurrentHeader();
    });
  }
}

function getOldestTransactionDate() {
  if (!cashData.transactions || cashData.transactions.length === 0) return null;
  const dates = cashData.transactions
    .map(t => new Date(t.date))
    .filter(d => !isNaN(d.getTime()));
  if (dates.length === 0) return null;
  const oldestDate = new Date(Math.min(...dates));
  return oldestDate.toISOString().split('T')[0];
}

function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCashDateRange() {
  const rangeValue = document.getElementById("cashDaysRange")?.value || "30";
  const today = new Date();
  let startDate, endDate;
  
  if (rangeValue === "custom") {
    const startInput = document.getElementById("cashStartDate")?.value;
    const endInput = document.getElementById("cashEndDate")?.value;
    
    if (startInput && endInput) {
      startDate = new Date(startInput + 'T12:00:00');
      endDate = new Date(endInput + 'T12:00:00');
    } else {
      // Fallback to 30 days if custom dates not set
      endDate = today;
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
    }
  } else {
    const daysRange = parseInt(rangeValue);
    endDate = today;
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (daysRange - 1));
  }
  
  // Generate array of date strings
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

function renderCashChart() {
  const canvas = document.getElementById("cashChart");
  if (!canvas) return;
  
  const stackBars = document.getElementById("cashStackBars")?.checked !== false;
  const showDataLabels = document.getElementById("cashDataLabels")?.checked === true;
  
  // Get dates to display using the new helper function
  const dates = getCashDateRange();
  
  // Check if FTG Builders is selected
  const ftgBuildersSelected = cashSelectedAccounts.includes(FTG_BUILDERS_LABEL);
  const ftgAccounts = getFTGBuildersAccounts(cashData.accounts);
  
  // Get individual selected accounts (non-FTG)
  const individualSelectedAccounts = cashData.accounts
    .filter(a => cashSelectedAccounts.includes(a.name) && !isFTGBuildersAccount(a.name))
    .sort((a, b) => b.balance - a.balance);
  
  // Build chart accounts list - FTG combined + individual accounts
  const chartAccountsConfig = [];
  
  if (ftgBuildersSelected && ftgAccounts.length > 0) {
    // Add FTG Builders as combined entry
    const ftgTotalBalance = ftgAccounts.reduce((sum, a) => sum + a.balance, 0);
    chartAccountsConfig.push({
      label: FTG_BUILDERS_LABEL,
      accounts: ftgAccounts,
      balance: ftgTotalBalance,
      isCombined: true
    });
  }
  
  // Add individual accounts
  individualSelectedAccounts.forEach(acct => {
    chartAccountsConfig.push({
      label: acct.name,
      accounts: [acct],
      balance: acct.balance,
      isCombined: false
    });
  });
  
  if (chartAccountsConfig.length === 0) {
    if (cashChartInstance) cashChartInstance.destroy();
    return;
  }
  
  // Colors for accounts
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  
  // Get theme colors
  const isDarkMode = document.documentElement.getAttribute("data-theme") === "dark";
  
  // Pre-calculate totals per date for data labels
  const dateTotals = dates.map(dateKey => {
    const balances = getBalanceForDate(dateKey);
    return chartAccountsConfig.reduce((sum, cfg) => {
      return sum + cfg.accounts.reduce((s, a) => s + (balances[a.name] || 0), 0);
    }, 0);
  });
  
  // Build datasets - last dataset in stack shows the total label
  const datasets = chartAccountsConfig.map((cfg, idx) => {
    const data = dates.map(dateKey => {
      const balances = getBalanceForDate(dateKey);
      // Sum balances for all accounts in this config (for combined FTG accounts)
      return cfg.accounts.reduce((sum, a) => sum + (balances[a.name] || 0), 0);
    });
    
    // Only the last (top) dataset shows data labels when stacked
    const isTopDataset = idx === chartAccountsConfig.length - 1;
    
    return {
      label: cfg.label,
      data: data,
      backgroundColor: colors[idx % colors.length],
      borderColor: colors[idx % colors.length],
      borderWidth: 1,
      stack: stackBars ? 'stack1' : undefined,
      datalabels: (showDataLabels && stackBars && isTopDataset) ? {
        display: true,
        align: 'end',
        anchor: 'end',
        offset: 2,
        color: isDarkMode ? '#ffffff' : '#1e3a5f',
        font: { weight: 'bold', size: 10 },
        formatter: (value, context) => {
          // Show the total for this date, not just this segment
          const total = dateTotals[context.dataIndex];
          if (total === null || total === undefined) return '';
          const millions = total / 1000000;
          return '$' + millions.toFixed(1) + 'M';
        }
      } : { display: false }
    };
  });
  
  // Labels
  const labels = dates.map(d => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  if (cashChartInstance) cashChartInstance.destroy();
  
  // Calculate min/max for Y-axis (start near minimum, not zero)
  let allValues = [];
  datasets.forEach(ds => {
    if (ds.type !== 'line') {
      allValues = allValues.concat(ds.data.filter(v => v !== null && v !== undefined));
    }
  });
  
  // For stacked bars, calculate totals per date
  if (stackBars && chartAccountsConfig.length > 1) {
    allValues = dates.map(dateKey => {
      const balances = getBalanceForDate(dateKey);
      return chartAccountsConfig.reduce((sum, cfg) => {
        return sum + cfg.accounts.reduce((s, a) => s + (balances[a.name] || 0), 0);
      }, 0);
    });
  }
  
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  
  // Round down to nearest million for min, round up for max
  const yMin = Math.floor(dataMin / 1000000) * 1000000;
  const yMax = Math.ceil(dataMax / 1000000) * 1000000;
  
  // Check if mobile for legend adjustments
  const isMobile = window.innerWidth <= 768;
  const themeColors = getChartThemeColors();
  
  cashChartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
        delay: (context) => {
          let delay = 0;
          if (context.type === 'data' && context.mode === 'default') {
            delay = context.dataIndex * 30 + context.datasetIndex * 60;
          }
          return delay;
        }
      },
      transitions: {
        active: { animation: { duration: 200 } }
      },
      layout: {
        padding: { top: showDataLabels ? 25 : 0, bottom: isMobile ? 10 : 0 }
      },
      plugins: {
        legend: { 
          display: chartAccountsConfig.length > 1, 
          position: 'bottom',
          labels: {
            color: themeColors.legendColor,
            boxWidth: isMobile ? 10 : 12,
            boxHeight: isMobile ? 10 : 12,
            padding: isMobile ? 6 : 10,
            font: { size: isMobile ? 9 : 11 },
            generateLabels: (chart) => {
              const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              if (isMobile) {
                return original.map(label => {
                  // Shorten account names on mobile: keep first part and last 4 digits
                  let text = label.text;
                  const match = text.match(/\((\d+)\)$/);
                  if (match && text.length > 20) {
                    const acctNum = match[1];
                    const prefix = text.substring(0, 12).trim();
                    text = prefix + '..(' + acctNum + ')';
                  }
                  return { ...label, text };
                });
              }
              return original;
            }
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
          }
        },
        datalabels: { display: false }
      },
      scales: {
        x: { 
          stacked: stackBars,
          grid: { color: themeColors.gridColor },
          ticks: {
            color: themeColors.textColor,
            font: { size: isMobile ? 9 : 11 },
            maxRotation: isMobile ? 45 : 0,
            minRotation: isMobile ? 45 : 0
          }
        },
        y: {
          stacked: stackBars,
          min: yMin > 0 ? yMin : undefined,
          max: yMax,
          grid: { color: themeColors.gridColor },
          ticks: {
            color: themeColors.textColor,
            font: { size: isMobile ? 10 : 12 },
            callback: v => {
              if (Math.abs(v) >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
              if (Math.abs(v) >= 1000) return '$' + (v/1000).toFixed(0) + 'K';
              return '$' + v;
            }
          }
        }
      }
    }
  });
  
  // Update stats tiles
  updateCashStatsTiles(dates, chartAccountsConfig);
}

function updateCashStatsTiles(dates, accountsConfig) {
  const totals = dates.map(dateKey => {
    const balances = getBalanceForDate(dateKey);
    return {
      date: dateKey,
      total: accountsConfig.reduce((sum, cfg) => {
        return sum + cfg.accounts.reduce((s, a) => s + (balances[a.name] || 0), 0);
      }, 0)
    };
  });
  
  if (totals.length === 0) return;
  
  const avg = totals.reduce((sum, t) => sum + t.total, 0) / totals.length;
  const max = totals.reduce((m, t) => t.total > m.total ? t : m, totals[0]);
  const min = totals.reduce((m, t) => t.total < m.total ? t : m, totals[0]);
  
  const firstTotal = totals[0].total;
  const lastTotal = totals[totals.length - 1].total;
  const growth = firstTotal !== 0 ? ((lastTotal - firstTotal) / Math.abs(firstTotal)) * 100 : 0;
  
  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  // Animate the stat values
  animateCurrency(document.getElementById("cashAvgValue"), avg, 600);
  animateCurrency(document.getElementById("cashMaxValue"), max.total, 600);
  document.getElementById("cashMaxDate").textContent = formatDate(max.date);
  animateCurrency(document.getElementById("cashMinValue"), min.total, 600);
  document.getElementById("cashMinDate").textContent = formatDate(min.date);
  const growthEl = document.getElementById("cashGrowthValue");
  if (growthEl) {
    growthEl.className = growth < 0 ? "stat-value negative" : "stat-value";
  }
  animatePercent(growthEl, growth, 600);
}

function renderCashDailyTable() {
  const container = document.getElementById("dailyBalanceTableContainer");
  if (!container) return;
  
  // Build display columns - FTG combined + individual accounts
  const ftgBuildersSelected = cashSelectedAccounts.includes(FTG_BUILDERS_LABEL);
  const ftgAccounts = getFTGBuildersAccounts(cashData.accounts);
  const individualSelectedAccounts = cashData.accounts
    .filter(a => cashSelectedAccounts.includes(a.name) && !isFTGBuildersAccount(a.name))
    .sort((a, b) => b.balance - a.balance);
  
  // Build column config
  const columnConfig = [];
  
  if (ftgBuildersSelected && ftgAccounts.length > 0) {
    columnConfig.push({
      label: FTG_BUILDERS_LABEL,
      accounts: ftgAccounts
    });
  }
  
  individualSelectedAccounts.forEach(a => {
    columnConfig.push({
      label: a.name,
      accounts: [a]
    });
  });
  
  if (columnConfig.length === 0) {
    container.innerHTML = '<div class="error-message">Select accounts to view data</div>';
    return;
  }
  
  // Get dates in reverse order (newest first) for table display
  const dates = getCashDateRange().reverse();
  const today = new Date();
  
  const todayStr = today.toISOString().split('T')[0];
  
  const expandedClass = cashTableExpanded ? 'expanded' : '';
  const toggleText = cashTableExpanded ? 'Hide Accounts' : 'Show Accounts';
  const toggleIcon = cashTableExpanded ? '◀' : '▶';
  
  let html = `
    <div class="table-expand-toggle">
      <button class="table-expand-btn" onclick="toggleCashTableExpand()">
        <span class="expand-icon">${toggleIcon}</span> ${toggleText}
      </button>
    </div>
    <div class="daily-balance-table-wrapper">
      <table class="daily-balance-table ${expandedClass}">
        <thead>
          <tr>
            <th class="date-col">Date</th>
            ${columnConfig.map(cfg => `<th class="balance-col account-col">${cfg.label}</th>`).join('')}
            <th class="total-col">Total</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  dates.forEach((dateKey, idx) => {
    const balances = getBalanceForDate(dateKey);
    let rowTotal = 0;
    
    const dateObj = new Date(dateKey + 'T12:00:00');
    const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    const isToday = dateKey === todayStr;
    const rowClass = isToday ? 'today-row' : '';
    
    html += `<tr class="${rowClass}">`;
    html += `<td class="date-col">${isToday ? 'Today' : displayDate}</td>`;
    
    columnConfig.forEach(cfg => {
      // Sum balances for all accounts in this column
      const bal = cfg.accounts.reduce((sum, a) => sum + (balances[a.name] || 0), 0);
      rowTotal += bal;
      const balClass = bal < 0 ? 'negative' : '';
      html += `<td class="balance-col account-col ${balClass}">${formatCurrency(bal)}</td>`;
    });
    
    const totalClass = rowTotal < 0 ? 'negative' : '';
    html += `<td class="total-col ${totalClass}">${formatCurrency(rowTotal)}</td>`;
    html += `</tr>`;
  });
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function toggleCashTableExpand() {
  cashTableExpanded = !cashTableExpanded;
  renderCashDailyTable();
}

function renderCashTransactionTable() {
  const container = document.getElementById("transactionTableContainer");
  if (!container) return;
  
  // Get date range from the helper function
  const dateRange = getCashDateRange();
  const startDateStr = dateRange[0];
  const endDateStr = dateRange[dateRange.length - 1];
  
  const filteredTxns = cashData.transactions.filter(txn => {
    // Check if account is selected
    // FTG Builders accounts: if FTG_BUILDERS_LABEL is selected, include all FTG accounts
    const ftgBuildersSelected = cashSelectedAccounts.includes(FTG_BUILDERS_LABEL);
    const isFTG = isFTGBuildersAccount(txn.account);
    const isDirectlySelected = cashSelectedAccounts.includes(txn.account);
    
    if (!isDirectlySelected && !(ftgBuildersSelected && isFTG)) return false;
    
    // Check if within date range
    try {
      const txnDate = new Date(txn.date);
      const txnDateStr = txnDate.toISOString().split('T')[0];
      return txnDateStr >= startDateStr && txnDateStr <= endDateStr;
    } catch (e) {
      return false;
    }
  });
  
  // Sort by date descending (newest first)
  filteredTxns.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB - dateA;
  });
  
  if (filteredTxns.length === 0) {
    container.innerHTML = '<div class="error-message" style="padding:20px;text-align:center;color:#6b7280;">No transactions found for selected accounts in this date range</div>';
    return;
  }
  
  let html = `
    <table class="transaction-table resizable-table">
      <thead>
        <tr>
          <th>Date<span class="resize-handle"></span></th>
          <th>Account<span class="resize-handle"></span></th>
          <th>Description<span class="resize-handle"></span></th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  filteredTxns.forEach(txn => {
    const dateObj = new Date(txn.date);
    const displayDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    
    const amountClass = txn.amount >= 0 ? 'positive' : 'negative';
    const amountDisplay = formatCurrency(txn.amount);
    
    // Shorten account name for display
    let shortAccount = txn.account;
    const acctMatch = txn.account.match(/\((\d+)\)$/);
    if (acctMatch && txn.account.length > 25) {
      shortAccount = txn.account.substring(0, 18) + '..(' + acctMatch[1] + ')';
    }
    
    // Use description, fallback to payee if empty
    const descDisplay = txn.description || txn.payee || '-';
    
    html += `
      <tr>
        <td class="txn-date">${displayDate}</td>
        <td class="txn-account" title="${txn.account}">${shortAccount}</td>
        <td class="txn-description">${descDisplay}</td>
        <td class="txn-amount ${amountClass}">${amountDisplay}</td>
      </tr>
    `;
  });
  
  html += `</tbody></table>`;
  html += `<div style="padding:10px;text-align:center;color:#6b7280;font-size:12px;">${filteredTxns.length} transaction${filteredTxns.length !== 1 ? 's' : ''}</div>`;
  
  container.innerHTML = html;
  
  // Enable column resizing
  const table = container.querySelector('.resizable-table');
  if (table) {
    initTableColumnResize(table);
  }
}

function updateCashDataAsOf(accounts) {
  const el = document.getElementById("cashDataAsOf");
  if (el && accounts && accounts.length > 0) {
    const lastUpdate = accounts[0].lastUpdate;
    if (lastUpdate) {
      const date = new Date(lastUpdate);
      el.textContent = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } else {
      const now = new Date();
      el.textContent = now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }
}

function initTransactionFilter() {
  const filterInput = document.getElementById("transactionFilterInput");
  const clearBtn = document.getElementById("transactionFilterClear");
  
  if (filterInput) {
    filterInput.addEventListener("input", function() {
      filterTransactionTable(this.value);
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener("click", function() {
      if (filterInput) {
        filterInput.value = "";
        filterTransactionTable("");
      }
    });
  }
}

function filterTransactionTable(searchTerm) {
  const container = document.getElementById("transactionTableContainer");
  if (!container) return;
  
  const table = container.querySelector(".transaction-table");
  if (!table) return;
  
  const rows = table.querySelectorAll("tbody tr");
  const term = searchTerm.toLowerCase().trim();
  let visibleCount = 0;
  
  rows.forEach(row => {
    if (!term) {
      row.style.display = "";
      visibleCount++;
      return;
    }
    
    const text = row.textContent.toLowerCase();
    if (text.includes(term)) {
      row.style.display = "";
      visibleCount++;
    } else {
      row.style.display = "none";
    }
  });
  
  const countEl = container.querySelector("div[style*='text-align:center']");
  if (countEl && term) {
    countEl.textContent = `${visibleCount} matching transaction${visibleCount !== 1 ? 's' : ''} (filtered)`;
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initTransactionFilter();
  initCashExportButtons();
});

function initCashExportButtons() {
  document.getElementById("exportDailyBalancesBtn")?.addEventListener("click", exportDailyBalancesToExcel);
  document.getElementById("exportTransactionsBtn")?.addEventListener("click", exportTransactionsToExcel);
}

async function exportDailyBalancesToExcel() {
  if (typeof ExcelJS === "undefined") {
    alert("ExcelJS library not loaded. Please refresh the page and try again.");
    return;
  }
  
  const container = document.getElementById("dailyBalanceTableContainer");
  if (!container) {
    alert("Daily balances container not found.");
    return;
  }
  
  const table = container.querySelector(".daily-balance-table");
  if (!table) {
    alert("No data to export. Please wait for data to load.");
    return;
  }
  
  const tbody = table.querySelector("tbody");
  if (!tbody || tbody.querySelectorAll("tr").length === 0) {
    alert("No balance data available to export.");
    return;
  }
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Daily Balances");
  
  // Get headers
  const headers = [];
  table.querySelectorAll("thead th").forEach(th => {
    headers.push(th.textContent.trim());
  });
  
  // Add header row with styling
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    };
  });
  
  // Add data rows
  table.querySelectorAll("tbody tr").forEach(tr => {
    const rowData = [];
    tr.querySelectorAll("td").forEach((td, idx) => {
      let value = td.textContent.trim();
      if (idx > 0) {
        // Parse currency values
        const numMatch = value.replace(/[$,()]/g, '').trim();
        const num = parseFloat(numMatch);
        if (!isNaN(num)) {
          value = value.includes('(') ? -Math.abs(num) : num;
        }
      }
      rowData.push(value);
    });
    const dataRow = worksheet.addRow(rowData);
    
    // Style data cells
    dataRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
      if (colNumber > 1 && typeof cell.value === "number") {
        cell.numFmt = '"$"#,##0.00_);[Red]("$"#,##0.00)';
        if (cell.value < 0) {
          cell.font = { color: { argb: "FFDC2626" } };
        }
      }
    });
  });
  
  // Auto-fit columns
  worksheet.columns.forEach((column, idx) => {
    column.width = idx === 0 ? 15 : 18;
  });
  
  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateRange = document.getElementById("cashDaysRange")?.value || "30";
  a.download = `Daily_Cash_Balances_${dateRange}_days_${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------
   RESIZABLE TABLE COLUMNS
-------------------------------------------------------- */
function saveColumnWidths(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const headers = table.querySelectorAll('thead th');
  const widths = [];
  headers.forEach(th => {
    widths.push(th.offsetWidth);
  });
  
  localStorage.setItem(`ftg_colWidths_${tableId}`, JSON.stringify(widths));
}

function loadColumnWidths(tableId) {
  const saved = localStorage.getItem(`ftg_colWidths_${tableId}`);
  if (!saved) return null;
  
  try {
    return JSON.parse(saved);
  } catch (e) {
    return null;
  }
}

function autoSizeColumns(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const headers = table.querySelectorAll('thead th');
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  
  // Use requestAnimationFrame to avoid blocking
  requestAnimationFrame(() => {
    const tempSpan = document.createElement('span');
    tempSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit;padding:0;';
    document.body.appendChild(tempSpan);
    
    // Cache computed styles to reduce reflows
    const headerFont = headers.length > 0 ? window.getComputedStyle(headers[0]).font : '13px Inter, sans-serif';
    
    headers.forEach((th, idx) => {
      let maxWidth = 0;
      
      // Measure header text
      const headerText = th.textContent.replace(/[\u2195\u2194]/g, '').trim();
      tempSpan.style.font = headerFont;
      tempSpan.style.fontWeight = 'bold';
      tempSpan.textContent = headerText;
      maxWidth = Math.max(maxWidth, tempSpan.offsetWidth + 40);
      
      // Sample only first 10 rows for performance
      const cells = tbody.querySelectorAll(`tr:not(.is-row-hidden) td:nth-child(${idx + 1})`);
      const sampleSize = Math.min(cells.length, 10);
      for (let i = 0; i < sampleSize; i++) {
        const cell = cells[i];
        const text = cell.textContent.trim();
        const indent = cell.style.paddingLeft ? parseInt(cell.style.paddingLeft) : 0;
        tempSpan.textContent = text;
        const cellWidth = tempSpan.offsetWidth + indent + 24;
        maxWidth = Math.max(maxWidth, cellWidth);
      }
      
      // Apply constraints
      const minWidth = idx === 0 ? 120 : 60;
      const maxAllowed = idx === 0 ? 350 : 200;
      const finalWidth = Math.min(Math.max(maxWidth, minWidth), maxAllowed);
      
      th.style.width = finalWidth + 'px';
      th.style.minWidth = finalWidth + 'px';
      th.style.maxWidth = finalWidth + 'px';
    });
    
    document.body.removeChild(tempSpan);
  });
}

function initTableColumnResize(table) {
  if (!table) return;
  
  const tableId = table.id;
  const headers = table.querySelectorAll('th');
  
  headers.forEach((th, idx) => {
    const handle = th.querySelector('.resize-handle');
    if (!handle) return;
    
    let startX, startWidth, column, colIndex;
    
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.pageX;
      column = th;
      colIndex = idx;
      startWidth = column.offsetWidth;
      
      handle.classList.add('resizing');
      table.classList.add('resizing');
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    function onMouseMove(e) {
      if (!column) return;
      const diff = e.pageX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      column.style.width = newWidth + 'px';
      column.style.minWidth = newWidth + 'px';
      column.style.maxWidth = newWidth + 'px';
    }
    
    function onMouseUp() {
      handle.classList.remove('resizing');
      table.classList.remove('resizing');
      column = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Save column widths to localStorage
      saveColumnWidths(tableId);
    }
  });
}

function addResizeHandlesToTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const headers = table.querySelectorAll('thead th');
  
  // Try to load saved widths first
  const savedWidths = loadColumnWidths(tableId);
  
  if (savedWidths && savedWidths.length === headers.length) {
    // Apply saved widths
    headers.forEach((th, idx) => {
      th.style.width = savedWidths[idx] + 'px';
      th.style.minWidth = savedWidths[idx] + 'px';
      th.style.maxWidth = savedWidths[idx] + 'px';
    });
  } else {
    // Auto-size columns based on content
    autoSizeColumns(tableId);
  }
  
  // Add resize handles
  headers.forEach((th, idx) => {
    // Don't add to last column
    if (idx < headers.length - 1) {
      // Only add if not already present
      if (!th.querySelector('.resize-handle')) {
        const handle = document.createElement('span');
        handle.className = 'resize-handle';
        handle.title = 'Drag to resize column';
        th.style.position = 'relative';
        th.appendChild(handle);
      }
    }
  });
  
  initTableColumnResize(table);
}

async function exportTransactionsToExcel() {
  if (typeof ExcelJS === "undefined") {
    alert("ExcelJS library not loaded. Please refresh the page and try again.");
    return;
  }
  
  const container = document.getElementById("transactionTableContainer");
  if (!container) {
    alert("Transactions container not found.");
    return;
  }
  
  const table = container.querySelector(".transaction-table");
  if (!table) {
    alert("No transactions to export. Please select accounts and a date range.");
    return;
  }
  
  const tbody = table.querySelector("tbody");
  const visibleRows = tbody ? Array.from(tbody.querySelectorAll("tr")).filter(tr => tr.style.display !== "none") : [];
  if (visibleRows.length === 0) {
    alert("No transactions match your current filter.");
    return;
  }
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Transactions");
  
  // Get headers
  const headers = [];
  table.querySelectorAll("thead th").forEach(th => {
    headers.push(th.textContent.trim());
  });
  
  // Add header row with styling
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10B981" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    };
  });
  
  // Add data rows (only visible ones if filtered)
  table.querySelectorAll("tbody tr").forEach(tr => {
    if (tr.style.display === "none") return; // Skip hidden rows
    
    const rowData = [];
    tr.querySelectorAll("td").forEach((td, idx) => {
      let value = td.textContent.trim();
      // Amount column (last column)
      if (idx === 3) {
        const numMatch = value.replace(/[$,()]/g, '').trim();
        const num = parseFloat(numMatch);
        if (!isNaN(num)) {
          value = value.includes('(') || td.classList.contains('negative') ? -Math.abs(num) : num;
        }
      }
      rowData.push(value);
    });
    const dataRow = worksheet.addRow(rowData);
    
    // Style data cells
    dataRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
      // Format amount column
      if (colNumber === 4 && typeof cell.value === "number") {
        cell.numFmt = '"$"#,##0.00_);[Red]("$"#,##0.00)';
        if (cell.value < 0) {
          cell.font = { color: { argb: "FFDC2626" } };
        } else {
          cell.font = { color: { argb: "FF10B981" } };
        }
      }
    });
  });
  
  // Auto-fit columns
  worksheet.columns = [
    { width: 15 },  // Date
    { width: 30 },  // Account
    { width: 45 },  // Description
    { width: 15 }   // Amount
  ];
  
  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Cash_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========================================
// JOB BUDGETS MODULE
// ========================================

let jobBudgetsData = [];
let jobBudgetsFiltered = [];
let jobBudgetsCurrentPage = 1;
let jobBudgetsPageSize = 25;
let jobBudgetsSortColumn = 'revised_contract';
let jobBudgetsSortDirection = 'desc';
let jobBudgetsInitialized = false;

function initJobBudgets() {
  if (jobBudgetsInitialized && jobBudgetsData.length > 0) {
    renderJobBudgetsTable();
    return;
  }
  
  // Open config panel by default for Job Budgets
  const configHeader = document.querySelector('#jobBudgets .config-header');
  const configBody = document.getElementById('jobBudgetsConfigBody');
  if (configHeader && configBody) {
    configHeader.classList.remove('collapsed');
    configBody.classList.remove('collapsed');
  }
  
  loadJobBudgetsData();
  setupJobBudgetsEventListeners();
  jobBudgetsInitialized = true;
}

function setupJobBudgetsEventListeners() {
  // Status checkboxes
  document.getElementById('jobStatusActive')?.addEventListener('change', filterJobBudgets);
  document.getElementById('jobStatusInactive')?.addEventListener('change', filterJobBudgets);
  document.getElementById('jobStatusClosed')?.addEventListener('change', filterJobBudgets);
  document.getElementById('jobStatusOverhead')?.addEventListener('change', filterJobBudgets);
  
  // Filter dropdowns
  document.getElementById('jobPmFilter')?.addEventListener('change', filterJobBudgets);
  document.getElementById('jobCustomerFilter')?.addEventListener('change', filterJobBudgets);
  
  // Search input with debounce
  const searchInput = document.getElementById('jobSearchInput');
  let searchTimeout;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterJobBudgets, 300);
  });
  
  // Pagination
  document.getElementById('jobPrevPage')?.addEventListener('click', () => {
    if (jobBudgetsCurrentPage > 1) {
      jobBudgetsCurrentPage--;
      renderJobBudgetsTable();
    }
  });
  
  document.getElementById('jobNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(jobBudgetsFiltered.length / jobBudgetsPageSize);
    if (jobBudgetsCurrentPage < totalPages) {
      jobBudgetsCurrentPage++;
      renderJobBudgetsTable();
    }
  });
  
  document.getElementById('jobPageSize')?.addEventListener('change', (e) => {
    jobBudgetsPageSize = parseInt(e.target.value);
    jobBudgetsCurrentPage = 1;
    renderJobBudgetsTable();
  });
  
  // Table header sorting
  document.querySelectorAll('.job-budgets-table th.sortable').forEach(th => {
    th.addEventListener('click', (e) => {
      // Don't sort if clicking on expand icon
      if (e.target.classList.contains('expand-icon')) return;
      
      const col = th.dataset.sort;
      if (jobBudgetsSortColumn === col) {
        jobBudgetsSortDirection = jobBudgetsSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        jobBudgetsSortColumn = col;
        jobBudgetsSortDirection = 'asc';
      }
      sortJobBudgets();
      renderJobBudgetsTable();
    });
  });
  
  // Expandable column toggles
  document.querySelectorAll('.job-budgets-table .expand-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = icon.dataset.expand;
      const detailClass = type === 'contract' ? 'contract-detail-col' : 'cost-detail-col';
      
      icon.classList.toggle('expanded');
      
      // Toggle visibility of detail columns
      document.querySelectorAll(`.job-budgets-table .${detailClass}`).forEach(el => {
        el.classList.toggle('hidden');
      });
    });
  });
  
  // Quick sort buttons
  document.querySelectorAll('#jobBudgets .quick-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sortCol = btn.dataset.sort;
      const sortDir = btn.dataset.dir;
      
      // Update active state
      document.querySelectorAll('#jobBudgets .quick-sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Set sort and re-render
      jobBudgetsSortColumn = sortCol;
      jobBudgetsSortDirection = sortDir;
      jobBudgetsCurrentPage = 1;
      sortJobBudgets();
      renderJobBudgetsTable();
    });
  });
  
  // Breakdown table expand/collapse buttons
  document.querySelectorAll('.breakdown-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const tableWrapper = document.getElementById(targetId);
      const textSpan = btn.querySelector('.expand-text');
      const chartBox = btn.closest('.chart-box');
      
      if (tableWrapper) {
        const isCollapsed = tableWrapper.classList.contains('collapsed');
        tableWrapper.classList.toggle('collapsed');
        btn.classList.toggle('expanded');
        
        // Toggle table-expanded class on parent chart-box for desktop expansion
        if (chartBox) {
          chartBox.classList.toggle('table-expanded', isCollapsed);
        }
        
        if (textSpan) {
          textSpan.textContent = isCollapsed ? 'Collapse' : 'Expand';
        }
      }
    });
  });
}

async function loadJobBudgetsData() {
  const loadingOverlay = document.getElementById('jobBudgetsLoadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  
  try {
    const resp = await fetch('data/financials_jobs.json');
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    
    jobBudgetsData = (data.job_budgets || []).map(job => ({
      ...job,
      original_contract: parseFloat(job.original_contract) || 0,
      tot_income_adj: parseFloat(job.tot_income_adj) || 0,
      revised_contract: parseFloat(job.revised_contract) || 0,
      original_cost: parseFloat(job.original_cost) || 0,
      tot_cost_adj: parseFloat(job.tot_cost_adj) || 0,
      revised_cost: parseFloat(job.revised_cost) || 0,
      estimated_profit: (parseFloat(job.revised_contract) || 0) - (parseFloat(job.revised_cost) || 0)
    }));
    
    // Populate filter dropdowns
    populateJobFilters();
    
    // Set data as of date
    const dataAsOf = document.getElementById('jobBudgetsDataAsOf');
    if (dataAsOf && data.generated_at) {
      dataAsOf.textContent = new Date(data.generated_at).toLocaleDateString();
    }
    
    // Apply initial filter (Active only by default)
    filterJobBudgets();
  } catch (err) {
    console.error('Error loading job budgets:', err);
    document.getElementById('jobBudgetsTableBody').innerHTML = 
      '<tr><td colspan="12" class="loading-cell">Error loading job data</td></tr>';
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

function populateJobFilters() {
  // Project Managers
  const pmFilter = document.getElementById('jobPmFilter');
  if (pmFilter) {
    const pms = [...new Set(jobBudgetsData.map(j => j.project_manager_name).filter(Boolean))].sort();
    pmFilter.innerHTML = '<option value="">All Project Managers</option>' + 
      pms.map(pm => `<option value="${pm}">${pm}</option>`).join('');
  }
  
  // Customers
  const custFilter = document.getElementById('jobCustomerFilter');
  if (custFilter) {
    const customers = [...new Set(jobBudgetsData.map(j => j.customer_name).filter(Boolean))].sort();
    custFilter.innerHTML = '<option value="">All Clients</option>' + 
      customers.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function getMarginColor(margin) {
  // Returns background color based on profit margin
  // High margins (30%+) = green, 0% = yellow, negative = pinkish red
  if (margin >= 30) return 'rgba(16, 185, 129, 0.4)'; // Strong green
  if (margin >= 20) return 'rgba(16, 185, 129, 0.3)'; // Medium green
  if (margin >= 10) return 'rgba(16, 185, 129, 0.2)'; // Light green
  if (margin >= 5) return 'rgba(234, 179, 8, 0.2)'; // Light yellow-green
  if (margin >= 0) return 'rgba(234, 179, 8, 0.3)'; // Yellow
  if (margin >= -10) return 'rgba(239, 68, 68, 0.2)'; // Light pinkish red
  if (margin >= -20) return 'rgba(239, 68, 68, 0.3)'; // Medium pinkish red
  return 'rgba(239, 68, 68, 0.4)'; // Strong pinkish red
}

function getJobStatusLabel(status) {
  const statusMap = {
    'A': { label: 'Active', class: 'active' },
    'I': { label: 'Inactive', class: 'inactive' },
    'C': { label: 'Closed', class: 'closed' },
    'O': { label: 'Overhead', class: 'overhead' }
  };
  return statusMap[status] || { label: status, class: '' };
}

function filterJobBudgets() {
  const showActive = document.getElementById('jobStatusActive')?.checked;
  const showInactive = document.getElementById('jobStatusInactive')?.checked;
  const showClosed = document.getElementById('jobStatusClosed')?.checked;
  const showOverhead = document.getElementById('jobStatusOverhead')?.checked;
  
  const pmFilter = document.getElementById('jobPmFilter')?.value || '';
  const custFilter = document.getElementById('jobCustomerFilter')?.value || '';
  const searchTerm = (document.getElementById('jobSearchInput')?.value || '').toLowerCase().trim();
  
  const allowedStatuses = [];
  if (showActive) allowedStatuses.push('A');
  if (showInactive) allowedStatuses.push('I');
  if (showClosed) allowedStatuses.push('C');
  if (showOverhead) allowedStatuses.push('O');
  
  jobBudgetsFiltered = jobBudgetsData.filter(job => {
    // Status filter
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(job.job_status)) return false;
    
    // PM filter
    if (pmFilter && job.project_manager_name !== pmFilter) return false;
    
    // Customer filter
    if (custFilter && job.customer_name !== custFilter) return false;
    
    // Search filter
    if (searchTerm) {
      const searchStr = `${job.job_no} ${job.job_description} ${job.customer_name}`.toLowerCase();
      if (!searchStr.includes(searchTerm)) return false;
    }
    
    return true;
  });
  
  jobBudgetsCurrentPage = 1;
  sortJobBudgets();
  updateJobSummaryMetrics();
  renderJobBudgetsTable();
}

function sortJobBudgets() {
  const col = jobBudgetsSortColumn;
  const dir = jobBudgetsSortDirection === 'asc' ? 1 : -1;
  
  jobBudgetsFiltered.sort((a, b) => {
    let aVal = a[col];
    let bVal = b[col];
    
    // Handle profit_margin (calculated field)
    if (col === 'profit_margin') {
      const aMargin = a.revised_contract ? (a.estimated_profit / a.revised_contract) * 100 : 0;
      const bMargin = b.revised_contract ? (b.estimated_profit / b.revised_contract) * 100 : 0;
      return (aMargin - bMargin) * dir;
    }
    
    // Numeric columns
    if (['original_contract', 'tot_income_adj', 'revised_contract', 'original_cost', 
         'tot_cost_adj', 'revised_cost', 'estimated_profit'].includes(col)) {
      return (aVal - bVal) * dir;
    }
    
    // String columns
    aVal = (aVal || '').toString().toLowerCase();
    bVal = (bVal || '').toString().toLowerCase();
    return aVal.localeCompare(bVal) * dir;
  });
}

function updateJobSummaryMetrics() {
  const totalJobs = jobBudgetsFiltered.length;
  const totalContract = jobBudgetsFiltered.reduce((sum, j) => sum + j.revised_contract, 0);
  const totalCost = jobBudgetsFiltered.reduce((sum, j) => sum + j.revised_cost, 0);
  const totalProfit = jobBudgetsFiltered.reduce((sum, j) => sum + j.estimated_profit, 0);
  
  // Calculate avg margin excluding jobs with zero revised_contract OR zero revised_cost
  const jobsWithValidMargin = jobBudgetsFiltered.filter(j => 
    parseFloat(j.revised_contract) > 0 && parseFloat(j.revised_cost) > 0
  );
  const avgMargin = jobsWithValidMargin.length > 0 
    ? jobsWithValidMargin.reduce((sum, j) => {
        const rc = parseFloat(j.revised_contract) || 0;
        const ep = parseFloat(j.estimated_profit) || 0;
        return sum + (ep / rc) * 100;
      }, 0) / jobsWithValidMargin.length
    : 0;
  
  document.getElementById('jobTotalCount').textContent = totalJobs.toLocaleString();
  document.getElementById('jobTotalContract').textContent = formatCurrencyCompact(totalContract);
  document.getElementById('jobTotalCost').textContent = formatCurrencyCompact(totalCost);
  
  const profitEl = document.getElementById('jobTotalProfit');
  profitEl.textContent = formatCurrencyCompact(totalProfit);
  profitEl.className = 'metric-value ' + (totalProfit >= 0 ? '' : 'negative');
  
  const marginEl = document.getElementById('jobAvgMargin');
  marginEl.textContent = avgMargin.toFixed(1) + '%';
  marginEl.className = 'metric-value ' + (avgMargin >= 0 ? '' : 'negative');
  
  // Render breakdowns
  renderJobBreakdowns();
}

let pmDonutChart = null;
let customerDonutChart = null;

const chartColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#94a3b8' // Gray for "Other"
];

function renderJobBreakdowns() {
  renderJobBreakdownByPm();
  renderJobBreakdownByCustomer();
  renderPmDonutChart();
  renderCustomerDonutChart();
}

function renderPmDonutChart() {
  const canvas = document.getElementById('pmDonutChart');
  if (!canvas) return;
  
  // Aggregate by Project Manager
  const pmMap = new Map();
  jobBudgetsFiltered.forEach(job => {
    const pm = job.project_manager_name || 'Unassigned';
    if (!pmMap.has(pm)) {
      pmMap.set(pm, 0);
    }
    pmMap.set(pm, pmMap.get(pm) + job.revised_contract);
  });
  
  // Sort by contract value and get top 10
  const sorted = [...pmMap.entries()]
    .sort((a, b) => b[1] - a[1]);
  
  const top10 = sorted.slice(0, 10);
  const otherTotal = sorted.slice(10).reduce((sum, [, val]) => sum + val, 0);
  
  const labels = top10.map(([name]) => name);
  const data = top10.map(([, val]) => val);
  
  if (otherTotal > 0) {
    labels.push('Other');
    data.push(otherTotal);
  }
  
  const isDarkMode = document.body.classList.contains('dark-mode');
  const isMobile = window.innerWidth <= 768;
  
  if (pmDonutChart) {
    pmDonutChart.destroy();
  }
  
  pmDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: chartColors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: isDarkMode ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: isDarkMode ? '#e2e8f0' : '#374151',
            font: { size: isMobile ? 10 : 11 },
            boxWidth: isMobile ? 10 : 12,
            padding: isMobile ? 6 : 8
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((value / total) * 100).toFixed(1);
              return `${formatCurrencyCompact(value)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderCustomerDonutChart() {
  const canvas = document.getElementById('customerDonutChart');
  if (!canvas) return;
  
  // Aggregate by Customer
  const custMap = new Map();
  jobBudgetsFiltered.forEach(job => {
    const cust = job.customer_name || 'Unknown';
    if (!custMap.has(cust)) {
      custMap.set(cust, 0);
    }
    custMap.set(cust, custMap.get(cust) + job.revised_contract);
  });
  
  // Sort by contract value and get top 10
  const sorted = [...custMap.entries()]
    .sort((a, b) => b[1] - a[1]);
  
  const top10 = sorted.slice(0, 10);
  const otherTotal = sorted.slice(10).reduce((sum, [, val]) => sum + val, 0);
  
  const labels = top10.map(([name]) => name);
  const data = top10.map(([, val]) => val);
  
  if (otherTotal > 0) {
    labels.push('Other');
    data.push(otherTotal);
  }
  
  const isDarkMode = document.body.classList.contains('dark-mode');
  const isMobile = window.innerWidth <= 768;
  
  if (customerDonutChart) {
    customerDonutChart.destroy();
  }
  
  customerDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: chartColors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: isDarkMode ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: isDarkMode ? '#e2e8f0' : '#374151',
            font: { size: isMobile ? 10 : 11 },
            boxWidth: isMobile ? 10 : 12,
            padding: isMobile ? 6 : 8
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((value / total) * 100).toFixed(1);
              return `${formatCurrencyCompact(value)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderJobBreakdownByPm() {
  const tbody = document.getElementById('jobPmBreakdownBody');
  if (!tbody) return;
  
  // Aggregate by Project Manager
  const pmMap = new Map();
  jobBudgetsFiltered.forEach(job => {
    const pm = job.project_manager_name || 'Unassigned';
    if (!pmMap.has(pm)) {
      pmMap.set(pm, { jobs: 0, contract: 0, cost: 0, profit: 0 });
    }
    const data = pmMap.get(pm);
    data.jobs++;
    data.contract += job.revised_contract;
    data.cost += job.revised_cost;
    data.profit += job.estimated_profit;
  });
  
  // Sort by contract value descending
  const sorted = [...pmMap.entries()]
    .map(([pm, data]) => ({
      name: pm,
      ...data,
      margin: data.contract > 0 ? (data.profit / data.contract) * 100 : 0
    }))
    .sort((a, b) => b.contract - a.contract);
  
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No data</td></tr>';
    return;
  }
  
  // Top 10 + Other (like the donut chart)
  const top10 = sorted.slice(0, 10);
  const others = sorted.slice(10);
  
  let displayRows = [...top10];
  if (others.length > 0) {
    const otherData = others.reduce((acc, row) => ({
      name: 'Other',
      jobs: acc.jobs + row.jobs,
      contract: acc.contract + row.contract,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit
    }), { name: 'Other', jobs: 0, contract: 0, cost: 0, profit: 0 });
    otherData.margin = otherData.contract > 0 ? (otherData.profit / otherData.contract) * 100 : 0;
    displayRows.push(otherData);
  }
  
  // Calculate totals for subtotal row
  const totals = displayRows.reduce((acc, row) => ({
    jobs: acc.jobs + row.jobs,
    contract: acc.contract + row.contract,
    cost: acc.cost + row.cost,
    profit: acc.profit + row.profit
  }), { jobs: 0, contract: 0, cost: 0, profit: 0 });
  totals.margin = totals.contract > 0 ? (totals.profit / totals.contract) * 100 : 0;
  
  const rowsHtml = displayRows.map(row => {
    const profitClass = row.profit >= 0 ? 'positive' : 'negative';
    const marginColor = getMarginColor(row.margin);
    return `<tr>
      <td>${row.name}</td>
      <td class="number-col">${row.jobs}</td>
      <td class="number-col">${formatCurrencyCompact(row.contract)}</td>
      <td class="number-col">${formatCurrencyCompact(row.cost)}</td>
      <td class="number-col ${profitClass}">${formatCurrencyCompact(row.profit)}</td>
      <td class="number-col margin-cell" style="background-color: ${marginColor}">${row.margin.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  
  const totalProfitClass = totals.profit >= 0 ? 'positive' : 'negative';
  const totalMarginColor = getMarginColor(totals.margin);
  const subtotalHtml = `<tr class="subtotal-row">
    <td><strong>Total</strong></td>
    <td class="number-col"><strong>${totals.jobs}</strong></td>
    <td class="number-col"><strong>${formatCurrencyCompact(totals.contract)}</strong></td>
    <td class="number-col"><strong>${formatCurrencyCompact(totals.cost)}</strong></td>
    <td class="number-col ${totalProfitClass}"><strong>${formatCurrencyCompact(totals.profit)}</strong></td>
    <td class="number-col margin-cell" style="background-color: ${totalMarginColor}"><strong>${totals.margin.toFixed(1)}%</strong></td>
  </tr>`;
  
  tbody.innerHTML = rowsHtml + subtotalHtml;
  
  // Apply dark mode styles after PM breakdown renders
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  applyJobBudgetsDarkModeStyles(currentTheme);
}

function renderJobBreakdownByCustomer() {
  const tbody = document.getElementById('jobCustomerBreakdownBody');
  if (!tbody) return;
  
  // Aggregate by Customer
  const custMap = new Map();
  jobBudgetsFiltered.forEach(job => {
    const cust = job.customer_name || 'Unknown';
    if (!custMap.has(cust)) {
      custMap.set(cust, { jobs: 0, contract: 0, cost: 0, profit: 0 });
    }
    const data = custMap.get(cust);
    data.jobs++;
    data.contract += job.revised_contract;
    data.cost += job.revised_cost;
    data.profit += job.estimated_profit;
  });
  
  // Sort by contract value descending
  const sorted = [...custMap.entries()]
    .map(([cust, data]) => ({
      name: cust,
      ...data,
      margin: data.contract > 0 ? (data.profit / data.contract) * 100 : 0
    }))
    .sort((a, b) => b.contract - a.contract);
  
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No data</td></tr>';
    return;
  }
  
  // Top 10 + Other (like the donut chart)
  const top10 = sorted.slice(0, 10);
  const others = sorted.slice(10);
  
  let displayRows = [...top10];
  if (others.length > 0) {
    const otherData = others.reduce((acc, row) => ({
      name: 'Other',
      jobs: acc.jobs + row.jobs,
      contract: acc.contract + row.contract,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit
    }), { name: 'Other', jobs: 0, contract: 0, cost: 0, profit: 0 });
    otherData.margin = otherData.contract > 0 ? (otherData.profit / otherData.contract) * 100 : 0;
    displayRows.push(otherData);
  }
  
  // Calculate totals for subtotal row
  const totals = displayRows.reduce((acc, row) => ({
    jobs: acc.jobs + row.jobs,
    contract: acc.contract + row.contract,
    cost: acc.cost + row.cost,
    profit: acc.profit + row.profit
  }), { jobs: 0, contract: 0, cost: 0, profit: 0 });
  totals.margin = totals.contract > 0 ? (totals.profit / totals.contract) * 100 : 0;
  
  const rowsHtml = displayRows.map(row => {
    const profitClass = row.profit >= 0 ? 'positive' : 'negative';
    const marginColor = getMarginColor(row.margin);
    return `<tr>
      <td>${row.name}</td>
      <td class="number-col">${row.jobs}</td>
      <td class="number-col">${formatCurrencyCompact(row.contract)}</td>
      <td class="number-col">${formatCurrencyCompact(row.cost)}</td>
      <td class="number-col ${profitClass}">${formatCurrencyCompact(row.profit)}</td>
      <td class="number-col margin-cell" style="background-color: ${marginColor}">${row.margin.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  
  const totalProfitClass = totals.profit >= 0 ? 'positive' : 'negative';
  const totalMarginColor = getMarginColor(totals.margin);
  const subtotalHtml = `<tr class="subtotal-row">
    <td><strong>Total</strong></td>
    <td class="number-col"><strong>${totals.jobs}</strong></td>
    <td class="number-col"><strong>${formatCurrencyCompact(totals.contract)}</strong></td>
    <td class="number-col"><strong>${formatCurrencyCompact(totals.cost)}</strong></td>
    <td class="number-col ${totalProfitClass}"><strong>${formatCurrencyCompact(totals.profit)}</strong></td>
    <td class="number-col margin-cell" style="background-color: ${totalMarginColor}"><strong>${totals.margin.toFixed(1)}%</strong></td>
  </tr>`;
  
  tbody.innerHTML = rowsHtml + subtotalHtml;
  
  // Apply dark mode styles after Customer breakdown renders
  const currentTheme2 = document.documentElement.getAttribute("data-theme") || "light";
  applyJobBudgetsDarkModeStyles(currentTheme2);
}

function formatCurrencyCompact(value) {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue >= 1000000) {
    return sign + '$' + (absValue / 1000000).toFixed(1) + 'M';
  } else if (absValue >= 1000) {
    return sign + '$' + (absValue / 1000).toFixed(0) + 'K';
  } else {
    return sign + '$' + absValue.toFixed(0);
  }
}

function renderJobBudgetsTable() {
  const tbody = document.getElementById('jobBudgetsTableBody');
  if (!tbody) return;
  
  // Update sort indicators
  document.querySelectorAll('.job-budgets-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === jobBudgetsSortColumn) {
      th.classList.add(jobBudgetsSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
  
  const start = (jobBudgetsCurrentPage - 1) * jobBudgetsPageSize;
  const end = start + jobBudgetsPageSize;
  const pageData = jobBudgetsFiltered.slice(start, end);
  
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="loading-cell">No jobs match the current filters</td></tr>';
    updateJobPagination(0);
    return;
  }
  
  // Check if columns are expanded
  const contractExpanded = document.querySelector('.expand-icon[data-expand="contract"]')?.classList.contains('expanded');
  const costExpanded = document.querySelector('.expand-icon[data-expand="cost"]')?.classList.contains('expanded');
  const contractHidden = contractExpanded ? '' : 'hidden';
  const costHidden = costExpanded ? '' : 'hidden';
  
  // Calculate totals for ALL filtered data (not just current page)
  const allTotals = {
    originalContract: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.original_contract) || 0), 0),
    changeOrders: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.tot_income_adj) || 0), 0),
    revisedContract: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.revised_contract) || 0), 0),
    originalCost: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.original_cost) || 0), 0),
    costAdj: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.tot_cost_adj) || 0), 0),
    revisedCost: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.revised_cost) || 0), 0),
    estimatedProfit: jobBudgetsFiltered.reduce((sum, j) => sum + (parseFloat(j.estimated_profit) || 0), 0)
  };
  // Calculate average margin as arithmetic mean of individual job margins
  // Exclude jobs with zero revised_contract OR zero revised_cost
  const jobsWithMargin = jobBudgetsFiltered.filter(j => 
    parseFloat(j.revised_contract) > 0 && parseFloat(j.revised_cost) > 0
  );
  const avgMargin = jobsWithMargin.length > 0 
    ? jobsWithMargin.reduce((sum, j) => {
        const rc = parseFloat(j.revised_contract) || 0;
        const ep = parseFloat(j.estimated_profit) || 0;
        return sum + (ep / rc) * 100;
      }, 0) / jobsWithMargin.length
    : 0;
  const totalProfitClass = allTotals.estimatedProfit >= 0 ? 'positive' : 'negative';
  const totalMarginColor = getMarginColor(avgMargin);
  
  const totalsRowHtml = `<tr class="totals-row">
    <td colspan="5"><strong>Totals (${jobBudgetsFiltered.length} jobs)</strong></td>
    <td class="number-col contract-detail-col ${contractHidden}"><strong>${formatCurrency(allTotals.originalContract)}</strong></td>
    <td class="number-col contract-detail-col ${contractHidden}"><strong>${formatCurrency(allTotals.changeOrders)}</strong></td>
    <td class="number-col revised-contract-col"><strong>${formatCurrency(allTotals.revisedContract)}</strong></td>
    <td class="number-col cost-detail-col ${costHidden}"><strong>${formatCurrency(allTotals.originalCost)}</strong></td>
    <td class="number-col cost-detail-col ${costHidden}"><strong>${formatCurrency(allTotals.costAdj)}</strong></td>
    <td class="number-col revised-cost-col"><strong>${formatCurrency(allTotals.revisedCost)}</strong></td>
    <td class="number-col ${totalProfitClass}"><strong>${formatCurrency(allTotals.estimatedProfit)}</strong></td>
    <td class="number-col" style="background-color: ${totalMarginColor}"><strong>${avgMargin.toFixed(1)}%</strong></td>
  </tr>`;
  
  const dataRowsHtml = pageData.map(job => {
    const status = getJobStatusLabel(job.job_status);
    const profitClass = job.estimated_profit >= 0 ? 'positive' : 'negative';
    
    // Only calculate margin if both revised_contract AND revised_cost are non-zero
    const hasValidMargin = job.revised_contract > 0 && job.revised_cost > 0;
    const margin = hasValidMargin ? (job.estimated_profit / job.revised_contract) * 100 : null;
    const marginColor = hasValidMargin ? getMarginColor(margin) : 'transparent';
    const marginDisplay = hasValidMargin ? `${margin.toFixed(1)}%` : '-';
    
    return `<tr>
      <td>${job.job_no}</td>
      <td>${job.job_description || ''}</td>
      <td>${job.customer_name || ''}</td>
      <td><span class="job-status-badge ${status.class}">${status.label}</span></td>
      <td>${job.project_manager_name || ''}</td>
      <td class="number-col contract-detail-col ${contractHidden}">${formatCurrency(job.original_contract)}</td>
      <td class="number-col contract-detail-col ${contractHidden}">${formatCurrency(job.tot_income_adj)}</td>
      <td class="number-col revised-contract-col">${formatCurrency(job.revised_contract)}</td>
      <td class="number-col cost-detail-col ${costHidden}">${formatCurrency(job.original_cost)}</td>
      <td class="number-col cost-detail-col ${costHidden}">${formatCurrency(job.tot_cost_adj)}</td>
      <td class="number-col revised-cost-col">${formatCurrency(job.revised_cost)}</td>
      <td class="number-col ${profitClass}">${formatCurrency(job.estimated_profit)}</td>
      <td class="number-col" style="background-color: ${marginColor}">${marginDisplay}</td>
    </tr>`;
  }).join('');
  
  tbody.innerHTML = totalsRowHtml + dataRowsHtml;
  
  updateJobPagination(jobBudgetsFiltered.length);
  
  // Apply dark mode styles after rendering
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  applyJobBudgetsDarkModeStyles(currentTheme);
}

function updateJobPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / jobBudgetsPageSize));
  
  document.getElementById('jobPageInfo').textContent = `Page ${jobBudgetsCurrentPage} of ${totalPages}`;
  document.getElementById('jobPrevPage').disabled = jobBudgetsCurrentPage <= 1;
  document.getElementById('jobNextPage').disabled = jobBudgetsCurrentPage >= totalPages;
}

// ========================================
// JOB OVERVIEW MODULE
// ========================================

let joData = [];
let joFiltered = [];
let joPmJobsChart = null;
let joPmContractChart = null;
let joPmMarginChart = null;
let joClientJobsChart = null;
let joClientContractChart = null;
let joClientMarginChart = null;
let joInitialized = false;

function initJobOverview() {
  if (joInitialized && joData.length > 0) {
    updateJobOverviewCharts();
    return;
  }
  
  const configHeader = document.querySelector('#jobOverview .config-header');
  const configBody = document.getElementById('jobOverviewConfigBody');
  if (configHeader && configBody) {
    configHeader.classList.remove('collapsed');
    configBody.classList.remove('collapsed');
  }
  
  loadJobOverviewData();
  setupJobOverviewEventListeners();
  joInitialized = true;
}

function setupJobOverviewEventListeners() {
  document.getElementById('joStatusActive')?.addEventListener('change', filterJobOverview);
  document.getElementById('joStatusInactive')?.addEventListener('change', filterJobOverview);
  document.getElementById('joStatusClosed')?.addEventListener('change', filterJobOverview);
  document.getElementById('joStatusOverhead')?.addEventListener('change', filterJobOverview);
  document.getElementById('joPmFilter')?.addEventListener('change', filterJobOverview);
  document.getElementById('joCustomerFilter')?.addEventListener('change', filterJobOverview);
  document.getElementById('joDataLabels')?.addEventListener('change', updateJobOverviewCharts);
}

async function loadJobOverviewData() {
  try {
    const resp = await fetch('data/financials_jobs.json');
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    
    const jobBudgets = data.job_budgets || [];
    const jobActualsRaw = data.job_actuals || [];
    const jobBilledRevenueRaw = data.job_billed_revenue || [];
    
    const actualCostMap = new Map();
    jobActualsRaw.forEach(row => {
      const jobNo = row.job_no;
      if (!actualCostMap.has(jobNo)) actualCostMap.set(jobNo, 0);
      actualCostMap.set(jobNo, actualCostMap.get(jobNo) + (parseFloat(row.actual_cost) || 0));
    });
    
    const billedRevenueMap = new Map();
    jobBilledRevenueRaw.forEach(row => {
      const jobNo = row.Job_No || row.job_no;
      if (jobNo) {
        if (!billedRevenueMap.has(jobNo)) billedRevenueMap.set(jobNo, 0);
        billedRevenueMap.set(jobNo, billedRevenueMap.get(jobNo) + (parseFloat(row.Billed_Revenue || row.billed_revenue) || 0));
      }
    });
    
    joData = jobBudgets.map(job => {
      const revisedContract = parseFloat(job.revised_contract) || 0;
      const revisedCost = parseFloat(job.revised_cost) || 0;
      const actualCost = actualCostMap.get(job.job_no) || 0;
      const billedRevenue = billedRevenueMap.get(job.job_no) || 0;
      
      let earnedRevenue = 0;
      if (revisedCost > 0 && revisedContract > 0 && actualCost > 0) {
        earnedRevenue = (actualCost / revisedCost) * revisedContract;
      }
      if (!isFinite(earnedRevenue)) earnedRevenue = 0;
      
      let percentComplete = 0;
      if (revisedCost > 0 && actualCost > 0) {
        percentComplete = (actualCost / revisedCost) * 100;
      }
      if (!isFinite(percentComplete)) percentComplete = 0;
      
      const backlog = revisedContract - earnedRevenue;
      const overUnder = billedRevenue - earnedRevenue;
      const estimatedProfit = revisedContract - revisedCost;
      let profitMargin = 0;
      if (revisedContract > 0) {
        profitMargin = (estimatedProfit / revisedContract) * 100;
      }
      
      return {
        ...job,
        revised_contract: revisedContract,
        revised_cost: revisedCost,
        actual_cost: actualCost,
        billed_revenue: billedRevenue,
        earned_revenue: earnedRevenue,
        percent_complete: percentComplete,
        backlog: backlog,
        over_under: overUnder,
        estimated_profit: estimatedProfit,
        profit_margin: profitMargin
      };
    });
    
    populateJobOverviewFilters();
    
    const dataAsOf = document.getElementById('jobOverviewDataAsOf');
    if (dataAsOf && data.generated_at) {
      dataAsOf.textContent = new Date(data.generated_at).toLocaleDateString();
    }
    
    filterJobOverview();
  } catch (err) {
    console.error('Error loading job overview:', err);
  }
}

function populateJobOverviewFilters() {
  const pmFilter = document.getElementById('joPmFilter');
  if (pmFilter) {
    const pms = [...new Set(joData.map(j => j.project_manager_name).filter(Boolean))].sort();
    pmFilter.innerHTML = '<option value="">All Project Managers</option>' + 
      pms.map(pm => `<option value="${pm}">${pm}</option>`).join('');
  }
  
  const custFilter = document.getElementById('joCustomerFilter');
  if (custFilter) {
    const customers = [...new Set(joData.map(j => j.customer_name).filter(Boolean))].sort();
    custFilter.innerHTML = '<option value="">All Clients</option>' + 
      customers.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function filterJobOverview() {
  const showActive = document.getElementById('joStatusActive')?.checked;
  const showInactive = document.getElementById('joStatusInactive')?.checked;
  const showClosed = document.getElementById('joStatusClosed')?.checked;
  const showOverhead = document.getElementById('joStatusOverhead')?.checked;
  
  const pmFilter = document.getElementById('joPmFilter')?.value || '';
  const custFilter = document.getElementById('joCustomerFilter')?.value || '';
  
  const allowedStatuses = [];
  if (showActive) allowedStatuses.push('A');
  if (showInactive) allowedStatuses.push('I');
  if (showClosed) allowedStatuses.push('C');
  if (showOverhead) allowedStatuses.push('O');
  
  joFiltered = joData.filter(job => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(job.job_status)) return false;
    if (pmFilter && job.project_manager_name !== pmFilter) return false;
    if (custFilter && job.customer_name !== custFilter) return false;
    return true;
  });
  
  updateJobOverviewMetrics();
  updateJobOverviewCharts();
}

function updateJobOverviewMetrics() {
  const totalJobs = joFiltered.length;
  const totalContract = joFiltered.reduce((sum, j) => sum + (j.revised_contract || 0), 0);
  const totalBilled = joFiltered.reduce((sum, j) => sum + (j.billed_revenue || 0), 0);
  const totalEarned = joFiltered.reduce((sum, j) => sum + (j.earned_revenue || 0), 0);
  const totalOverUnder = totalBilled - totalEarned;
  
  const jobsWithValidMargin = joFiltered.filter(j => j.revised_contract > 0 && j.revised_cost > 0);
  let avgProfitMargin = 0;
  if (jobsWithValidMargin.length > 0) {
    const totalContractForMargin = jobsWithValidMargin.reduce((sum, j) => sum + j.revised_contract, 0);
    const totalCostForMargin = jobsWithValidMargin.reduce((sum, j) => sum + j.revised_cost, 0);
    const totalProfitForMargin = totalContractForMargin - totalCostForMargin;
    avgProfitMargin = totalContractForMargin > 0 ? (totalProfitForMargin / totalContractForMargin) * 100 : 0;
  }
  
  document.getElementById('joTotalJobs').textContent = totalJobs.toLocaleString();
  document.getElementById('joContractValue').textContent = formatCurrency(totalContract);
  document.getElementById('joBilledRevenue').textContent = formatCurrency(totalBilled);
  
  const marginEl = document.getElementById('joEstProfitMargin');
  if (marginEl) {
    if (jobsWithValidMargin.length === 0) {
      marginEl.textContent = '-';
      marginEl.style.color = '#6b7280';
    } else {
      marginEl.textContent = avgProfitMargin.toFixed(1) + '%';
      marginEl.style.color = avgProfitMargin >= 0 ? '#10b981' : '#ef4444';
    }
  }
  
  const overUnderEl = document.getElementById('joOverUnderValue');
  const overUnderTile = document.getElementById('joOverUnderTile');
  if (overUnderEl) {
    overUnderEl.textContent = formatCurrency(totalOverUnder);
    if (totalOverUnder >= 0) {
      overUnderEl.style.color = '#10b981';
      if (overUnderTile) overUnderTile.style.borderLeftColor = '#10b981';
    } else {
      overUnderEl.style.color = '#ef4444';
      if (overUnderTile) overUnderTile.style.borderLeftColor = '#ef4444';
    }
  }
}

function getJobOverviewSubtitle() {
  const filters = [];
  const showActive = document.getElementById('joStatusActive')?.checked;
  const showInactive = document.getElementById('joStatusInactive')?.checked;
  const showClosed = document.getElementById('joStatusClosed')?.checked;
  const showOverhead = document.getElementById('joStatusOverhead')?.checked;
  
  const statusFilters = [];
  if (showActive) statusFilters.push('Active');
  if (showInactive) statusFilters.push('Inactive');
  if (showClosed) statusFilters.push('Closed');
  if (showOverhead) statusFilters.push('Overhead');
  if (statusFilters.length > 0 && statusFilters.length < 4) {
    filters.push(`Status: ${statusFilters.join(', ')}`);
  }
  
  const pm = document.getElementById('joPmFilter')?.value;
  if (pm) filters.push(`PM: ${pm}`);
  const client = document.getElementById('joCustomerFilter')?.value;
  if (client) filters.push(`Client: ${client}`);
  
  const total = joFiltered?.length || 0;
  let subtitle = `${total} Job${total !== 1 ? 's' : ''}`;
  if (filters.length > 0) subtitle += ` | ${filters.join(' | ')}`;
  return subtitle;
}

function getJobOverviewTableHtml() {
  if (!joFiltered || joFiltered.length === 0) {
    return "<p>No job data available</p>";
  }
  
  const totalJobs = joFiltered.length;
  const totalContract = joFiltered.reduce((sum, j) => sum + (j.revised_contract || 0), 0);
  const totalBilled = joFiltered.reduce((sum, j) => sum + (j.billed_revenue || 0), 0);
  const totalEarned = joFiltered.reduce((sum, j) => sum + (j.earned_revenue || 0), 0);
  const totalOverUnder = totalBilled - totalEarned;
  
  const jobsWithValidMargin = joFiltered.filter(j => j.revised_contract > 0 && j.revised_cost > 0);
  let avgProfitMargin = 0;
  if (jobsWithValidMargin.length > 0) {
    const totalContractForMargin = jobsWithValidMargin.reduce((sum, j) => sum + j.revised_contract, 0);
    const totalCostForMargin = jobsWithValidMargin.reduce((sum, j) => sum + j.revised_cost, 0);
    const totalProfitForMargin = totalContractForMargin - totalCostForMargin;
    avgProfitMargin = totalContractForMargin > 0 ? (totalProfitForMargin / totalContractForMargin) * 100 : 0;
  }
  
  const overUnderColor = totalOverUnder >= 0 ? '#10b981' : '#dc2626';
  const marginColor = avgProfitMargin >= 0 ? '#10b981' : '#dc2626';
  
  let html = `<div style="margin-bottom:20px;">
    <h3 style="margin:0 0 12px 0;font-size:14px;color:#374151;">Key Metrics</h3>
    <table style="border-collapse:collapse;font-size:12px;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Total Jobs:</td>
        <td style="padding:6px 0;font-weight:600;">${totalJobs.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Contract Value:</td>
        <td style="padding:6px 0;font-weight:600;">${formatCurrency(totalContract)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Billed Revenue:</td>
        <td style="padding:6px 0;font-weight:600;">${formatCurrency(totalBilled)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Over/(Under) Bill:</td>
        <td style="padding:6px 0;font-weight:600;color:${overUnderColor};">${formatCurrency(totalOverUnder)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;">Est. Profit Margin:</td>
        <td style="padding:6px 0;font-weight:600;color:${marginColor};">${avgProfitMargin.toFixed(1)}%</td>
      </tr>
    </table>
  </div>`;
  
  return html;
}

function getJobOverviewCsvData() {
  if (!joFiltered || joFiltered.length === 0) {
    return "";
  }
  
  let csv = "Job #,Description,Client,Status,Project Manager,Contract Value,Billed Revenue,Earned Revenue,Over/(Under) Bill,Est. Profit Margin %\n";
  
  joFiltered.forEach(job => {
    const status = getJobStatusLabel(job.job_status);
    const overUnder = (job.billed_revenue || 0) - (job.earned_revenue || 0);
    const margin = job.revised_contract > 0 && job.revised_cost > 0 
      ? ((job.revised_contract - job.revised_cost) / job.revised_contract) * 100 
      : 0;
    
    csv += `"${job.job_no}","${(job.job_description || '').replace(/"/g, '""')}","${(job.customer_name || '').replace(/"/g, '""')}","${status.label}","${(job.project_manager_name || '').replace(/"/g, '""')}",${job.revised_contract || 0},${job.billed_revenue || 0},${job.earned_revenue || 0},${overUnder},${margin.toFixed(1)}\n`;
  });
  
  return csv;
}

async function captureJobOverviewCharts() {
  try {
    const chartConfigs = [
      { chart: joPmJobsChart, title: '# of Jobs by PM' },
      { chart: joPmContractChart, title: 'Contract Value by PM' },
      { chart: joPmMarginChart, title: 'Profit Margin % by PM' },
      { chart: joClientJobsChart, title: '# of Jobs by Client' },
      { chart: joClientContractChart, title: 'Contract Value by Client' },
      { chart: joClientMarginChart, title: 'Profit Margin % by Client' }
    ];
    
    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    
    const chartImages = [];
    for (const cfg of chartConfigs) {
      if (cfg.chart) {
        try {
          const base64 = cfg.chart.toBase64Image("image/png", 1);
          const img = await loadImage(base64);
          if (img) chartImages.push({ img, title: cfg.title });
        } catch (e) {
          console.log("Error getting chart image:", cfg.title, e);
        }
      }
    }
    
    console.log("Captured", chartImages.length, "job overview chart images");
    
    if (chartImages.length === 0) {
      console.log("No chart images captured");
      return null;
    }
    
    const chartWidth = 350;
    const chartHeight = 200;
    const titleHeight = 25;
    const padding = 12;
    const tileHeight = titleHeight + chartHeight;
    
    const cols = 3;
    const rows = 2;
    
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = cols * chartWidth + (cols + 1) * padding;
    compositeCanvas.height = rows * tileHeight + (rows + 1) * padding;
    const ctx = compositeCanvas.getContext("2d");
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    
    for (let i = 0; i < chartImages.length; i++) {
      const { img, title } = chartImages[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (chartWidth + padding);
      const y = padding + row * (tileHeight + padding);
      
      ctx.fillStyle = "#374151";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "left";
      ctx.fillText(title, x, y + 16);
      
      if (img) {
        ctx.drawImage(img, x, y + titleHeight, chartWidth, chartHeight);
      }
    }
    
    const dataUrl = compositeCanvas.toDataURL("image/jpeg", 0.85);
    const base64Data = dataUrl.split(",")[1];
    const sizeKB = Math.round(base64Data.length / 1024);
    console.log("Job Overview composite chart image size:", sizeKB, "KB");
    
    return base64Data;
  } catch (err) {
    console.error("Job Overview chart capture error:", err.message);
    return null;
  }
}

function updateJobOverviewCharts() {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const textColor = isDarkMode ? '#e2e8f0' : '#374151';
  const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const showDataLabels = document.getElementById('joDataLabels')?.checked === true;
  
  const pmData = aggregateJobsByField(joFiltered, 'project_manager_name');
  const customerData = aggregateJobsByField(joFiltered, 'customer_name');
  
  renderJoPmJobsChart(pmData, textColor, gridColor, showDataLabels);
  renderJoPmContractChart(pmData, textColor, gridColor, showDataLabels);
  renderJoPmMarginChart(pmData, textColor, gridColor, showDataLabels);
  renderJoClientJobsChart(customerData, textColor, gridColor, showDataLabels);
  renderJoClientContractChart(customerData, textColor, gridColor, showDataLabels);
  renderJoClientMarginChart(customerData, textColor, gridColor, showDataLabels);
  
  updateJoChartStats(pmData, customerData);
}

function updateJoChartStats(pmData, clientData) {
  updateJoStatSet(pmData, 'joPm', 'jobCount', false);
  updateJoStatSet(pmData, 'joPm', 'contractValue', true);
  updateJoStatSet(pmData, 'joPm', 'profitMargin', false, true);
  updateJoStatSet(clientData, 'joClient', 'jobCount', false);
  updateJoStatSet(clientData, 'joClient', 'contractValue', true);
  updateJoStatSet(clientData, 'joClient', 'profitMargin', false, true);
}

function updateJoStatSet(data, prefix, field, isCurrency, isPercent) {
  const fieldSuffix = field === 'jobCount' ? 'Jobs' : field === 'contractValue' ? 'Contract' : 'Margin';
  
  if (!data || data.length === 0) {
    document.getElementById(`${prefix}${fieldSuffix}Avg`).textContent = '-';
    document.getElementById(`${prefix}${fieldSuffix}High`).textContent = '-';
    document.getElementById(`${prefix}${fieldSuffix}Low`).textContent = '-';
    document.getElementById(`${prefix}${fieldSuffix}HighName`).textContent = '';
    document.getElementById(`${prefix}${fieldSuffix}LowName`).textContent = '';
    return;
  }
  
  const values = data.map(d => d[field]);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const maxItem = data.find(d => d[field] === maxVal);
  const minItem = data.find(d => d[field] === minVal);
  
  const avgEl = document.getElementById(`${prefix}${fieldSuffix}Avg`);
  const highEl = document.getElementById(`${prefix}${fieldSuffix}High`);
  const lowEl = document.getElementById(`${prefix}${fieldSuffix}Low`);
  const highNameEl = document.getElementById(`${prefix}${fieldSuffix}HighName`);
  const lowNameEl = document.getElementById(`${prefix}${fieldSuffix}LowName`);
  
  if (avgEl) {
    if (isCurrency) avgEl.textContent = formatCurrency(avg);
    else if (isPercent) avgEl.textContent = avg.toFixed(1) + '%';
    else avgEl.textContent = avg.toFixed(1);
  }
  if (highEl) {
    if (isCurrency) highEl.textContent = formatCurrency(maxVal);
    else if (isPercent) highEl.textContent = maxVal.toFixed(1) + '%';
    else highEl.textContent = maxVal;
  }
  if (lowEl) {
    if (isCurrency) lowEl.textContent = formatCurrency(minVal);
    else if (isPercent) lowEl.textContent = minVal.toFixed(1) + '%';
    else lowEl.textContent = minVal;
  }
  if (highNameEl) highNameEl.textContent = maxItem?.name || '';
  if (lowNameEl) lowNameEl.textContent = minItem?.name || '';
}

function aggregateJobsByField(jobs, field) {
  const groups = {};
  jobs.forEach(job => {
    const key = job[field] || 'Unknown';
    if (!groups[key]) {
      groups[key] = { 
        name: key, 
        jobCount: 0, 
        contractValue: 0, 
        revisedCost: 0,
        estimatedProfit: 0 
      };
    }
    groups[key].jobCount++;
    groups[key].contractValue += job.revised_contract || 0;
    groups[key].revisedCost += job.revised_cost || 0;
    groups[key].estimatedProfit += job.estimated_profit || 0;
  });
  
  return Object.values(groups)
    .filter(g => g.contractValue > 0 || g.jobCount > 0)
    .map(g => ({
      ...g,
      profitMargin: g.contractValue > 0 && g.revisedCost > 0 
        ? ((g.contractValue - g.revisedCost) / g.contractValue) * 100 
        : 0
    }))
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, 15);
}

function createJoGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function getJoBarColors(count) {
  const colors = [
    ['#1e40af', '#1e3a8a'],
    ['#047857', '#064e3b'],
    ['#7c3aed', '#5b21b6'],
    ['#0d9488', '#0f766e'],
    ['#dc2626', '#991b1b'],
    ['#ea580c', '#c2410c'],
    ['#4f46e5', '#3730a3'],
    ['#0891b2', '#0e7490'],
    ['#be185d', '#9d174d'],
    ['#65a30d', '#4d7c0f']
  ];
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
}

function renderJoPmJobsChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joPmJobsChart');
  if (!ctx) return;
  
  if (joPmJobsChart) joPmJobsChart.destroy();
  
  const sortedData = [...data].sort((a, b) => b.jobCount - a.jobCount);
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joPmJobsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedData.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: sortedData.map(d => d.jobCount),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ctx.raw + ' jobs' } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => val
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
      }
    }
  });
}

function renderJoPmContractChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joPmContractChart');
  if (!ctx) return;
  
  if (joPmContractChart) joPmContractChart.destroy();
  
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joPmContractChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: data.map(d => d.contractValue),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => '$' + (val / 1000000).toFixed(1) + 'M'
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, callback: (val) => '$' + (val / 1000000).toFixed(0) + 'M' }, grid: { color: gridColor } }
      }
    }
  });
}

function renderJoPmMarginChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joPmMarginChart');
  if (!ctx) return;
  
  if (joPmMarginChart) joPmMarginChart.destroy();
  
  const sortedData = [...data].sort((a, b) => b.profitMargin - a.profitMargin);
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joPmMarginChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedData.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: sortedData.map(d => d.profitMargin),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ctx.raw.toFixed(1) + '%' } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => val.toFixed(1) + '%'
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, callback: (val) => val + '%' }, grid: { color: gridColor } }
      }
    }
  });
}

function renderJoClientJobsChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joClientJobsChart');
  if (!ctx) return;
  
  if (joClientJobsChart) joClientJobsChart.destroy();
  
  const sortedData = [...data].sort((a, b) => b.jobCount - a.jobCount);
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joClientJobsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedData.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: sortedData.map(d => d.jobCount),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ctx.raw + ' jobs' } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => val
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
      }
    }
  });
}

function renderJoClientContractChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joClientContractChart');
  if (!ctx) return;
  
  if (joClientContractChart) joClientContractChart.destroy();
  
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joClientContractChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: data.map(d => d.contractValue),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => '$' + (val / 1000000).toFixed(1) + 'M'
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, callback: (val) => '$' + (val / 1000000).toFixed(0) + 'M' }, grid: { color: gridColor } }
      }
    }
  });
}

function renderJoClientMarginChart(data, textColor, gridColor, showDataLabels) {
  const ctx = document.getElementById('joClientMarginChart');
  if (!ctx) return;
  
  if (joClientMarginChart) joClientMarginChart.destroy();
  
  const sortedData = [...data].sort((a, b) => b.profitMargin - a.profitMargin);
  const context = ctx.getContext('2d');
  const blueGradient = createJoGradient(context, '#2563eb', '#60a5fa');
  
  joClientMarginChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedData.map(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name),
      datasets: [{
        data: sortedData.map(d => d.profitMargin),
        backgroundColor: blueGradient,
        borderRadius: 4
      }]
    },
    plugins: showDataLabels ? [ChartDataLabels] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showDataLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ctx.raw.toFixed(1) + '%' } },
        datalabels: showDataLabels ? {
          display: true, anchor: 'end', align: 'top', offset: 2,
          color: textColor, font: { weight: 'bold', size: 10 },
          formatter: (val) => val.toFixed(1) + '%'
        } : { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, callback: (val) => val + '%' }, grid: { color: gridColor } }
      }
    }
  });
}

// ========================================
// JOB ACTUALS MODULE
// ========================================

let jobActualsData = [];
let jobActualsFiltered = [];
let jaCurrentPage = 1;
let jaPageSize = 25;
let jaSortColumn = 'actual_cost';
let jaSortDirection = 'desc';
let jaInitialized = false;
let jaPmDonutChart = null;
let jaCustomerDonutChart = null;

function initJobActuals() {
  if (jaInitialized && jobActualsData.length > 0) {
    renderJobActualsTable();
    return;
  }
  
  const configHeader = document.querySelector('#jobActuals .config-header');
  const configBody = document.getElementById('jobActualsConfigBody');
  if (configHeader && configBody) {
    configHeader.classList.remove('collapsed');
    configBody.classList.remove('collapsed');
  }
  
  loadJobActualsData();
  setupJobActualsEventListeners();
  jaInitialized = true;
}

function setupJobActualsEventListeners() {
  document.getElementById('jaStatusActive')?.addEventListener('change', filterJobActuals);
  document.getElementById('jaStatusInactive')?.addEventListener('change', filterJobActuals);
  document.getElementById('jaStatusClosed')?.addEventListener('change', filterJobActuals);
  document.getElementById('jaStatusOverhead')?.addEventListener('change', filterJobActuals);
  
  document.getElementById('jaPmFilter')?.addEventListener('change', filterJobActuals);
  document.getElementById('jaCustomerFilter')?.addEventListener('change', filterJobActuals);
  
  const searchInput = document.getElementById('jaSearchInput');
  let searchTimeout;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterJobActuals, 300);
  });
  
  document.getElementById('jaPrevPage')?.addEventListener('click', () => {
    if (jaCurrentPage > 1) {
      jaCurrentPage--;
      renderJobActualsTable();
    }
  });
  
  document.getElementById('jaNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(jobActualsFiltered.length / jaPageSize);
    if (jaCurrentPage < totalPages) {
      jaCurrentPage++;
      renderJobActualsTable();
    }
  });
  
  document.getElementById('jaPageSize')?.addEventListener('change', (e) => {
    jaPageSize = parseInt(e.target.value);
    jaCurrentPage = 1;
    renderJobActualsTable();
  });
  
  document.querySelectorAll('#jobActualsTable th.ja-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (jaSortColumn === col) {
        jaSortDirection = jaSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        jaSortColumn = col;
        jaSortDirection = 'desc';
      }
      sortJobActuals();
      renderJobActualsTable();
    });
  });
  
  document.querySelectorAll('.ja-quick-sort').forEach(btn => {
    btn.addEventListener('click', () => {
      const sortCol = btn.dataset.sort;
      const sortDir = btn.dataset.dir;
      
      document.querySelectorAll('.ja-quick-sort').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      jaSortColumn = sortCol;
      jaSortDirection = sortDir;
      jaCurrentPage = 1;
      sortJobActuals();
      renderJobActualsTable();
    });
  });
  
  document.querySelectorAll('#jobActuals .breakdown-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const tableWrapper = document.getElementById(targetId);
      const textSpan = btn.querySelector('.expand-text');
      
      if (tableWrapper) {
        const isCollapsed = tableWrapper.classList.contains('collapsed');
        tableWrapper.classList.toggle('collapsed');
        btn.classList.toggle('expanded');
        
        if (textSpan) {
          textSpan.textContent = isCollapsed ? 'Collapse' : 'Expand';
        }
      }
    });
  });
}

async function loadJobActualsData() {
  const loadingOverlay = document.getElementById('jobActualsLoadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  
  try {
    const resp = await fetch('data/financials_jobs.json');
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    
    const jobBudgets = data.job_budgets || [];
    const jobActualsRaw = data.job_actuals || [];
    const jobBilledRevenueRaw = data.job_billed_revenue || [];
    
    const budgetMap = new Map();
    jobBudgets.forEach(job => {
      budgetMap.set(job.job_no, {
        customer_name: job.customer_name,
        project_manager_name: job.project_manager_name,
        job_status: job.job_status,
        job_description: job.job_description,
        revised_contract: parseFloat(job.revised_contract) || 0,
        revised_cost: parseFloat(job.revised_cost) || 0
      });
    });
    
    const billedRevenueMap = new Map();
    jobBilledRevenueRaw.forEach(row => {
      const jobNo = row.Job_No || row.job_no;
      if (jobNo) {
        const billedRev = parseFloat(row.Billed_Revenue || row.billed_revenue) || 0;
        billedRevenueMap.set(jobNo, billedRev);
      }
    });
    
    const jobMap = new Map();
    jobActualsRaw.forEach(row => {
      const jobNo = row.job_no;
      if (!jobMap.has(jobNo)) {
        jobMap.set(jobNo, {
          job_no: jobNo,
          job_status: row.job_status,
          job_description: row.job_description,
          project_manager_name: row.project_manager_name,
          actual_cost: 0
        });
      }
      jobMap.get(jobNo).actual_cost += parseFloat(row.actual_cost) || 0;
    });
    
    jobActualsData = [];
    jobMap.forEach((job, jobNo) => {
      const budget = budgetMap.get(jobNo) || {};
      const revisedCost = budget.revised_cost || 0;
      const revisedContract = budget.revised_contract || 0;
      const billedRevenue = billedRevenueMap.get(jobNo) || 0;
      
      let earnedRevenue = 0;
      if (revisedCost > 0 && revisedContract > 0 && job.actual_cost > 0) {
        earnedRevenue = (job.actual_cost / revisedCost) * revisedContract;
      }
      if (!isFinite(earnedRevenue)) earnedRevenue = 0;
      
      let percentComplete = 0;
      if (revisedCost > 0 && job.actual_cost > 0) {
        percentComplete = (job.actual_cost / revisedCost) * 100;
      }
      if (!isFinite(percentComplete)) percentComplete = 0;
      
      jobActualsData.push({
        ...job,
        customer_name: budget.customer_name || '',
        revised_contract: revisedContract,
        revised_cost: revisedCost,
        billed_revenue: billedRevenue,
        earned_revenue: earnedRevenue,
        percent_complete: percentComplete
      });
    });
    
    populateJobActualsFilters();
    
    const dataAsOf = document.getElementById('jobActualsDataAsOf');
    if (dataAsOf && data.generated_at) {
      dataAsOf.textContent = new Date(data.generated_at).toLocaleDateString();
    }
    
    filterJobActuals();
  } catch (err) {
    console.error('Error loading job actuals:', err);
    document.getElementById('jobActualsTableBody').innerHTML = 
      '<tr><td colspan="10" class="loading-cell">Error loading job actuals data</td></tr>';
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

function populateJobActualsFilters() {
  const pmFilter = document.getElementById('jaPmFilter');
  if (pmFilter) {
    const pms = [...new Set(jobActualsData.map(j => j.project_manager_name).filter(Boolean))].sort();
    pmFilter.innerHTML = '<option value="">All Project Managers</option>' + 
      pms.map(pm => `<option value="${pm}">${pm}</option>`).join('');
  }
  
  const custFilter = document.getElementById('jaCustomerFilter');
  if (custFilter) {
    const customers = [...new Set(jobActualsData.map(j => j.customer_name).filter(Boolean))].sort();
    custFilter.innerHTML = '<option value="">All Clients</option>' + 
      customers.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function filterJobActuals() {
  const showActive = document.getElementById('jaStatusActive')?.checked;
  const showInactive = document.getElementById('jaStatusInactive')?.checked;
  const showClosed = document.getElementById('jaStatusClosed')?.checked;
  const showOverhead = document.getElementById('jaStatusOverhead')?.checked;
  
  const pmFilter = document.getElementById('jaPmFilter')?.value || '';
  const custFilter = document.getElementById('jaCustomerFilter')?.value || '';
  const searchTerm = (document.getElementById('jaSearchInput')?.value || '').toLowerCase().trim();
  
  const allowedStatuses = [];
  if (showActive) allowedStatuses.push('A');
  if (showInactive) allowedStatuses.push('I');
  if (showClosed) allowedStatuses.push('C');
  if (showOverhead) allowedStatuses.push('O');
  
  jobActualsFiltered = jobActualsData.filter(job => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(job.job_status)) return false;
    if (pmFilter && job.project_manager_name !== pmFilter) return false;
    if (custFilter && job.customer_name !== custFilter) return false;
    
    if (searchTerm) {
      const searchStr = `${job.job_no} ${job.job_description} ${job.customer_name}`.toLowerCase();
      if (!searchStr.includes(searchTerm)) return false;
    }
    
    return true;
  });
  
  jaCurrentPage = 1;
  sortJobActuals();
  updateJobActualsSummaryMetrics();
  renderJobActualsTable();
}

function sortJobActuals() {
  const col = jaSortColumn;
  const dir = jaSortDirection === 'asc' ? 1 : -1;
  
  jobActualsFiltered.sort((a, b) => {
    let aVal = a[col];
    let bVal = b[col];
    
    if (['billed_revenue', 'earned_revenue', 'actual_cost', 'percent_complete'].includes(col)) {
      return ((aVal || 0) - (bVal || 0)) * dir;
    }
    
    if (col === 'over_under_bill') {
      const aOver = (a.billed_revenue || 0) - (a.earned_revenue || 0);
      const bOver = (b.billed_revenue || 0) - (b.earned_revenue || 0);
      return (aOver - bOver) * dir;
    }
    
    aVal = (aVal || '').toString().toLowerCase();
    bVal = (bVal || '').toString().toLowerCase();
    return aVal.localeCompare(bVal) * dir;
  });
}

function updateJobActualsSummaryMetrics() {
  const totalJobs = jobActualsFiltered.length;
  const totalBilledRevenue = jobActualsFiltered.reduce((sum, j) => sum + (j.billed_revenue || 0), 0);
  const totalEarnedRevenue = jobActualsFiltered.reduce((sum, j) => sum + j.earned_revenue, 0);
  const totalActualCost = jobActualsFiltered.reduce((sum, j) => sum + j.actual_cost, 0);
  const totalOverUnder = totalBilledRevenue - totalEarnedRevenue;
  
  document.getElementById('jaTotalCount').textContent = totalJobs.toLocaleString();
  document.getElementById('jaTotalBilledRevenue').textContent = formatCurrency(totalBilledRevenue);
  document.getElementById('jaTotalEarnedRevenue').textContent = formatCurrency(totalEarnedRevenue);
  document.getElementById('jaTotalActualCost').textContent = formatCurrency(totalActualCost);
  const overUnderEl = document.getElementById('jaTotalOverUnder');
  overUnderEl.textContent = formatCurrency(totalOverUnder);
  overUnderEl.style.color = totalOverUnder >= 0 ? '#10b981' : '#dc2626';
  
  const overUnderCard = document.getElementById('jaOverUnderCard');
  if (overUnderCard) {
    overUnderCard.style.backgroundColor = totalOverUnder >= 0 ? '#d1fae5' : '#fce7f3';
  }
  
  renderJobActualsBreakdowns();
}

function renderJobActualsBreakdowns() {
  // Donut charts removed per user request
}

function renderJaPmDonutChart() {
  const canvas = document.getElementById('jaPmDonutChart');
  if (!canvas) return;
  
  const pmMap = new Map();
  jobActualsFiltered.forEach(job => {
    const pm = job.project_manager_name || 'Unassigned';
    if (!pmMap.has(pm)) pmMap.set(pm, 0);
    pmMap.set(pm, pmMap.get(pm) + job.actual_cost);
  });
  
  const sorted = [...pmMap.entries()].sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10);
  const otherTotal = sorted.slice(10).reduce((sum, [, val]) => sum + val, 0);
  
  const labels = top10.map(([name]) => name);
  const data = top10.map(([, val]) => val);
  
  if (otherTotal > 0) {
    labels.push('Other');
    data.push(otherTotal);
  }
  
  const isDarkMode = document.body.classList.contains('dark-mode');
  const isMobile = window.innerWidth <= 768;
  
  if (jaPmDonutChart) jaPmDonutChart.destroy();
  
  jaPmDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: chartColors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: isDarkMode ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: isDarkMode ? '#e2e8f0' : '#374151',
            font: { size: isMobile ? 10 : 11 },
            boxWidth: isMobile ? 10 : 12,
            padding: isMobile ? 6 : 8
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((value / total) * 100).toFixed(1);
              return `${formatCurrencyCompact(value)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderJaCustomerDonutChart() {
  const canvas = document.getElementById('jaCustomerDonutChart');
  if (!canvas) return;
  
  const custMap = new Map();
  jobActualsFiltered.forEach(job => {
    const cust = job.customer_name || 'Unknown';
    if (!custMap.has(cust)) custMap.set(cust, 0);
    custMap.set(cust, custMap.get(cust) + job.actual_cost);
  });
  
  const sorted = [...custMap.entries()].sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10);
  const otherTotal = sorted.slice(10).reduce((sum, [, val]) => sum + val, 0);
  
  const labels = top10.map(([name]) => name);
  const data = top10.map(([, val]) => val);
  
  if (otherTotal > 0) {
    labels.push('Other');
    data.push(otherTotal);
  }
  
  const isDarkMode = document.body.classList.contains('dark-mode');
  const isMobile = window.innerWidth <= 768;
  
  if (jaCustomerDonutChart) jaCustomerDonutChart.destroy();
  
  jaCustomerDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: chartColors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: isDarkMode ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: isDarkMode ? '#e2e8f0' : '#374151',
            font: { size: isMobile ? 10 : 11 },
            boxWidth: isMobile ? 10 : 12,
            padding: isMobile ? 6 : 8
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((value / total) * 100).toFixed(1);
              return `${formatCurrencyCompact(value)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderJaPmBreakdownTable() {
  const tbody = document.getElementById('jaPmBreakdownBody');
  if (!tbody) return;
  
  const pmMap = new Map();
  jobActualsFiltered.forEach(job => {
    const pm = job.project_manager_name || 'Unassigned';
    if (!pmMap.has(pm)) {
      pmMap.set(pm, { jobs: 0, earnedRev: 0, actualCost: 0 });
    }
    const d = pmMap.get(pm);
    d.jobs++;
    d.earnedRev += job.earned_revenue;
    d.actualCost += job.actual_cost;
  });
  
  const sorted = [...pmMap.entries()]
    .map(([pm, d]) => ({ pm, ...d, profit: d.earnedRev - d.actualCost }))
    .sort((a, b) => b.actualCost - a.actualCost);
  
  tbody.innerHTML = sorted.map(row => {
    const margin = row.earnedRev > 0 ? (row.profit / row.earnedRev) * 100 : 0;
    const marginColor = getMarginColor(margin);
    const profitClass = row.profit >= 0 ? 'positive' : 'negative';
    return `<tr>
      <td>${row.pm}</td>
      <td class="number-col">${row.jobs}</td>
      <td class="number-col">${formatCurrency(row.earnedRev)}</td>
      <td class="number-col">${formatCurrency(row.actualCost)}</td>
      <td class="number-col ${profitClass}">${formatCurrency(row.profit)}</td>
      <td class="number-col" style="background-color: ${marginColor}">${margin.toFixed(1)}%</td>
    </tr>`;
  }).join('');
}

function renderJaCustomerBreakdownTable() {
  const tbody = document.getElementById('jaCustomerBreakdownBody');
  if (!tbody) return;
  
  const custMap = new Map();
  jobActualsFiltered.forEach(job => {
    const cust = job.customer_name || 'Unknown';
    if (!custMap.has(cust)) {
      custMap.set(cust, { jobs: 0, earnedRev: 0, actualCost: 0 });
    }
    const d = custMap.get(cust);
    d.jobs++;
    d.earnedRev += job.earned_revenue;
    d.actualCost += job.actual_cost;
  });
  
  const sorted = [...custMap.entries()]
    .map(([cust, d]) => ({ cust, ...d, profit: d.earnedRev - d.actualCost }))
    .sort((a, b) => b.actualCost - a.actualCost);
  
  tbody.innerHTML = sorted.map(row => {
    const margin = row.earnedRev > 0 ? (row.profit / row.earnedRev) * 100 : 0;
    const marginColor = getMarginColor(margin);
    const profitClass = row.profit >= 0 ? 'positive' : 'negative';
    return `<tr>
      <td>${row.cust}</td>
      <td class="number-col">${row.jobs}</td>
      <td class="number-col">${formatCurrency(row.earnedRev)}</td>
      <td class="number-col">${formatCurrency(row.actualCost)}</td>
      <td class="number-col ${profitClass}">${formatCurrency(row.profit)}</td>
      <td class="number-col" style="background-color: ${marginColor}">${margin.toFixed(1)}%</td>
    </tr>`;
  }).join('');
}

function renderJobActualsTable() {
  const tbody = document.getElementById('jobActualsTableBody');
  if (!tbody) return;
  
  const startIdx = (jaCurrentPage - 1) * jaPageSize;
  const endIdx = startIdx + jaPageSize;
  const pageData = jobActualsFiltered.slice(startIdx, endIdx);
  
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="loading-cell">No jobs found matching filters</td></tr>';
    updateJaPagination(0);
    return;
  }
  
  // Calculate totals for ALL filtered data (not just current page)
  const allTotals = {
    billedRevenue: jobActualsFiltered.reduce((sum, j) => sum + (j.billed_revenue || 0), 0),
    earnedRevenue: jobActualsFiltered.reduce((sum, j) => sum + (j.earned_revenue || 0), 0),
    actualCost: jobActualsFiltered.reduce((sum, j) => sum + (j.actual_cost || 0), 0)
  };
  const totalOverUnder = allTotals.billedRevenue - allTotals.earnedRevenue;
  const totalOverUnderColor = totalOverUnder >= 0 ? '#d1fae5' : '#fce7f3';
  const avgPctComplete = jobActualsFiltered.length > 0 
    ? jobActualsFiltered.reduce((sum, j) => sum + (j.percent_complete || 0), 0) / jobActualsFiltered.length 
    : 0;
  
  const totalsRowHtml = `<tr class="totals-row">
    <td colspan="5"><strong>Totals (${jobActualsFiltered.length} jobs)</strong></td>
    <td class="number-col"><strong>${formatCurrency(allTotals.billedRevenue)}</strong></td>
    <td class="number-col"><strong>${formatCurrency(allTotals.earnedRevenue)}</strong></td>
    <td class="number-col" style="background-color: ${totalOverUnderColor}; color: #1e293b;"><strong>${formatCurrency(totalOverUnder)}</strong></td>
    <td class="number-col"><strong>${formatCurrency(allTotals.actualCost)}</strong></td>
    <td class="number-col"><strong>${Math.round(avgPctComplete)}%</strong></td>
  </tr>`;
  
  const dataRowsHtml = pageData.map(job => {
    const status = getJobStatusLabel(job.job_status);
    const pctComplete = job.percent_complete || 0;
    const overUnderBill = (job.billed_revenue || 0) - (job.earned_revenue || 0);
    const overUnderColor = overUnderBill >= 0 ? '#d1fae5' : '#fce7f3';
    
    return `<tr>
      <td>${job.job_no}</td>
      <td>${job.job_description || ''}</td>
      <td>${job.customer_name || ''}</td>
      <td><span class="job-status-badge ${status.class}">${status.label}</span></td>
      <td>${job.project_manager_name || ''}</td>
      <td class="number-col">${formatCurrency(job.billed_revenue || 0)}</td>
      <td class="number-col">${formatCurrency(job.earned_revenue)}</td>
      <td class="number-col" style="background-color: ${overUnderColor}; color: #1e293b;">${formatCurrency(overUnderBill)}</td>
      <td class="number-col">${formatCurrency(job.actual_cost)}</td>
      <td class="number-col">${Math.round(pctComplete)}%</td>
    </tr>`;
  }).join('');
  
  tbody.innerHTML = totalsRowHtml + dataRowsHtml;
  
  updateJaPagination(jobActualsFiltered.length);
}

function updateJaPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / jaPageSize));
  
  document.getElementById('jaPageInfo').textContent = `Page ${jaCurrentPage} of ${totalPages}`;
  document.getElementById('jaPrevPage').disabled = jaCurrentPage <= 1;
  document.getElementById('jaNextPage').disabled = jaCurrentPage >= totalPages;
}

// ========================================
// JOB COSTS MODULE
// ========================================

let jobCostsData = [];
let jobCostsFiltered = [];
let jcCurrentPage = 1;
let jcPageSize = 25;
let jcSortColumn = 'job_no';
let jcSortDirection = 'asc';
let jcEventListenersSetup = false;

function initJobCosts() {
  if (!jcEventListenersSetup) {
    setupJobCostsEventListeners();
    jcEventListenersSetup = true;
  }
  loadJobCostsData();
}

function setupJobCostsEventListeners() {
  document.getElementById('jcStatusActive')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcStatusInactive')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcStatusClosed')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcStatusOverhead')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcPmFilter')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcCustomerFilter')?.addEventListener('change', filterJobCosts);
  document.getElementById('jcSearchInput')?.addEventListener('input', filterJobCosts);
  
  document.querySelectorAll('.jc-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (jcSortColumn === col) {
        jcSortDirection = jcSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        jcSortColumn = col;
        jcSortDirection = 'asc';
      }
      sortJobCosts();
      renderJobCostsTable();
    });
  });
  
  document.getElementById('jcPrevPage')?.addEventListener('click', () => {
    if (jcCurrentPage > 1) {
      jcCurrentPage--;
      renderJobCostsTable();
    }
  });
  
  document.getElementById('jcNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(jobCostsFiltered.length / jcPageSize);
    if (jcCurrentPage < totalPages) {
      jcCurrentPage++;
      renderJobCostsTable();
    }
  });
  
  document.getElementById('jcPageSize')?.addEventListener('change', (e) => {
    jcPageSize = parseInt(e.target.value);
    jcCurrentPage = 1;
    renderJobCostsTable();
  });
}

async function loadJobCostsData() {
  const loadingOverlay = document.getElementById('jobCostsLoadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  
  try {
    const resp = await fetch('data/financials_jobs.json');
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    
    const jobBudgets = data.job_budgets || [];
    const jobActualsRaw = data.job_actuals || [];
    
    const budgetMap = new Map();
    jobBudgets.forEach(job => {
      const originalCost = parseFloat(job.original_cost) || 0;
      const costAdjustments = parseFloat(job.cost_adjustments) || 0;
      budgetMap.set(job.job_no, {
        customer_name: job.customer_name,
        project_manager_name: job.project_manager_name,
        job_status: job.job_status,
        job_description: job.job_description,
        estimated_cost: originalCost + costAdjustments
      });
    });
    
    jobCostsData = jobActualsRaw.map(row => {
      const budget = budgetMap.get(row.job_no) || {};
      return {
        job_no: row.job_no,
        job_status: row.job_status || budget.job_status,
        job_description: row.job_description || budget.job_description,
        project_manager_name: row.project_manager_name || budget.project_manager_name,
        customer_name: budget.customer_name || '',
        cost_code_no: row.cost_code_no || '',
        cost_code_description: row.cost_code_description || '',
        estimated_cost: budget.estimated_cost || 0,
        actual_cost: parseFloat(row.actual_cost) || 0
      };
    });
    
    populateJobCostsFilters();
    
    const dataAsOf = document.getElementById('jobCostsDataAsOf');
    if (dataAsOf && data.generated_at) {
      dataAsOf.textContent = new Date(data.generated_at).toLocaleDateString();
    }
    
    filterJobCosts();
  } catch (err) {
    console.error('Error loading job costs:', err);
    document.getElementById('jobCostsTableBody').innerHTML = 
      '<tr><td colspan="6" class="loading-cell">Error loading job costs data</td></tr>';
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

function populateJobCostsFilters() {
  const pmFilter = document.getElementById('jcPmFilter');
  if (pmFilter) {
    const pms = [...new Set(jobCostsData.map(j => j.project_manager_name).filter(Boolean))].sort();
    pmFilter.innerHTML = '<option value="">All Project Managers</option>' + 
      pms.map(pm => `<option value="${pm}">${pm}</option>`).join('');
  }
  
  const custFilter = document.getElementById('jcCustomerFilter');
  if (custFilter) {
    const customers = [...new Set(jobCostsData.map(j => j.customer_name).filter(Boolean))].sort();
    custFilter.innerHTML = '<option value="">All Clients</option>' + 
      customers.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function filterJobCosts() {
  const showActive = document.getElementById('jcStatusActive')?.checked;
  const showInactive = document.getElementById('jcStatusInactive')?.checked;
  const showClosed = document.getElementById('jcStatusClosed')?.checked;
  const showOverhead = document.getElementById('jcStatusOverhead')?.checked;
  
  const pmFilter = document.getElementById('jcPmFilter')?.value || '';
  const custFilter = document.getElementById('jcCustomerFilter')?.value || '';
  const searchTerm = (document.getElementById('jcSearchInput')?.value || '').toLowerCase().trim();
  
  const allowedStatuses = [];
  if (showActive) allowedStatuses.push('A');
  if (showInactive) allowedStatuses.push('I');
  if (showClosed) allowedStatuses.push('C');
  if (showOverhead) allowedStatuses.push('O');
  
  jobCostsFiltered = jobCostsData.filter(row => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(row.job_status)) return false;
    if (pmFilter && row.project_manager_name !== pmFilter) return false;
    if (custFilter && row.customer_name !== custFilter) return false;
    
    if (searchTerm) {
      const searchStr = `${row.job_no} ${row.job_description} ${row.cost_code_no} ${row.cost_code_description}`.toLowerCase();
      if (!searchStr.includes(searchTerm)) return false;
    }
    
    return true;
  });
  
  jcCurrentPage = 1;
  sortJobCosts();
  renderJobCostsTable();
}

function sortJobCosts() {
  const col = jcSortColumn;
  const dir = jcSortDirection === 'asc' ? 1 : -1;
  
  jobCostsFiltered.sort((a, b) => {
    let aVal = a[col];
    let bVal = b[col];
    
    if (['estimated_cost', 'actual_cost'].includes(col)) {
      return ((aVal || 0) - (bVal || 0)) * dir;
    }
    
    aVal = (aVal || '').toString().toLowerCase();
    bVal = (bVal || '').toString().toLowerCase();
    return aVal.localeCompare(bVal) * dir;
  });
}

function renderJobCostsTable() {
  const tbody = document.getElementById('jobCostsTableBody');
  if (!tbody) return;
  
  const startIdx = (jcCurrentPage - 1) * jcPageSize;
  const endIdx = startIdx + jcPageSize;
  const pageData = jobCostsFiltered.slice(startIdx, endIdx);
  
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No costs found matching filters</td></tr>';
    updateJcPagination(0);
    return;
  }
  
  tbody.innerHTML = pageData.map(row => {
    return `<tr>
      <td>${row.job_no}</td>
      <td>${row.job_description || ''}</td>
      <td>${row.cost_code_no || ''}</td>
      <td>${row.cost_code_description || ''}</td>
      <td class="number-col">${formatCurrency(row.estimated_cost)}</td>
      <td class="number-col">${formatCurrency(row.actual_cost)}</td>
    </tr>`;
  }).join('');
  
  updateJcPagination(jobCostsFiltered.length);
}

function updateJcPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / jcPageSize));
  
  document.getElementById('jcPageInfo').textContent = `Page ${jcCurrentPage} of ${totalPages}`;
  document.getElementById('jcPrevPage').disabled = jcCurrentPage <= 1;
  document.getElementById('jcNextPage').disabled = jcCurrentPage >= totalPages;
}

// ========================================
// MISSING BUDGETS MODULE
// ========================================

let missingBudgetsFiltered = [];
let mbCurrentPage = 1;
let mbPageSize = 25;
let mbSortColumn = 'job_no';
let mbSortDirection = 'asc';
let mbActiveTab = 'noContract';
let mbEventListenersSetup = false;

function initMissingBudgets() {
  // Setup event listeners (only once)
  if (!mbEventListenersSetup) {
    setupMissingBudgetsEventListeners();
    mbEventListenersSetup = true;
  }
  
  // Load data exactly like Job Budgets does
  loadMissingBudgetsData();
}

function loadMissingBudgetsData() {
  const tbody = document.getElementById('missingBudgetsTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="loading-cell">Loading job data...</td></tr>';
  
  fetch('data/financials_jobs.json')
    .then(resp => resp.text())
    .then(text => {
      const data = JSON.parse(text.replace(/^\uFEFF/, ''));
      
      jobBudgetsData = (data.job_budgets || []).map(job => ({
        ...job,
        original_contract: parseFloat(job.original_contract) || 0,
        tot_income_adj: parseFloat(job.tot_income_adj) || 0,
        revised_contract: parseFloat(job.revised_contract) || 0,
        original_cost: parseFloat(job.original_cost) || 0,
        tot_cost_adj: parseFloat(job.tot_cost_adj) || 0,
        revised_cost: parseFloat(job.revised_cost) || 0,
        estimated_profit: (parseFloat(job.revised_contract) || 0) - (parseFloat(job.revised_cost) || 0)
      }));
      
      // Populate filters
      populateMbFilters();
      
      // Set data date
      const dateEl = document.getElementById('missingBudgetsDataAsOf');
      if (dateEl && data.generated_at) {
        dateEl.textContent = new Date(data.generated_at).toLocaleDateString();
      }
      
      // Filter and render
      filterMissingBudgets();
    })
    .catch(err => {
      console.error('Error loading missing budgets:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="loading-cell">Error loading data</td></tr>';
    });
}

function populateMbFilters() {
  const pms = [...new Set(jobBudgetsData.map(j => j.project_manager_name).filter(Boolean))].sort();
  const customers = [...new Set(jobBudgetsData.map(j => j.customer_name).filter(Boolean))].sort();
  
  const pmSelect = document.getElementById('mbPmFilter');
  if (pmSelect && pmSelect.options.length <= 1) {
    pmSelect.innerHTML = '<option value="">All Project Managers</option>' + 
      pms.map(pm => `<option value="${pm}">${pm}</option>`).join('');
  }
  
  const custSelect = document.getElementById('mbCustomerFilter');
  if (custSelect && custSelect.options.length <= 1) {
    custSelect.innerHTML = '<option value="">All Clients</option>' + 
      customers.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function setupMissingBudgetsEventListeners() {
  // Tab switching
  document.querySelectorAll('.mb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      mbActiveTab = tab.dataset.tab;
      mbCurrentPage = 1;
      filterMissingBudgets();
    });
  });
  
  // Status checkboxes
  ['mbStatusActive', 'mbStatusInactive', 'mbStatusClosed', 'mbStatusOverhead'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      mbCurrentPage = 1;
      filterMissingBudgets();
    });
  });
  
  // PM/Customer filters
  document.getElementById('mbPmFilter')?.addEventListener('change', () => {
    mbCurrentPage = 1;
    filterMissingBudgets();
  });
  document.getElementById('mbCustomerFilter')?.addEventListener('change', () => {
    mbCurrentPage = 1;
    filterMissingBudgets();
  });
  
  // Search
  document.getElementById('mbSearchInput')?.addEventListener('input', () => {
    mbCurrentPage = 1;
    filterMissingBudgets();
  });
  
  // Pagination
  document.getElementById('mbPrevPage')?.addEventListener('click', () => {
    if (mbCurrentPage > 1) {
      mbCurrentPage--;
      renderMissingBudgetsTable();
    }
  });
  
  document.getElementById('mbNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(missingBudgetsFiltered.length / mbPageSize);
    if (mbCurrentPage < totalPages) {
      mbCurrentPage++;
      renderMissingBudgetsTable();
    }
  });
  
  document.getElementById('mbPageSize')?.addEventListener('change', (e) => {
    mbPageSize = parseInt(e.target.value);
    mbCurrentPage = 1;
    renderMissingBudgetsTable();
  });
  
  // Sortable headers
  document.querySelectorAll('#missingBudgetsTable .sortable').forEach(th => {
    th.addEventListener('click', (e) => {
      if (e.target.classList.contains('expand-icon')) return;
      const col = th.dataset.sort;
      if (mbSortColumn === col) {
        mbSortDirection = mbSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        mbSortColumn = col;
        mbSortDirection = 'asc';
      }
      sortMissingBudgets();
    });
  });
  
  // Expandable column toggles for Missing Budgets table
  document.querySelectorAll('#missingBudgetsTable .expand-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = icon.dataset.expand;
      const detailClass = type === 'mb-contract' ? 'contract-detail-col' : 'cost-detail-col';
      
      icon.classList.toggle('expanded');
      
      // Toggle visibility of detail columns in Missing Budgets table only
      document.querySelectorAll(`#missingBudgetsTable .${detailClass}`).forEach(el => {
        el.classList.toggle('hidden');
      });
    });
  });
}

function filterMissingBudgets() {
  const statusActive = document.getElementById('mbStatusActive')?.checked;
  const statusInactive = document.getElementById('mbStatusInactive')?.checked;
  const statusClosed = document.getElementById('mbStatusClosed')?.checked;
  const statusOverhead = document.getElementById('mbStatusOverhead')?.checked;
  
  const pmFilter = document.getElementById('mbPmFilter')?.value || '';
  const custFilter = document.getElementById('mbCustomerFilter')?.value || '';
  const search = (document.getElementById('mbSearchInput')?.value || '').toLowerCase();
  
  // Use shared jobBudgetsData from Job Budgets module
  missingBudgetsFiltered = jobBudgetsData.filter(job => {
    // Filter by tab - check if BOTH component values are zero (handle string values)
    if (mbActiveTab === 'noContract') {
      // No Contract Value: Original Contract = 0 AND Change Orders = 0
      const origContract = parseFloat(job.original_contract) || 0;
      const changeOrders = parseFloat(job.tot_income_adj) || 0;
      if (origContract !== 0 || changeOrders !== 0) return false;
    } else {
      // No Estimated Cost: Original Cost = 0 AND Cost Adjustments = 0
      const origCost = parseFloat(job.original_cost) || 0;
      const costAdj = parseFloat(job.tot_cost_adj) || 0;
      if (origCost !== 0 || costAdj !== 0) return false;
    }
    
    // Status filter
    const status = (job.job_status || '').toLowerCase();
    if (status === 'a' || status === 'active') {
      if (!statusActive) return false;
    } else if (status === 'i' || status === 'inactive') {
      if (!statusInactive) return false;
    } else if (status === 'c' || status === 'closed') {
      if (!statusClosed) return false;
    } else if (status === 'o' || status === 'overhead') {
      if (!statusOverhead) return false;
    }
    
    // PM filter
    if (pmFilter && job.project_manager_name !== pmFilter) return false;
    
    // Customer filter
    if (custFilter && job.customer_name !== custFilter) return false;
    
    // Search
    if (search) {
      const searchFields = [job.job_no, job.job_description, job.customer_name].join(' ').toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    
    return true;
  });
  
  sortMissingBudgets();
}

function sortMissingBudgets() {
  missingBudgetsFiltered.sort((a, b) => {
    let valA = a[mbSortColumn];
    let valB = b[mbSortColumn];
    
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    
    if (valA < valB) return mbSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return mbSortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  
  renderMissingBudgetsTable();
}

function renderMissingBudgetsTable() {
  const tbody = document.getElementById('missingBudgetsTableBody');
  if (!tbody) return;
  
  if (missingBudgetsFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="loading-cell">No jobs found with missing budget data</td></tr>';
    updateMbPagination(0);
    return;
  }
  
  const start = (mbCurrentPage - 1) * mbPageSize;
  const end = start + mbPageSize;
  const pageData = missingBudgetsFiltered.slice(start, end);
  
  tbody.innerHTML = pageData.map(job => {
    const status = getJobStatusLabel(job.job_status);
    return `<tr>
      <td>${job.job_no || ''}</td>
      <td>${job.job_description || ''}</td>
      <td>${job.customer_name || ''}</td>
      <td><span class="job-status-badge ${status.class}">${status.label}</span></td>
      <td>${job.project_manager_name || ''}</td>
      <td class="number-col contract-detail-col hidden">${formatCurrency(job.original_contract)}</td>
      <td class="number-col contract-detail-col hidden">${formatCurrency(job.tot_income_adj)}</td>
      <td class="number-col revised-contract-col">${formatCurrency(job.revised_contract)}</td>
      <td class="number-col cost-detail-col hidden">${formatCurrency(job.original_cost)}</td>
      <td class="number-col cost-detail-col hidden">${formatCurrency(job.tot_cost_adj)}</td>
      <td class="number-col revised-cost-col">${formatCurrency(job.revised_cost)}</td>
    </tr>`;
  }).join('');
  
  updateMbPagination(missingBudgetsFiltered.length);
}

function updateMbPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / mbPageSize));
  
  document.getElementById('mbPageInfo').textContent = `Page ${mbCurrentPage} of ${totalPages}`;
  document.getElementById('mbPrevPage').disabled = mbCurrentPage <= 1;
  document.getElementById('mbNextPage').disabled = mbCurrentPage >= totalPages;
}

// ========================================
// ADMIN MODULE
// ========================================

let adminRoles = [];
let adminPermissions = [];
let adminUsers = [];

function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function initAdminModule() {
  // Tab switching
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`admin${tabId.charAt(0).toUpperCase() + tabId.slice(1)}Tab`).classList.add('active');
      
      if (tabId === 'users') loadUsers();
      if (tabId === 'roles') loadRoles();
      if (tabId === 'audit') loadAuditLog();
    });
  });
  
  // Add user button
  document.getElementById('addUserBtn')?.addEventListener('click', () => openUserModal());
  
  // User search
  document.getElementById('userSearchInput')?.addEventListener('input', filterUsers);
  
  // Refresh audit button
  document.getElementById('refreshAuditBtn')?.addEventListener('click', loadAuditLog);
  
  // Load initial data
  loadRolesForSelect();
  loadUsers();
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Loading users...</td></tr>';
  
  try {
    const resp = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    const data = await resp.json();
    
    if (!data.success) throw new Error(data.error);
    
    adminUsers = data.users;
    renderUsersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  const search = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  
  const filtered = adminUsers.filter(u => 
    u.displayName.toLowerCase().includes(search) || 
    u.email.toLowerCase().includes(search)
  );
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No users found</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>${escapeHtml(u.displayName)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="role-badge ${u.roleName || ''}">${u.roleName || 'None'}</span></td>
      <td><span class="status-badge ${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
      <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
      <td>
        <button class="action-btn edit" onclick="openUserModal(${u.id})">Edit</button>
        <button class="action-btn reset" onclick="resetUserPassword(${u.id})">Reset</button>
        ${u.isActive 
          ? `<button class="action-btn warning" onclick="disableUser(${u.id})">Disable</button>` 
          : `<button class="action-btn success" onclick="enableUser(${u.id})">Enable</button>`}
        <button class="action-btn delete" onclick="deleteUser(${u.id}, '${u.displayName.replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  renderUsersTable();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadRolesForSelect() {
  try {
    const resp = await fetch('/api/admin/roles', { headers: getAuthHeaders() });
    const data = await resp.json();
    if (data.success) {
      adminRoles = data.roles;
      const select = document.getElementById('userRole');
      if (select) {
        select.innerHTML = '<option value="">Select Role...</option>' + 
          adminRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load roles:', err);
  }
}

function openUserModal(userId = null) {
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const hint = document.getElementById('passwordHint');
  const error = document.getElementById('userModalError');
  
  error.textContent = '';
  document.getElementById('editUserId').value = userId || '';
  document.getElementById('userDisplayName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userRole').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userActive').checked = true;
  
  if (userId) {
    title.textContent = 'Edit User';
    hint.style.display = 'block';
    const user = adminUsers.find(u => u.id === userId);
    if (user) {
      document.getElementById('userDisplayName').value = user.displayName;
      document.getElementById('userEmail').value = user.email;
      document.getElementById('userRole').value = user.roleId || '';
      document.getElementById('userActive').checked = user.isActive;
    }
  } else {
    title.textContent = 'Add User';
    hint.style.display = 'none';
  }
  
  modal.classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

async function saveUser() {
  const userId = document.getElementById('editUserId').value;
  const error = document.getElementById('userModalError');
  const btn = document.getElementById('saveUserBtn');
  
  const data = {
    displayName: document.getElementById('userDisplayName').value.trim(),
    email: document.getElementById('userEmail').value.trim(),
    roleId: document.getElementById('userRole').value || null,
    isActive: document.getElementById('userActive').checked
  };
  
  const password = document.getElementById('userPassword').value;
  if (password) data.password = password;
  
  if (!data.displayName || !data.email) {
    error.textContent = 'Display name and email are required';
    return;
  }
  
  if (!userId && !password) {
    error.textContent = 'Password is required for new users';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Saving...';
  error.textContent = '';
  
  try {
    const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
    const method = userId ? 'PUT' : 'POST';
    
    const resp = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    closeUserModal();
    loadUsers();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save User';
  }
}

async function resetUserPassword(userId) {
  const newPassword = prompt('Enter new password (min 6 characters):');
  if (!newPassword) return;
  
  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }
  
  try {
    const resp = await fetch(`/api/admin/reset-password/${userId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ password: newPassword })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    alert('Password reset successfully');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function disableUser(userId) {
  if (!confirm('Are you sure you want to disable this user? They will not be able to log in.')) return;
  
  try {
    const resp = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ isActive: false })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    loadUsers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function enableUser(userId) {
  try {
    const resp = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ isActive: true })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    loadUsers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteUser(userId, displayName) {
  if (!confirm(`Are you sure you want to permanently delete "${displayName}"? This action cannot be undone.`)) return;
  if (!confirm('This will delete all user data including sessions, preferences, and audit history. Continue?')) return;
  
  try {
    const resp = await fetch(`/api/admin/users/${userId}/permanent`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    alert('User deleted successfully');
    loadUsers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadRoles() {
  const container = document.getElementById('rolesContainer');
  container.innerHTML = '<div class="loading-spinner">Loading roles...</div>';
  
  try {
    const [rolesResp, permsResp] = await Promise.all([
      fetch('/api/admin/roles', { headers: getAuthHeaders() }),
      fetch('/api/admin/permissions', { headers: getAuthHeaders() })
    ]);
    
    const rolesData = await rolesResp.json();
    const permsData = await permsResp.json();
    
    if (!rolesData.success || !permsData.success) throw new Error('Failed to load data');
    
    adminRoles = rolesData.roles;
    adminPermissions = permsData.permissions;
    
    let html = `
      <div class="roles-header">
        <h3>Manage Roles</h3>
        <button class="btn-primary" onclick="openRoleModal()">+ Add Role</button>
      </div>
    `;
    
    for (const role of adminRoles) {
      const rolePermsResp = await fetch(`/api/admin/roles/${role.id}/permissions`, { headers: getAuthHeaders() });
      const rolePermsData = await rolePermsResp.json();
      const rolePerms = rolePermsData.permissions || [];
      
      const isProtected = role.name.toLowerCase() === 'admin';
      
      html += `
        <div class="role-card" data-role-id="${role.id}">
          <div class="role-card-header">
            <div>
              <span class="role-card-title">${escapeHtml(role.name)}</span>
              ${isProtected ? '<span class="role-protected-badge">System Role</span>' : ''}
            </div>
            <div class="role-card-actions">
              <button class="action-btn edit" onclick="openRoleModal(${role.id})">Edit</button>
              ${!isProtected ? `<button class="action-btn delete" onclick="deleteRole(${role.id}, '${escapeHtml(role.name)}')">Delete</button>` : ''}
            </div>
          </div>
          <div class="role-card-description">${escapeHtml(role.description || '')}</div>
          <div class="permissions-grouped">
            ${renderGroupedPermissions(adminPermissions, rolePerms, role.id, 'perm')}
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="loading-cell">Error: ${err.message}</div>`;
  }
}

async function openRoleModal(roleId = null) {
  const modal = document.getElementById('roleModal');
  const title = document.getElementById('roleModalTitle');
  const error = document.getElementById('roleModalError');
  const grid = document.getElementById('rolePermissionsGrid');
  
  error.textContent = '';
  document.getElementById('editRoleId').value = roleId || '';
  document.getElementById('roleName').value = '';
  document.getElementById('roleDescription').value = '';
  
  // Load permissions if not already loaded
  if (!adminPermissions || adminPermissions.length === 0) {
    try {
      const resp = await fetch('/api/admin/permissions', { headers: getAuthHeaders() });
      const data = await resp.json();
      if (data.success) adminPermissions = data.permissions;
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }
  }
  
  let rolePerms = [];
  
  if (roleId) {
    title.textContent = 'Edit Role';
    const role = adminRoles.find(r => r.id === roleId);
    if (role) {
      document.getElementById('roleName').value = role.name;
      document.getElementById('roleDescription').value = role.description || '';
    }
    
    try {
      const resp = await fetch(`/api/admin/roles/${roleId}/permissions`, { headers: getAuthHeaders() });
      const data = await resp.json();
      if (data.success) rolePerms = data.permissions;
    } catch (err) {
      console.error('Failed to load role permissions:', err);
    }
  } else {
    title.textContent = 'Add Role';
  }
  
  // Render permissions grid with grouping
  grid.innerHTML = renderGroupedPermissions(adminPermissions, rolePerms, null, 'modal_perm');
  
  modal.classList.remove('hidden');
}

function renderGroupedPermissions(permissions, selectedPerms, roleId, prefix) {
  const permissionGroups = {
    'Financials': ['overview', 'revenue', 'account', 'income_statement', 'balance_sheet', 'cash_flow', 'cash_balances', 'receivables'],
    'Job Reports': ['job_overview', 'job_budgets', 'job_actuals', 'cost_detail', 'missing_budgets', 'job_analytics'],
    'Admin': ['admin']
  };
  
  let html = '';
  
  for (const [groupName, groupKeys] of Object.entries(permissionGroups)) {
    const groupPerms = permissions.filter(p => groupKeys.includes(p.pageKey));
    if (groupPerms.length === 0) continue;
    
    html += `<div class="permission-group">
      <div class="permission-group-title">${escapeHtml(groupName)}</div>
      <div class="permission-group-items">`;
    
    for (const p of groupPerms) {
      const inputId = roleId ? `${prefix}_${roleId}_${p.pageKey}` : `${prefix}_${p.pageKey}`;
      const isChecked = selectedPerms.includes(p.pageKey) ? 'checked' : '';
      const onChangeAttr = roleId ? `onchange="saveRolePermissions(${roleId})"` : '';
      
      html += `
        <div class="permission-item">
          <input type="checkbox" id="${inputId}" ${isChecked} ${onChangeAttr}>
          <label for="${inputId}">${escapeHtml(p.pageName)}</label>
        </div>`;
    }
    
    html += `</div></div>`;
  }
  
  return html;
}

function closeRoleModal() {
  document.getElementById('roleModal').classList.add('hidden');
}

async function saveRole() {
  const roleId = document.getElementById('editRoleId').value;
  const error = document.getElementById('roleModalError');
  const btn = document.getElementById('saveRoleBtn');
  
  const name = document.getElementById('roleName').value.trim();
  const description = document.getElementById('roleDescription').value.trim();
  
  if (!name) {
    error.textContent = 'Role name is required';
    return;
  }
  
  // Collect selected permissions
  const permissions = [];
  adminPermissions.forEach(p => {
    const cb = document.getElementById(`modal_perm_${p.pageKey}`);
    if (cb && cb.checked) {
      permissions.push(p.pageKey);
    }
  });
  
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    const url = roleId ? `/api/admin/roles/${roleId}` : '/api/admin/roles';
    const method = roleId ? 'PUT' : 'POST';
    
    const resp = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description, permissions })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    closeRoleModal();
    loadRoles();
    loadRolesForSelect();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Role';
  }
}

async function deleteRole(roleId, roleName) {
  if (!confirm(`Are you sure you want to delete the "${roleName}" role?`)) return;
  
  try {
    const resp = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    const result = await resp.json();
    
    if (!result.success) {
      if (result.error === 'users_assigned') {
        openReassignModal(roleId, roleName, result.users, result.availableRoles);
        return;
      }
      throw new Error(result.error);
    }
    
    loadRoles();
    loadRolesForSelect();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function openReassignModal(roleId, roleName, users, availableRoles) {
  const modal = document.getElementById('roleReassignModal');
  const message = document.getElementById('reassignMessage');
  const usersList = document.getElementById('reassignUsersList');
  const roleSelect = document.getElementById('reassignNewRole');
  const error = document.getElementById('reassignModalError');
  
  document.getElementById('reassignRoleId').value = roleId;
  error.textContent = '';
  
  const userCount = users.length;
  message.innerHTML = `The <strong>"${escapeHtml(roleName)}"</strong> role has <strong>${userCount} user${userCount > 1 ? 's' : ''}</strong> assigned. Please select a new role for them before deleting.`;
  
  usersList.innerHTML = users.map(u => `
    <div class="reassign-user-item">
      <div class="reassign-user-icon">${escapeHtml(u.username.charAt(0).toUpperCase())}</div>
      <span class="reassign-user-name">${escapeHtml(u.username)}</span>
    </div>
  `).join('');
  
  roleSelect.innerHTML = '<option value="">Select new role...</option>' + 
    availableRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  
  modal.classList.remove('hidden');
}

function closeReassignModal() {
  document.getElementById('roleReassignModal').classList.add('hidden');
}

async function confirmReassignAndDelete() {
  const roleId = document.getElementById('reassignRoleId').value;
  const newRoleId = document.getElementById('reassignNewRole').value;
  const error = document.getElementById('reassignModalError');
  const btn = document.getElementById('confirmReassignBtn');
  
  if (!newRoleId) {
    error.textContent = 'Please select a role to reassign users to';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Processing...';
  error.textContent = '';
  
  try {
    const resp = await fetch(`/api/admin/roles/${roleId}/reassign-and-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newRoleId: parseInt(newRoleId) })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    closeReassignModal();
    loadRoles();
    loadRolesForSelect();
    loadUsers();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reassign & Delete Role';
  }
}

async function saveRolePermissions(roleId) {
  const card = document.querySelector(`.role-card[data-role-id="${roleId}"]`);
  const checkboxes = card.querySelectorAll('input[type="checkbox"]');
  const permissions = [];
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const pageKey = cb.id.replace(`perm_${roleId}_`, '');
      permissions.push(pageKey);
    }
  });
  
  try {
    const resp = await fetch(`/api/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ permissions })
    });
    
    const result = await resp.json();
    if (!result.success) throw new Error(result.error);
    
    alert('Permissions saved successfully');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadAuditLog() {
  const tbody = document.getElementById('auditLogBody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Loading audit log...</td></tr>';
  
  try {
    const resp = await fetch('/api/admin/audit-log?limit=100', { headers: getAuthHeaders() });
    const data = await resp.json();
    
    if (!data.success) throw new Error(data.error);
    
    if (data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No audit logs found</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.logs.map(log => `
      <tr>
        <td>${log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''}</td>
        <td>${escapeHtml(log.userName || 'Unknown')}</td>
        <td>${escapeHtml(log.action)}</td>
        <td>${log.details ? escapeHtml(JSON.stringify(log.details).substring(0, 50)) : ''}</td>
        <td>${escapeHtml(log.ipAddress || '')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

// Map data-section attributes to permission page_keys
const sectionToPermission = {
  'overview': 'overview',
  'revenue': 'revenue',
  'accounts': 'account',
  'incomeStatement': 'income_statement',
  'balanceSheet': 'balance_sheet',
  'cashFlows': 'cash_flow',
    'receivablesPayables': 'receivables',
  'jobAnalytics': 'job_analytics',
  'jobOverview': 'job_overview',
  'jobBudgets': 'job_budgets',
  'jobActuals': 'job_actuals',
  'costDetail': 'cost_detail',
  'missingBudgets': 'missing_budgets',
  'cashReports': 'cash_balances',
  'admin': 'admin'
};

// Order of sections for default page selection
const sectionOrder = [
  'overview', 'revenue', 'incomeStatement', 'balanceSheet', 'cashFlows', 
  'cashReports', 'accounts', 'receivablesPayables', 'jobOverview', 'jobBudgets', 'jobActuals', 'costDetail', 'missingBudgets', 'jobAnalytics'
];

// Check permissions and show/hide nav items based on user role
async function checkAdminAccess() {
  const token = getAuthToken();
  console.log('[DEBUG] checkAdminAccess - token:', token ? 'exists' : 'missing');
  if (!token) {
    // No token - show overview as default for legacy behavior
    showDefaultSection();
    return;
  }
  
  try {
    const resp = await fetch('/api/verify-session', { headers: getAuthHeaders() });
    const data = await resp.json();
    console.log('[DEBUG] verify-session response:', JSON.stringify(data));
    
    if (data.success && data.user) {
      const userPerms = data.user.permissions || [];
      // Case-insensitive admin check
      const userRole = data.user.role || '';
      const isAdmin = userRole.toLowerCase() === 'admin';
      console.log('[DEBUG] userRole:', userRole, 'isAdmin:', isAdmin);
      
      // Get all nav items
      const navItems = document.querySelectorAll('.nav-item[data-section]');
      
      navItems.forEach(navItem => {
        const section = navItem.getAttribute('data-section');
        const permKey = sectionToPermission[section];
        
        if (permKey) {
          // Admin role has all permissions, otherwise check specific permission
          if (isAdmin || userPerms.includes(permKey)) {
            navItem.classList.remove('hidden');
          } else {
            navItem.classList.add('hidden');
          }
        }
      });
      
      // Special handling for admin nav - only visible to admin role
      const adminNavItem = document.getElementById('adminNavItem');
      console.log('[DEBUG] adminNavItem element:', adminNavItem);
      console.log('[DEBUG] adminNavItem classList before:', adminNavItem ? adminNavItem.classList.toString() : 'null');
      if (adminNavItem) {
        if (isAdmin) {
          adminNavItem.classList.remove('hidden');
          console.log('[DEBUG] Removed hidden class from adminNavItem');
        } else {
          adminNavItem.classList.add('hidden');
          console.log('[DEBUG] Added hidden class to adminNavItem');
        }
        console.log('[DEBUG] adminNavItem classList after:', adminNavItem.classList.toString());
      }
      
      // Store permissions for later use (in memory and localStorage for page refresh)
      window.userPermissions = userPerms;
      window.isAdminUser = isAdmin;
      window.userRole = userRole;
      
      // Cache admin status in localStorage for immediate access on page refresh
      localStorage.setItem("ftg_is_admin", isAdmin ? "true" : "false");
      localStorage.setItem("ftg_user_role", userRole);
      
      // Navigate to the appropriate default page based on permissions
      navigateToDefaultPage(userRole, userPerms, isAdmin);
    } else {
      // Session invalid - but preserve cached admin status for display continuity
      console.log('[DEBUG] Session invalid but checking cached admin status');
      const cachedIsAdmin = localStorage.getItem("ftg_is_admin") === "true";
      if (cachedIsAdmin) {
        window.isAdminUser = true;
        const adminNavItem = document.getElementById('adminNavItem');
        if (adminNavItem) {
          adminNavItem.classList.remove('hidden');
          console.log('[DEBUG] Session invalid - Preserved admin nav from cache');
        }
      }
      showDefaultSection();
    }
  } catch (err) {
    console.error('[DEBUG] Failed to check permissions:', err);
    // On error, preserve cached admin status and show default section
    const cachedIsAdmin = localStorage.getItem("ftg_is_admin") === "true";
    console.log('[DEBUG] Error catch - cachedIsAdmin:', cachedIsAdmin);
    if (cachedIsAdmin) {
      window.isAdminUser = true;
      const adminNavItem = document.getElementById('adminNavItem');
      if (adminNavItem) {
        adminNavItem.classList.remove('hidden');
        console.log('[DEBUG] Error catch - Preserved admin nav visibility from cache');
      }
    }
    showDefaultSection();
  }
}

// Fallback function to show overview when permission check fails or for non-authenticated users
function showDefaultSection() {
  const overviewEl = document.getElementById('overview');
  const overviewNav = document.querySelector('.nav-item[data-section="overview"]');
  
  if (overviewEl) {
    overviewEl.classList.add('visible');
    initOverviewModule();
    loadFinancialCharts();
  }
  if (overviewNav) {
    overviewNav.classList.add('active');
  }
  
  // Also check if we have stored admin status from a previous successful auth
  if (window.isAdminUser) {
    const adminNavItem = document.getElementById('adminNavItem');
    if (adminNavItem) adminNavItem.classList.remove('hidden');
  }
}

function navigateToDefaultPage(userRole, userPerms, isAdmin) {
  // Determine which section to show
  let targetSection = null;
  
  // For Project Managers (manager role), default to Job Budgets if they have access
  const roleLower = userRole.toLowerCase();
  if (roleLower === 'manager' && (isAdmin || userPerms.includes('job_budgets'))) {
    targetSection = 'jobBudgets';
  } else if (isAdmin) {
    // Admins default to overview
    targetSection = 'overview';
  } else {
    // For everyone else, find the first permitted section
    for (const section of sectionOrder) {
      const permKey = sectionToPermission[section];
      if (permKey && userPerms.includes(permKey)) {
        targetSection = section;
        break;
      }
    }
  }
  
  if (targetSection) {
    // Navigate to the target section
    const sections = document.querySelectorAll('.dashboard-section');
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    
    // Remove visible from all sections
    sections.forEach(s => s.classList.remove('visible'));
    navItems.forEach(i => i.classList.remove('active'));
    
    // Activate target section
    const targetEl = document.getElementById(targetSection);
    const targetNav = document.querySelector(`.nav-item[data-section="${targetSection}"]`);
    
    if (targetEl) targetEl.classList.add('visible');
    if (targetNav) targetNav.classList.add('active');
    
    // Hide export ribbon on admin page
    const exportArea = document.querySelector('.content-export-area');
    if (exportArea) {
      exportArea.style.display = targetSection === 'admin' ? 'none' : '';
    }
    
    // Expand parent nav if needed
    const finStatementsParent = document.getElementById("navFinancialStatements");
    const finStatementsChildren = document.getElementById("navFinancialStatementsChildren");
    const jobsParent = document.getElementById("navJobs");
    const jobsChildren = document.getElementById("navJobsChildren");
    
    const fsChildren = ['overview', 'revenue', 'incomeStatement', 'balanceSheet', 'cashFlows', 'cashReports', 'accounts', 'receivablesPayables'];
    const jobsChildItems = ['jobOverview', 'jobBudgets', 'jobActuals', 'costDetail', 'missingBudgets', 'jobAnalytics'];
    
    if (fsChildren.includes(targetSection) && finStatementsParent && finStatementsChildren) {
      finStatementsParent.classList.add("expanded");
      finStatementsChildren.classList.add("expanded");
    }
    
    if (jobsChildItems.includes(targetSection) && jobsParent && jobsChildren) {
      jobsParent.classList.add("expanded");
      jobsChildren.classList.add("expanded");
    }
    
    // Initialize the section if needed
    if (targetSection === "overview") {
      initOverviewModule();
      loadFinancialCharts();
    }
    if (targetSection === "jobBudgets") initJobBudgets();
    if (targetSection === "missingBudgets") initMissingBudgets();
    if (targetSection === "revenue") initRevenueModule();
    if (targetSection === "accounts") initAccountModule();
    if (targetSection === "incomeStatement") loadIncomeStatement();
    if (targetSection === "balanceSheet") initBalanceSheet();
    if (targetSection === "cashFlows") loadCashFlowStatement();
    if (targetSection === "cashReports") initCashReports();
    if (targetSection === "admin") initAdminModule();
  }
  
  // Show admin nav item if user is admin
  if (isAdmin) {
    const adminNavItem = document.getElementById('adminNavItem');
    if (adminNavItem) adminNavItem.classList.remove('hidden');
  }
}

// Update initNavigation to handle admin section
const originalInitNav = initNavigation;
initNavigation = function() {
  originalInitNav();
  
  // Add admin section handler
  const adminNavItem = document.getElementById('adminNavItem');
  if (adminNavItem) {
    adminNavItem.addEventListener('click', () => {
      initAdminModule();
    });
  }
  
  // Check admin access on load
  console.log('Calling checkAdminAccess from initNavigation');
  checkAdminAccess();
  
  // Fallback: Re-check admin nav visibility after a delay to handle any race conditions
  setTimeout(() => {
    const cachedIsAdmin = localStorage.getItem("ftg_is_admin") === "true";
    const adminNav = document.getElementById('adminNavItem');
    console.log('[DEBUG] Fallback check - cachedIsAdmin:', cachedIsAdmin, 'adminNav:', adminNav);
    if (cachedIsAdmin && adminNav && adminNav.classList.contains('hidden')) {
      console.log('[DEBUG] Fallback: Forcing admin nav to show');
      adminNav.classList.remove('hidden');
    }
  }, 500);
};
