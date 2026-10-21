import frappe

def validate_system_manager_role_assignment(doc, method=None):
    """
    Enforce that ONLY the Administrator can assign/grant the 'System Manager' role to any user.
    HR Manager, HR User, or any other user is strictly forbidden from granting this role.
    """
    if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_install", False) or getattr(frappe.flags, "in_patch", False):
        return

    session_user = frappe.session.user if getattr(frappe, "session", None) else None
    if not session_user or session_user == "Administrator":
        return

    new_roles = [r.role for r in doc.get("roles", [])]
    if "System Manager" in new_roles:
        already_had = False
        if not doc.is_new():
            already_had = bool(frappe.db.get_value("Has Role", {"parent": doc.name, "role": "System Manager"}))

        if not already_had:
            frappe.throw(
                frappe._("Permission Denied: Only the <b>Administrator</b> can assign or grant the <b>System Manager</b> role. HR and other users are not permitted to grant this role."),
                title=frappe._("Restricted Role Assignment"),
                exc=frappe.PermissionError
            )


def validate_employee_role_assignment(doc, method=None):
    """
    Ensure non-Administrator cannot assign 'System Manager' via Employee custom_assigned_roles.
    """
    if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_install", False) or getattr(frappe.flags, "in_patch", False):
        return

    session_user = frappe.session.user if getattr(frappe, "session", None) else None
    if not session_user or session_user == "Administrator":
        return

    if doc.get("custom_assigned_roles"):
        try:
            roles = frappe.parse_json(doc.custom_assigned_roles)
            if isinstance(roles, list) and "System Manager" in roles:
                already_had = False
                if doc.user_id:
                    already_had = bool(frappe.db.get_value("Has Role", {"parent": doc.user_id, "role": "System Manager"}))
                
                if not already_had:
                    frappe.throw(
                        frappe._("Permission Denied: Only the <b>Administrator</b> can assign or grant the <b>System Manager</b> role."),
                        title=frappe._("Restricted Role Assignment"),
                        exc=frappe.PermissionError
                    )
        except Exception as e:
            if isinstance(e, frappe.PermissionError):
                raise
