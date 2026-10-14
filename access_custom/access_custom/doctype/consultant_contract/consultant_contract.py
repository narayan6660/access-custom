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
        self.set_request_id_as_requester()
        self.sync_workflow_status()
        self.validate_pdf_attachments()
        self.validate_approver_permissions()

    def calculate_tenure_and_end_date(self):
        start = self.proposed_start_date or self.start_date
        end = self.proposed_end_date or self.end_date
        unit = (self.tenure_unit or "Months").lower()

        # 1. If start and end date are both provided, auto-calculate tenure
        if start and end:
            s_date = getdate(start)
            e_date = getdate(end)
            diff_days = (e_date - s_date).days + 1
            if diff_days > 0:
                months = max(1, round(diff_days / 30.4375))
                self.initial_tenure_value = months
                self.tenure_unit = "Months"
                self.contract_tenure = f"{months} Months ({diff_days} Days)"
                self.start_date = start
                self.end_date = end
                self.proposed_start_date = start
                self.proposed_end_date = end
        elif start and self.initial_tenure_value and not end:
            s_date = getdate(start)
            tenure_val = int(self.initial_tenure_value)
            if "month" in unit:
                self.proposed_end_date = add_days(add_months(s_date, tenure_val), -1)
            elif "year" in unit:
                self.proposed_end_date = add_days(add_years(s_date, tenure_val), -1)
            elif "week" in unit:
                self.proposed_end_date = add_days(s_date, tenure_val * 7 - 1)
            else:
                self.proposed_end_date = add_days(s_date, tenure_val - 1)
            self.end_date = self.proposed_end_date
            self.start_date = start
            diff_days = (getdate(self.proposed_end_date) - s_date).days + 1
            self.contract_tenure = f"{tenure_val} {self.tenure_unit or 'Months'} ({diff_days} Days)"

        # 2. Total contract value estimation if compensation given
        tenure_val = self.initial_tenure_value or 0
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

        # Sync Team Lead Approver from Section A Team Lead
        if self.team_lead:
            user_id = frappe.db.get_value("Employee", self.team_lead, "user_id")
            if user_id:
                self.team_lead_approver = user_id
            elif not self.team_lead_approver:
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

    def set_request_id_as_requester(self):
        # Request ID is the Contract Manager / Requester who created the contract request
        if not self.request_id or self.request_id.startswith("CC-"):
            user = self.owner or frappe.session.user
            emp = frappe.db.get_value("Employee", {"user_id": user}, ["name", "employee_name"], as_dict=True)
            if emp:
                self.request_id = f"{emp.employee_name} ({emp.name})"
            else:
                self.request_id = user

    def validate_approver_permissions(self):
        state = self.workflow_state or "Draft"
        user = frappe.session.user
        roles = frappe.get_roles(user)
        is_admin = user == "Administrator" or "System Manager" in roles

        if self.is_new():
            return

        old_doc = self.get_doc_before_save()
        if not old_doc:
            return

        # Check remarks locking
        if state == "Pending Team Lead Approval":
            is_lead = (self.team_lead_approver and user == self.team_lead_approver) or is_admin
            if self.team_lead_remarks != old_doc.team_lead_remarks and not is_lead:
                frappe.throw(frappe._("Only the assigned Team Lead can enter Team Lead remarks."))
            if self.hr_remarks != old_doc.hr_remarks:
                frappe.throw(frappe._("Cannot enter HR remarks during Team Lead approval stage."))
            if self.ceo_remarks != old_doc.ceo_remarks:
                frappe.throw(frappe._("Cannot enter CEO remarks during Team Lead approval stage."))

        elif state == "Pending HR Review":
            is_hr = (self.hr_approver and user == self.hr_approver) or ("HR Manager" in roles) or is_admin
            if self.hr_remarks != old_doc.hr_remarks and not is_hr:
                frappe.throw(frappe._("Only the assigned HR Approver can enter HR remarks."))
            if self.team_lead_remarks != old_doc.team_lead_remarks:
                frappe.throw(frappe._("Cannot edit Team Lead remarks during HR Review stage."))
            if self.ceo_remarks != old_doc.ceo_remarks:
                frappe.throw(frappe._("Cannot enter CEO remarks during HR Review stage."))

        elif state == "Pending CEO Approval":
            is_ceo = (self.ceo_approver and user == self.ceo_approver) or ("CEO Approver" in roles) or is_admin
            if self.ceo_remarks != old_doc.ceo_remarks and not is_ceo:
                frappe.throw(frappe._("Only the assigned CEO Approver can enter CEO remarks."))
            if self.team_lead_remarks != old_doc.team_lead_remarks:
                frappe.throw(frappe._("Cannot edit Team Lead remarks during CEO stage."))
            if self.hr_remarks != old_doc.hr_remarks:
                frappe.throw(frappe._("Cannot edit HR remarks during CEO stage."))

        elif state == "Pending Final HR Review":
            is_hr = (self.final_hr_approver and user == self.final_hr_approver) or ("HR Manager" in roles) or ("HR User" in roles) or is_admin
            if self.final_hr_remarks != old_doc.final_hr_remarks and not is_hr:
                frappe.throw(frappe._("Only the assigned HR Approver can enter Final HR remarks."))
            if self.team_lead_remarks != old_doc.team_lead_remarks:
                frappe.throw(frappe._("Cannot edit Team Lead remarks during Final HR Review stage."))
            if self.hr_remarks != old_doc.hr_remarks:
                frappe.throw(frappe._("Cannot edit initial HR remarks during Final HR Review stage."))
            if self.ceo_remarks != old_doc.ceo_remarks:
                frappe.throw(frappe._("Cannot edit CEO remarks during Final HR Review stage."))

        elif state not in ["Draft", "Returned for Revision"]:
            if (self.team_lead_remarks != old_doc.team_lead_remarks or 
                self.hr_remarks != old_doc.hr_remarks or 
                self.ceo_remarks != old_doc.ceo_remarks or
                self.final_hr_remarks != old_doc.final_hr_remarks):
                if not is_admin:
                    frappe.throw(frappe._("Approver remarks cannot be modified at this stage."))

        # Enforce all Section G fields must be filled before Contract Manager can issue contract
        if self.workflow_state in ["Contract Issued", "Signed by Consultant", "Active"]:
            missing_g = []
            if not self.sent_to_consultant_date:
                missing_g.append("Sent to Consultant Date")
            if not self.consultant_signed_contract:
                missing_g.append("Consultant Signed Contract (Upload PDF)")
            if not self.consultant_signed_date:
                missing_g.append("Consultant Signed Date")
            if not self.consultant_received_date:
                missing_g.append("Received Date")
            if not self.final_executed_contract:
                missing_g.append("Final Executed Contract (Upload PDF)")
            if not self.countersigned_date:
                missing_g.append("Management Countersigned Date")
            if missing_g:
                frappe.throw(frappe._("Cannot issue contract until all fields in Section G — Consultant Signed Contract are filled: {0}").format(", ".join(missing_g)))

    def on_update(self):
        self.handle_workflow_email_notifications()

    def handle_workflow_email_notifications(self):
        old_doc = self.get_doc_before_save()
        if not old_doc:
            return

        old_state = getattr(old_doc, "workflow_state", None)
        new_state = getattr(self, "workflow_state", None)

        if old_state == new_state:
            return

        # 1. State changed to CEO Approved
        if new_state == "CEO Approved":
            self.send_ceo_approved_emails()

        # 2. State changed to Pending Final HR Review
        elif new_state == "Pending Final HR Review":
            self.send_final_hr_review_emails()

        # 3. State changed to Approved for Issuance
        elif new_state == "Approved for Issuance":
            self.send_approved_for_issuance_emails()

    def send_ceo_approved_emails(self):
        try:
            contract_url = frappe.utils.get_url_to_form("Consultant Contract", self.name)
            consultant_name = self.consultant_name or "Consultant"
            ceo_user = self.ceo_approver or "CEO"
            remarks = self.ceo_remarks or "No remarks provided"

            # 1. Broad notification to Contract Manager (Owner), Team Lead, and HR
            recipients = set()
            if self.owner and "@" in self.owner:
                recipients.add(self.owner)
            if self.team_lead_approver and "@" in self.team_lead_approver:
                recipients.add(self.team_lead_approver)
            if self.hr_approver and "@" in self.hr_approver:
                recipients.add(self.hr_approver)

            subject_all = f"CEO Approved: Consultant Contract {self.name} - {consultant_name}"
            msg_all = f"""
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                <h3 style="color: #166534; border-bottom: 2px solid #86efac; padding-bottom: 8px;">
                    &#10003; Consultant Contract Approved by CEO
                </h3>
                <p>Consultant Contract <b>{self.name}</b> for <b>{consultant_name}</b> has been formally reviewed and <b>Approved by the CEO</b> ({ceo_user}).</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin: 15px 0;">
                    <b>CEO Remarks / Feedback:</b><br>
                    <span style="color: #334155;">{frappe.utils.escape_html(remarks)}</span>
                </div>
                <p><b>Next Step:</b> The Contract Manager is downloading the preview agreement up to CEO approval and submitting to HR for Final Review.</p>
                <p><a href="{contract_url}" style="background: #0284c7; color: #ffffff; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">View Consultant Contract</a></p>
            </div>
            """

            if recipients:
                frappe.sendmail(
                    recipients=list(recipients),
                    subject=subject_all,
                    message=msg_all,
                    reference_doctype="Consultant Contract",
                    reference_name=self.name,
                    now=True
                )

            # 2. Dedicated follow-up action mail to Contract Manager
            cm_recipients = set()
            if self.owner and "@" in self.owner:
                cm_recipients.add(self.owner)
            cm_users = frappe.db.sql_list("""
                SELECT DISTINCT u.name FROM `tabUser` u
                INNER JOIN `tabHas Role` r ON r.parent = u.name
                WHERE r.role = 'Contract Manager' AND u.enabled = 1
            """)
            for u in cm_users:
                if u and "@" in u:
                    cm_recipients.add(u)

            subject_cm = f"Action Required: Download Preview Agreement & Send to HR for Final Review — {self.name}"
            msg_cm = f"""
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                <h3 style="color: #0284c7; border-bottom: 2px solid #93c5fd; padding-bottom: 8px;">
                    Consultant Contract: Next Steps Following CEO Approval
                </h3>
                <p>Hello Contract Manager,</p>
                <p>The CEO has completed approval for Consultant Contract <b>{self.name}</b> for <b>{consultant_name}</b>.</p>
                
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 6px; margin: 15px 0;">
                    <b style="color: #1e40af;">Action Checklist:</b>
                    <ol style="margin: 8px 0 0 18px; padding: 0;">
                        <li>Open the contract in Frappe: <a href="{contract_url}">{self.name}</a></li>
                        <li>Download the <b>Preview Form / Agreement (PDF)</b> (verified up to CEO approval).</li>
                        <li>Click <b>Send to HR for Final Review</b> to dispatch the contract for final HR authorization.</li>
                    </ol>
                </div>

                <p style="margin-top: 20px;">
                    <a href="{contract_url}" style="background: #16a34a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                        Open Contract & Send to HR &rarr;
                    </a>
                </p>
            </div>
            """

            if cm_recipients:
                frappe.sendmail(
                    recipients=list(cm_recipients),
                    subject=subject_cm,
                    message=msg_cm,
                    reference_doctype="Consultant Contract",
                    reference_name=self.name,
                    now=True
                )
        except Exception as e:
            frappe.log_error(title=f"Error sending CEO approved emails for {self.name}", message=str(e))

    def send_final_hr_review_emails(self):
        try:
            contract_url = frappe.utils.get_url_to_form("Consultant Contract", self.name)
            consultant_name = self.consultant_name or "Consultant"
            recipients = set()
            if self.final_hr_approver and "@" in self.final_hr_approver:
                recipients.add(self.final_hr_approver)
            elif self.hr_approver and "@" in self.hr_approver:
                recipients.add(self.hr_approver)
            else:
                hr_users = frappe.db.sql_list("""
                    SELECT DISTINCT u.name FROM `tabUser` u
                    INNER JOIN `tabHas Role` r ON r.parent = u.name
                    WHERE r.role IN ('HR Manager', 'HR User') AND u.enabled = 1
                """)
                for u in hr_users:
                    if u and "@" in u:
                        recipients.add(u)

            subject = f"Action Required: Final HR Review for Consultant Contract {self.name} - {consultant_name}"
            msg = f"""
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                <h3 style="color: #0284c7; border-bottom: 2px solid #93c5fd; padding-bottom: 8px;">
                    Final HR Review Required
                </h3>
                <p>The Contract Manager has submitted Consultant Contract <b>{self.name}</b> for <b>{consultant_name}</b> for <b>Final HR Review</b> following CEO approval.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin: 15px 0;">
                    <b>Required Actions:</b>
                    <ul style="margin: 6px 0 0 18px; padding: 0;">
                        <li><b>Approve:</b> Authorize contract for issuance to the consultant</li>
                        <li><b>Return for Revision:</b> Send back to Contract Manager with feedback</li>
                        <li><b>Reject:</b> Reject contract with explanation</li>
                    </ul>
                </div>
                <p style="margin: 12px 0; color: #475569; font-size: 13px;">&#128206; <b>Attachment:</b> <i>The verified Consultant Agreement Preview Form (PDF) is attached to this email for your direct review.</i></p>
                <p><a href="{contract_url}" style="background: #0284c7; color: #ffffff; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">Open Contract in Desk &rarr;</a></p>
            </div>
            """

            attachments = []
            try:
                pdf_attachment = frappe.attach_print(
                    doctype="Consultant Contract",
                    name=self.name,
                    print_format="Consultant Agreement",
                    doc=self
                )
                if pdf_attachment:
                    attachments.append(pdf_attachment)
            except Exception as pe:
                frappe.log_error(title=f"Error attaching preview PDF for {self.name}", message=str(pe))

            if recipients:
                frappe.sendmail(
                    recipients=list(recipients),
                    subject=subject,
                    message=msg,
                    attachments=attachments,
                    reference_doctype="Consultant Contract",
                    reference_name=self.name,
                    now=True
                )
        except Exception as e:
            frappe.log_error(title=f"Error sending Final HR review email for {self.name}", message=str(e))

    def send_approved_for_issuance_emails(self):
        try:
            contract_url = frappe.utils.get_url_to_form("Consultant Contract", self.name)
            consultant_name = self.consultant_name or "Consultant"
            recipients = set()
            if self.owner and "@" in self.owner:
                recipients.add(self.owner)

            subject = f"Approved for Issuance: Consultant Contract {self.name} - {consultant_name}"
            msg = f"""
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                <h3 style="color: #166534; border-bottom: 2px solid #86efac; padding-bottom: 8px;">
                    &#10003; Final HR Review Complete — Ready for Issuance
                </h3>
                <p>Final HR Review has been approved for Consultant Contract <b>{self.name}</b> for <b>{consultant_name}</b>.</p>
                <p>You can now issue the formal contract to the consultant by clicking <b>Actions &rarr; Issue Contract</b>.</p>
                <p><a href="{contract_url}" style="background: #16a34a; color: #ffffff; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">Open Contract & Issue &rarr;</a></p>
            </div>
            """

            if recipients:
                frappe.sendmail(
                    recipients=list(recipients),
                    subject=subject,
                    message=msg,
                    reference_doctype="Consultant Contract",
                    reference_name=self.name,
                    now=True
                )
        except Exception as e:
            frappe.log_error(title=f"Error sending Approved for Issuance email for {self.name}", message=str(e))

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
    user = frappe.session.user
    roles = frappe.get_roles(user)
    is_admin = user == "Administrator" or "System Manager" in roles

    # Strict approver validation
    if decision_field == "team_lead_decision":
        if not (is_admin or "Team Lead" in roles or (doc.team_lead_approver and user == doc.team_lead_approver)):
            frappe.throw(frappe._("Only the assigned Team Lead Approver is authorized to action this step."), frappe.PermissionError)
    elif decision_field == "hr_decision":
        if not (is_admin or "HR Manager" in roles or "HR User" in roles or (doc.hr_approver and user == doc.hr_approver)):
            frappe.throw(frappe._("Only the assigned HR Approver is authorized to action this step."), frappe.PermissionError)
    elif decision_field == "ceo_decision":
        if not (is_admin or "CEO Approver" in roles or (doc.ceo_approver and user == doc.ceo_approver)):
            frappe.throw(frappe._("Only the assigned CEO Approver is authorized to action this step."), frappe.PermissionError)
    elif decision_field == "final_hr_decision":
        if not (is_admin or "HR Manager" in roles or "HR User" in roles or (doc.final_hr_approver and user == doc.final_hr_approver)):
            frappe.throw(frappe._("Only the assigned HR Approver is authorized to action this step."), frappe.PermissionError)

    if decision_field:
        doc.db_set(decision_field, decision_val, update_modified=False)
    if remarks_field and remarks_val is not None:
        doc.db_set(remarks_field, remarks_val, update_modified=False)

    frappe.db.commit()
    return {"status": "success", "decision_val": decision_val, "remarks_val": remarks_val}


