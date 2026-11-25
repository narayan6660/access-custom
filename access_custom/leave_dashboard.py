import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate
from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on, get_leaves_for_period


@frappe.whitelist()
def get_employee_leave_statement(employee: str, from_date: str = None, to_date: str = None) -> dict:
    """
    Returns the comprehensive leave statement (Policy Leaves, Allocated, Taken, Closing Balance)
    plus recent leave applications for a specific employee.

    - Policy Leaves: Shows the total annual entitlement defined in the Leave Policy
      (e.g. PL=5, SL=7, EL=15) so HR clearly understands the annual entitlement.
    - Allocated: The actual leaves allocated for this period (pro-rated or full year).
    - Taken: Leaves consumed during this period.
    - Closing Balance: Strictly Allocated - Taken (non-accumulative; no carry forward is added).
    """
    if not employee:
        frappe.throw(_("Employee is required"))

    emp = frappe.get_doc("Employee", employee)

    today = getdate(nowdate())
    curr_year = today.year
    if not from_date:
        from_date = f"{curr_year}-01-01"
    if not to_date:
        to_date = f"{curr_year}-12-31"

    # 1. Fetch assigned Leave Policy for this employee to show Policy entitlement
    assigned_policy = frappe.db.get_value(
        "Leave Policy Assignment",
        {
            "employee": employee,
            "docstatus": 1,
            "effective_from": ["<=", to_date],
            "effective_to": [">=", from_date]
        },
        "leave_policy",
        order_by="effective_from desc"
    )

    if not assigned_policy:
        assigned_policy = emp.get("custom_leave_policy")

    if not assigned_policy and emp.company:
        assigned_policy = frappe.db.get_value("Company", emp.company, "leave_policy")

    policy_map = {}
    if assigned_policy:
        details = frappe.get_all(
            "Leave Policy Detail",
            filters={"parent": assigned_policy},
            fields=["leave_type", "annual_allocation"]
        )
        policy_map = {d.leave_type: flt(d.annual_allocation, 2) for d in details}

    # 2. Fetch active leave allocations for this employee in the period
    allocations = frappe.get_all(
        "Leave Allocation",
        filters={"employee": employee, "docstatus": 1, "to_date": [">=", from_date]},
        fields=["leave_type", "total_leaves_allocated", "new_leaves_allocated", "from_date", "to_date"],
        order_by="leave_type asc"
    )

    # All unique leave types from allocations or ledger entries
    ledger_types = frappe.db.sql_list(
        """
        SELECT DISTINCT leave_type
        FROM `tabLeave Ledger Entry`
        WHERE employee = %s AND docstatus = 1
        """,
        (employee,)
    )

    alloc_types = [a.leave_type for a in allocations]
    leave_types = sorted(list(set(alloc_types + ledger_types)))

    statement = []
    total_policy = 0.0
    total_allocated = 0.0
    total_taken = 0.0
    total_closing = 0.0

    for lt in leave_types:
        matching_allocs = [a for a in allocations if a.leave_type == lt]
        allocated = flt(sum(a.new_leaves_allocated or a.total_leaves_allocated for a in matching_allocs), 2)

        # Policy entitlement: show total annual leaves from policy for HR reference
        policy_leaves = policy_map.get(lt)
        if policy_leaves is None:
            policy_leaves = allocated

        # Taken in period
        taken = flt(abs(get_leaves_for_period(employee, lt, from_date, to_date) or 0.0), 2)

        # Closing balance: strictly Allocated - Taken (never add policy entitlement/opening to balance)
        closing = flt(allocated - taken, 2)

        # Skip if completely zero across all fields
        if policy_leaves == 0 and allocated == 0 and taken == 0 and closing == 0:
            continue

        statement.append({
            "leave_type": lt,
            "policy_leaves": policy_leaves,
            "opening_balance": policy_leaves,  # kept for template compatibility
            "leaves_allocated": allocated,
            "leaves_taken": taken,
            "closing_balance": closing,
        })

        total_policy += policy_leaves
        total_allocated += allocated
        total_taken += taken
        total_closing += closing

    # Recent leave applications
    applications = frappe.get_all(
        "Leave Application",
        filters={"employee": employee, "docstatus": ["!=", 2], "from_date": [">=", from_date]},
        fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "status"],
        order_by="from_date desc",
        limit=10
    )

    return {
        "employee": employee,
        "employee_name": emp.employee_name,
        "company": emp.company,
        "department": emp.department,
        "designation": emp.designation,
        "from_date": from_date,
        "to_date": to_date,
        "totals": {
            "policy_leaves": total_policy,
            "opening": total_policy,
            "allocated": total_allocated,
            "taken": total_taken,
            "closing": total_closing,
        },
        "statement": statement,
        "applications": applications,
    }
