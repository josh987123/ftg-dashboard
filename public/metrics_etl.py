"""
Canonical Metrics ETL Module
============================
This module provides the SINGLE SOURCE OF TRUTH for all financial metric calculations.
Both dashboard pages and NLQ queries should use these pre-computed metrics.

Key Metrics Computed:
- Jobs: completion %, earned revenue, backlog, margin, over/under billing
- AR: collectible amounts, aging buckets, days outstanding
- AP: remaining balances, aging buckets
- PM: aggregated job metrics by project manager
"""

import json
import os
from datetime import datetime, date
from typing import Dict, List, Any, Optional

EXCLUDED_PM = 'josh angelo'
EXCLUDED_AP_VENDORS = [
    'FTG Builders LLC',
    'FTG Builders, LLC', 
    'FTG Builders',
    'FTG BUILDERS LLC'
]

def load_json_file(filename: str) -> dict:
    """Load a JSON file from the data directory."""
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    filepath = os.path.join(data_dir, filename)
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        return json.load(f)


def calculate_job_metrics(job: dict, actual_cost: float, billed: float) -> dict:
    """
    Calculate canonical job metrics.
    This is THE definition for how job metrics are computed.
    
    PROFIT/MARGIN CALCULATION RULES:
    - Closed Jobs (status='C'): 
        profit = billed - actual_cost
        margin = profit / billed * 100
        Valid only if billed > 0 AND actual_cost > 0
    - Active Jobs (status='A', 'O', 'I'):
        profit = contract - budget_cost (projected)
        margin = profit / contract * 100
        Valid only if contract > 0 AND budget_cost > 0
    
    Jobs with missing revenue/cost data are excluded from profit aggregations.
    
    Args:
        job: Raw job budget record
        actual_cost: Sum of actuals for this job
        billed: Billed revenue for this job
    
    Returns:
        Dict with all computed metrics
    """
    job_no = str(job.get('job_no', ''))
    budget_cost = float(job.get('revised_cost') or 0)
    contract = float(job.get('revised_contract') or 0)
    original_contract = float(job.get('original_contract') or 0)
    original_cost = float(job.get('original_cost') or 0)
    job_status = job.get('job_status', '')
    
    has_budget = budget_cost > 0
    is_closed = job_status == 'C'
    
    if has_budget:
        percent_complete = min((actual_cost / budget_cost) * 100, 100) if budget_cost > 0 else 0
        earned_revenue = (actual_cost / budget_cost) * contract if budget_cost > 0 else 0
    else:
        percent_complete = 0
        earned_revenue = 0
    
    backlog = contract - earned_revenue
    over_under_billing = billed - earned_revenue
    
    if is_closed:
        actual_profit = billed - actual_cost
        actual_margin = (actual_profit / billed * 100) if billed > 0 else 0
        valid_for_profit = billed > 0 and actual_cost > 0
        profit = actual_profit
        margin = actual_margin
        profit_basis = 'actual'
    else:
        projected_profit = contract - budget_cost
        projected_margin = (projected_profit / contract * 100) if contract > 0 else 0
        valid_for_profit = contract > 0 and budget_cost > 0
        profit = projected_profit
        margin = projected_margin
        profit_basis = 'projected'
    
    return {
        'job_no': job_no,
        'job_description': job.get('job_description', ''),
        'project_manager': job.get('project_manager_name', ''),
        'customer_name': job.get('customer_name', ''),
        'job_status': job_status,
        'original_contract': original_contract,
        'contract': contract,
        'original_cost': original_cost,
        'budget_cost': budget_cost,
        'actual_cost': actual_cost,
        'billed': billed,
        'has_budget': has_budget,
        'percent_complete': round(percent_complete, 2),
        'earned_revenue': round(earned_revenue, 2),
        'backlog': round(backlog, 2),
        'profit': round(profit, 2),
        'margin': round(margin, 2),
        'valid_for_profit': valid_for_profit,
        'profit_basis': profit_basis,
        'over_under_billing': round(over_under_billing, 2)
    }


