from access_custom.contract_lifecycle import validate_single_active_consultant_contract_action
# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ConsultantContractTermination(Document):
    def validate(self):
        # Auto-fetch approvers from parent contract if missing
        if self.contract:
            parent_doc = frappe.get_value(
                "Consultant Contract",
                self.contract,
                [
                    "team_lead_approver",
                    "hr_approver",
                    "ceo_approver",
                    "end_date",
                    "proposed_end_date"
                ],
                as_dict=True
            )
            if parent_doc:
                if not self.team_lead_approver and parent_doc.team_lead_approver:
                    self.team_lead_approver = parent_doc.team_lead_approver
                if not self.hr_approver and parent_doc.hr_approver:
                    self.hr_approver = parent_doc.hr_approver
                if not self.ceo_approver and parent_doc.ceo_approver:
                    self.ceo_approver = parent_doc.ceo_approver
                if not self.effective_termination_date and (parent_doc.end_date or parent_doc.proposed_end_date):
                    self.effective_termination_date = parent_doc.end_date or parent_doc.proposed_end_date

        if not self.requested_by:
            self.requested_by = frappe.session.user_fullname or frappe.session.user

        # Synchronize status with workflow_state
        if getattr(self, "workflow_state", None):
            self.status = self.workflow_state

        self.validate_pdf_attachments()
        self.validate_approver_permissions()
        validate_single_active_consultant_contract_action(self)

    def validate_pdf_attachments(self):
        val = getattr(self, "termination_letter", None)
        if val:
            clean = val.split("?")[0].split("#")[0].lower().strip()
            if not clean.endswith(".pdf"):
                frappe.throw(
                    frappe._("Invalid Document Format: <b>Termination / Release Letter</b> only accepts PDF (.pdf) files. Uploaded document is not permitted."),
                    title=frappe._("PDF Validation Error")
                )

    def validate_approver_permissions(self):
        state = self.workflow_state or self.status or "Draft"
        user = frappe.session.user
        roles = frappe.get_roles(user)
        is_admin = user == "Administrator" or "System Manager" in roles

        if self.is_new():
            return

        old_doc = self.get_doc_before_save()
        if not old_doc:
            return

        old_state = old_doc.workflow_state or old_doc.status or "Draft"
        if old_state == "Returned for Revision" and state != "Returned for Revision":
            is_cm = (user == self.owner) or ("Contract Manager" in roles) or is_admin
            if not is_cm:
                frappe.throw(frappe._("Only the Contract Manager is authorized to resubmit this document after revision."))

        # Restrict upload of termination letter post-approval strictly to Contract Manager
        if self.docstatus == 1:
            if getattr(self, "termination_letter", None) != getattr(old_doc, "termination_letter", None):
                if getattr(old_doc, "termination_letter", None):
                    frappe.throw(
                        frappe._("The Termination / Release Letter has already been uploaded and finalized. It cannot be modified, replaced, or deleted."),
                        frappe.PermissionError
                    )
                is_cm = (user == self.owner) or ("Contract Manager" in roles) or is_admin
                if not is_cm:
                    frappe.throw(
                        frappe._("Only the Contract Manager is authorized to upload the Termination / Release Letter."),
                        frappe.PermissionError
                    )

        if state == "Pending Team Lead Approval":
            is_lead = (self.team_lead_approver and user == self.team_lead_approver) or ("Team Lead" in roles) or is_admin
            if self.team_lead_remarks != old_doc.team_lead_remarks and not is_lead:
                frappe.throw(frappe._("Only the assigned Team Lead can enter Team Lead remarks."))
            if self.hr_remarks != old_doc.hr_remarks:
                frappe.throw(frappe._("Cannot enter HR remarks during Team Lead approval stage."))
            if self.ceo_remarks != old_doc.ceo_remarks:
                frappe.throw(frappe._("Cannot enter CEO remarks during Team Lead approval stage."))

        elif state == "Pending HR Review":
            is_hr = (self.hr_approver and user == self.hr_approver) or ("HR Manager" in roles) or ("HR User" in roles) or is_admin
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

    def on_submit(self):
        if self.contract:
            parent = frappe.get_doc("Consultant Contract", self.contract)
            parent.db_set("status", "Terminated", update_modified=False)
            parent.db_set("workflow_state", "Terminated", update_modified=False)
            if self.effective_termination_date:
                parent.db_set("end_date", self.effective_termination_date, update_modified=False)
                parent.db_set("proposed_end_date", self.effective_termination_date, update_modified=False)

            # Post audit comment on parent contract timeline
            notes = [f"Type: {self.termination_type or 'General'}"]
            if self.effective_termination_date:
                notes.append(f"Effective Date: {self.effective_termination_date}")
            if self.final_settlement_amount:
                notes.append(f"Final Settlement: {self.final_settlement_amount}")

            parent.add_comment(
                comment_type="Info",
                text=f"Consultant Contract Termination {self.name} approved. Contract marked as Terminated. (" + ", ".join(notes) + ")"
            )

            frappe.msgprint(
                msg=f"Parent Contract {self.contract} has been marked as TERMINATED.",
                title="Contract Terminated",
                indicator="red"
            )


@frappe.whitelist()
def record_termination_approver_decision(name, decision_field, decision_val, remarks_field=None, remarks_val=None):
    if not frappe.has_permission("Consultant Contract Termination", "write", doc=name):
        frappe.throw(frappe._("Not permitted to action this termination."), frappe.PermissionError)

    doc = frappe.get_doc("Consultant Contract Termination", name)
    user = frappe.session.user
    roles = frappe.get_roles(user)
    is_admin = user == "Administrator" or "System Manager" in roles

    if decision_field == "team_lead_decision":
        if not (is_admin or "Team Lead" in roles or (doc.team_lead_approver and user == doc.team_lead_approver)):
            frappe.throw(frappe._("Only the assigned Team Lead Approver is authorized to action this step."), frappe.PermissionError)
    elif decision_field == "hr_decision":
        if not (is_admin or "HR Manager" in roles or "HR User" in roles or (doc.hr_approver and user == doc.hr_approver)):
            frappe.throw(frappe._("Only the assigned HR Approver is authorized to action this step."), frappe.PermissionError)
    elif decision_field == "ceo_decision":
        if not (is_admin or "CEO Approver" in roles or (doc.ceo_approver and user == doc.ceo_approver)):
            frappe.throw(frappe._("Only the assigned CEO Approver is authorized to action this step."), frappe.PermissionError)

    if decision_field:
        doc.db_set(decision_field, decision_val, update_modified=False)
    if remarks_field and remarks_val is not None:
        doc.db_set(remarks_field, remarks_val, update_modified=False)

    frappe.db.commit()
    return {"status": "success", "decision_val": decision_val, "remarks_val": remarks_val}
