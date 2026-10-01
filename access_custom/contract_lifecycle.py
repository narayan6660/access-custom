import frappe
import json

STAGE_APPROVER_MAP = {
    "Test Customer Contract": {
        "Pending Team Lead Approval": "lead_approver",
        "Pending Level 2.1 Legal Approval": "legal_approver",
        "Pending Level 2.2 Finance Approval": "finance_approver",
        "Pending Level 2.3 HR Approval": "hr_approver",
        "Pending CEO Approval": "ceo_approver",
        "Termination Under TL Review": "lead_approver",
        "Termination Under Legal Review": "legal_approver",
        "Termination Under Finance Review": "finance_approver",
        "Termination Under HR Review": "hr_approver",
        "Termination Under CEO Review": "ceo_approver",
        "Team Lead Closure": "lead_approver",
        "Legal Closure": "legal_approver",
        "Finance Closure": "finance_approver",
        "CEO Closure": "ceo_approver",
        "Amendment Pending Legal": "legal_approver",
        "Amendment Pending Finance": "finance_approver",
        "Amendment Pending CEO": "ceo_approver",
    },
    "Contract Amendment": {
        "Under Team Lead Review": "lead_approver",
        "Pending Legal Review": "legal_approver",
        "Pending Finance Review": "finance_approver",
        "Pending HR Review": "hr_approver",
        "Pending CEO Review": "ceo_approver",
    },
    "Contract On Hold": {
        "Pending Team Lead Approval": "lead_approver",
        "Pending Legal Approval": "legal_approver",
        "Pending Finance Approval": "finance_approver",
        "Pending HR Approval": "hr_approver",
        "Pending CEO Approval": "ceo_approver",
    },
    "Contract Termination": {
        "Termination Under TL Review": "lead_approver",
        "Termination Under Legal Review": "legal_approver",
        "Termination Under Finance Review": "finance_approver",
        "Termination Under HR Review": "hr_approver",
        "Termination Under CEO Review": "ceo_approver",
    },
    "Contract Closure": {
        "Team Lead Closure": "lead_approver",
        "Legal Closure": "legal_approver",
        "Finance Closure": "finance_approver",
        "CEO Closure": "ceo_approver",
    },
}

FINAL_STATES = {
    "Test Customer Contract": ["Commenced", "Terminated", "Closed", "Rejected"],
    "Contract Amendment": ["Executed", "Rejected"],
    "Contract On Hold": ["On Hold", "Resumed", "Rejected"],
    "Contract Termination": ["Terminated", "Termination Executed", "Rejected"],
    "Contract Closure": ["Closed", "Rejected"],
}

RESET_STATES = ["Draft", "Returned for Revision", "Termination Requested", "Closure Initiated"]


def create_silent_todo(doctype, name, allocated_to, description, priority="High"):
    """
    Creates a ToDo record directly without calling frappe.desk.form.assign_to.notify_assignment.
    This places the task on the user's Desk/sidebar without sending the default system email.
    """
    todo = frappe.get_doc({
        "doctype": "ToDo",
        "allocated_to": allocated_to,
        "reference_type": doctype,
        "reference_name": str(name),
        "description": description,
        "priority": priority,
        "status": "Open",
        "date": frappe.utils.nowdate(),
        "assigned_by": frappe.session.user or allocated_to,
    })
    todo.flags.ignore_permissions = True
    todo.insert(ignore_permissions=True)
    return todo


def close_silent_todos(doctype, name, except_user=None):
    """
    Closes open ToDos directly without calling notify_assignment.
    Updates the reference document's _assign tags cleanly.
    """
    filters = {
        "reference_type": doctype,
        "reference_name": name,
        "status": ("not in", ["Cancelled", "Closed"]),
    }
    if except_user:
        filters["allocated_to"] = ("!=", except_user)

    open_todos = frappe.get_all("ToDo", filters=filters, fields=["name", "allocated_to"])
    for t in open_todos:
        frappe.db.set_value("ToDo", t.name, "status", "Closed", update_modified=False)

    # Update _assign field on the parent document
    active_assignees = frappe.get_all("ToDo", filters={
        "reference_type": doctype,
        "reference_name": name,
        "status": "Open",
    }, pluck="allocated_to")

    if frappe.db.has_column(doctype, "_assign"):
        frappe.db.set_value(
            doctype,
            name,
            "_assign",
            json.dumps(list(set(active_assignees))) if active_assignees else "",
            update_modified=False
        )


def get_contract_permission_query_conditions(user=None, doctype=None, **kwargs):
    """
    SQL conditions to filter contract and lifecycle documents list views.
    Only contract owners, assigned approvers, ToDo assignees, and DocShare recipients can view.
    Bypassed for Administrator, System Manager, and Contract Manager.
    """
    if not user:
        user = frappe.session.user

    if user == "Administrator":
        return ""

    roles = frappe.get_roles(user)
    if "System Manager" in roles or "Contract Manager" in roles or "Finance Approver" in roles:
        return ""

    escaped_user = frappe.db.escape(user)
    dt = doctype or "Test Customer Contract"

    conds = [
        f"`tab{dt}`.`owner` = {escaped_user}",
    ]

    meta = frappe.get_meta(dt)
    for app_field in ["lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"]:
        if meta.has_field(app_field):
            conds.append(f"`tab{dt}`.`{app_field}` = {escaped_user}")

    if meta.has_field("contract_owner"):
        emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if emp:
            escaped_emp = frappe.db.escape(emp)
            conds.append(f"`tab{dt}`.`contract_owner` = {escaped_emp}")

    if meta.has_field("requested_by"):
        emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if emp:
            escaped_emp = frappe.db.escape(emp)
            conds.append(f"`tab{dt}`.`requested_by` = {escaped_emp}")

    # If this is a lifecycle document linked to a parent contract
    if meta.has_field("contract"):
        conds.append(f"""`tab{dt}`.`contract` IN (
            SELECT `name` FROM `tabTest Customer Contract`
            WHERE `owner` = {escaped_user}
               OR `lead_approver` = {escaped_user}
               OR `legal_approver` = {escaped_user}
               OR `finance_approver` = {escaped_user}
               OR `hr_approver` = {escaped_user}
               OR `ceo_approver` = {escaped_user}
        )""")

    # If this is parent Test Customer Contract, also allow if user is approver on any child lifecycle docs
    if dt == "Test Customer Contract":
        for child_dt in ["Contract Amendment", "Contract On Hold", "Contract Termination", "Contract Closure"]:
            conds.append(f"""`tab{dt}`.`name` IN (
                SELECT `contract` FROM `tab{child_dt}`
                WHERE `owner` = {escaped_user}
                   OR `lead_approver` = {escaped_user}
                   OR `legal_approver` = {escaped_user}
                   OR `finance_approver` = {escaped_user}
                   OR `hr_approver` = {escaped_user}
                   OR `ceo_approver` = {escaped_user}
            )""")

    # Open ToDo assignment
    conds.append(f"""`tab{dt}`.`name` IN (
        SELECT `reference_name` FROM `tabToDo`
        WHERE `reference_type` = '{dt}'
          AND `allocated_to` = {escaped_user}
          AND `status` = 'Open'
    )""")

    # DocShare
    conds.append(f"""`tab{dt}`.`name` IN (
        SELECT `share_name` FROM `tabDocShare`
        WHERE `share_doctype` = '{dt}'
          AND `user` = {escaped_user}
    )""")

    return "(" + " OR ".join(conds) + ")"


