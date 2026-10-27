import frappe
from frappe import _


def validate_employee_contract_uniqueness(doc, method=None):
    """
    Ensure that any Consultant Contract or Employee Contract can only be used
    ONCE to create/onboard an employee record.
    Multiple contracts can still be created for an employee subsequently.
    """
    if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_install", False):
        return

    # 1. Validate Consultant Contract uniqueness
    if doc.get("custom_active_contract"):
        existing_emp = frappe.db.get_value(
            "Employee",
            {
                "custom_active_contract": doc.custom_active_contract,
                "name": ["!=", doc.name or ""]
            },
            ["name", "employee_name"],
            as_dict=True
        )
        if existing_emp:
            frappe.throw(
                _("Consultant Contract <b>{0}</b> is already linked to Employee <b>{1} ({2})</b>.<br>A contract can only be used once to create an employee.").format(
                    doc.custom_active_contract,
                    existing_emp.employee_name or existing_emp.name,
                    existing_emp.name
                ),
                title=_("Contract Already Used")
            )

    # 2. Validate Employee Contract uniqueness
    if doc.get("custom_active_employee_contract"):
        existing_emp = frappe.db.get_value(
            "Employee",
            {
                "custom_active_employee_contract": doc.custom_active_employee_contract,
                "name": ["!=", doc.name or ""]
            },
            ["name", "employee_name"],
            as_dict=True
        )
        if existing_emp:
            frappe.throw(
                _("Employee Contract <b>{0}</b> is already linked to Employee <b>{1} ({2})</b>.<br>A contract can only be used once to create an employee.").format(
                    doc.custom_active_employee_contract,
                    existing_emp.employee_name or existing_emp.name,
                    existing_emp.name
                ),
                title=_("Contract Already Used")
            )


@frappe.whitelist()
def get_available_consultant_contracts(doctype, txt, searchfield, start, page_length, filters):
    """
    Search query for custom_active_contract link field on Employee.
    Excludes active consultant contracts that have already been linked to an employee.
    """
    current_employee = filters.get("current_employee") if isinstance(filters, dict) else None

    # Find contracts already linked to other employees
    emp_filters = [["custom_active_contract", "is", "set"]]
    if current_employee:
        emp_filters.append(["name", "!=", current_employee])

    used_contracts = frappe.get_all("Employee", filters=emp_filters, pluck="custom_active_contract")
    used_contracts = [c for c in used_contracts if c]

    contract_filters = [["status", "=", "Active"]]
    if used_contracts:
        contract_filters.append(["name", "not in", used_contracts])

    or_filters = []
    if txt:
        or_filters = [
            ["name", "like", f"%{txt}%"],
            ["consultant_name", "like", f"%{txt}%"]
        ]

    return frappe.get_all(
        "Consultant Contract",
        filters=contract_filters,
        or_filters=or_filters,
        fields=["name", "consultant_name"],
        start=start,
        page_length=page_length,
        order_by="modified desc",
        as_list=True
    )


@frappe.whitelist()
def get_available_employee_contracts(doctype, txt, searchfield, start, page_length, filters):
    """
    Search query for custom_active_employee_contract link field on Employee.
    Excludes active contracts that have already been linked to an employee.
    """
    current_employee = filters.get("current_employee") if isinstance(filters, dict) else None

    # Find contracts already linked to other employees
    emp_filters = [["custom_active_employee_contract", "is", "set"]]
    if current_employee:
        emp_filters.append(["name", "!=", current_employee])

    used_contracts = frappe.get_all("Employee", filters=emp_filters, pluck="custom_active_employee_contract")
    used_contracts = [c for c in used_contracts if c]

    contract_filters = [["custom_contract_status", "in", ["Active", "Issued", "CEO Approved", "Internally Approved"]]]
    if used_contracts:
        contract_filters.append(["name", "not in", used_contracts])

    or_filters = []
    if txt:
        or_filters = [
            ["name", "like", f"%{txt}%"],
            ["party_name", "like", f"%{txt}%"]
        ]

    return frappe.get_all(
        "Contract",
        filters=contract_filters,
        or_filters=or_filters,
        fields=["name", "party_name"],
        start=start,
        page_length=page_length,
        order_by="modified desc",
        as_list=True
    )