def calculate_ar_invoice_metrics(invoice: dict) -> Optional[dict]:
    """
    Calculate canonical AR invoice metrics.
    Only returns metrics for invoices with amount due > 0.
    
    Args:
        invoice: Raw AR invoice record
    
    Returns:
        Dict with computed metrics, or None if invoice is fully paid
    """
    calc_due = float(invoice.get('calculated_amount_due', 0) or 0)
    
    if calc_due <= 0:
        return None
    
    retainage = float(invoice.get('retainage_amount', 0) or 0)
    collectible = max(0, calc_due - retainage)
    days = int(float(invoice.get('days_outstanding', 0) or 0))
    
    if days <= 30:
        aging_bucket = 'current'
    elif days <= 60:
        aging_bucket = 'days_31_60'
    elif days <= 90:
        aging_bucket = 'days_61_90'
    else:
        aging_bucket = 'days_90_plus'
    
    return {
        'invoice_no': invoice.get('invoice_no', ''),
        'customer_name': (invoice.get('customer_name', '') or '').strip(),
        'project_manager': (invoice.get('project_manager_name', '') or '').strip(),
        'job_no': invoice.get('job_no', ''),
        'invoice_date': invoice.get('invoice_date', ''),
        'due_date': invoice.get('due_date', ''),
        'invoice_amount': float(invoice.get('invoice_amount', 0) or 0),
        'calculated_amount_due': calc_due,
        'retainage': retainage,
        'collectible': round(collectible, 2),
        'days_outstanding': days,
        'aging_bucket': aging_bucket,
        'total_due': round(collectible + retainage, 2)
    }


def calculate_ap_invoice_metrics(invoice: dict) -> Optional[dict]:
    """
    Calculate canonical AP invoice metrics.
    Only returns metrics for invoices with remaining balance > 0.
    Excludes internal vendors.
    
    Args:
        invoice: Raw AP invoice record
    
    Returns:
        Dict with computed metrics, or None if excluded/paid
    """
    remaining = float(invoice.get('remaining_balance', 0) or 0)
    
    if remaining <= 0:
        return None
    
    vendor = (invoice.get('vendor_name', '') or '').strip()
    if vendor in EXCLUDED_AP_VENDORS:
        return None
    
    retainage = float(invoice.get('retainage_amount', 0) or 0)
    amount_ex_ret = remaining - retainage if retainage > 0 else remaining
    days = int(float(invoice.get('days_outstanding', 0) or 0))
    
    if days <= 30:
        aging_bucket = 'current'
    elif days <= 60:
        aging_bucket = 'days_31_60'
    elif days <= 90:
        aging_bucket = 'days_61_90'
    else:
        aging_bucket = 'days_90_plus'
    
    return {
        'invoice_no': invoice.get('invoice_no', ''),
        'vendor_name': vendor,
        'project_manager': (invoice.get('project_manager_name', '') or '').strip(),
        'job_no': invoice.get('job_no', ''),
        'invoice_date': invoice.get('invoice_date', ''),
        'due_date': invoice.get('due_date', ''),
        'invoice_amount': float(invoice.get('invoice_amount', 0) or 0),
        'remaining_balance': remaining,
        'retainage': retainage,
        'amount_ex_retainage': round(amount_ex_ret, 2),
        'days_outstanding': days,
        'aging_bucket': aging_bucket
    }


def run_jobs_etl() -> List[dict]:
    """
    Run the Jobs ETL to compute all job metrics.
    
    Returns:
        List of job metrics records
    """
    jobs_data = load_json_file('financials_jobs.json')
    
    budgets = jobs_data.get('job_budgets', [])
    actuals = jobs_data.get('job_actuals', [])
    billed_data = jobs_data.get('job_billed_revenue', [])
    
    actual_by_job = {}
    for a in actuals:
        job_no = str(a.get('Job_No') or a.get('job_no') or '')
        value = float(a.get('Value') or a.get('actual_cost') or 0)
        actual_by_job[job_no] = actual_by_job.get(job_no, 0) + value
    
    billed_by_job = {}
    for b in billed_data:
        job_no = str(b.get('Job_No') or b.get('job_no') or '')
        billed_by_job[job_no] = float(b.get('Billed_Revenue') or b.get('billed_revenue') or 0)
    
    results = []
    for job in budgets:
        job_no = str(job.get('job_no', ''))
        actual_cost = actual_by_job.get(job_no, 0)
        billed = billed_by_job.get(job_no, 0)
        
        metrics = calculate_job_metrics(job, actual_cost, billed)
        results.append(metrics)
    
    return results


def run_ar_etl() -> List[dict]:
    """
    Run the AR ETL to compute all AR invoice metrics.
    
    Returns:
        List of AR invoice metrics records (only unpaid invoices)
    """
    ar_data = load_json_file('ar_invoices.json')
    invoices = ar_data.get('invoices', [])
    
    results = []
    for inv in invoices:
        metrics = calculate_ar_invoice_metrics(inv)
        if metrics:
            results.append(metrics)
    
    return results