def has_contract_permission(doc, ptype="read", user=None, **kwargs):
    """
    Controller hook checking read/write permissions on specific contract documents.
    """
    if not user:
        user = frappe.session.user

    if user == "Administrator":
        return True

    roles = frappe.get_roles(user)
    if "System Manager" in roles or "Contract Manager" in roles or "Finance Approver" in roles:
        return True
    

    if not doc or not getattr(doc, "name", None) or (hasattr(doc, "is_new") and doc.is_new()):
        return True

    if getattr(doc, "owner", None) == user:
        return True

    # Approvers directly on doc
    approvers = [
        doc.get("lead_approver"),
        doc.get("legal_approver"),
        doc.get("finance_approver"),
        doc.get("hr_approver"),
        doc.get("ceo_approver"),
    ]
    if user in [a for a in approvers if a]:
        return True

    # Linked Employee (contract_owner or requested_by)
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if emp and (doc.get("contract_owner") == emp or doc.get("requested_by") == emp):
        return True

    # If child doc with parent contract
    if doc.get("contract"):
        parent_approvers = frappe.db.get_value(
            "Test Customer Contract",
            doc.contract,
            ["owner", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"],
            as_dict=True
        )
        if parent_approvers:
            if user == parent_approvers.get("owner"):
                return True
            if user in [parent_approvers.get(f) for f in ["lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"] if parent_approvers.get(f)]:
                return True

    # If parent doc, check if user is approver on any active child lifecycle docs
    if doc.doctype == "Test Customer Contract":
        for child_dt in ["Contract Amendment", "Contract On Hold", "Contract Termination", "Contract Closure"]:
            has_child = frappe.db.sql(f"""
                SELECT 1 FROM `tab{child_dt}`
                WHERE `contract` = %s AND (
                    `owner` = %s OR
                    `lead_approver` = %s OR
                    `legal_approver` = %s OR
                    `finance_approver` = %s OR
                    `hr_approver` = %s OR
                    `ceo_approver` = %s
                ) LIMIT 1
            """, (doc.name, user, user, user, user, user, user))
            if has_child:
                return True

    # Active ToDo assignment
    if frappe.db.exists("ToDo", {
        "reference_type": doc.doctype,
        "reference_name": doc.name,
        "allocated_to": user,
        "status": "Open",
    }):
        return True

    # DocShare
    if frappe.db.exists("DocShare", {
        "share_doctype": doc.doctype,
        "share_name": doc.name,
        "user": user,
    }):
        return True

    return False


def sync_contract_assignment(doc, method=None):
    """
    Hook on doc_events: on_update
    1. Shares doc with designated approvers.
    2. Determines active stage approver from workflow_state and assigns via Frappe ToDo SILENTLY (no spam emails).
    3. Closes obsolete stage assignments automatically SILENTLY.
    """
    if not doc or not getattr(doc, "name", None):
        return

    if hasattr(doc, "is_new") and doc.is_new():
        return

    if getattr(frappe.flags, "in_sync_contract_assignment", False):
        return
    frappe.flags.in_sync_contract_assignment = True

    try:
        # 1. Share document with all specified approvers so they have access
        approver_fields = [
            "lead_approver",
            "legal_approver",
            "finance_approver",
            "hr_approver",
            "ceo_approver",
        ]
        approvers = [doc.get(f) for f in approver_fields if doc.get(f)]

        # If child doc, copy parent contract approvers if child approvers are empty
        if doc.get("contract") and frappe.db.exists("Test Customer Contract", doc.contract):
            parent_doc = frappe.get_cached_doc("Test Customer Contract", doc.contract)
            for f in approver_fields:
                if doc.doctype == "Contract Amendment":
                    if f == "legal_approver" and not doc.get("requires_legal"):
                        continue
                    if f == "finance_approver" and not doc.get("requires_finance"):
                        continue
                    if f == "hr_approver" and not doc.get("requires_hr"):
                        continue

                if not doc.get(f) and parent_doc.get(f):
                    frappe.db.set_value(doc.doctype, doc.name, f, parent_doc.get(f), update_modified=False)
                    doc.set(f, parent_doc.get(f))
                    if parent_doc.get(f) not in approvers:
                        approvers.append(parent_doc.get(f))

            # Ensure non-required approvers are cleared on Contract Amendment
            if doc.doctype == "Contract Amendment":
                if not doc.get("requires_legal") and doc.get("legal_approver"):
                    frappe.db.set_value(doc.doctype, doc.name, "legal_approver", None, update_modified=False)
                    doc.set("legal_approver", None)
                if not doc.get("requires_finance") and doc.get("finance_approver"):
                    frappe.db.set_value(doc.doctype, doc.name, "finance_approver", None, update_modified=False)
                    doc.set("finance_approver", None)
                if not doc.get("requires_hr") and doc.get("hr_approver"):
                    frappe.db.set_value(doc.doctype, doc.name, "hr_approver", None, update_modified=False)
                    doc.set("hr_approver", None)

        for approver in approvers:
            if approver and frappe.db.exists("User", approver):
                if not frappe.db.exists("DocShare", {
                    "share_doctype": doc.doctype,
                    "share_name": doc.name,
                    "user": approver,
                }):
                    try:
                        frappe.share.add(
                            doc.doctype,
                            doc.name,
                            approver,
                            read=1,
                            write=1,
                            submit=0,
                            notify=0,
                        )
                    except Exception:
                        pass

        # 2. Determine active stage approver
        doctype_map = STAGE_APPROVER_MAP.get(doc.doctype, {})
        state = doc.get("workflow_state")
        target_field = doctype_map.get(state)
        target_approver = doc.get(target_field) if target_field else None

        # Safeguard: ensure past approval stages have their status stamped
        ensure_approval_status_stamped(doc)

        # Check for workflow transitions (Rejection / Return for Revision / Resubmit)
        handle_workflow_transition_events(doc)

        # Record completion timestamps for finished states
        now_dt = frappe.utils.now_datetime()
        meta = frappe.get_meta(doc.doctype)

        if (doc.get("workflow_state") == "Commenced" or doc.get("contract_status") == "Commenced") and not doc.get("commenced_on"):
            if meta.has_field("commenced_on"):
                frappe.db.set_value(doc.doctype, doc.name, "commenced_on", now_dt, update_modified=False)
                doc.commenced_on = now_dt

        if (doc.get("workflow_state") in ["Closed", "Contract Closed"] or doc.get("status") == "Closed") and not doc.get("closed_on"):
            if meta.has_field("closed_on"):
                frappe.db.set_value(doc.doctype, doc.name, "closed_on", now_dt, update_modified=False)
                doc.closed_on = now_dt

        if (doc.get("workflow_state") in ["On Hold", "Active Hold"] or doc.get("status") == "On Hold") and not doc.get("on_hold_on"):
            if meta.has_field("on_hold_on"):
                frappe.db.set_value(doc.doctype, doc.name, "on_hold_on", now_dt, update_modified=False)
                doc.on_hold_on = now_dt

        if (doc.get("workflow_state") == "Resumed" or doc.get("status") == "Resumed") and not doc.get("resumed_on"):
            if meta.has_field("resumed_on"):
                frappe.db.set_value(doc.doctype, doc.name, "resumed_on", now_dt, update_modified=False)
                doc.resumed_on = now_dt

        if (doc.get("workflow_state") in ["Termination Executed", "Terminated"] or doc.get("status") == "Terminated") and not doc.get("executed_on"):
            if meta.has_field("executed_on"):
                frappe.db.set_value(doc.doctype, doc.name, "executed_on", now_dt, update_modified=False)
                doc.executed_on = now_dt

        if (doc.get("workflow_state") == "Executed" or doc.get("docstatus") == 1) and not doc.get("executed_on"):
            if meta.has_field("executed_on"):
                frappe.db.set_value(doc.doctype, doc.name, "executed_on", now_dt, update_modified=False)
                doc.executed_on = now_dt

        # Final / Reset states: silently close all assignments
        doctype_finals = FINAL_STATES.get(doc.doctype, ["Commenced", "Terminated", "Closed", "Rejected", "Executed"])
        if state in doctype_finals or state in RESET_STATES:
            close_silent_todos(doc.doctype, doc.name)
            return

        if target_approver and frappe.db.exists("User", target_approver):
            # Silently close open ToDos for everyone EXCEPT the active target approver
            close_silent_todos(doc.doctype, doc.name, except_user=target_approver)

            # Check if active approver already has an open ToDo
            already_assigned = frappe.db.exists("ToDo", {
                "reference_type": doc.doctype,
                "reference_name": doc.name,
                "allocated_to": target_approver,
                "status": "Open",
            })

            if not already_assigned:
                try:
                    create_silent_todo(
                        doctype=doc.doctype,
                        name=doc.name,
                        allocated_to=target_approver,
                        description=f"Approval required for {doc.doctype} {doc.name} at stage: {state}",
                        priority="High",
                    )
                except Exception as e:
                    frappe.log_error(f"Error assigning {doc.doctype} {doc.name} to {target_approver}: {str(e)}")

                # Send customized approval assignment email for Contract On Hold
                if doc.doctype == "Contract On Hold":
                    try:
                        from access_custom.access_custom.doctype.contract_on_hold.contract_on_hold import send_on_hold_stage_approval_email
                        send_on_hold_stage_approval_email(doc, state, target_approver)
                    except Exception as e:
                        frappe.log_error(f"Error sending On Hold approval assignment email: {str(e)}")

    finally:
        frappe.flags.in_sync_contract_assignment = False


def on_contract_trash(doc, method=None):
    """
    Hook on doc_events: on_trash
    Cleans up any ToDos or DocShares if a document is deleted.
    """
    if not doc or not getattr(doc, "name", None):
        return
    try:
        frappe.db.delete("ToDo", {
            "reference_type": doc.doctype,
            "reference_name": doc.name,
        })
        frappe.db.delete("DocShare", {
            "share_doctype": doc.doctype,
            "share_name": doc.name,
        })
    except Exception:
        pass


def ensure_approval_status_stamped(doc):
    """
    Safeguard: If a lifecycle document advanced beyond an approval stage,
    ensure the completed stage's approver status field is stamped.
    """
    if doc.doctype not in ["Contract Amendment", "Contract On Hold", "Contract Termination", "Contract Closure"]:
        return

    meta = frappe.get_meta(doc.doctype)
    now_str = frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd-MM-yyyy HH:mm:ss")
    
    stages_order = []
    if doc.doctype == "Contract Amendment":
        stages_order = [
            ("Under Team Lead Review", "lead_approver_status"),
            ("Pending Legal Review", "legal_approver_status"),
            ("Pending Finance Review", "finance_approver_status"),
            ("Pending HR Review", "hr_approver_status"),
            ("Pending CEO Review", "ceo_approver_status"),
            ("Pending Client Signature", None),
            ("Executed", None)
        ]
    elif doc.doctype == "Contract On Hold":
        stages_order = [
            ("Pending Team Lead Approval", "lead_approver_status"),
            ("Pending Legal Approval", "legal_approver_status"),
            ("Pending Finance Approval", "finance_approver_status"),
            ("Pending HR Approval", "hr_approver_status"),
            ("Pending CEO Approval", "ceo_approver_status"),
            ("On Hold", None)
        ]
    elif doc.doctype == "Contract Termination":
        stages_order = [
            ("Termination Under TL Review", "lead_approver_status"),
            ("Termination Under Legal Review", "legal_approver_status"),
            ("Termination Under Finance Review", "finance_approver_status"),
            ("Termination Under HR Review", "hr_approver_status"),
            ("Termination Under CEO Review", "ceo_approver_status"),
            ("Termination Executed", None),
            ("Terminated", None)
        ]
    elif doc.doctype == "Contract Closure":
        stages_order = [
            ("Team Lead Closure", "lead_approver_status"),
            ("Legal Closure", "legal_approver_status"),
            ("Finance Closure", "finance_approver_status"),
            ("CEO Closure", "ceo_approver_status"),
            ("Closed", None)
        ]

    curr_state = doc.get("workflow_state")
    curr_idx = -1
    for idx, (st, _) in enumerate(stages_order):
        if st == curr_state:
            curr_idx = idx
            break

    if curr_idx > 0:
        for idx in range(curr_idx):
            st, status_field = stages_order[idx]
            if status_field and meta.has_field(status_field):
                val = doc.get(status_field)
                if not val or not ("Approved" in val or "Rejected" in val or "Returned" in val):
                    # Check if this approver was required
                    if doc.doctype == "Contract Amendment":
                        if status_field == "legal_approver_status" and not doc.get("requires_legal"):
                            continue
                        if status_field == "finance_approver_status" and not doc.get("requires_finance"):
                            continue
                        if status_field == "hr_approver_status" and not doc.get("requires_hr"):
                            continue

                    new_val = f"Approved [{now_str}]"
                    frappe.db.set_value(doc.doctype, doc.name, status_field, new_val, update_modified=False)
                    doc.set(status_field, new_val)



# ==============================================================================
# LIFECYCLE STAGES CONFIGURATION FOR DYNAMIC BROADCAST & RESET
# ==============================================================================
LIFECYCLE_STAGES_CONFIG = {
    "Contract Amendment": [
        {"state": "Under Team Lead Review", "field": "lead_approver", "status": "lead_approver_status", "review": "lead_approver_review", "role": "Team Lead Review"},
        {"state": "Pending Legal Review", "field": "legal_approver", "status": "legal_approver_status", "review": "legal_approver_review", "role": "Legal Review"},
        {"state": "Pending Finance Review", "field": "finance_approver", "status": "finance_approver_status", "review": "finance_approver_review", "role": "Finance Review"},
        {"state": "Pending HR Review", "field": "hr_approver", "status": "hr_approver_status", "review": "hr_approver_review", "role": "HR Review"},
        {"state": "Pending CEO Review", "field": "ceo_approver", "status": "ceo_approver_status", "review": "ceo_approver_review", "role": "CEO Review"},
    ],
    "Contract On Hold": [
        {"state": "Pending Team Lead Approval", "field": "lead_approver", "status": "lead_approver_status", "review": "lead_approver_review", "role": "Team Lead Approval"},
        {"state": "Pending Legal Approval", "field": "legal_approver", "status": "legal_approver_status", "review": "legal_approver_review", "role": "Legal Approval"},
        {"state": "Pending Finance Approval", "field": "finance_approver", "status": "finance_approver_status", "review": "finance_approver_review", "role": "Finance Approval"},
        {"state": "Pending HR Approval", "field": "hr_approver", "status": "hr_approver_status", "review": "hr_approver_review", "role": "HR Approval"},
        {"state": "Pending CEO Approval", "field": "ceo_approver", "status": "ceo_approver_status", "review": "ceo_approver_review", "role": "CEO Approval"},
    ],
    "Contract Termination": [
        {"state": "Termination Under TL Review", "field": "lead_approver", "status": "lead_approver_status", "review": "lead_approver_review", "role": "Team Lead Review"},
        {"state": "Termination Under Legal Review", "field": "legal_approver", "status": "legal_approver_status", "review": "legal_approver_review", "role": "Legal Review"},
        {"state": "Termination Under Finance Review", "field": "finance_approver", "status": "finance_approver_status", "review": "finance_approver_review", "role": "Finance Review"},
        {"state": "Termination Under HR Review", "field": "hr_approver", "status": "hr_approver_status", "review": "hr_approver_review", "role": "HR Review"},
        {"state": "Termination Under CEO Review", "field": "ceo_approver", "status": "ceo_approver_status", "review": "ceo_approver_review", "role": "CEO Review"},
    ],
    "Contract Closure": [
        {"state": "Team Lead Closure", "field": "lead_approver", "status": "lead_approver_status", "review": "lead_approver_review", "role": "Team Lead Closure"},
        {"state": "Legal Closure", "field": "legal_approver", "status": "legal_approver_status", "review": "legal_approver_review", "role": "Legal Closure"},
        {"state": "Finance Closure", "field": "finance_approver", "status": "finance_approver_status", "review": "finance_approver_review", "role": "Finance Closure"},
        {"state": "CEO Closure", "field": "ceo_approver", "status": "ceo_approver_status", "review": "ceo_approver_review", "role": "CEO Closure"},
    ]
}


@frappe.whitelist()

def validate_stage_approver_authorization(doc, method=None):
    """
    Strict Stage Approver Authorization Validation:
    1. Prevents any approver from approving/rejecting a state that is not assigned to them.
       (e.g., a Finance Manager cannot approve HR stage, Legal stage, TL stage, or CEO stage).
    2. Ensures only the exact assigned approver on this contract (or Administrator) can approve or reject in their state.
    3. Blocks unauthorized transitions and throws a clear PermissionError message.
    """
    if not doc or not getattr(doc, "name", None) or (hasattr(doc, "is_new") and doc.is_new()):
        return

    current_user = frappe.session.user
    if current_user == "Administrator":
        return

    dt = doc.doctype
    if dt not in STAGE_APPROVER_MAP:
        return

    current_state = doc.get("workflow_state")
    if not current_state:
        return

    # Get previous state from database
    prev_state = None
    if hasattr(doc, "_doc_before_save") and doc._doc_before_save:
        prev_state = doc._doc_before_save.get("workflow_state")
    if not prev_state:
        prev_state = frappe.db.get_value(dt, doc.name, "workflow_state")

    # If the workflow state is transitioning
    if prev_state and prev_state != current_state:
        # Check if previous state had a designated approver
        approver_field = STAGE_APPROVER_MAP.get(dt, {}).get(prev_state)
        if approver_field:
            assigned_user = doc.get(approver_field)
            if not assigned_user and doc.get("contract"):
                assigned_user = frappe.db.get_value("Test Customer Contract", doc.contract, approver_field)

            role_titles = {
                "lead_approver": "Team Lead Approver",
                "legal_approver": "Legal Approver",
                "finance_approver": "Finance Approver",
                "hr_approver": "HR Approver",
                "ceo_approver": "CEO Approver"
            }
            approver_title = role_titles.get(approver_field, "Stage Approver")

            if not assigned_user:
                frappe.throw(
                    frappe._("Approval Blocked: No {0} has been assigned on this contract for '{1}' stage.").format(
                        approver_title, prev_state
                    ),
                    title=frappe._("Approver Not Assigned")
                )

            if current_user != assigned_user:
                assigned_name = frappe.db.get_value("User", assigned_user, "full_name") or assigned_user
                frappe.throw(
                    frappe._("Unauthorized Approval Action: Document is currently in '{0}'. Only the assigned {1} ({2}) is permitted to approve, reject, or return this document.").format(
                        prev_state, approver_title, assigned_name
                    ),
                    title=frappe._("Access Denied")
                )


@frappe.whitelist()
def record_approver_decision(doctype, name, status_field=None, status_val=None, review_field=None, review_val=None):
    """
    Atomically records the active approver's review comments and status before workflow action.
    Saves directly to DB with update_modified=False to prevent race conditions and timestamp conflicts.
    """
    if not frappe.has_permission(doctype, "write", doc=name):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

    current_user = frappe.session.user
    if current_user != "Administrator":
        doc_state = frappe.db.get_value(doctype, name, "workflow_state")
        approver_field = STAGE_APPROVER_MAP.get(doctype, {}).get(doc_state)
        if approver_field:
            assigned_user = frappe.db.get_value(doctype, name, approver_field)
            if not assigned_user:
                parent_contract = frappe.db.get_value(doctype, name, "contract")
                if parent_contract:
                    assigned_user = frappe.db.get_value("Test Customer Contract", parent_contract, approver_field)
            if assigned_user and current_user != assigned_user:
                assigned_name = frappe.db.get_value("User", assigned_user, "full_name") or assigned_user
                frappe.throw(
                    frappe._("Unauthorized: You are not the assigned approver for '{0}' (Assigned to: {1}).").format(doc_state, assigned_name),
                    frappe.PermissionError
                )

    meta = frappe.get_meta(doctype)
    if status_field and meta.has_field(status_field):
        frappe.db.set_value(doctype, name, status_field, status_val, update_modified=False)
    if review_field and review_val is not None and meta.has_field(review_field):
        frappe.db.set_value(doctype, name, review_field, str(review_val).strip(), update_modified=False)

    return {
        "status": "success",
        "status_field": status_field,
        "status_val": status_val,
        "review_field": review_field,
        "review_val": review_val
    }


def handle_workflow_transition_events(doc):
    """
    Detects workflow transitions and triggers:
    1. Rejection & Return for Revision dynamic email broadcast to document creator + all prior approvers.
    2. Approver status reset on resubmission from Draft / Returned for Revision back to Level 1 review.
    """
    if doc.doctype not in LIFECYCLE_STAGES_CONFIG:
        return

    old_doc = doc.get_doc_before_save()
    old_state = old_doc.get("workflow_state") if old_doc else None
    new_state = doc.get("workflow_state")

    if not old_state or old_state == new_state:
        return

    # Case 1: Resubmission from Draft / Returned for Revision / Rejected to first review stage
    first_stages = [
        "Under Team Lead Review",
        "Pending Team Lead Approval",
        "Termination Under TL Review",
        "Team Lead Closure"
    ]
    if old_state in ["Draft", "Returned for Revision", "Rejected"] and new_state in first_stages:
        reset_approver_statuses_on_resubmit(doc)

    # Case 2: Rejection or Return for Revision
    if new_state in ["Draft", "Returned for Revision", "Rejected"]:
        send_rejection_or_revision_broadcast(doc, old_state, new_state)


def reset_approver_statuses_on_resubmit(doc):
    """
    When document is resubmitted to Team Lead from Draft/Returned/Rejected,
    reset all approval statuses and reviews to None so the cycle proceeds cleanly from the beginning.
    """
    fields_to_reset = [
        "lead_approver_status",
        "legal_approver_status",
        "finance_approver_status",
        "hr_approver_status",
        "ceo_approver_status",
        "lead_approver_review",
        "legal_approver_review",
        "finance_approver_review",
        "hr_approver_review",
        "ceo_approver_review"
    ]
    meta = frappe.get_meta(doc.doctype)
    for f in fields_to_reset:
        if meta.has_field(f):
            frappe.db.set_value(doc.doctype, doc.name, f, None, update_modified=False)
            doc.set(f, None)


def send_rejection_or_revision_broadcast(doc, old_state, new_state):
    """
    Broadcasts email notification on Reject or Return for Revision to:
    1. Document Creator / Contract Manager (doc.owner and linked employee user)
    2. ALL prior approvers who approved before this stage
    """
    stages = LIFECYCLE_STAGES_CONFIG.get(doc.doctype, [])
    rejecting_stage_idx = -1
    for idx, s in enumerate(stages):
        if s["state"] == old_state:
            rejecting_stage_idx = idx
            break

    if rejecting_stage_idx == -1:
        return

    current_stage_cfg = stages[rejecting_stage_idx]
    status_val = doc.get(current_stage_cfg["status"]) or ""
    review_comment = doc.get(current_stage_cfg["review"]) or ""
    decider_email = doc.get(current_stage_cfg["field"]) or frappe.session.user
    stage_role = current_stage_cfg["role"]

    is_rejected = ("Rejected" in status_val) or (new_state == "Rejected")
    is_returned = ("Returned" in status_val) or (new_state == "Returned for Revision")

    if not (is_rejected or is_returned):
        return

    decision_type = "Rejected" if is_rejected else "Returned for Revision"
    header_color = "#dc2626" if is_rejected else "#d97706"
    subject = f"Notice: {doc.doctype} {doc.name} {decision_type} by {stage_role}"

    # Helper to resolve and validate email address
    def resolve_valid_email(user_or_email):
        if not user_or_email:
            return None
        email = user_or_email
        if frappe.db.exists("User", user_or_email):
            user_email = frappe.db.get_value("User", user_or_email, "email")
            if user_email:
                email = user_email
        if frappe.utils.validate_email_address(email, throw=False):
            return email
        return None

    # Build recipient list: Creator + All prior approvers
    recipients = []
    if doc.owner:
        email = resolve_valid_email(doc.owner)
        if email:
            recipients.append(email)

    for emp_field in ["requested_by", "contract_owner"]:
        if doc.get(emp_field):
            emp_user = frappe.db.get_value("Employee", doc.get(emp_field), "user_id")
            if emp_user:
                email = resolve_valid_email(emp_user)
                if email:
                    recipients.append(email)

    for idx in range(rejecting_stage_idx):
        past_stage = stages[idx]
        app_val = doc.get(past_stage["field"])
        if app_val:
            email = resolve_valid_email(app_val)
            if email:
                recipients.append(email)

    recipients = list(dict.fromkeys(recipients))
    if not recipients:
        return

    reason_display = review_comment.strip() if review_comment else "No specific comments entered."
    doc_url = frappe.utils.get_url_to_form(doc.doctype, doc.name)
    year_str = str(frappe.utils.getdate().year)
    box_bg = "#fef2f2" if is_rejected else "#fffbeb"
    box_border = "#fecaca" if is_rejected else "#fde68a"
    reason_label = "Reason for Rejection" if is_rejected else "Revision Feedback / Comments"

    if is_rejected:
        status_desc = "This amendment proposal has been rejected and transitioned to the <strong>Rejected</strong> state."
    else:
        status_desc = "The document has been returned directly to <strong>Draft</strong> stage. Only the Contract Manager is authorized to modify the details and resubmit to Team Lead for approvals from the beginning."

    html_message = f"""<!-- Hidden Preheader -->
<div style="display: none; max-height: 0px; overflow: hidden; font-size: 0px; line-height: 0px; mso-hide: all; color: #fff;">
  Notice: {doc.doctype} {doc.name} has been {decision_type.lower()} by {stage_role}.
</div>

<!-- Main Email Wrapper -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <tr>
    <td align="center">
      <!-- Main Card Container -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; border: 1px solid #dfe1e6; border-collapse: separate; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <!-- Colored Header -->
        <tr>
          <td style="background-color: {header_color}; padding: 24px 32px; text-align: center;">
            <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600; letter-spacing: 0.5px;">{doc.doctype} {decision_type}</h2>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #172b4d; line-height: 24px;">Hello,</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #172b4d; line-height: 24px;">
              <strong>{doc.doctype} {doc.name}</strong> has been <strong style="color: {header_color};">{decision_type.lower()}</strong> during the <strong>{stage_role}</strong> stage.
            </p>
            <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 22px;">
              {status_desc}
            </p>

            <!-- Structured Data Table -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #dfe1e6; border-radius: 6px; border-collapse: separate; overflow: hidden; margin-bottom: 24px;">
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; background-color: #fafbfc; font-size: 14px; color: #5e6c84; font-weight: 500; width: 38%;">Document ID</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; font-size: 14px; color: #172b4d; font-weight: 600; text-align: right;">{doc.name}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; background-color: #fafbfc; font-size: 14px; color: #5e6c84; font-weight: 500;">Master Contract</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; font-size: 14px; color: #172b4d; font-weight: 600; text-align: right;">{doc.get('contract') or 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; background-color: #fafbfc; font-size: 14px; color: #5e6c84; font-weight: 500;">Customer Name</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; font-size: 14px; color: #172b4d; font-weight: 600; text-align: right;">{doc.get('customer_name') or 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; background-color: #fafbfc; font-size: 14px; color: #5e6c84; font-weight: 500;">Decided By</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #dfe1e6; font-size: 14px; color: #172b4d; font-weight: 600; text-align: right;">{stage_role} ({decider_email})</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; background-color: #fafbfc; font-size: 14px; color: #5e6c84; font-weight: 500;">Decision</td>
                <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: {header_color}; text-align: right;">{decision_type}</td>
              </tr>
            </table>

            <!-- Reason Box -->
            <div style="background-color: {box_bg}; border: 1px solid {box_border}; border-radius: 6px; padding: 16px; margin-bottom: 28px;">
              <div style="font-size: 13px; font-weight: 700; color: {header_color}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                {reason_label}
              </div>
              <div style="font-size: 14px; color: #1f2937; line-height: 20px; white-space: pre-wrap;">
                {frappe.utils.escape_html(reason_display)}
              </div>
            </div>

            <!-- Call to Action Button -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="{header_color}" style="border-radius: 6px;">
                        <a href="{doc_url}" target="_blank" style="font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; display: inline-block;">Open Document Details</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 24px; background-color: #fafbfc; text-align: center; border-top: 1px solid #dfe1e6;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b778c;">This is an automated workflow notification from the Contract Lifecycle Management system.</p>
            <p style="margin: 0; font-size: 12px; color: #6b778c;">&copy; {year_str} ACCESS Health International.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
"""

    try:
        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=html_message,
            reference_doctype=doc.doctype,
            reference_name=doc.name,
            now=True
        )
    except Exception as e:
        frappe.log_error(f"Error sending rejection/revision broadcast for {doc.doctype} {doc.name}: {str(e)}")


