# FTG Dashboard

## Overview

FTG Dashboard is a client-side financial dashboard application designed for tracking and visualizing business financial metrics. It provides password-protected access to financial data, including revenue, accounts receivable, and accounts payable across multiple years (2015-2025). The application features a responsive design with mobile sidebar navigation and robust data visualization capabilities, aiming to deliver comprehensive financial insights.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The application is a pure client-side solution built with vanilla HTML, CSS, and JavaScript. All static assets are served from the `/public` directory.

### Authentication & User Management
The system uses database-backed authentication with bcrypt password hashing and flexible role-based access control (RBAC). Default roles include `admin` and `manager`, but admins can create, modify, and delete custom roles with page-level permissions. Session management includes server-side tokens, 30-day expiration, and IP tracking. User preferences and saved views are stored locally per user.

### Two-Factor Authentication (2FA)
- **TOTP-based 2FA**: Users can enable 2FA via Security Settings in the user menu
- **QR Code Setup**: Standard authenticator app support (Google Authenticator, Authy, etc.)
- **Encrypted Secrets**: TOTP secrets are encrypted using Fernet before database storage
- **Backup Codes**: 10 recovery codes (SHA-256 hashed) generated when 2FA is enabled
- **Key Management**: Encryption key derived from `TOTP_ENCRYPTION_KEY` env var or `DATABASE_URL`

### Password Reset
- **Self-Service Reset**: Users can request password reset via email on the login page
- **Admin Reset**: Admins can reset user passwords from the Admin dashboard
- **Token Security**: Reset tokens are SHA-256 hashed before database storage
- **Session Invalidation**: All existing sessions are terminated when password is changed
- **Email Delivery**: Uses Google Mail integration for sending reset links

### Admin Dashboard (Admin role only)
Admins have access to:
- **User Management**: CRUD operations for users, including role assignment
- **Role Management**: Full CRUD for custom roles with page-level permission controls. Admins can create new roles, name them, and select which pages each role can access
- **Audit Log**: Track administrative actions for security and compliance

### Data Management
Financial data is stored in static JSON files (`financials.json`, `account_groups.json`) covering the period 2015-2025 with monthly granularity. Data includes detailed GL history, account metadata, and hierarchical financial statement structures.

### Dashboard Views
The dashboard offers several key views:
- **Executive Overview**: Displays ten configurable financial metric tiles with comparison options and responsive layout.
- **Revenue**: Provides monthly/quarterly/annual revenue charts with trendlines, KPIs, and export options.
- **Account Detail**: Offers GL account drilldown with various views and data tables.
- **Income Statement**: Presents a full P&L statement with hierarchical account groups, multiple period types, comparison modes, and detail levels.
- **Balance Sheet**: Shows a full balance sheet with cumulative balances, various view and comparison modes, and detailed asset, liability, and equity breakdowns.
- **Statement of Cash Flows**: Uses the indirect method, offering period types, comparison modes, detail levels, and AI analysis.
- **Cash Balances**: Tracks cash position using both Google Sheets for daily data and Balance Sheet data for monthly/quarterly/annual views.
- **AP Aging**: Accounts Payable aging report grouped by vendor with aging buckets (0-30, 31-60, 61-90, 90+ days, retainage). Features bar chart, summary metrics, sortable table with clickable vendor names that open detail modal showing all outstanding invoices.
- **AR Aging**: Accounts Receivable aging report grouped by customer with aging buckets (0-30, 31-60, 61-90, 90+ days, retainage). Features bar chart, summary metrics, sortable table with clickable customer names that open detail modal showing all outstanding invoices. Uses `ar_invoices.json` data source.

### Jobs Module
The Jobs section in the sidebar contains job-related tracking views:
- **Job Overview**: High-level summary view with key metrics section (left: stacked Total Jobs and Over/(Under) Bill tiles with conditional coloring, right: bar chart showing Billed Revenue, Earned Revenue, Actual Cost) and three additional bar charts: Revenue (Contracted, Earned, Billed, Backlog), Over/(Under) Bill (Billed vs Earned with variance), and Costs (Revised Cost vs Actual Cost). Features same filtering options as other job views (status, PM, customer).
- **Budgets**: Displays all jobs with filtering by status (Active, Inactive, Closed, Overhead - Active checked by default), project manager, and customer. Features a searchable table with columns for Job #, Description, Customer, Status, Project Manager, Original Contract, Change Orders, Revised Contract (yellow-shaded), Original Cost, Cost Adjustments, Revised Cost, and Estimated Profit (calculated). Includes summary metrics (Total Jobs, Total Revised Contract, Total Revised Cost, Total Estimated Profit, Avg Profit Margin) and pagination. Table columns (Job #, Description, Client, Status, Project Manager) feature interactive column filtering with dropdown multi-select and separate sort controls (ascending/descending arrows).
- **Job Actuals**: Displays actual costs vs earned revenue for jobs. Aggregates `actual_cost` from `job_actuals` data by job number and cross-references with `job_budgets` for contract/cost data. Key calculations:
  - **Actual Cost**: Sum of `actual_cost` from `job_actuals` for each job
  - **Earned Revenue**: `(Actual Cost / Revised Cost) × Revised Contract` - represents revenue earned based on percentage of budget spent
  - **Billed Revenue**: Placeholder for future integration (currently shows $0)
  - **Actual Profit**: `Earned Revenue - Actual Cost`
  - **Actual Margin**: `(Actual Profit / Earned Revenue) × 100`
  Features donut charts by PM and Customer, breakdown tables, same filtering options as Job Budgets, search, sort, and pagination.