def run_ap_etl() -> List[dict]:
    """
    Run the AP ETL to compute all AP invoice metrics.
    
    Returns:
        List of AP invoice metrics records (only unpaid, non-excluded)
    """
    ap_data = load_json_file('ap_invoices.json')
    invoices = ap_data.get('invoices', [])
    
    results = []
    for inv in invoices:
        metrics = calculate_ap_invoice_metrics(inv)
        if metrics:
            results.append(metrics)
    
    return results


def aggregate_pm_metrics(job_metrics: List[dict], exclude_josh: bool = True) -> List[dict]:
    """
    Aggregate job metrics by project manager.
    
    PROFIT AGGREGATION RULES:
    - Only jobs with valid_for_profit=True are included in profit/margin calculations
    - For closed jobs: profit = billed - actual_cost, margin = profit/billed
    - For active jobs: profit = contract - budget_cost, margin = profit/contract
    - Jobs missing cost/revenue data are excluded from profit aggregations
    
    Args:
        job_metrics: List of computed job metrics
        exclude_josh: Whether to exclude Josh Angelo from analysis
    
    Returns:
        List of PM-level aggregated metrics
    """
    pm_data = {}
    
    for job in job_metrics:
        pm = job.get('project_manager', '').strip()
        if not pm:
            continue
        
        if exclude_josh and EXCLUDED_PM in pm.lower():
            continue
        
        if pm not in pm_data:
            pm_data[pm] = {
                'project_manager': pm,
                'total_jobs': 0,
                'active_jobs': 0,
                'jobs_with_budget': 0,
                'jobs_valid_for_profit': 0,
                'total_contract': 0,
                'total_budget': 0,
                'total_actual': 0,
                'total_billed': 0,
                'total_earned_revenue': 0,
                'total_backlog': 0,
                'total_profit': 0,
                'margin_sum': 0,
                'completion_sum': 0
            }
        
        pm_data[pm]['total_jobs'] += 1
        pm_data[pm]['total_contract'] += job['contract']
        pm_data[pm]['total_budget'] += job['budget_cost']
        pm_data[pm]['total_actual'] += job['actual_cost']
        pm_data[pm]['total_billed'] += job['billed']
        
        if job['job_status'] == 'A':
            pm_data[pm]['active_jobs'] += 1
        
        if job['has_budget']:
            pm_data[pm]['jobs_with_budget'] += 1
            pm_data[pm]['total_earned_revenue'] += job['earned_revenue']
            pm_data[pm]['total_backlog'] += job['backlog']
            pm_data[pm]['completion_sum'] += job['percent_complete']
        
        if job.get('valid_for_profit', False):
            pm_data[pm]['jobs_valid_for_profit'] += 1
            pm_data[pm]['total_profit'] += job['profit']
            pm_data[pm]['margin_sum'] += job['margin']
    
    results = []
    for pm, data in pm_data.items():
        jobs_with_budget = data['jobs_with_budget']
        jobs_valid_for_profit = data['jobs_valid_for_profit']
        avg_margin = (data['margin_sum'] / jobs_valid_for_profit) if jobs_valid_for_profit > 0 else 0
        avg_completion = (data['completion_sum'] / jobs_with_budget) if jobs_with_budget > 0 else 0
        
        results.append({
            'project_manager': pm,
            'total_jobs': data['total_jobs'],
            'active_jobs': data['active_jobs'],
            'jobs_with_budget': jobs_with_budget,
            'jobs_valid_for_profit': jobs_valid_for_profit,
            'total_contract': round(data['total_contract'], 2),
            'total_budget': round(data['total_budget'], 2),
            'total_actual': round(data['total_actual'], 2),
            'total_billed': round(data['total_billed'], 2),
            'total_earned_revenue': round(data['total_earned_revenue'], 2),
            'total_backlog': round(data['total_backlog'], 2),
            'total_profit': round(data['total_profit'], 2),
            'avg_margin': round(avg_margin, 2),
            'avg_completion': round(avg_completion, 2)
        })
    
    return sorted(results, key=lambda x: x['total_contract'], reverse=True)