@frappe.whitelist()
def backfill_completion_timestamps():
    # 1. Contract Closure
    closures = frappe.get_all('Contract Closure', filters={'workflow_state': 'Closed'}, fields=['name', 'modified', 'creation', 'closed_on'])
    for c in closures:
        if not c.closed_on:
            frappe.db.set_value('Contract Closure', c.name, 'closed_on', c.modified or c.creation, update_modified=False)

    # 2. Contract On Hold
    holds = frappe.get_all('Contract On Hold', fields=['name', 'workflow_state', 'status', 'modified', 'creation', 'on_hold_on', 'resumed_on', 'actual_resume_date'])
    for h in holds:
        if h.workflow_state == 'Resumed' or h.status == 'Resumed':
            if not h.resumed_on:
                frappe.db.set_value('Contract On Hold', h.name, 'resumed_on', h.modified or h.creation, update_modified=False)
            if not h.on_hold_on:
                frappe.db.set_value('Contract On Hold', h.name, 'on_hold_on', h.creation, update_modified=False)
        elif h.workflow_state in ['On Hold', 'Active Hold'] or h.status == 'On Hold':
            if not h.on_hold_on:
                frappe.db.set_value('Contract On Hold', h.name, 'on_hold_on', h.modified or h.creation, update_modified=False)

    # 3. Contract Termination
    terminations = frappe.get_all('Contract Termination', filters={'workflow_state': ['in', ['Termination Executed', 'Terminated']]}, fields=['name', 'modified', 'creation', 'executed_on'])
    for t in terminations:
        if not t.executed_on:
            frappe.db.set_value('Contract Termination', t.name, 'executed_on', t.modified or t.creation, update_modified=False)

    # 4. Contract Amendment
    amendments = frappe.get_all('Contract Amendment', filters={'workflow_state': 'Executed'}, fields=['name', 'modified', 'creation', 'executed_on'])
    for a in amendments:
        if not a.executed_on:
            frappe.db.set_value('Contract Amendment', a.name, 'executed_on', a.modified or a.creation, update_modified=False)

    # 5. Test Customer Contract
    contracts = frappe.get_all('Test Customer Contract', filters={'workflow_state': ['in', ['Commenced', 'Closed', 'Terminated']]}, fields=['name', 'modified', 'creation', 'commenced_on'])
    for c in contracts:
        if not c.commenced_on:
            frappe.db.set_value('Test Customer Contract', c.name, 'commenced_on', c.modified or c.creation, update_modified=False)

    frappe.db.commit()
    return "Backfill complete and committed!"


