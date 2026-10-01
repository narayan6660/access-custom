# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, add_months, add_years, getdate, nowdate

class ConsultantContract(Document):
    def validate(self):
        self.calculate_tenure_and_end_date()
        self.calculate_allocation_totals()
        self.sync_rfp_and_sections()
        self.generate_custom_contract_id()
        self.sync_workflow_status()
        self.validate_pdf_attachments()

    def calculate_tenure_and_end_date(self):
        # 1. Auto-calculate end date if start date & tenure provided
        start = self.proposed_start_date or self.start_date
        tenure_val = self.initial_tenure_value or 0
        unit = (self.tenure_unit or "Months").lower()

        if start and tenure_val > 0 and not self.proposed_end_date:
            s_date = getdate(start)
            if "month" in unit:
                self.proposed_end_date = add_months(s_date, int(tenure_val))
            elif "year" in unit:
                self.proposed_end_date = add_years(s_date, int(tenure_val))
            elif "week" in unit:
                self.proposed_end_date = add_days(s_date, int(tenure_val) * 7)
            else:
                self.proposed_end_date = add_days(s_date, int(tenure_val))

        # 2. Total contract value estimation if compensation given
        if self.compensation_amount and tenure_val > 0 and not self.total_contract_value:
            comp_type = (self.compensation_type or "").lower()
            if "month" in comp_type and "month" in unit:
                self.total_contract_value = float(self.compensation_amount) * int(tenure_val)
            else:
                self.total_contract_value = float(self.compensation_amount)

    def calculate_allocation_totals(self):
        total = 0.0
        for row in (self.project_allocations or []):
            total += float(row.allocation_percent or 0)
        self.total_allocation_percent = total

        if total > 100.0:
            frappe.msgprint(
                msg=frappe._(f"Total project allocation is {total}%, which exceeds 100%. Please review consultant capacity."),
                title=frappe._("Over-Allocation Warning"),
                indicator="orange"
            )

    def sync_rfp_and_sections(self):
        # Synchronize fields between Section 1 (RFP summary) and detailed sections
        if self.organization and not self.requesting_organization:
            self.requesting_organization = self.organization
        elif self.requesting_organization and not self.organization:
            self.organization = self.requesting_organization

        if self.project_name and not self.project:
            self.project = self.project_name
        elif self.project and not self.project_name:
            self.project_name = self.project

        if self.proposed_start_date and not self.start_date:
            self.start_date = self.proposed_start_date
        elif self.start_date and not self.proposed_start_date:
            self.proposed_start_date = self.start_date

        if self.proposed_end_date and not self.end_date:
            self.end_date = self.proposed_end_date
        elif self.end_date and not self.proposed_end_date:
            self.proposed_end_date = self.end_date

        if self.proposed_fee and not self.compensation_amount:
            self.compensation_amount = self.proposed_fee
        elif self.compensation_amount and not self.proposed_fee:
            self.proposed_fee = self.compensation_amount

        if self.initial_tenure_value and not self.contract_tenure:
            self.contract_tenure = f"{self.initial_tenure_value} {self.tenure_unit or 'Months'}"

        # Sync Team Lead Approver from Section A Team Lead if empty
        if self.team_lead and not self.team_lead_approver:
            self.team_lead_approver = self.team_lead

    def sync_workflow_status(self):
        if getattr(self, "workflow_state", None):
            self.status = self.workflow_state

    
    def validate_pdf_attachments(self):
        pdf_fields = ["consultant_cv", "consultant_signed_contract", "final_executed_contract"]
        for fieldname in pdf_fields:
            val = getattr(self, fieldname, None)
            if val:
                clean = val.split("?")[0].split("#")[0].lower().strip()
                if not clean.endswith(".pdf"):
                    f_label = self.meta.get_field(fieldname).label if self.meta.get_field(fieldname) else fieldname
                    frappe.throw(
                        frappe._("Invalid Document Format: <b>{0}</b> only accepts PDF (.pdf) files. Uploaded document is not permitted.").format(f_label),
                        title=frappe._("PDF Validation Error")
                    )

    def generate_custom_contract_id(self):
        # Lakshmi's rule: CC-[COMP]-[YYMMDD]-[001]
        if not self.request_id and (self.organization or self.requesting_organization):
            org = self.organization or self.requesting_organization
            company_abbr = frappe.db.get_value("Company", org, "abbr") or "CON"
            comp_prefix = company_abbr.strip().upper()

            # Date format YYMMDD
            raw_date = nowdate()
            parts = raw_date.split("-")
            date_str = parts[0][2:] + parts[1] + parts[2]

            search_prefix = f"CC-{comp_prefix}-{date_str}-"

            existing = frappe.get_all(
                "Consultant Contract",
                filters={"request_id": ("like", f"{search_prefix}%")},
                pluck="request_id"
            )

            numbers = []
            for rid in existing:
                if rid:
                    try:
                        num = int(rid.split("-")[-1])
                        numbers.append(num)
                    except Exception:
                        pass

            next_num = max(numbers) + 1 if numbers else 1
            self.request_id = f"{search_prefix}{str(next_num).zfill(3)}"

    def on_submit(self):
        # Auto-create Consultant Master if this is a new consultant
        if self.existing_consultant == "No" and self.consultant_name:
            self.auto_create_consultant_master()

    def auto_create_consultant_master(self):
        filters = {}
        if self.email_id:
            filters["email"] = self.email_id
        else:
            filters["consultant_name"] = self.consultant_name

        existing_master = frappe.db.get_value("Consultant Master", filters, "name")
        if not existing_master:
            master = frappe.get_doc({
                "doctype": "Consultant Master",
                "consultant_name": self.consultant_name,
                "email": self.email_id,
                "mobile": self.contact_number,
                "address": self.consultant_address,
                "area_of_expertise": self.area_of_expertise,
                "cv_attachment": self.consultant_cv,
                "gstin": self.gstin_number,
                "status": "Active"
            })
            master.insert(ignore_permissions=True)
            self.db_set("consultant_id", master.name)
            frappe.msgprint(
                msg=frappe._(f"New Consultant Master record <b>{master.name}</b> was automatically created for {self.consultant_name}."),
                title=frappe._("Consultant Master Created"),
                indicator="green"
            )
        else:
            self.db_set("consultant_id", existing_master)


