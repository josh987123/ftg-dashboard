# FTG Dashboard

## Overview
FTG Dashboard is a client-side financial dashboard application providing password-protected access to business financial metrics. It tracks and visualizes revenue, accounts receivable, and accounts payable across multiple years (2015-2025). The application features a responsive design, mobile sidebar navigation, robust data visualization, and AI-powered insights for comprehensive financial analysis, aiming to deliver strategic business intelligence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The application is a pure client-side solution built with vanilla HTML, CSS, and JavaScript. All static assets are served from the `/public` directory.

### Authentication & User Management
The system uses database-backed authentication with bcrypt password hashing, flexible role-based access control (RBAC), and server-side token-based session management. It supports TOTP-based Two-Factor Authentication (2FA) with encrypted secrets and backup codes, and self-service and admin-initiated password resets. The Admin Dashboard (for `admin` role) provides user and role CRUD operations with page-level permission controls and an audit log.

### Data Management
Financial data is stored in static JSON files (`financials.json`, `account_groups.json`, `ar_invoices.json`, `ap_invoices.json`, etc.) with monthly granularity, covering 2015-2025.

### Dashboard Views
The dashboard provides several key views for financial analysis:
- **Executive Overview**: Configurable metric tiles with comparison options.
- **Revenue**: Monthly/quarterly/annual charts with KPIs.
- **Account Detail**: GL account drilldown.
- **Income Statement**: Hierarchical P&L with comparison modes.
- **Balance Sheet**: Cumulative balances with detailed breakdowns.
- **Statement of Cash Flows**: Indirect method with AI analysis.
- **Cash Balances**: Tracks cash position from balance sheet and Google Sheets.
- **AP/AR Aging**: Reports grouped by vendor/customer with aging buckets, bar charts, and detailed invoice modals.
- **Jobs Module**: Contains Job Overview, Budgets, Job Actuals, Cost Codes, and PM Report views for detailed job costing and performance analysis. Includes:
  - **Profitability Heat Map** (Job Overview): Visualizes profit margins by Project Manager or Client and job size range (contract value buckets), with color-coded cells (green = high margin, red = loss) and hover tooltips showing job counts and totals. Width matches AI Analysis section on desktop.
  - **PM Performance Radar Chart** (PM Report): Located under AI Analysis section. Compares individual PM metrics to portfolio average across 5 normalized dimensions (profit margin, job count, contract value, avg job size, billing position). Excludes Josh Angelo.
- **Distribution Reports (Admin Only)**: A dedicated section visible only to admin users, containing placeholder pages for future specialized reports:
  - Dept Head Meeting
  - Daily Cash Report
  - Weekly PM Report
  - Month End Reporting
- **Income Statement**: Supports single period and matrix views with AI analysis.
  - **Revenue to Operating Income Waterfall Chart**: Displayed under AI Analysis section, only visible in single period mode. Shows detailed waterfall flow: Revenue → Direct Labor → Materials → Subcontracts → Other Direct → Indirect Labor → Other Indirect → Gross Profit → Operating Exp → Operating Income. Uses floating bars for proper deduction visualization. Profit bars shown in green, deduction bars in red.

### AI Insights
A dedicated AI-powered analysis page aggregates data from all sources to provide strategic business intelligence, including executive summaries, financial health, job performance, cash flow, AR/AP, PM performance, and strategic recommendations.

### Responsive Design
The application uses a mobile-first approach with a responsive sidebar, hamburger menu, and CSS flexbox layouts. A dedicated "LANDSCAPE MOBILE/TABLET COMPATIBILITY" section in `style.css` provides orientation-aware media queries (`@media (orientation: landscape)`) to ensure proper display on phones and tablets in landscape mode. This includes horizontal metric tile layouts, readable font sizes (14px minimum for values, 9px for labels), and appropriate chart sizing.

### Session & Navigation State
Authentication status, user roles, and sidebar collapse state are cached in `localStorage` for immediate UI responsiveness.

