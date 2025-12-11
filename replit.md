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
- **User-specific logins**: Four authorized users (Sergio, Josh, Rodney, Greg) with shared password (`Ftgb2025$`)
- **Login flow**: Modal requires first name + password, validates against authorized user list
- **Session persistence**: Uses `localStorage` to remember authentication state and current user (`ftg_current_user`)
- **User display**: Current user's name shown in header after login
- **User preferences**: Each user's settings saved to `localStorage` keyed by username (`ftg_prefs_${username}`)

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
  - **Current Assets** (expandable subtotal):
    - Cash & Cash Equivalents: Checking (1001, 1005, 1040), Savings & Investments (1003, 1004, 1006, 1007), Undeposited Funds (1090)
    - Receivables: Contracts (1100), Retention (1105), Emp Dependent (1110), Loans (1120-1130), Underbillings (1050)
    - Other Current Assets: Employee Advances (1030)
  - **Long-Term Assets** (expandable subtotal):
    - Fixed Assets: Leasehold Improvements (1300+1305), Equipment & Machinery (1310+1315), Office Furniture (1320+1325), Vehicles (1400+1405)
    - Intangible Assets: Organization Costs (1750), Client Knowledge (1800+1805)
    - Prepaid Assets (1500-1600), Other Long-Term Assets (1610, 1700, 1900)
  - **TOTAL ASSETS** = Current Assets + Long-Term Assets
  - **Current Liabilities** (expandable subtotal):
    - Accounts Payable (expandable): Contracts (2000, 2005), Retention (2010), Credit Cards (2015-2018)
    - Accrued Expenses (2021, 2023, 2025, 2028, 2030, 2070, 2100, 2110)
    - Overbillings (2120)
    - Other Current Liabilities (2130, 2140, 2200, 2250)
  - **Long-Term Liabilities** (expandable subtotal):
    - Loan - Bridge Bank (2500), Note - Vehicles (2510), Note - Former Shareholder (2515), Deferred Tax Liability (2150)
  - **TOTAL LIABILITIES** = Current Liabilities + Long-Term Liabilities
  - **Equity** (expandable subtotal):
    - Treasury Stock (3010)
    - Capital Contributions (expandable): 3030, 3031, 3032, 3033, 3034
    - Distributions (expandable): 3025, 3035, 3036
    - Retained Earnings (cumulative through prior year-end)
    - Current Year Net Income (Jan 1 through selected date)
  - Multi-level expand/collapse with recursive parent visibility checking
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