import frappe
from frappe.model.workflow import apply_workflow

def sync():
    frappe.set_user("Administrator")
    policies = [
        {
            "title": "India Leave Policy - 2026",
            "details": [
                ("Personal Leave (PL) - India", 5.0),
                ("Sick Leave (SL) - India", 7.0),
                ("Earned Leave (EL) - India", 15.0),
                ("Maternity Leave (ML) - India", 180.0),
                ("Paternity Leave (PAL) - India", 10.0),
                ("Bereavement Leave (BL) - India", 5.0),
            ],
        },
        {
            "title": "Singapore Leave Policy - 2026",
            "details": [
                ("Personal Leave (PL) - Singapore", 5.0),
                ("Sick Leave (SL) - Singapore", 14.0),
                ("Annual Leave (AL) - Singapore", 21.0),
                ("Maternity Leave (ML) - Singapore", 112.0),
                ("Paternity Leave (PAL) - Singapore", 28.0),
                ("Bereavement Leave (BL) - Singapore", 5.0),
                ("Childcare Leave (CL) - Singapore", 6.0),
                ("Extended Childcare Leave (ECL) - Singapore", 2.0),
            ],
        },
        {
            "title": "Egypt Leave Policy - 2026",
            "details": [
                ("Casual Leave (CL) - Egypt", 6.0),
                ("Sick Leave (SL) - Egypt", 180.0),
                ("Annual Leave (AL) - Egypt", 21.0),
                ("Maternity Leave (ML) - Egypt", 90.0),
            ],
        },
        {
            "title": "Dubai Leave Policy - 2026",
            "details": [
                ("Annual Leave (AL) - Dubai", 30.0),
                ("Maternity Leave (ML) - Dubai", 60.0),
                ("Paternity Leave (PAL) - Dubai", 5.0),
                ("Sick Leave (SL) - Dubai", 15.0),
                ("Bereavement Leave (BL) - Dubai", 5.0),
            ],
        },
        {
            "title": "US Leave Policy - 2026",
            "details": [
                ("Personal Leave (PL) - US", 5.0),
                ("Sick Leave (SL) - US", 7.0),
                ("Earned Leave (EL) - US", 15.0),
                ("Maternity Leave (ML) - US", 84.0),
                ("Paternity Leave (PAL) - US", 84.0),
                ("Bereavement Leave (BL) - US", 5.0),
            ],
        },
    ]

    for p in policies:
        existing = frappe.db.get_value("Leave Policy", {"title": p["title"]}, "name")
        if not existing:
            doc = frappe.get_doc({
                "doctype": "Leave Policy",
                "title": p["title"],
                "workflow_state": "Draft",
                "leave_policy_details": [
                    {"leave_type": lt, "annual_allocation": alloc} for lt, alloc in p["details"]
                ],
            })
            doc.insert()
            apply_workflow(doc, "Submit for Approval")
            apply_workflow(doc, "Approve")
            print(f"Created and Approved: {p['title']} -> {doc.name}")
        else:
            print(f"Already exists: {p['title']} ({existing})")

    frappe.db.commit()
    print("All 5 Regional Leave Policies synced successfully!")