def aggregate_ar_by_customer(ar_metrics: List[dict]) -> List[dict]:
    """
    Aggregate AR metrics by customer with aging buckets.
    
    Args:
        ar_metrics: List of computed AR invoice metrics
    
    Returns:
        List of customer-level AR summaries
    """
    customer_data = {}
    
    for inv in ar_metrics:
        customer = inv['customer_name'] or 'Unknown Customer'
        
        if customer not in customer_data:
            customer_data[customer] = {
                'customer_name': customer,
                'invoice_count': 0,
                'total_due': 0,
                'collectible': 0,
                'retainage': 0,
                'current': 0,
                'days_31_60': 0,
                'days_61_90': 0,
                'days_90_plus': 0,
                'weighted_days': 0
            }
        
        customer_data[customer]['invoice_count'] += 1
        customer_data[customer]['total_due'] += inv['total_due']
        customer_data[customer]['collectible'] += inv['collectible']
        customer_data[customer]['retainage'] += inv['retainage']
        customer_data[customer][inv['aging_bucket']] += inv['collectible']
        customer_data[customer]['weighted_days'] += inv['collectible'] * inv['days_outstanding']
    
    results = []
    for customer, data in customer_data.items():
        avg_days = (data['weighted_days'] / data['collectible']) if data['collectible'] > 0 else 0
        
        results.append({
            'customer_name': customer,
            'invoice_count': data['invoice_count'],
            'total_due': round(data['total_due'], 2),
            'collectible': round(data['collectible'], 2),
            'retainage': round(data['retainage'], 2),
            'current': round(data['current'], 2),
            'days_31_60': round(data['days_31_60'], 2),
            'days_61_90': round(data['days_61_90'], 2),
            'days_90_plus': round(data['days_90_plus'], 2),
            'avg_days_outstanding': round(avg_days, 1)
        })
    
    return sorted(results, key=lambda x: x['total_due'], reverse=True)


def aggregate_ap_by_vendor(ap_metrics: List[dict]) -> List[dict]:
    """
    Aggregate AP metrics by vendor with aging buckets.
    
    Args:
        ap_metrics: List of computed AP invoice metrics
    
    Returns:
        List of vendor-level AP summaries
    """
    vendor_data = {}
    
    for inv in ap_metrics:
        vendor = inv['vendor_name'] or 'Unknown Vendor'
        
        if vendor not in vendor_data:
            vendor_data[vendor] = {
                'vendor_name': vendor,
                'invoice_count': 0,
                'total_due': 0,
                'retainage': 0,
                'current': 0,
                'days_31_60': 0,
                'days_61_90': 0,
                'days_90_plus': 0,
                'weighted_days': 0
            }
        
        vendor_data[vendor]['invoice_count'] += 1
        vendor_data[vendor]['total_due'] += inv['remaining_balance']
        vendor_data[vendor]['retainage'] += inv['retainage']
        vendor_data[vendor][inv['aging_bucket']] += inv['amount_ex_retainage']
        vendor_data[vendor]['weighted_days'] += inv['amount_ex_retainage'] * inv['days_outstanding']
    
    results = []
    for vendor, data in vendor_data.items():
        amount_ex_ret = data['total_due'] - data['retainage']
        avg_days = (data['weighted_days'] / amount_ex_ret) if amount_ex_ret > 0 else 0
        
        results.append({
            'vendor_name': vendor,
            'invoice_count': data['invoice_count'],
            'total_due': round(data['total_due'], 2),
            'retainage': round(data['retainage'], 2),
            'current': round(data['current'], 2),
            'days_31_60': round(data['days_31_60'], 2),
            'days_61_90': round(data['days_61_90'], 2),
            'days_90_plus': round(data['days_90_plus'], 2),
            'avg_days_outstanding': round(avg_days, 1)
        })
    
    return sorted(results, key=lambda x: x['total_due'], reverse=True)


def get_ar_summary(ar_metrics: List[dict]) -> dict:
    """Get overall AR summary totals."""
    total_due = sum(inv['total_due'] for inv in ar_metrics)
    collectible = sum(inv['collectible'] for inv in ar_metrics)
    retainage = sum(inv['retainage'] for inv in ar_metrics)
    current = sum(inv['collectible'] for inv in ar_metrics if inv['aging_bucket'] == 'current')
    days_31_60 = sum(inv['collectible'] for inv in ar_metrics if inv['aging_bucket'] == 'days_31_60')
    days_61_90 = sum(inv['collectible'] for inv in ar_metrics if inv['aging_bucket'] == 'days_61_90')
    days_90_plus = sum(inv['collectible'] for inv in ar_metrics if inv['aging_bucket'] == 'days_90_plus')
    
    weighted_days = sum(inv['collectible'] * inv['days_outstanding'] for inv in ar_metrics)
    avg_days = (weighted_days / collectible) if collectible > 0 else 0
    
    return {
        'total_invoices': len(ar_metrics),
        'total_due': round(total_due, 2),
        'collectible': round(collectible, 2),
        'retainage': round(retainage, 2),
        'current': round(current, 2),
        'days_31_60': round(days_31_60, 2),
        'days_61_90': round(days_61_90, 2),
        'days_90_plus': round(days_90_plus, 2),
        'avg_days_outstanding': round(avg_days, 1)
    }


