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
A dedicated AI-powered analysis page aggregates data to provide strategic business intelligence. It includes a chat interface for natural language questions about financial data using a **Semantic Data Catalog** architecture. This two-stage AI process (intent classification, structured query plan generation, Python resolvers, natural language answer generation) allows flexible querying across various entities (jobs, AR, AP, GL, cash, PM summaries, cost codes, customers) with comprehensive filtering capabilities. Josh Angelo is excluded from all PM analysis.

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