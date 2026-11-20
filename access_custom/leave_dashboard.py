import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate
from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on, get_leaves_for_period


@frappe.whitelist()
def get_employee_leave_statement(employee: str, from_date: str = None, to_date: str = None) -> dict:
    """
    Returns the comprehensive leave statement (Opening + Allocated - Taken = Closing)
    plus recent leave applications for a specific employee.
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

    # Fetch active or relevant leave allocations for this employee
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
    total_opening = 0.0
    total_allocated = 0.0
    total_taken = 0.0
    total_closing = 0.0

    for lt in leave_types:
        # Opening balance before from_date
        opening = flt(get_leave_balance_on(employee, lt, add_days(from_date, -1)) or 0.0, 2)

        # Allocated in period
        matching_allocs = [a for a in allocations if a.leave_type == lt]
        allocated = flt(sum(a.new_leaves_allocated or a.total_leaves_allocated for a in matching_allocs), 2)

        # Taken in period
        taken = flt(abs(get_leaves_for_period(employee, lt, from_date, to_date) or 0.0), 2)

        # Closing
        closing = flt(opening + allocated - taken, 2)

        # Skip if completely zero across all fields
        if opening == 0 and allocated == 0 and taken == 0 and closing == 0:
            continue

        statement.append({
            "leave_type": lt,
            "opening_balance": opening,
            "leaves_allocated": allocated,
            "leaves_taken": taken,
            "closing_balance": closing,
        })

        total_opening += opening
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
            "opening": total_opening,
            "allocated": total_allocated,
            "taken": total_taken,
            "closing": total_closing,
        },
        "statement": statement,
        "applications": applications,
    }