def get_ap_summary(ap_metrics: List[dict]) -> dict:
    """Get overall AP summary totals."""
    total_due = sum(inv['remaining_balance'] for inv in ap_metrics)
    retainage = sum(inv['retainage'] for inv in ap_metrics)
    current = sum(inv['amount_ex_retainage'] for inv in ap_metrics if inv['aging_bucket'] == 'current')
    days_31_60 = sum(inv['amount_ex_retainage'] for inv in ap_metrics if inv['aging_bucket'] == 'days_31_60')
    days_61_90 = sum(inv['amount_ex_retainage'] for inv in ap_metrics if inv['aging_bucket'] == 'days_61_90')
    days_90_plus = sum(inv['amount_ex_retainage'] for inv in ap_metrics if inv['aging_bucket'] == 'days_90_plus')
    
    amount_ex_ret = total_due - retainage
    weighted_days = sum(inv['amount_ex_retainage'] * inv['days_outstanding'] for inv in ap_metrics)
    avg_days = (weighted_days / amount_ex_ret) if amount_ex_ret > 0 else 0
    
    return {
        'total_invoices': len(ap_metrics),
        'total_due': round(total_due, 2),
        'retainage': round(retainage, 2),
        'current': round(current, 2),
        'days_31_60': round(days_31_60, 2),
        'days_61_90': round(days_61_90, 2),
        'days_90_plus': round(days_90_plus, 2),
        'avg_days_outstanding': round(avg_days, 1)
    }


def get_jobs_summary(job_metrics: List[dict], active_only: bool = False) -> dict:
    """
    Get overall jobs summary totals.
    
    PROFIT AGGREGATION RULES:
    - Only jobs with valid_for_profit=True are included in profit/margin calculations
    - For closed jobs: profit = billed - actual_cost
    - For active jobs: profit = contract - budget_cost (projected)
    - Jobs missing cost/revenue data are excluded from profit aggregations
    """
    jobs = [j for j in job_metrics if j['job_status'] == 'A'] if active_only else job_metrics
    jobs_with_budget = [j for j in jobs if j['has_budget']]
    jobs_valid_for_profit = [j for j in jobs if j.get('valid_for_profit', False)]
    
    total_contract = sum(j['contract'] for j in jobs)
    total_budget = sum(j['budget_cost'] for j in jobs)
    total_actual = sum(j['actual_cost'] for j in jobs)
    total_billed = sum(j['billed'] for j in jobs)
    
    total_earned = sum(j['earned_revenue'] for j in jobs_with_budget)
    total_backlog = sum(j['backlog'] for j in jobs_with_budget)
    total_profit = sum(j['profit'] for j in jobs_valid_for_profit)
    
    avg_margin = (sum(j['margin'] for j in jobs_valid_for_profit) / len(jobs_valid_for_profit)) if jobs_valid_for_profit else 0
    avg_completion = (sum(j['percent_complete'] for j in jobs_with_budget) / len(jobs_with_budget)) if jobs_with_budget else 0
    
    return {
        'total_jobs': len(jobs),
        'jobs_with_budget': len(jobs_with_budget),
        'jobs_without_budget': len(jobs) - len(jobs_with_budget),
        'jobs_valid_for_profit': len(jobs_valid_for_profit),
        'total_contract': round(total_contract, 2),
        'total_budget': round(total_budget, 2),
        'total_actual': round(total_actual, 2),
        'total_billed': round(total_billed, 2),
        'total_earned_revenue': round(total_earned, 2),
        'total_backlog': round(total_backlog, 2),
        'total_profit': round(total_profit, 2),
        'avg_margin': round(avg_margin, 2),
        'avg_completion': round(avg_completion, 2)
    }


