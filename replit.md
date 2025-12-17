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

### Jobs Module
The Jobs section in the sidebar contains job-related tracking views:
- **Job Overview**: High-level summary view with key metrics section (left: stacked Total Jobs and Over/(Under) Bill tiles with conditional coloring, right: bar chart showing Billed Revenue, Earned Revenue, Actual Cost) and three additional bar charts: Revenue (Contracted, Earned, Billed, Backlog), Over/(Under) Bill (Billed vs Earned with variance), and Costs (Revised Cost vs Actual Cost). Features same filtering options as other job views (status, PM, customer).
- **Budgets**: Displays all jobs with filtering by status (Active, Inactive, Closed, Overhead - Active checked by default), project manager, and customer. Features a searchable table with columns for Job #, Description, Customer, Status, Project Manager, Original Contract, Change Orders, Revised Contract (yellow-shaded), Original Cost, Cost Adjustments, Revised Cost, and Estimated Profit (calculated). Includes summary metrics (Total Jobs, Total Revised Contract, Total Revised Cost, Total Estimated Profit, Avg Profit Margin) and pagination.
- **Job Actuals**: Displays actual costs vs earned revenue for jobs. Aggregates `actual_cost` from `job_actuals` data by job number and cross-references with `job_budgets` for contract/cost data. Key calculations:
  - **Actual Cost**: Sum of `actual_cost` from `job_actuals` for each job
  - **Earned Revenue**: `(Actual Cost / Revised Cost) × Revised Contract` - represents revenue earned based on percentage of budget spent
  - **Billed Revenue**: Placeholder for future integration (currently shows $0)
  - **Actual Profit**: `Earned Revenue - Actual Cost`
  - **Actual Margin**: `(Actual Profit / Earned Revenue) × 100`
  Features donut charts by PM and Customer, breakdown tables, same filtering options as Job Budgets, search, sort, and pagination.
- **Missing Budgets**: Shows jobs with incomplete budget data. Has two tabs: "No Contract Value" (jobs with zero revised contract) and "No Estimated Cost" (jobs with zero revised cost). Features same configuration options as Job Budgets (status filters with Active checked by default, PM filter, Customer filter), search, and pagination. Simplified table with columns: Job #, Description, Customer, Status, Project Manager, Revised Contract, Revised Cost (no profit/margin columns).
- **Job Analytics**: Placeholder for future job analytics features.
- **Over/Under Bill**: Placeholder for future over/under billing tracking.

### Responsive Design
The application adopts a mobile-first approach with a responsive sidebar navigation, hamburger menu, and flexible layout using CSS flexbox.

### Session & Navigation State
- **Cached Auth State**: Admin status and user role are cached in localStorage (`ftg_is_admin`, `ftg_user_role`) for immediate page load without network delay
- **Instant Section Display**: On page refresh, the overview section is shown immediately (synchronously) while async permission verification runs in background
- **Admin Nav Persistence**: Admin navigation visibility is restored instantly from localStorage cache on authenticated page loads

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