@frappe.whitelist()
def get_status_summary():
    return {
        "closures": frappe.get_all('Contract Closure', fields=['name', 'workflow_state', 'status', 'closed_on']),
        "holds": frappe.get_all('Contract On Hold', fields=['name', 'workflow_state', 'status', 'on_hold_on', 'resumed_on', 'actual_resume_date']),
        "terminations": frappe.get_all('Contract Termination', fields=['name', 'workflow_state', 'status', 'executed_on', 'effective_termination_date']),
        "amendments": frappe.get_all('Contract Amendment', fields=['name', 'workflow_state', 'executed_on']),
        "contracts": frappe.get_all('Test Customer Contract', fields=['name', 'workflow_state', 'contract_status', 'commenced_on'])
    }



@frappe.whitelist()
def backfill_employee_names():
    # 1. Test Customer Contract
    contracts = frappe.get_all("Test Customer Contract", fields=["name", "contract_owner"])
    for c in contracts:
        if c.contract_owner:
            emp_name = frappe.db.get_value("Employee", c.contract_owner, "employee_name")
            if emp_name:
                frappe.db.set_value("Test Customer Contract", c.name, "contract_owner_name", emp_name, update_modified=False)

    # 2. Child lifecycle doctypes
    for dt in ["Contract Amendment", "Contract On Hold", "Contract Termination", "Contract Closure"]:
        docs = frappe.get_all(dt, fields=["name", "requested_by"])
        for d in docs:
            if d.requested_by:
                emp_name = frappe.db.get_value("Employee", d.requested_by, "employee_name")
                if emp_name:
                    frappe.db.set_value(dt, d.name, "requested_by_name", emp_name, update_modified=False)

    frappe.db.commit()
    return "Backfilled employee names for all existing records!"

