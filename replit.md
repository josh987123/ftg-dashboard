# FTG Dashboard

## Overview

FTG Dashboard is a client-side financial dashboard application designed for tracking and visualizing business financial metrics. It provides password-protected access to financial data, including revenue, accounts receivable, and accounts payable across multiple years (2015-2025). The application features a responsive design with mobile sidebar navigation and robust data visualization capabilities, aiming to deliver comprehensive financial insights.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The application is a pure client-side solution built with vanilla HTML, CSS, and JavaScript. All static assets are served from the `/public` directory.

### Authentication & User Management
The system uses database-backed authentication with bcrypt password hashing and role-based access control (RBAC) for `admin`, `manager`, and `viewer` roles. Session management includes server-side tokens, 30-day expiration, and IP tracking. User preferences and saved views are stored locally per user.

### Admin Dashboard (Admin role only)
Admins have access to user management (CRUD operations), role permission configuration, and an audit log to track administrative actions.

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

### Responsive Design
The application adopts a mobile-first approach with a responsive sidebar navigation, hamburger menu, and flexible layout using CSS flexbox.

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