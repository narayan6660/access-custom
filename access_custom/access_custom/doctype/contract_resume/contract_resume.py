import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, getdate, now_datetime


class ContractResume(Document):
    def validate_supporting_document(self):
        if self.resume_supporting_document:
            clean_path = str(self.resume_supporting_document).split("?")[0].split("#")[0].lower().strip()
            if not clean_path.endswith(".pdf"):
                frappe.throw(_("<b>Resume Supporting Document</b> only accepts <b>PDF (.pdf)</b> files. Uploaded file is not permitted."))

    def _validate_links(self):
        self.resolve_requested_by()
        self.validate_supporting_document()
        self.autofill_details()
        super()._validate_links()

    def autofill_details(self):
        if self.on_hold_record and not self.hold_reason:
            hold_doc = frappe.db.get_value(
                "Contract On Hold",
                self.on_hold_record,
                ["contract", "customer_name", "project_title", "company", "hold_date", "expected_resume_date", "hold_reason", "supporting_document", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"],
                as_dict=True
            )
            if hold_doc:
                if not self.contract:
                    self.contract = hold_doc.contract
                if not self.customer_name:
                    self.customer_name = hold_doc.customer_name
                if not self.project_title:
                    self.project_title = hold_doc.project_title
                if not self.company:
                    self.company = hold_doc.company
                if not self.hold_date:
                    self.hold_date = hold_doc.hold_date
                if not self.expected_resume_date:
                    self.expected_resume_date = hold_doc.expected_resume_date
                if not self.hold_reason:
                    self.hold_reason = hold_doc.hold_reason
                if not self.hold_supporting_document:
                    self.hold_supporting_document = hold_doc.supporting_document
                if not self.lead_approver:
                    self.lead_approver = hold_doc.lead_approver
                if not self.legal_approver:
                    self.legal_approver = hold_doc.legal_approver
                if not self.finance_approver:
                    self.finance_approver = hold_doc.finance_approver
                if not self.hr_approver:
                    self.hr_approver = hold_doc.hr_approver
                if not self.ceo_approver:
                    self.ceo_approver = hold_doc.ceo_approver

        if self.contract and not self.customer_name:
            c = frappe.db.get_value("Test Customer Contract", self.contract, ["customer_name", "project_title", "lead_approver", "ceo_approver"], as_dict=True)
            if c:
                self.customer_name = c.customer_name
                self.project_title = c.project_title
                if not self.lead_approver:
                    self.lead_approver = c.lead_approver
                if not self.ceo_approver:
                    self.ceo_approver = c.ceo_approver

    def resolve_requested_by(self):
        if not self.requested_by or not frappe.db.exists("Employee", self.requested_by):
            user_to_check = self.owner or frappe.session.user
            emp = frappe.db.get_value("Employee", {"user_id": user_to_check}, ["name", "employee_name"], as_dict=True)
            if emp:
                self.requested_by = emp.name
                self.requested_by_name = emp.employee_name

    def validate(self):
        self.validate_supporting_document()
        self.resolve_requested_by()
        self.autofill_details()

        if not self.actual_resume_date:
            self.actual_resume_date = today()

        # Validate that parent contract is currently On Hold
        if self.contract and self.is_new():
            contract_status = frappe.db.get_value("Test Customer Contract", self.contract, "contract_status")
            if contract_status != "On Hold":
                frappe.throw(_("Contract <b>{0}</b> is currently '{1}'. A Resumption Request can only be created for contracts that are currently <b>On Hold</b>.").format(self.contract, contract_status))

        # Ensure approvers cannot initiate a resumption request
        if self.is_new():
            approvers = [self.lead_approver, self.legal_approver, self.finance_approver, self.hr_approver, self.ceo_approver]
            user = frappe.session.user
            if user != "Administrator" and user in [a for a in approvers if a]:
                frappe.throw(_("Approvers cannot initiate a Resumption Request. Only the Contract Manager is authorized to request contract resumption."))

        # Check for duplicate active resume request
        if self.is_new() and self.on_hold_record:
            existing = frappe.db.exists("Contract Resume", {
                "on_hold_record": self.on_hold_record,
                "docstatus": 0,
                "workflow_state": ["not in", ["Rejected"]]
            })
            if existing:
                frappe.throw(_("An active Resumption Request (<b><a href='/app/contract-resume/{0}'>{0}</a></b>) is already in progress for this hold record.").format(existing))

    def on_update(self):
        state = self.workflow_state or self.status or ""
        if state == "Resumed":
            if not getattr(self, "resumed_on", None):
                self.resumed_on = now_datetime()
                frappe.db.set_value(self.doctype, self.name, "resumed_on", self.resumed_on, update_modified=False)
            self.apply_resumption()

    def apply_resumption(self):
        """Applies final resumption to Contract On Hold and Master Customer Contract"""
        if not self.on_hold_record or not self.contract:
            return

        now_dt = self.resumed_on or now_datetime()
        res_date = self.actual_resume_date or today()
        remarks = self.resume_remarks or "Contract operations successfully resumed."

        # 1. Update Contract On Hold
        frappe.db.set_value("Contract On Hold", self.on_hold_record, {
            "workflow_state": "Resumed",
            "status": "Resumed",
            "actual_resume_date": res_date,
            "resumed_on": now_dt,
            "resume_remarks": remarks
        }, update_modified=True)

        # 2. Update Master Customer Contract
        frappe.db.set_value("Test Customer Contract", self.contract, {
            "contract_status": "Commenced",
            "actual_resume_date": res_date
        }, update_modified=True)

        # Add timeline comment
        try:
            c_doc = frappe.get_doc("Test Customer Contract", self.contract)
            c_doc.add_comment(
                "Comment",
                f"? Contract resumed from On Hold via Resumption Request <a href='/app/contract-resume/{self.name}'><b>{self.name}</b></a>. Resumption Date: {res_date}."
            )
        except Exception:
            pass

        # 3. Send Notification Email
        self.send_resumption_email()

    def send_resumption_email(self):
        flag_key = f"sent_resumption_email_{self.name}"
        if getattr(frappe.flags, flag_key, False):
            return
        frappe.flags[flag_key] = True

        approver_emails = []
        for af in ["lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver", "owner"]:
            u = getattr(self, af, None)
            if u:
                email = u if "@" in u else (frappe.db.get_value("User", u, "email") or frappe.db.get_value("Employee", u, "user_id"))
                if email and email not in approver_emails:
                    approver_emails.append(email)

        if self.contract:
            c_users = frappe.db.get_value("Test Customer Contract", self.contract, ["contract_owner", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver", "owner"], as_dict=True)
            if c_users:
                for k, val in c_users.items():
                    if val:
                        email = val if "@" in val else (frappe.db.get_value("User", val, "email") or frappe.db.get_value("Employee", val, "user_id"))
                        if email and email not in approver_emails:
                            approver_emails.append(email)

        recipients = [e for e in approver_emails if e and "@" in e]
        if not recipients:
            return

        try:
            contract_ref = self.contract
            cust_name = self.customer_name or ""
            res_date = self.actual_resume_date or today()
            now_str = now_datetime().strftime("%d-%m-%Y %H:%M:%S")

            subject = f"?? [Contract Resumed] Contract {contract_ref} has been Officially Resumed"
            message = f"""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
                <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract Resumed from On Hold</h2>
                    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Official Resumption Notification</p>
                </div>
                
                <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                    <p style="margin-top: 0;">Dear Approver / Team,</p>
                    <p>Please be advised that the Resumption Request (<a href="{frappe.utils.get_url()}/app/contract-resume/{self.name}"><b>{self.name}</b></a>) has received full executive approval. The following contract is officially <b>resumed from On Hold</b> and restored to active <b>Commenced</b> operations.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Contract Reference:</td>
                                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                            </tr>
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Hold Reference:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.on_hold_record}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Resumed Date:</td>
                                <td style="padding: 8px 4px; color: #16a34a; font-weight: 700;">{res_date} ({now_str})</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Approved By:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.ceo_approver or frappe.session.user} (CEO)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Resolution Remarks:</td>
                                <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{self.resume_remarks or 'Contract operations successfully resumed.'}"</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 25px 0 10px 0;">
                        <a href="{frappe.utils.get_url()}/app/test-customer-contract/{self.contract}" style="background-color: #16a34a; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25);">
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
            frappe.log_error(f"Failed to send contract resume email: {str(e)}", "Contract Resumption Email")


def send_resume_stage_approval_email(doc, state, target_approver):
    if not target_approver or state in ["Maker", "Resumed", "Rejected"]:
        return

    recipient_email = target_approver
    if "@" not in recipient_email:
        recipient_email = frappe.db.get_value("User", target_approver, "email") or frappe.db.get_value("Employee", target_approver, "user_id")

    if not recipient_email or "@" not in recipient_email:
        return

    try:
        contract_ref = doc.contract or ""
        cust_name = doc.customer_name or ""
        stage_role_map = {
            "Pending Team Lead Approval": "Team Lead Review",
            "Pending Legal Approval": "Legal Review",
            "Pending Finance Approval": "Finance Review",
            "Pending HR Approval": "HR Review",
            "Pending CEO Approval": "CEO Review"
        }
        stage_label = stage_role_map.get(state, state)
        subject = f"? Action Required: Approval for Contract Resumption - {contract_ref}"

        message = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
            <div style="background: linear-gradient(135deg, #0d9488, #0f766e); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract Resumption Approval Required</h2>
                <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Action Required: {stage_label}</p>
            </div>
            
            <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                <p style="margin-top: 0;">Dear Approver,</p>
                <p>A request to resume master contract <b>{contract_ref}</b> from On Hold has been submitted and is currently pending your review and decision at the <b>{stage_label}</b> stage.</p>
                
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Resume Request ID:</td>
                            <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{doc.name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Master Contract:</td>
                            <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                        </tr>
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Title:</td><td style="padding: 8px 4px; color: #0f172a;">{doc.project_title}</td></tr>' if doc.get("project_title") else ''}
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Hold Record:</td>
                            <td style="padding: 8px 4px; color: #0f172a;">{doc.on_hold_record}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Proposed Resume Date:</td>
                            <td style="padding: 8px 4px; color: #0f172a;">{doc.actual_resume_date}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Requested By:</td>
                            <td style="padding: 8px 4px; color: #0f172a;">{doc.get("requested_by_name") or doc.get("requested_by") or doc.get("owner")}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Resumption Reason:</td>
                            <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{doc.get("resume_remarks") or 'No justification provided'}"</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin: 25px 0 10px 0;">
                    <a href="{frappe.utils.get_url()}/app/contract-resume/{doc.name}" style="background-color: #0d9488; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(13, 148, 136, 0.25);">
                        Review & Approve in ERPNext &rarr;
                    </a>
                </div>
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center;">
                This is an automated workflow notification from Access Health Contract Management System.
            </div>
        </div>
        """
        frappe.sendmail(recipients=[recipient_email], subject=subject, message=message, now=True)
    except Exception as e:
        frappe.log_error(f"Failed to send contract resume stage approval email: {str(e)}", "Contract Resume Stage Email")