@frappe.whitelist()
def debug_inspect_roles_and_contract():
    import json
    c = frappe.db.get_value("Test Customer Contract", "TEST-2026-00036", 
        ["name", "owner", "contract_owner", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver", "workflow_state"], 
        as_dict=True)
    
    out = {"contract": c}
    if c and c.get("ceo_approver"):
        out["ceo_roles"] = frappe.get_roles(c.get("ceo_approver"))
    if c and c.get("owner"):
        out["owner_roles"] = frappe.get_roles(c.get("owner"))

    hold = frappe.db.get_value("Contract On Hold", "HOLD-2026-00004", 
        ["name", "owner", "requested_by", "requested_by_name", "contract"], as_dict=True)
    out["hold"] = hold
    if hold and hold.get("requested_by"):
        out["emp"] = frappe.db.get_value("Employee", hold.get("requested_by"), ["name", "employee_name", "user_id"], as_dict=True)
    with open('/tmp/debug_out.json', 'w') as df:
        json.dump(out, df, indent=2, default=str)
    return out



@frappe.whitelist()
def custom_get_transitions(doc, workflow=None, raise_exception=False):
    """
    Whitelisted override for frappe.model.workflow.get_transitions.
    1. During approval stages: ONLY the assigned approver for the active stage (or Administrator)
       receives transitions. All other approvers receive [].
    2. During Draft / Returned for Revision: ONLY the Contract Manager or document creator/owner
       receives transitions (e.g. 'Submit to Team Lead'). Other approvers receive [].
    """
    from frappe.model.workflow import get_transitions as orig_get_transitions
    from frappe.model.document import Document

    if isinstance(doc, Document):
        doc_obj = doc
    else:
        try:
            doc_data = frappe.parse_json(doc) if isinstance(doc, str) else doc
            doc_obj = frappe.get_doc(doc_data)
            if not doc_obj.is_new() and doc_obj.name:
                doc_obj.load_from_db()
        except Exception:
            return orig_get_transitions(doc, workflow=workflow, raise_exception=raise_exception)

    transitions = orig_get_transitions(doc_obj, workflow=workflow, raise_exception=raise_exception)

    doctype = doc_obj.doctype
    if doctype not in STAGE_APPROVER_MAP:
        return transitions

    user = frappe.session.user
    if user == "Administrator":
        return transitions

    current_state = doc_obj.get("workflow_state")
    if not current_state:
        return transitions

        # Case A: In Draft or Returned for Revision (After Rejection)
    # ONLY Contract Manager or Creator/Owner is permitted to see/action the document.
    # Approvers assigned to this contract MUST NOT see any actions in Draft!
    if current_state in ["Draft", "Returned for Revision", "Termination Requested", "Closure Initiated", "In Progress"]:
        approvers = [
            doc_obj.get("lead_approver"),
            doc_obj.get("legal_approver"),
            doc_obj.get("finance_approver"),
            doc_obj.get("hr_approver"),
            doc_obj.get("ceo_approver"),
        ]
        approvers = [a for a in approvers if a]

        is_owner = (user == doc_obj.owner)
        if doc_obj.get("contract_owner"):
            emp_user = frappe.db.get_value("Employee", doc_obj.contract_owner, "user_id")
            if emp_user and user == emp_user:
                is_owner = True

        # Any assigned approver on this contract who is not the creator cannot action in Draft
        if user in approvers and not is_owner:
            return []

        roles = frappe.get_roles(user)
        if not is_owner and "Contract Manager" not in roles:
            return []

        return transitions

    # Case B: In an active approval stage
    approver_field = STAGE_APPROVER_MAP.get(doctype, {}).get(current_state)
    if approver_field:
        assigned_user = doc_obj.get(approver_field)
        if not assigned_user and doc_obj.get("contract"):
            assigned_user = frappe.db.get_value("Test Customer Contract", doc_obj.contract, approver_field)

        # STRICT: If user is not the assigned approver for this active state, return NO transitions!
        if not assigned_user or user != assigned_user:
            return []

    return transitions


@frappe.whitelist()
def custom_apply_workflow(doc, action):
    """
    Whitelisted override for frappe.model.workflow.apply_workflow.
    Enforces that:
    1. During approval stages, only the designated approver for the active stage can execute actions.
    2. During Draft / Returned for Revision, only Contract Manager / Creator can submit or resubmit.
    """
    from frappe.model.workflow import apply_workflow as orig_apply_workflow
    from frappe.model.document import Document

    if isinstance(doc, Document):
        doc_obj = doc
    else:
        doc_data = frappe.parse_json(doc) if isinstance(doc, str) else doc
        doc_obj = frappe.get_doc(doc_data)

    doctype = doc_obj.doctype
    if doctype in STAGE_APPROVER_MAP:
        user = frappe.session.user
        if user != "Administrator":
            current_state = doc_obj.get("workflow_state")

            if current_state in ["Draft", "Returned for Revision", "Termination Requested", "Closure Initiated", "In Progress"]:
                is_creator = (user == doc_obj.owner)
                if doc_obj.get("contract_owner"):
                    emp_user = frappe.db.get_value("Employee", doc_obj.contract_owner, "user_id")
                    if emp_user and user == emp_user:
                        is_creator = True
                roles = frappe.get_roles(user)
                is_contract_manager = ("Contract Manager" in roles) or ("System Manager" in roles)

                if not is_creator and not is_contract_manager:
                    action_msg = "commence or action" if current_state == "In Progress" else "submit or resubmit"
                    frappe.throw(
                        frappe._("Access Denied: Document is in '{0}'. Only the Contract Manager or document creator can {1}.").format(current_state, action_msg),
                        frappe.PermissionError
                    )

                if action == "Commence Contract" or current_state == "In Progress":
                    signed_doc = doc_obj.get("upload_signed_document") or frappe.db.get_value(doctype, doc_obj.name, "upload_signed_document")
                    if not signed_doc:
                        frappe.throw(
                            frappe._("Please upload the 'Complete Counter Signed Contract' document before commencing the contract."),
                            title=frappe._("Document Required")
                        )

            approver_field = STAGE_APPROVER_MAP.get(doctype, {}).get(current_state)
            if approver_field:
                assigned_user = doc_obj.get(approver_field)
                if not assigned_user and doc_obj.get("contract"):
                    assigned_user = frappe.db.get_value("Test Customer Contract", doc_obj.contract, approver_field)

                if not assigned_user or user != assigned_user:
                    role_titles = {
                        "lead_approver": "Team Lead Approver",
                        "legal_approver": "Legal Approver",
                        "finance_approver": "Finance Approver",
                        "hr_approver": "HR Approver",
                        "ceo_approver": "CEO Approver"
                    }
                    approver_title = role_titles.get(approver_field, "Stage Approver")
                    assigned_name = frappe.db.get_value("User", assigned_user, "full_name") or assigned_user or "Assigned Approver"
                    frappe.throw(
                        frappe._("Access Denied: You cannot approve or reject for '{0}'. Only the assigned {1} ({2}) is permitted to approve or reject this stage.").format(
                            current_state, approver_title, assigned_name
                        ),
                        frappe.PermissionError
                    )

    return orig_apply_workflow(doc, action)
