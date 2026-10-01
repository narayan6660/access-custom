import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, now_datetime

class ContractTermination(Document):
    def _validate_links(self):
        self.resolve_requested_by()
        super()._validate_links()

    def resolve_requested_by(self):
        if not self.requested_by or not frappe.db.exists("Employee", self.requested_by):
            user_to_check = self.requested_by if (self.requested_by and "@" in self.requested_by) else (self.owner or frappe.session.user)
            emp = frappe.db.get_value("Employee", {"user_id": user_to_check}, "name")
            if emp:
                self.requested_by = emp
            elif self.contract:
                self.requested_by = frappe.db.get_value("Test Customer Contract", self.contract, "contract_owner")
            if not self.requested_by:
                first_emp = frappe.db.get_value("Employee", {"status": "Active"}, "name")
                if first_emp:
                    self.requested_by = first_emp

    def validate(self):
        if not self.effective_termination_date:
            self.effective_termination_date = today()
        state = self.workflow_state or self.status or ""
        if state in ["Termination Executed", "Terminated"] and not getattr(self, "executed_on", None):
            self.executed_on = now_datetime()
        self.resolve_requested_by()

        # Enforce PDF-only validation for supporting documents
        pdf_fields = [
            ("closure_documents", "Closure Documents"),
            ("client_communication_document", "Client Communication Upload")
        ]
        for f, label in pdf_fields:
            val = getattr(self, f, None)
            if val and not val.lower().endswith(".pdf"):
                frappe.throw(_("Only PDF files (.pdf) are allowed for <b>{0}</b>. Please upload a valid PDF document.").format(label))

        if self.financial_settlement_required and not self.outstanding_payment and not self.final_settlement:
            frappe.msgprint(_("Please specify Outstanding Payment or Final Settlement Amount if Financial Settlement is required."), indicator="orange")

    def on_update(self):
        state = self.workflow_state or self.status or ""
        if state in ["Termination Executed", "Terminated", "Contract Closed"]:
            if not getattr(self, "executed_on", None):
                self.executed_on = now_datetime()
                frappe.db.set_value(self.doctype, self.name, "executed_on", self.executed_on, update_modified=False)
        self.sync_contract_status()

    def sync_contract_status(self):
        if not self.contract:
            return
        
        state = self.workflow_state or self.status or ""
        if state in ["Termination Executed", "Terminated", "Contract Closed", "Cancelled"]:
            frappe.db.set_value("Test Customer Contract", self.contract, {
                "contract_status": "Terminated",
                "workflow_state": "Terminated",
                "effective_termination_date": self.effective_termination_date or today()
            })
            frappe.msgprint(_("Contract {0} status updated to Terminated.").format(self.contract), indicator="red")
