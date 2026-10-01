import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, getdate, now_datetime


class ContractOnHold(Document):
    def _validate_links(self):
        self.resolve_requested_by()
        state = self.workflow_state or self.status or ""
        # Validate supporting document required before submitting past Draft
        if state and state not in ["Draft"]:
            if not getattr(self, "supporting_document", None):
                frappe.throw(_("Please upload the <b>Supporting Document</b> before submitting this On Hold request for approval."))

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
        if not self.hold_date:
            self.hold_date = today()
        state = self.workflow_state or self.status or ""
        if state in ["On Hold", "Active Hold"] and not getattr(self, "on_hold_on", None):
            self.on_hold_on = now_datetime()
        if state == "Resumed" and not getattr(self, "resumed_on", None):
            self.resumed_on = now_datetime()
        self.resolve_requested_by()
        # Validate supporting document required before submitting past Draft
        if state and state not in ["Draft"]:
            if not getattr(self, "supporting_document", None):
                frappe.throw(_("Please upload the <b>Supporting Document</b> before submitting this On Hold request for approval."))


        # Validate contract status
        if self.contract:
            contract_status = frappe.db.get_value("Test Customer Contract", self.contract, "workflow_state")
            if self.is_new() and contract_status not in ["Commenced"]:
                frappe.msgprint(_("Warning: Contract {0} is currently in state '{1}', not 'Commenced'.").format(self.contract, contract_status), indicator="orange")

    def on_update(self):
        state = self.workflow_state or self.status or ""
        if state in ["On Hold", "Active Hold"] and not getattr(self, "on_hold_on", None):
            self.on_hold_on = now_datetime()
            frappe.db.set_value(self.doctype, self.name, "on_hold_on", self.on_hold_on, update_modified=False)
        elif state == "Resumed" and not getattr(self, "resumed_on", None):
            self.resumed_on = now_datetime()
            frappe.db.set_value(self.doctype, self.name, "resumed_on", self.resumed_on, update_modified=False)
        self.sync_contract_status()
        if state in ["On Hold", "Active Hold"]:
            self.send_on_hold_placed_email()

    def sync_contract_status(self):
        if not self.contract:
            return
        
        state = self.workflow_state or ""
        if state in ["On Hold", "Active Hold"]:
            frappe.db.set_value("Test Customer Contract", self.contract, {
                "contract_status": "On Hold",
                "hold_date": self.hold_date or today()
            })
            if self.impact_on_end_date and self.revised_end_date:
                frappe.db.set_value("Test Customer Contract", self.contract, "contract_end_date", self.revised_end_date)
            frappe.msgprint(_("Contract {0} status updated to On Hold").format(self.contract), indicator="blue")
        elif state in ["Resumed"]:
            frappe.db.set_value("Test Customer Contract", self.contract, {
                "contract_status": "Commenced",
                "actual_resume_date": self.actual_resume_date or today()
            })
            frappe.msgprint(_("Contract {0} has been resumed and returned to Commenced.").format(self.contract), indicator="green")

    def send_on_hold_placed_email(self):
        """Dispatches customized HTML notification to all approvers and contract managers when contract is placed on hold"""
        flag_key = f"sent_on_hold_placed_email_{self.name}"
        if getattr(frappe.flags, flag_key, False):
            return
        frappe.flags[flag_key] = True

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
            hold_dt_str = self.on_hold_on.strftime("%d-%m-%Y %H:%M:%S") if getattr(self, "on_hold_on", None) else now_datetime().strftime("%d-%m-%Y %H:%M:%S")
            subject = f"⚠️ [Contract On Hold] Contract {contract_ref} has been Placed On Hold"

            message = f"""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
                <div style="background: linear-gradient(135deg, #d97706, #92400e); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract Placed On Hold</h2>
                    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Official Contract On Hold Notification</p>
                </div>
                
                <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                    <p style="margin-top: 0;">Dear Approver / Team,</p>
                    <p>Please be advised that <b>Contract On Hold {self.name}</b> for master contract <b>{contract_ref}</b> has received final approval from the CEO and the contract is now officially <b>On Hold</b>.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Contract Reference:</td>
                                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                            </tr>
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Project Title:</td><td style="padding: 8px 4px; color: #0f172a;">{self.project_title}</td></tr>' if self.project_title else ''}
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Hold Record ID:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Placed On Hold Date & Time:</td>
                                <td style="padding: 8px 4px; color: #d97706; font-weight: 700;">{hold_dt_str}</td>
                            </tr>
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Expected Resume Date:</td><td style="padding: 8px 4px; color: #0f172a;">{self.expected_resume_date}</td></tr>' if self.expected_resume_date else ''}
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Revised End Date:</td><td style="padding: 8px 4px; color: #0f172a;">{self.revised_end_date}</td></tr>' if self.impact_on_end_date and self.revised_end_date else ''}
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Approved By:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{self.ceo_approver or frappe.session.user} (CEO)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Hold Reason:</td>
                                <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{self.hold_reason or 'No specific reason stated.'}"</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 25px 0 10px 0;">
                        <a href="{frappe.utils.get_url()}/app/contract-on-hold/{self.name}" style="background-color: #d97706; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.25);">
                            View Contract On Hold in ERPNext &rarr;
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
            frappe.log_error(f"Failed to send contract on hold email: {str(e)}", "Contract On Hold Email")


def send_on_hold_stage_approval_email(doc, state, target_approver):
    """Dispatches customized HTML assignment email to the assigned approver for the active stage"""
    flag_key = f"sent_on_hold_stage_email_{doc.name}_{state}"
    if getattr(frappe.flags, flag_key, False):
        return
    frappe.flags[flag_key] = True

    if not target_approver:
        return

    recipient_email = target_approver if "@" in target_approver else (frappe.db.get_value("User", target_approver, "email") or frappe.db.get_value("Employee", target_approver, "user_id"))
    if not recipient_email or "@" not in recipient_email:
        return

    try:
        contract_ref = doc.contract or doc.name
        cust_name = doc.customer_name or (frappe.db.get_value("Test Customer Contract", doc.contract, "customer_name") if doc.contract else "")
        stage_role_map = {
            "Pending Team Lead Approval": "Team Lead Review",
            "Pending Legal Approval": "Legal Review",
            "Pending Finance Approval": "Finance Review",
            "Pending HR Approval": "HR Review",
            "Pending CEO Approval": "CEO Review"
        }
        stage_label = stage_role_map.get(state, state)
        subject = f"⏳ Action Required: Approval for Contract On Hold - {contract_ref}"

        message = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
            <div style="background: linear-gradient(135deg, #d97706, #b45309); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract On Hold Review Required</h2>
                <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Action Required: {stage_label}</p>
            </div>
            
            <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                <p style="margin-top: 0;">Dear Approver,</p>
                <p>A request to place master contract <b>{contract_ref}</b> on hold has been submitted and is currently pending your review and decision at the <b>{stage_label}</b> stage.</p>
                
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Hold Record ID:</td>
                            <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{doc.name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Master Contract:</td>
                            <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                        </tr>
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Project Title:</td><td style="padding: 8px 4px; color: #0f172a;">{doc.project_title}</td></tr>' if doc.get("project_title") else ''}
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Hold Date:</td>
                            <td style="padding: 8px 4px; color: #0f172a;">{doc.hold_date or today()}</td>
                        </tr>
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Expected Resume Date:</td><td style="padding: 8px 4px; color: #0f172a;">{doc.expected_resume_date}</td></tr>' if doc.get("expected_resume_date") else ''}
                        {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Revised End Date:</td><td style="padding: 8px 4px; color: #0f172a;">{doc.revised_end_date}</td></tr>' if doc.get("impact_on_end_date") and doc.get("revised_end_date") else ''}
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Requested By:</td>
                            <td style="padding: 8px 4px; color: #0f172a;">{doc.get("requested_by") or doc.get("owner")}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Hold Reason:</td>
                            <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{doc.get("hold_reason") or 'No reason specified'}"</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin: 25px 0 10px 0;">
                    <a href="{frappe.utils.get_url()}/app/contract-on-hold/{doc.name}" style="background-color: #d97706; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.25);">
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
        frappe.log_error(f"Failed to send on hold stage approval email: {str(e)}", "Contract On Hold Assignment Email")


@frappe.whitelist()
def resume_contract(hold_name, actual_resume_date=None, resume_remarks=None):
    doc = frappe.get_doc("Contract On Hold", hold_name)
    if doc.workflow_state not in ["On Hold", "Active Hold", "Approved"]:
        frappe.throw(_("Contract can only be resumed when On Hold."))
    
    res_date = actual_resume_date or today()
    now_dt = now_datetime()
    now_str = now_dt.strftime("%d-%m-%Y %H:%M:%S")
    remarks = resume_remarks or ""
    
    # Update Contract On Hold
    frappe.db.set_value("Contract On Hold", hold_name, {
        "actual_resume_date": res_date,
        "resume_remarks": remarks,
        "workflow_state": "Resumed",
        "status": "Resumed",
        "resumed_on": now_dt
    }, update_modified=True)

    doc.workflow_state = "Resumed"
    doc.status = "Resumed"
    doc.actual_resume_date = res_date
    doc.resumed_on = now_dt
    doc.resume_remarks = remarks
    doc.sync_contract_status()

    # Collect Approver Emails for Notification
    approver_emails = []
    approver_fields = ["lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"]
    for af in approver_fields:
        user_or_emp = getattr(doc, af, None)
        if user_or_emp:
            email = None
            if "@" in user_or_emp:
                email = user_or_emp
            else:
                email = frappe.db.get_value("User", user_or_emp, "email") or frappe.db.get_value("Employee", user_or_emp, "user_id")
            if email and email not in approver_emails:
                approver_emails.append(email)

    if doc.contract:
        contract_doc = frappe.db.get_value("Test Customer Contract", doc.contract, ["contract_owner", "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"], as_dict=True)
        if contract_doc:
            for k, u in contract_doc.items():
                if u:
                    email = u if "@" in u else (frappe.db.get_value("User", u, "email") or frappe.db.get_value("Employee", u, "user_id"))
                    if email and email not in approver_emails:
                        approver_emails.append(email)

    recipients = [e for e in approver_emails if e and "@" in e]
    if recipients:
        try:
            contract_ref = doc.contract or doc.name
            cust_name = frappe.db.get_value("Test Customer Contract", doc.contract, "customer_name") if doc.contract else ""
            subject = f"🔔 [Contract Resumed] Contract {contract_ref} has been Resumed from On Hold"
            
            message = f"""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
                <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 18px 22px; border-radius: 8px; color: #ffffff; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Contract Resumed from On Hold</h2>
                    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Official Resumption Notification</p>
                </div>
                
                <div style="padding: 24px 8px; color: #334155; line-height: 1.6; font-size: 14px;">
                    <p style="margin-top: 0;">Dear Approver / Team,</p>
                    <p>Please be advised that the following contract has been officially <b>resumed from On Hold</b> status and restored to active <b>Commenced</b> operations.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; width: 38%;">Contract Reference:</td>
                                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">{contract_ref}</td>
                            </tr>
                            {f'<tr><td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Customer Name:</td><td style="padding: 8px 4px; color: #0f172a;">{cust_name}</td></tr>' if cust_name else ''}
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Hold Record ID:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{doc.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Resumed Date & Time:</td>
                                <td style="padding: 8px 4px; color: #16a34a; font-weight: 700;">{res_date} ({now_str})</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Resumed By:</td>
                                <td style="padding: 8px 4px; color: #0f172a;">{frappe.session.user}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; color: #64748b; vertical-align: top;">Resolution Remarks:</td>
                                <td style="padding: 8px 4px; color: #334155; font-style: italic;">"{remarks or 'Contract operations successfully resumed.'}"</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 25px 0 10px 0;">
                        <a href="{frappe.utils.get_url()}/app/test-customer-contract/{doc.contract}" style="background-color: #16a34a; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25);">
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

    return {"status": "success", "message": _("Contract Resumed Successfully and Notifications Dispatched.")}
