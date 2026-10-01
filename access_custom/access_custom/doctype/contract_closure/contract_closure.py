import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, now_datetime

class ContractClosure(Document):
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
        if not self.closure_date:
            self.closure_date = today()
        state = self.workflow_state or self.status or ""
        if state in ["Closed", "Contract Closed"] and not getattr(self, "closed_on", None):
            self.closed_on = now_datetime()
        self.resolve_requested_by()

        # Enforce PDF-only validation on all 3 supporting closure documents
        doc_fields = [
            ("closure_documents", "1. Final Deliverable / Closure Report (PDF)"),
            ("client_acceptance_document", "2. Client Acceptance Sign-off (PDF)"),
            ("final_settlement_document", "3. Final Settlement & Reconciliation (PDF)")
        ]
        for fn, label in doc_fields:
            val = getattr(self, fn, None)
            if val and not val.lower().endswith(".pdf"):
                frappe.throw(_("Only PDF files (.pdf) are allowed for <b>{0}</b>. Please upload a valid PDF document.").format(label))

        # Enforce that Final Deliverable / Closure Report (PDF) is mandatory when submitting for approvals
        if state in ["Team Lead Closure", "Legal Closure", "Finance Closure", "CEO Closure", "Closed"]:
            if not getattr(self, "closure_documents", None):
                frappe.throw(_("Please upload the <b>Final Deliverable / Closure Report (PDF)</b> before submitting for approval."))

    def on_update(self):
        state = self.workflow_state or self.status or ""
        if state in ["Closed", "Contract Closed"]:
            if not getattr(self, "closed_on", None):
                self.closed_on = now_datetime()
                frappe.db.set_value(self.doctype, self.name, "closed_on", self.closed_on, update_modified=False)
            self.sync_contract_status()
            self.send_closure_completion_email()

    def sync_contract_status(self):
        if not self.contract:
            return
        
        state = self.workflow_state or self.status or ""
        if state in ["Closed", "Contract Closed"]:
            frappe.db.set_value("Test Customer Contract", self.contract, "contract_status", "Closed")
            frappe.db.set_value("Test Customer Contract", self.contract, "workflow_state", "Closed")
            frappe.msgprint(_("Contract {0} status updated to Closed.").format(self.contract), indicator="green")

    def send_closure_completion_email(self):
        """Dispatches customized HTML closure completion notification to all approvers and managers"""
        if getattr(frappe.flags, f"sent_closure_email_{self.name}", False):
            return
        frappe.flags[f"sent_closure_email_{self.name}"] = True

        approver_emails = []
        approver_fields = ["lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver", "owner"]
        for af in approver_fields:
            user_or_emp = getattr(self, af, None)
            if user_or_emp:
                email = user_or_emp if "@" in user_or_emp else (frappe.db.get_value("User", user_or_emp, "email") or frappe.db.get_value("Employee", user_or_emp, "user_id"))
                if email and email not in approver_emails:
                    approver_emails.append(email)

        if self.contract:
            contract_doc = frappe.db.get_value("Test Customer Contract", self.contract, ["contract_owner", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver", "owner"], as_dict=True)
            if contract_doc:
                for k, u in contract_doc.items():
                    if u:
                        email = u if "@" in u else (frappe.db.get_value("User", u, "email") or frappe.db.get_value("Employee", u, "user_id"))
                        if email and email not in approver_emails:
                            approver_emails.append(email)

        recipients = [e for e in approver_emails if e and "@" in e]
        if not recipients:
            return

        try:
            contract_ref = self.contract or self.name
            cust_name = self.customer_name or (frappe.db.get_value("Test Customer Contract", self.contract, "customer_name") if self.contract else "")
            closed_dt_str = self.closed_on.strftime("%d-%m-%Y %H:%M:%S") if self.closed_on else now_datetime().strftime("%d-%m-%Y %H:%M:%S")
            subject = f"✅ [Contract Closed] Contract {contract_ref} has been Officially Closed"

            message = f"""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
                <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract Formally Closed</h2>
                    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Official Closure & Audit Completion Notification</p>
                </div>
                
                <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                    <p style="margin-top: 0;">Dear Approver / Team,</p>
                    <p>Please be advised that <b>Contract Closure {self.name}</b> for master contract <b>{contract_ref}</b> has received final approval from the CEO and is now formally <b>Closed</b>.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Contract Reference:</td>
                                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                            </tr>
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Closure Record ID:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Closed Date & Time:</td>
                                <td style="padding: 8px 4px; color: #16a34a; font-weight: 700;">{closed_dt_str}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Approved By:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.ceo_approver or frappe.session.user} (CEO)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Closure Remarks:</td>
                                <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{self.remarks or 'All deliverables, financial reconciliation, and documentation successfully completed.'}"</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 25px 0 10px 0;">
                        <a href="{frappe.utils.get_url()}/app/test-customer-contract/{self.contract or self.name}" style="background-color: #16a34a; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25);">
                            View Master Contract in ERPNext &rarr;
                        </a>
                    </div>
                </div>

                <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center;">
                    This is an automated workflow notification from Access Health Contract Management System.
                </div>
            </div>
            """
            frappe.sendmail(recipients=recipients, subject=subject, message=message, now=True)
        except Exception as e:
            frappe.log_error(f"Failed to send contract closure email: {str(e)}", "Contract Closure Email")