@frappe.whitelist()
def check_and_mark_expired_contracts():
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


@frappe.whitelist()
def get_leadership_employees(doctype, txt, searchfield, start, page_len, filters=None):
    start = int(start or 0)
    page_len = int(page_len or 20)

    if isinstance(filters, str):
        import json
        try:
            filters = json.loads(filters)
        except Exception:
            filters = {}
    elif not filters:
        filters = {}

    role = (filters or {}).get("role", "")
    if role == "Team Lead":
        return get_team_leads(doctype, txt, searchfield, start, page_len, filters)
    elif role in ["Projects Manager", "Project Manager"]:
        return get_project_managers(doctype, txt, searchfield, start, page_len, filters)

    role_pattern = f"%{role}%" if role else "%"
    return frappe.db.sql("""
        SELECT e.name, e.employee_name
        FROM `tabEmployee` e
        LEFT JOIN `tabUser` u ON e.user_id = u.name
        LEFT JOIN `tabHas Role` r ON r.parent = u.name
        WHERE e.status = 'Active'
          AND (r.role = %(role)s OR e.designation LIKE %(role_pattern)s)
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
        GROUP BY e.name
        ORDER BY e.employee_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {"role": role, "role_pattern": role_pattern, "txt": f"%{txt or ''}%", "start": start, "page_len": page_len})


@frappe.whitelist()
def get_team_leads(doctype, txt, searchfield, start, page_len, filters=None):
    start = int(start or 0)
    page_len = int(page_len or 20)
    return frappe.db.sql("""
        SELECT e.name, e.employee_name
        FROM `tabEmployee` e
        LEFT JOIN `tabUser` u ON e.user_id = u.name
        LEFT JOIN `tabHas Role` r ON r.parent = u.name
        WHERE e.status = 'Active'
          AND (r.role = 'Team Lead' OR e.designation LIKE '%%%%Team Lead%%%%')
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
        GROUP BY e.name
        ORDER BY e.employee_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {"txt": f"%{txt or ''}%", "start": start, "page_len": page_len})


@frappe.whitelist()
def get_project_managers(doctype, txt, searchfield, start, page_len, filters=None):
    start = int(start or 0)
    page_len = int(page_len or 20)
    return frappe.db.sql("""
        SELECT e.name, e.employee_name
        FROM `tabEmployee` e
        LEFT JOIN `tabUser` u ON e.user_id = u.name
        LEFT JOIN `tabHas Role` r ON r.parent = u.name
        WHERE e.status = 'Active'
          AND (r.role IN ('Project Manager', 'Projects Manager') OR e.designation LIKE '%%%%Project Manager%%%%' OR e.designation LIKE '%%%%Projects Manager%%%%')
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
        GROUP BY e.name
        ORDER BY e.employee_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {"txt": f"%{txt or ''}%", "start": start, "page_len": page_len})