class MetricsCache:
    """
    In-memory cache for computed metrics.
    Refreshed on demand or at server startup.
    """
    
    def __init__(self):
        self._jobs_metrics: List[dict] = []
        self._ar_metrics: List[dict] = []
        self._ap_metrics: List[dict] = []
        self._pm_metrics: List[dict] = []
        self._ar_by_customer: List[dict] = []
        self._ap_by_vendor: List[dict] = []
        self._last_refresh: Optional[datetime] = None
    
    def refresh(self):
        """Refresh all metrics from source data."""
        print(f"[MetricsETL] Starting metrics refresh...")
        start = datetime.now()
        
        self._jobs_metrics = run_jobs_etl()
        self._ar_metrics = run_ar_etl()
        self._ap_metrics = run_ap_etl()
        self._pm_metrics = aggregate_pm_metrics(self._jobs_metrics)
        self._ar_by_customer = aggregate_ar_by_customer(self._ar_metrics)
        self._ap_by_vendor = aggregate_ap_by_vendor(self._ap_metrics)
        self._last_refresh = datetime.now()
        
        elapsed = (datetime.now() - start).total_seconds()
        print(f"[MetricsETL] Refresh complete in {elapsed:.2f}s")
        print(f"  - Jobs: {len(self._jobs_metrics)} records")
        print(f"  - AR: {len(self._ar_metrics)} invoices")
        print(f"  - AP: {len(self._ap_metrics)} invoices")
        print(f"  - PMs: {len(self._pm_metrics)} managers")
    
    @property
    def jobs(self) -> List[dict]:
        return self._jobs_metrics
    
    @property
    def ar(self) -> List[dict]:
        return self._ar_metrics
    
    @property
    def ap(self) -> List[dict]:
        return self._ap_metrics
    
    @property
    def pm(self) -> List[dict]:
        return self._pm_metrics
    
    @property
    def ar_by_customer(self) -> List[dict]:
        return self._ar_by_customer
    
    @property
    def ap_by_vendor(self) -> List[dict]:
        return self._ap_by_vendor
    
    @property
    def last_refresh(self) -> Optional[datetime]:
        return self._last_refresh
    
    def get_jobs_summary(self, active_only: bool = False) -> dict:
        return get_jobs_summary(self._jobs_metrics, active_only)
    
    def get_ar_summary(self) -> dict:
        return get_ar_summary(self._ar_metrics)
    
    def get_ap_summary(self) -> dict:
        return get_ap_summary(self._ap_metrics)
    
    def filter_jobs(self, pm: str = None, status: str = None, customer: str = None, 
                   has_budget: bool = None, exclude_josh: bool = True) -> List[dict]:
        """Filter jobs with various criteria."""
        results = self._jobs_metrics
        
        if exclude_josh:
            results = [j for j in results if EXCLUDED_PM not in j['project_manager'].lower()]
        
        if pm:
            results = [j for j in results if pm.lower() in j['project_manager'].lower()]
        
        if status:
            results = [j for j in results if j['job_status'] == status]
        
        if customer:
            results = [j for j in results if customer.lower() in j['customer_name'].lower()]
        
        if has_budget is not None:
            results = [j for j in results if j['has_budget'] == has_budget]
        
        return results
    
    def filter_ar(self, customer: str = None, pm: str = None) -> List[dict]:
        """Filter AR invoices."""
        results = self._ar_metrics
        
        if customer:
            results = [inv for inv in results if customer.lower() in inv['customer_name'].lower()]
        
        if pm:
            results = [inv for inv in results if pm.lower() in inv['project_manager'].lower()]
        
        return results
    
    def filter_ap(self, vendor: str = None, pm: str = None) -> List[dict]:
        """Filter AP invoices."""
        results = self._ap_metrics
        
        if vendor:
            results = [inv for inv in results if vendor.lower() in inv['vendor_name'].lower()]
        
        if pm:
            results = [inv for inv in results if pm.lower() in inv['project_manager'].lower()]
        
        return results


metrics_cache = MetricsCache()


def init_metrics():
    """Initialize the metrics cache. Call on server startup."""
    metrics_cache.refresh()


if __name__ == '__main__':
    init_metrics()
    
    print("\n=== Jobs Summary (Active) ===")
    print(metrics_cache.get_jobs_summary(active_only=True))
    
    print("\n=== AR Summary ===")
    print(metrics_cache.get_ar_summary())
    
    print("\n=== AP Summary ===")
    print(metrics_cache.get_ap_summary())
    
    print("\n=== Top 5 PMs by Contract Value ===")
    for pm in metrics_cache.pm[:5]:
        print(f"  {pm['project_manager']}: ${pm['total_contract']:,.0f} contract, {pm['avg_margin']:.1f}% avg margin")