@frappe.whitelist()
def record_consultant_approver_decision(name, decision_field, decision_val, remarks_field=None, remarks_val=None):
    """
    Atomically records the decision and remarks when an approver actions the Consultant Contract via Action button.
    """
    if not frappe.has_permission("Consultant Contract", "write", doc=name):
        frappe.throw(frappe._("Not permitted to action this contract."), frappe.PermissionError)

    doc = frappe.get_doc("Consultant Contract", name)

    if decision_field:
        doc.db_set(decision_field, decision_val, update_modified=False)
    if remarks_field and remarks_val:
        doc.db_set(remarks_field, remarks_val, update_modified=False)

    frappe.db.commit()
    return {"status": "success", "decision_val": decision_val, "remarks_val": remarks_val}


@frappe.whitelist()
def check_and_mark_expired_contracts():
    """
    Automated Expiry Monitor (Slide 6).
    Daily scheduled job:
    1. Scans all active Consultant Contracts where end_date < today.
    2. Checks if there is an approved Consultant Contract Extension.
    3. If no approved extension exists, sets status and workflow_state to 'Expired'.
    4. Strict Rule: No silent extensions permitted.
    """
    from frappe.utils import nowdate
    today = nowdate()

    active_contracts = frappe.get_all(
        "Consultant Contract",
        filters={
            "status": ["in", ["Active", "Signed by Consultant", "Contract Issued"]],
            "end_date": ["<", today]
        },
        fields=["name", "request_id", "consultant_name", "end_date", "owner", "team_lead_approver"]
    )

    expired_count = 0
    for c in active_contracts:
        has_extension = frappe.db.exists("Consultant Contract Extension", {
            "contract": c.name,
            "status": "Approved",
            "revised_end_date": [">=", today]
        })

        if not has_extension:
            frappe.db.set_value("Consultant Contract", c.name, {
                "status": "Expired",
                "workflow_state": "Expired"
            }, update_modified=False)

            frappe.log_error(
                title=f"Consultant Contract Expired: {c.request_id or c.name}",
                message=f"Contract for {c.consultant_name} expired on {c.end_date}. No active extension found. Marked as Expired automatically."
            )
            expired_count += 1

    frappe.db.commit()
    return {"checked": len(active_contracts), "expired_marked": expired_count}


@frappe.whitelist()
def get_consultant_pipeline_stats():
    """
    Returns counts for the 6 Executive Pipeline KPI Cards (Slides 11 & 15).
    """
    from frappe.utils import nowdate, add_days
    today = nowdate()
    in_30 = add_days(today, 30)
    in_90 = add_days(today, 90)

    ceo_count = frappe.db.count("Consultant Contract", {"workflow_state": "Pending CEO Approval"})
    hr_count = frappe.db.count("Consultant Contract", {"workflow_state": "Pending HR Review"})
    to_issue_count = frappe.db.count("Consultant Contract", {"workflow_state": "CEO Approved"})
    awaiting_sign_count = frappe.db.count("Consultant Contract", {"workflow_state": "Contract Issued"})
    exp_30_count = frappe.db.count("Consultant Contract", {"status": "Active", "end_date": ["between", [today, in_30]]})
    exp_90_count = frappe.db.count("Consultant Contract", {"status": "Active", "end_date": ["between", [today, in_90]]})
    active_count = frappe.db.count("Consultant Contract", {"status": "Active"})

    return {
        "ceo_approval": ceo_count,
        "hr_review": hr_count,
        "to_be_issued": to_issue_count,
        "awaiting_signature": awaiting_sign_count,
        "expiring_30": exp_30_count,
        "expiring_90": exp_90_count,
        "total_active": active_count
    }
