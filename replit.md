# FTG Dashboard

## Overview
FTG Dashboard is a client-side financial dashboard application providing password-protected access to business financial metrics. It tracks and visualizes revenue, accounts receivable, and accounts payable across multiple years (2015-2025). The application features a responsive design, robust data visualization, and AI-powered insights for comprehensive financial analysis, aiming to deliver strategic business intelligence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The application is a pure client-side solution built with vanilla HTML, CSS, and JavaScript. All static assets are served from the `/public` directory.

### Authentication & User Management
The system uses database-backed authentication with bcrypt password hashing, flexible role-based access control (RBAC), server-side token-based session management, and TOTP-based Two-Factor Authentication (2FA). The Admin Dashboard provides user and role CRUD operations with page-level permission controls and an audit log.

### Data Management
Financial data is stored in static JSON files (`financials.json`, `account_groups.json`, `ar_invoices.json`, `ap_invoices.json`, etc.) with monthly granularity, covering 2015-2025. A `DataCache` utility provides 5-minute TTL caching for financial data to optimize performance.

### Dashboard Views
The dashboard provides several key views for financial analysis:
- **Executive Overview**: Configurable metric tiles.
- **Account Detail**: GL account drilldown.
- **Income Statement**: Hierarchical P&L with comparison modes and a Revenue to Operating Income Waterfall Chart.
- **Balance Sheet**: Cumulative balances with detailed breakdowns.
- **Statement of Cash Flows**: Indirect method with AI analysis.
- **Cash Balances**: Tracks cash position from balance sheet and Google Sheets, including a Cash Report with an auto-generated executive summary, daily/weekly views, metric tiles with delta badges, and a Cash Balance Safety Check formula.
- **AP/AR Aging**: Reports grouped by vendor/customer with aging buckets, charts, and detailed invoice modals.
- **Jobs Module**: Consolidates Job and PM Overview, Budgets, Job Actuals, Cost Codes, and Over/Under Billing for detailed job costing and performance analysis, including a Profitability Heat Map and PM Performance Radar Chart.
- **Distribution Reports (Admin Only)**: Dedicated section for specialized reports like the Cash Report.

### AI Insights & Natural Language Q&A
A dedicated AI-powered analysis page with a ChatGPT-style chat interface provides strategic business intelligence. Features include:
- **Welcome Screen**: Centered AI icon with greeting and 6 quick-start suggestion buttons
- **Chat Messages**: Avatar-based conversation (blue for user, green for assistant) with smooth animations
- **Fixed Input Area**: "Run Full Analysis" button on left, text input with send button on right
- **Responsive Design**: Optimized layouts for mobile (768px), tablet (769-1024px), and desktop
- **Dark Mode**: Full dark theme support

The system uses a **Semantic Data Catalog** architecture with a two-stage AI process (intent classification, structured query plan generation, Python resolvers, natural language answer generation) for flexible querying across entities (jobs, AR, AP, GL, cash, PM summaries, cost codes, customers). Josh Angelo is excluded from all PM analysis.

#### NLQ Calculation Consistency (Dec 2025)
Critical alignment between page-level calculations and NLQ resolvers:
- **AR Aging**: Only includes invoices with `calculated_amount_due > 0`; collectible = calc_due - retainage; aging buckets use collectible amounts; retainage tracked separately; total_due = collectible + retainage; includes weighted avg days outstanding and top5 customer concentration
- **AP Aging**: Uses remaining_balance > 0; includes weighted avg days outstanding and top5 vendor concentration
- **Income Statement**: Revenue = accounts 4000 + 4090; Direct Expenses = 5000-5025 + 5200 + 5300 + 5410 + 5500; Indirect = 6xxx; Operating Expenses = 7000-7599; formulas match account_groups.json
- **Jobs**: percent_complete = actual_cost / budget_cost * 100 (0% when no budget!); earned_revenue = (actual_cost/budget_cost) * contract; over_under_billing = billed - earned_revenue; backlog = contract - earned_revenue; has_budget flag tracks jobs without budgets
- **Job Profit/Margin (Dec 2025)**: Closed jobs (status='C') use actual: profit = billed - actual_cost, margin = profit/billed. Active jobs use projected: profit = contract - budget_cost, margin = profit/contract. Jobs missing revenue/cost data excluded from profit aggregations via valid_for_profit flag.

