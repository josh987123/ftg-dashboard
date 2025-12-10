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
- **Static JSON files**: Financial data is stored in `/public/data/financials.json`
- **Data structure**: Organized by metric type (revenue, accounts_receivable, accounts_payable) with yearly arrays containing monthly values
- **GL History**: `gl_history_all` array contains individual GL account data with monthly columns in "YYYY-MM" format
- **Accounts**: `accounts` array contains account metadata (account_no, description, debit_credit)
- **Historical range**: Covers 2015-2025 with monthly granularity

### Dashboard Views
- **Revenue View**: Monthly/quarterly/annual revenue charts with year comparison, trendlines, and export options (Print/PDF/CSV)
- **Account View**: GL account drilldown with dropdown selector, monthly/quarterly/annual views, trendlines, and data tables
- **Other sections**: Overview, Financials, Projects, Operations, Reports show "UNDER CONSTRUCTION" banners

### Responsive Design
- **Mobile-first approach**: Sidebar navigation with hamburger menu toggle for mobile devices
- **Overlay pattern**: Semi-transparent overlay when mobile sidebar is open
- **Flexible layout**: Uses CSS flexbox for the main layout structure

## External Dependencies

### Fonts
- **Google Fonts**: Inter font family (weights: 300, 400, 500, 600, 700) loaded via CDN

### Static Assets
- **Logo**: `logo.png` used in login screen and header
- **No backend services**: Application runs entirely in the browser
- **No database**: All data is stored in static JSON files
- **No API integrations**: Self-contained application with no external API calls