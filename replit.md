# FTG Dashboard

## Overview

FTG Dashboard is a client-side financial dashboard application for tracking and visualizing business financial metrics. The application provides password-protected access to financial data including revenue, accounts receivable, and accounts payable across multiple years (2015-2025). It features a responsive design with mobile sidebar navigation and data visualization capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Pure client-side application**: The dashboard is built entirely with vanilla HTML, CSS, and JavaScript without frameworks
- **Static file serving**: All assets are served from the `/public` directory
- **Component structure**:
  - `index.html` - Main application shell with login screen, header, and sidebar layout
  - `style.css` - Complete styling using CSS custom properties and responsive design
  - `dashboard.js` - All application logic including authentication and navigation

### Authentication
- **Client-side password protection**: Simple password check against a hardcoded value (`Ftgb2025$`)
- **Session persistence**: Uses `localStorage` to remember authentication state
- **Login flow**: Modal overlay blocks access until correct password is entered

### Data Management
- **Static JSON files**: Financial data is stored in `/public/data/financials.json` and account hierarchy in `/public/data/account_groups.json`
- **Data structure**: Organized by metric type (revenue, accounts_receivable, accounts_payable) with yearly arrays containing monthly values
- **GL History**: `gl_history_all` array contains individual GL account data with monthly columns in "YYYY-MM" format
- **Accounts**: `accounts` array contains account metadata (account_no, description, debit_credit)
- **Account Groups**: `income_statement.groups` and `balance_sheet.groups` arrays define hierarchical financial statement structures with accounts, accounts_range, formulas, levels, and row types (header, detail, subtotal, ratio)
- **Historical range**: Covers 2015-2025 with monthly granularity

### Dashboard Views
- **Executive Overview**: Six metric tiles with bar charts showing key financial metrics:
  - Metrics: Revenue, Gross Profit, Gross Profit %, Operating Expenses, Operating Profit, Operating Profit %
  - Configuration options: View type (monthly/quarterly/annual), year selector, year range slider for annual view
  - Compare to prior year option adds red bars for prior year comparison
  - Responsive grid layout (3 columns desktop, 2 tablet, 1 mobile)
- **Revenue**: Monthly/quarterly/annual revenue charts with year comparison, trendlines, summary KPI tiles (Average, Largest, Smallest, CAGR), and export options (Print/PDF/CSV). Partial periods shown in orange with "Exclude Current Period" option.
- **Account Detail**: GL account drilldown with dropdown selector (accounts 4000+), monthly/quarterly/annual views, trendlines, and data tables. Income accounts (4000-4999, 8000-8999) display as positive values.
- **Income Statement**: Full P&L statement with hierarchical account groups from account_groups.json:
  - Period types: Month, Quarter, Year, YTD, TTM
  - Comparison modes: None, Prior Period, Prior Year (with $ and % variance)
  - View modes: Single Period or Matrix (3/6/9/12 months, 4 quarters, 5 years)
  - Detail level selector: Summary/Medium/Account (stacked radio buttons right of Compare dropdown)
  - Expand/collapse hierarchy with disclosure icons
  - Accounting format: Whole dollars with parentheses for negatives, percentages for ratios
- **Balance Sheet**: Full balance sheet with cumulative balances from inception (2015) to selected date:
  - As of date selector (monthly periods from 2015-2025)
  - Comparison mode: None or Prior Year (with $ and % variance)
  - Detail level: Summary (totals only) or Detail (all line items)
  - Show in Thousands option
  - Account groups: Assets (1000s), Liabilities (2000s), Equity (3000s)
  - Hierarchical structure with expand/collapse for subtotals
  - Equity section includes Retained Earnings (cumulative through prior year-end) and Current Year Net Income (Jan 1 through selected date)
  - Mobile-responsive styling at 768px and 500px breakpoints
- **Statement of Cash Flows**: Under construction - will display cash flow statements
- **Over/Under Bill**: Under construction - will track billing variances
- **Receivables/Payables**: Under construction - will manage AR/AP tracking
- **Job Analytics**: Under construction - will provide job-level performance metrics
- **Cash Reports**: Under construction - will display cash position reports

### Responsive Design
- **Mobile-first approach**: Sidebar navigation with hamburger menu toggle for mobile devices
- **Overlay pattern**: Semi-transparent overlay when mobile sidebar is open
- **Flexible layout**: Uses CSS flexbox for the main layout structure

## External Dependencies

### Fonts
- **Google Fonts**: Inter font family (weights: 300, 400, 500, 600, 700) loaded via CDN

### Backend Services
- **Flask Server**: Python Flask application (`public/server.py`) serves static files for local development

### Export & Email Features
- **Universal Export**: Print, PDF, and CSV export work for all three main views (Revenue, Account, Income Statement)
- **Smart Page Orientation**: Exports automatically use landscape for wide content (matrix views, annual comparison) and portrait for tall content (single period views)
- **Email Reports**: Modal dialog to email current report view via EmailJS
  - Executive Overview emails include visual chart images (captured using Chart.js toBase64Image)
  - Charts are combined into a 2x3 grid with titles and stats
  - Sent as PNG attachment via EmailJS variable attachment feature
  - Requires EmailJS Personal plan for attachment support
- **Page Formatting**: Exports are sized to fit on a single page with appropriate font scaling

### EmailJS Configuration
- **Service**: EmailJS client-side email service (no backend required)
- **Credentials stored in dashboard.js**:
  - Public Key: `g7M4wCTIOOn2D65le`
  - Service ID: `service_x8zz5uy`
  - Template ID: `template_44g2s84`
- **Template requires**: Variable attachment named `chart_attachment` for Executive Overview charts

### Static Assets
- **Logo**: `logo.png` used in login screen and header
- **No database**: All data is stored in static JSON files