### UI/UX Decisions
The interface features smooth page transitions, gradient accents, glassmorphism effects for modals, drag-and-drop tiles, subtle button and card hover effects, skeleton loading states, and notification animations. It includes a custom time-based greeting.

### Structured Audit Logging
Comprehensive audit logging tracks events across authentication, security, user/role management, and data access with severity levels and detailed metadata.

### Color Standards
A defined color palette uses specific colors for positive/success, negative/error, primary actions, and warnings.

### Chart Theme Switching
A centralized architecture allows for theme-adaptive Chart.js charts using CSS variables, a `ChartThemeManager` singleton, and a `ChartThemePlugin` for automatic color application and gradient regeneration on theme changes.

## External Dependencies

### Fonts
- **Google Fonts**: Inter font family (weights: 300-700) is loaded via CDN.

### Backend Services
- **Flask Server**: A Python Flask application (`public/server.py`) is used for serving static files during local development.

### Export & Email Features
- **Universal Export**: Print, PDF, and CSV export functionality across dashboard views.
- **EmailJS**: Client-side service used for sending current report views and images via email.
- **Scheduled Email Reports**: A background scheduler handles delivery of user-configured scheduled reports, with schedules stored in a database table.

### Static Assets
- **Logo**: `logo.png` is used for branding.
- **Data Storage**: All core financial data is stored in static JSON files.

## Performance Optimizations (December 2024)

### Script Loading
- **Deferred Loading**: Chart.js and dashboard.js use `defer` attribute for non-blocking load
- **Lazy Loading**: Heavy export libraries (html2canvas, jsPDF, XLSX, ExcelJS, EmailJS) are loaded on-demand via `LazyLoader` utility when user triggers export/email functions
- Initial page load reduced by ~500KB+ by deferring export libraries

### Font Optimization
- Google Fonts Inter uses preconnect and preload for faster font loading

### Cache Control
Flask server applies optimized cache headers by file type:
- Images/fonts: 1 year cache (immutable assets)
- CSS/JS: 1 day cache (versioned via query strings)
- JSON data files: 5 minutes cache
- HTML: no-cache for fresh content

### Chart.js Management
All chart instances properly destroyed before recreation to prevent memory leaks.

### Data Caching
`DataCache` utility provides 5-minute TTL caching for financial data:
- Methods: getGLData(), getJobsData(), getARData(), getAPData(), getAccountGroups()
- Deduplicates concurrent requests to same endpoint
- Used by Job Budgets, Job Actuals, Job Costs, and Job Overview loaders
- Can be invalidated via invalidate() method if needed

### PM Exclusion Configuration
`PM_EXCLUSION_CONFIG` centralizes PM exclusions (e.g., Josh Angelo):
- isExcluded(pmName): Check if a PM should be excluded from analysis
- getExclusionNote(): Returns UI-friendly exclusion note
- getAIPromptExclusion(): Returns AI prompt instructions for exclusion

### PM Selection UI (December 2024)
PM selection uses first-name button tabs (not dropdowns) across 6 job-related pages:
- **Pages**: PM Report, Job Overview, Job Budgets, Job Actuals, Cost Code Analysis, Over/Under Billing
- **Tab Bar Layout**: "All" button first, then PM first names sorted by `PM_TAB_ORDER` preference, then alphabetically
- **Filtering**: Only PMs with active jobs shown in tabs; "All" option shows all data including inactive PMs
- **Status Filters**: Checkbox-based (Active, Inactive, Closed, Overhead) in a dedicated status-filter-bar below tabs
- **State Management**: `pmTabsState` object tracks selected PM for each page (pmr, jo, jb, ja, cc, oub keys)
- **CSS Classes**: `pm-tabs-bar`, `pm-tab-btn`, `pm-tab-btn.active` with dark mode support and mobile responsiveness
- **Helper Functions**:
  - `buildPmTabs(containerId, pms, pageKey, onSelect)`: Generic tab builder used by all pages
  - `getActivePmsFromData(data)`: Extracts PMs with active jobs for tab display
  - `getSelectedPmForPage(pageKey)`: Retrieves selected PM from pmTabsState