- **Cost Codes**: Analyzes job costs by cost code category. Features:
  - **Cost as % of Earned Revenue Chart**: Horizontal bar chart showing top 10 cost codes as a percentage of total earned revenue. Earned revenue calculated as `(Actual Cost / Revised Cost) × Revised Contract` per job.
  - **Job + Cost Code Table**: Flat table showing each job and cost code combination with columns: Job #, Job Description, Cost Code, Description, Total Cost, % of Revenue.
  - **Filters**: Status, PM, and Customer dropdown filters. Search input for finding specific cost codes.
  - **My PM View**: Respects the global PM filter toggle to show only logged-in user's jobs.
- **PM Report**: Project manager-focused performance view. Features:
  - **PM Selector**: Dropdown to select a project manager (auto-selects current user if PM view is enabled).
  - **AI Analysis Panel**: AI-powered analysis of PM performance metrics, risk areas, and recommendations.
  - **Key Metrics Row**: 5 tiles showing Total Jobs, Total Contract Value, Total Actual Cost, Total Earned Revenue, and Net Over/(Under) with conditional coloring.
  - **Over/Under Billing Table**: Jobs with billing variance for the selected PM, sorted by under-billed first. Shows Job #, Description, Client, Contract, Actual Cost, % Complete, Earned Rev, Billed Rev, Over/(Under).
  - **Missing Budgets Table**: Jobs with >$2,500 actual cost but missing budgeted revenue or cost. Shows Job #, Description, Client, Status, Actual Cost, Budgeted Revenue, Budgeted Cost, and Issue badge (No Budget/No Revenue/No Cost).
  - **Client Summary Table**: All clients with active jobs (includes subtotal row). Shows Client, Est. Contract, Est. Cost, Est. Profit, Billed (Last Mo.), Billed to Date, Cost to Date.
  - Responsive design for mobile and desktop.

### AI Insights (Comprehensive Business Analysis)
Standalone AI-powered analysis page that aggregates data from all sources and provides strategic business intelligence:
- **Single Button Interface**: One "Run Full Analysis" button with progress indicator
- **Data Aggregation**: Loads and aggregates data from financials_gl.json, financials_jobs.json, ar_invoices.json, and ap_invoices.json
- **Pre-computed Metrics**: Revenue/expense trends, job portfolio stats, AR/AP aging, PM rankings, client summaries
- **AI Prompt Construction**: Builds comprehensive prompt with all aggregated data (fits within token limits)
- **Sectioned Results**: Executive Summary, Financial Health, Job Performance, Cash Flow & AR/AP, PM Performance, Strategic Recommendations
- **Error Handling**: Graceful error display with retry option

### Responsive Design
The application adopts a mobile-first approach with a responsive sidebar navigation, hamburger menu, and flexible layout using CSS flexbox.

### Session & Navigation State
- **Cached Auth State**: Admin status and user role are cached in localStorage (`ftg_is_admin`, `ftg_user_role`) for immediate page load without network delay
- **Instant Section Display**: On page refresh, the overview section is shown immediately (synchronously) while async permission verification runs in background
- **Admin Nav Persistence**: Admin navigation visibility is restored instantly from localStorage cache on authenticated page loads
- **Sidebar Collapse**: Desktop sidebar can be collapsed to icon-only mode (state persisted in localStorage). Hover over section icons shows submenu flyout.

### UI Polish & Micro-interactions
- **Button Effects**: Subtle lift on hover, scale on active
- **Input Focus**: Blue glow ring on focus
- **Table Rows**: Smooth hover highlight transitions
- **Cards/Tiles**: Lift effect on hover
- **Loading States**: Skeleton shimmer and pulse animations
- **Notifications**: Slide-in/slide-out animations
- **Reduced Motion**: Respects user's motion preference for accessibility

### Structured Audit Logging
- **Categories**: authentication, security, user_management, role_management, data_access, general
- **Severity Levels**: info, warning, critical
- **Events Logged**: Login (success/failure), logout, 2FA enable/disable, password changes/resets, user CRUD, role CRUD
- **Failure Tracking**: Invalid email, disabled account, wrong password, invalid 2FA code
- **Metadata**: IP address, user agent, session ID, result status
- **Admin API**: Filterable by category, severity, action, user, date range, with search

### Color Standards
A defined color palette is used for consistency:
- **Positive/Success**: Green (`#10b981`)
- **Negative/Error**: Red (`#dc2626`)
- **Primary Blue**: (`#3b82f6`) for current year data and primary actions.
- **Warning/Partial**: Orange (`#f59e0b`) for partial periods.

## External Dependencies

### Fonts
- **Google Fonts**: Inter font family (weights: 300-700) loaded via CDN.

### Backend Services
- **Flask Server**: A Python Flask application (`public/server.py`) is used for serving static files during local development.

### Export & Email Features
- **Universal Export**: Print, PDF, and CSV export functionality is available across key dashboard views. Exports feature smart page orientation.
- **Email Reports**: Current report views can be emailed via EmailJS, including visual chart images for the Executive Overview.
- **Scheduled Email Reports**: Users can schedule reports (Executive Overview, Revenue, Account Detail, Income Statement, Balance Sheet, Cash Flow, Cash Balances) with configurable frequency and recipients. A background scheduler handles delivery, and schedules are stored in a `scheduled_reports` database table.

### EmailJS Configuration
- **Service**: EmailJS client-side service is used for sending emails. Credentials (Public Key, Service ID, Template ID) are configured in `dashboard.js`.

### Static Assets
- **Logo**: `logo.png` is used for branding.
- **Data Storage**: All financial data is stored in static JSON files; no separate database is used for core financial data.