#### Important Data Flags
- **has_budget**: Critical flag on jobs - many jobs show 0% completion because they have no budget (revised_cost = 0). NLQ explains this and shows actual_cost instead.
- **Active vs All Jobs**: For "current" metrics like backlog, filter to job_status='A'. Completed jobs may have negative backlog (earned > contract).
- Josh Angelo is excluded from all PM analysis but NOT from AR Aging page totals (only when PM filter is applied)

#### NLQ Aggregation Rules (Dec 2025)
- Sum/Average of backlog, earned_revenue, percent_complete, margin only includes jobs WITH budgets
- Jobs without budgets are excluded from these aggregations and counted separately
- For "current backlog" queries, semantic catalog instructs AI to filter to active jobs only


#### Canonical Metrics Layer (Dec 2025)
All dashboard pages use a pre-computed metrics layer via `/api/metrics/*` endpoints as the single source of truth:
- **Jobs Metrics**: `/api/metrics/jobs` - 4259 jobs with pre-computed percent_complete, earned_revenue, over_under_billing, backlog, margin, has_budget flag
- **AR Metrics**: `/api/metrics/ar` - 324 invoices with aging buckets, summary totals (total_due, collectible, retainage)
- **AP Metrics**: `/api/metrics/ap` - 967 invoices with aging buckets, summary totals
- **PM Metrics**: `/api/metrics/pm` - 15 project managers with aggregated metrics
- **Summary**: `/api/metrics/summary` - Quick access to counts and totals

This ensures complete consistency between page-level displays and NLQ responses - all use the same pre-computed values from `metrics_etl.py`.

#### Legitimate Raw Data Exceptions
Three modules require raw detail-level data that isn't in the metrics cache:
1. **Cost Codes Module** (`initCostCodes`): Needs individual `job_actuals` line items with cost code breakdown to display per-cost-code analysis
2. **Job Costs Table** (`loadJobCostsData`): Needs individual `job_actuals` line items with cost code detail for cost breakdown display
3. **Cash Report Safety Details** (`loadCashReportData`): Uses metrics for totals (AR, AP, OUB), but keeps raw AR/AP invoices for detailed safety breakdown sections showing individual invoices
### Responsive Design
The application uses a mobile-first approach with a responsive sidebar, hamburger menu, CSS flexbox layouts, and orientation-aware media queries for landscape mobile/tablet compatibility.

### UI/UX Decisions
The interface features smooth page transitions, gradient accents, glassmorphism effects, drag-and-drop tiles, subtle hover effects, skeleton loading states, and notification animations.

### Performance Optimizations
Includes deferred and lazy loading of scripts, font optimization with preconnect and preload, optimized cache headers via the Flask server, proper Chart.js instance management, and data caching with TTL.

## External Dependencies

### Fonts
- **Google Fonts**: Inter font family is loaded via CDN.

### Backend Services
- **Flask Server**: A Python Flask application (`public/server.py`) is used for serving static files during local development.

### Export & Email Features
- **EmailJS**: Client-side service for sending current report views and images via email.
- **Scheduled Email Reports**: A background scheduler handles delivery of user-configured scheduled reports.
- **Universal Export Ribbon**: Provides Print, PDF, Email, and Schedule Email options.
- **Table-Specific CSV/Excel Exports**: Individual data tables offer dedicated CSV and Excel export buttons.

### Static Assets
- **Logo**: `logo.png` is used for branding.
- **Data Storage**: All core financial data is stored in static JSON files.