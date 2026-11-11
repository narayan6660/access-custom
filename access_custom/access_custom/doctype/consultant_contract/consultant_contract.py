# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import re
import frappe
from frappe.model.document import Document
from frappe.utils import add_days, add_months, add_years, getdate, nowdate

class ConsultantContract(Document):
    def validate(self):
        self.calculate_tenure_and_end_date()
        self.calculate_allocation_totals()
        self.sync_rfp_and_sections()
        self.compile_consultant_address()
        self.set_request_id_as_requester()
        self.sync_workflow_status()
        self.validate_pdf_attachments()
        self.validate_approver_permissions()
        self.validate_contact_details()
        self.validate_submission_requirements()
        self.validate_company_template_availability()

    def calculate_tenure_and_end_date(self):
        start = self.proposed_start_date or self.start_date
        end = self.proposed_end_date or self.end_date

        # If start and end date are both provided, auto-calculate Contract Tenure exactly like Customer Contract
        if start and end:
            s_date = getdate(start)
            e_date = getdate(end)
            if e_date >= s_date:
                from dateutil.relativedelta import relativedelta
                r = relativedelta(e_date, s_date)
                years = r.years
                months = r.months
                days = r.days

                parts = []
                if years > 0:
                    parts.append(f"{years} Year" if years == 1 else f"{years} Years")
                if months > 0:
                    parts.append(f"{months} Month" if months == 1 else f"{months} Months")
                if days > 0:
                    parts.append(f"{days} Day" if days == 1 else f"{days} Days")

                self.contract_tenure = ", ".join(parts) if parts else "0 Days"
                self.start_date = start
                self.end_date = end
                self.proposed_start_date = start
                self.proposed_end_date = end

                total_months = (years * 12) + months
                if days >= 28:
                    total_months += 1
                elif days > 0:
                    total_months += (days / 30.0)
                self.initial_tenure_value = max(1, round(total_months))

                # Calculate total contract value on the basis of Contract Tenure
                fee = float(self.compensation_amount or self.proposed_fee or 0)
                comp_type = (self.compensation_type or "Monthly").lower()
                if "month" in comp_type:
                    self.total_contract_value = round(fee * total_months, 2)
                elif "day" in comp_type:
                    diff_days = (e_date - s_date).days + 1
                    self.total_contract_value = fee * diff_days
                elif not self.total_contract_value:
                    self.total_contract_value = fee
        elif start and not end and self.initial_tenure_value:
            from dateutil.relativedelta import relativedelta
            unit = (self.tenure_unit or "Months").lower()
            val = int(self.initial_tenure_value)
            s_date = getdate(start)
            if "year" in unit:
                e_date = s_date + relativedelta(years=val) - relativedelta(days=1)
            elif "day" in unit:
                e_date = s_date + relativedelta(days=val - 1)
            else:
                e_date = s_date + relativedelta(months=val) - relativedelta(days=1)
            self.end_date = e_date
            self.proposed_end_date = e_date
            self.start_date = start
            self.proposed_start_date = start
            if not self.contract_tenure:
                self.contract_tenure = f"{val} {self.tenure_unit or 'Months'}"

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
        # Section A requesting_organization is primary; sync to organization for list views
        if self.requesting_organization:
            self.organization = self.requesting_organization
        elif self.organization:
            self.requesting_organization = self.organization

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

        # Sync grade and custom_grade_level
        if hasattr(self, "custom_grade_level") and self.custom_grade_level and not getattr(self, "grade", None):
            self.grade = self.custom_grade_level
        elif hasattr(self, "grade") and self.grade and not getattr(self, "custom_grade_level", None):
            self.custom_grade_level = self.grade

        # Sync email aliases
        if self.email_id:
            self.email = self.email_id
            self.consultant_email = self.email_id

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

    def compile_consultant_address(self):
        parts = []
        if self.address_line_1:
            parts.append(str(self.address_line_1).strip())
        if getattr(self, "address_line_2", None) and self.address_line_2:
            parts.append(str(self.address_line_2).strip())
        if self.city:
            parts.append(str(self.city).strip())
        if self.state:
            parts.append(str(self.state).strip())
        
        country_pin = []
        if self.country:
            country_pin.append(str(self.country).strip())
        if self.pin_code:
            country_pin.append(str(self.pin_code).strip())
        
        if country_pin:
            parts.append(" – ".join(country_pin) if (self.country and self.pin_code) else country_pin[0])
            
        if parts:
            self.consultant_address = ", ".join(parts)

    def autoname(self):
        # Name format: <company_abbr>/<YYMMDD>/<serial_number> (e.g. AQH-IND/261016/1)
        company = self.requesting_organization or self.organization
        if not company:
            frappe.throw(frappe._("Please select Requesting Organization (Company) before saving the contract."))
        self.name = generate_consultant_contract_number(company, self.request_date or self.creation)

    def set_request_id_as_requester(self):
        # Request ID is the Contract Manager / Requester who created the contract request
        if not self.request_id or self.request_id.startswith("CC-") or "/" in str(self.request_id):
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

        # Validate Submit / Resubmit from Draft or Returned for Revision: Strictly Contract Manager / document creator
        if old_doc and old_doc.workflow_state in ["Draft", "Returned for Revision"] and self.workflow_state == "Pending Team Lead Approval":
            is_cm = ("Contract Manager" in roles) or (self.owner == user) or is_admin
            is_approver = user in [self.team_lead_approver, self.hr_approver, self.ceo_approver, self.final_hr_approver]
            if is_approver and not is_admin and self.owner != user:
                frappe.throw(frappe._("Approvers are not permitted to submit/resubmit a returned contract. This must be handled by the Contract Manager."))
            if not is_cm:
                frappe.throw(frappe._("Only the Contract Manager or document creator can submit this contract for approval."))

            # Clean reset of all approver decisions and remarks for the new approval sequence
            self.team_lead_decision = None
            self.hr_decision = None
            self.ceo_decision = None
            self.final_hr_decision = None
            self.team_lead_remarks = None
            self.hr_remarks = None
            self.ceo_remarks = None
            self.final_hr_remarks = None
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



        # Enforce all Section G fields must be filled before Contract Manager can execute/activate contract
        if self.workflow_state == "Active":
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
                frappe.throw(frappe._("Cannot activate contract until all fields in Section G — Consultant Signed Contract are filled: {0}").format(", ".join(missing_g)))

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

        # 3. State changed to Signed by Consultant (post-Final HR review)
        elif new_state in ["Signed by Consultant", "Approved for Issuance"]:
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
                    now=False
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
                    now=False
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
                pf_to_use = self.contract_template or "Consultant Agreement"
                pdf_attachment = frappe.attach_print(
                    doctype="Consultant Contract",
                    name=self.name,
                    print_format=pf_to_use,
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
                    now=False
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
                    now=False
                )
        except Exception as e:
            frappe.log_error(title=f"Error sending Approved for Issuance email for {self.name}", message=str(e))


    def validate_submission_requirements(self):
        """
        Validates that mandatory fields (Start Date and Compensation) are populated
        before the contract can be submitted for approval or progressed through the workflow.
        Note: End Date is autocalculated from Start Date and tenure, so it is not manually required.
        """
        state = self.workflow_state or self.status or "Draft"
        if state not in ["Draft", "Returned for Revision", "Rejected", "Cancelled"]:
            # 1. Start Date is mandatory
            start = self.start_date or self.proposed_start_date
            if not start:
                frappe.throw(
                    frappe._("<b>Start Date</b> is mandatory before submitting the contract for approval. Please enter a valid Start Date."),
                    title=frappe._("Missing Start Date")
                )

            # 2. Salary / Compensation is mandatory and must be > 0
            fee = float(self.compensation_amount or self.proposed_fee or 0)
            if fee <= 0:
                frappe.throw(
                    frappe._("<b>Compensation / Salary</b> is mandatory before submitting the contract for approval. Please enter a valid compensation amount greater than 0."),
                    title=frappe._("Missing Salary / Compensation")
                )


    def validate_company_template_availability(self):
        """
        Validates that the selected company has a dedicated contract template.
        If no dedicated template exists, warns/blocks creation and directs user to admin.
        """
        company = self.requesting_organization or self.organization
        if company:
            has_template = frappe.db.exists("Contract Template", {"company": company})
            if not has_template:
                frappe.throw(
                    frappe._("There is no dedicated template for <b>{0}</b>. Please contact the admin.").format(company),
                    title=frappe._("No Dedicated Template")
                )

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

    def validate_contact_details(self):
        # 1. Consultant Name
        if self.consultant_name:
            raw_name = str(self.consultant_name).strip()
            if not re.match(r'^[a-zA-Z\s.]+$', raw_name):
                frappe.throw(
                    frappe._("<b>Consultant Name</b> can only contain letters (a–z, A–Z), spaces, and dots ('.'). Numbers or special symbols are not allowed."),
                    title=frappe._("Invalid Name Format")
                )
            if len(re.sub(r'[^a-zA-Z]', '', raw_name)) < 2:
                frappe.throw(
                    frappe._("<b>Consultant Name</b> must contain at least 2 letters."),
                    title=frappe._("Invalid Name Format")
                )

        # 2. Email ID
        if getattr(self, 'email_id', None) and str(self.email_id).strip():
            raw_email = str(self.email_id).strip()
            if '..' in raw_email or not re.match(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', raw_email):
                frappe.throw(
                    frappe._("Please enter a valid <b>Email ID</b> (e.g. name@domain.com). Disallowed characters or consecutive dots are not permitted."),
                    title=frappe._("Invalid Email Address")
                )

        # 3. Mobile / Contact Number
        if getattr(self, 'contact_number', None) and str(self.contact_number).strip():
            raw_phone = re.sub(r'[\s\-\(\)]', '', str(self.contact_number).strip())
            for d in range(10):
                if str(d) * 10 in raw_phone:
                    frappe.throw(
                        frappe._("Please enter a valid <b>Mobile Number</b>, not a dummy or repeated number."),
                        title=frappe._("Invalid Mobile Number")
                    )
            for seq in ['0123456789', '1234567890', '9876543210', '0987654321']:
                if seq in raw_phone:
                    frappe.throw(
                        frappe._("Please enter a valid <b>Mobile Number</b>, not a sequential test number."),
                        title=frappe._("Invalid Mobile Number")
                    )

            country = getattr(self, 'country', '') or 'India'
            is_india = 'india' in country.lower()
            if is_india:
                p = raw_phone
                if p.startswith('+91'):
                    p = p[3:]
                elif p.startswith('91') and len(p) == 12:
                    p = p[2:]
                elif p.startswith('0') and len(p) == 11:
                    p = p[1:]

                if len(p) != 10:
                    frappe.throw(
                        frappe._("Indian <b>Mobile Number</b> must be exactly 10 digits (currently {0} digits).").format(len(p)),
                        title=frappe._("Invalid Mobile Number")
                    )
                if p[0] not in '6789':
                    frappe.throw(
                        frappe._("Indian <b>Mobile Number</b> must start with 6, 7, 8, or 9 (starts with '{0}').").format(p[0]),
                        title=frappe._("Invalid Mobile Number")
                    )
            else:
                digits = re.sub(r'\D', '', raw_phone)
                if len(digits) < 7 or len(digits) > 15:
                    frappe.throw(
                        frappe._("International <b>Mobile Number</b> must contain between 7 and 15 digits."),
                        title=frappe._("Invalid Mobile Number")
                    )

        # 4. Pin Code
        if getattr(self, 'pin_code', None) and str(self.pin_code).strip():
            raw_pin = str(self.pin_code).strip()
            country = getattr(self, 'country', '') or 'India'
            is_india = 'india' in country.lower()
            if is_india:
                if not re.match(r'^[1-9][0-9]{5}$', raw_pin):
                    frappe.throw(
                        frappe._("Indian <b>Pin Code</b> must be exactly 6 digits and cannot start with 0 (e.g. 500081)."),
                        title=frappe._("Invalid Pin Code")
                    )



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
def send_30_day_contract_expiry_reminders():
    """
    Sends automated 30-day expiry notification emails for active consultant contracts
    reaching their scheduled end date within the next 30 days.
    """
    from frappe.utils import nowdate, add_days, formatdate, getdate
    today = nowdate()
    in_30_days = add_days(today, 30)

    contracts = frappe.get_all(
        "Consultant Contract",
        filters={
            "status": ["in", ["Active", "Signed by Consultant", "Contract Issued"]],
            "end_date": ["between", [today, in_30_days]]
        },
        fields=[
            "name", "request_id", "consultant_name", "start_date", "end_date",
            "owner", "team_lead_approver", "hr_approver", "final_hr_approver",
            "requesting_organization", "organization"
        ]
    )

    sent_count = 0
    for c in contracts:
        if not c.end_date:
            continue

        # Prevent sending duplicate notification for this contract
        already_sent = frappe.db.exists(
            "Communication",
            {
                "reference_doctype": "Consultant Contract",
                "reference_name": c.name,
                "subject": ["like", "%30-Day Contract Expiry Notice%"]
            }
        )
        if already_sent:
            continue

        recipients = set()
        for field in [c.owner, c.team_lead_approver, c.hr_approver, c.final_hr_approver]:
            if field and "@" in field:
                recipients.add(field.strip())

        if not (c.hr_approver or c.final_hr_approver):
            hr_users = frappe.db.sql_list("""
                SELECT DISTINCT u.name FROM `tabUser` u
                INNER JOIN `tabHas Role` r ON r.parent = u.name
                WHERE r.role IN ('HR Manager', 'HR User') AND u.enabled = 1
            """)
            for u in hr_users:
                if u and "@" in u:
                    recipients.add(u)

        if not recipients:
            continue

        days_remaining = (getdate(c.end_date) - getdate(today)).days
        consultant_name = c.consultant_name or "Consultant"
        formatted_end = formatdate(c.end_date, "dd-MM-yyyy")
        formatted_start = formatdate(c.start_date, "dd-MM-yyyy") if c.start_date else "N/A"
        contract_url = frappe.utils.get_url_to_form("Consultant Contract", c.name)
        org = c.requesting_organization or c.organization or "Organization"

        subject = f"Action Required: 30-Day Contract Expiry Notice for {c.name} - {consultant_name}"
        message = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background: #ffffff;">
            <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 18px;">
                <h3 style="color: #b45309; margin: 0; font-size: 18px;">
                    &#9888; Consultant Contract Expiry Reminder (30 Days)
                </h3>
            </div>
            <p style="font-size: 14px; margin-bottom: 16px;">
                This is an automated notification that the following consultant engagement is approaching its scheduled end date:
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13.5px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;">
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; width: 35%; color: #92400e; border-bottom: 1px solid #fde68a;">Contract Reference:</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #fde68a; color: #1e293b;"><b>{c.name}</b></td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #92400e; border-bottom: 1px solid #fde68a;">Consultant Name:</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #fde68a; color: #1e293b;">{consultant_name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #92400e; border-bottom: 1px solid #fde68a;">Organization:</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #fde68a; color: #1e293b;">{org}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #92400e; border-bottom: 1px solid #fde68a;">Contract Tenure:</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #fde68a; color: #1e293b;">{formatted_start} &rarr; <b>{formatted_end}</b></td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #92400e;">Days Remaining:</td>
                    <td style="padding: 10px 14px; color: #b45309; font-weight: bold;">{days_remaining} Day{'s' if days_remaining != 1 else ''}</td>
                </tr>
            </table>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin-bottom: 20px; font-size: 13px; color: #475569;">
                <b>Recommended Actions:</b>
                <ul style="margin: 6px 0 0 18px; padding: 0;">
                    <li>If engagement should continue: Initiate a <b>Contract Extension</b> or amendment.</li>
                    <li>If engagement concludes on schedule: Prepare completion sign-off and final deliverables review.</li>
                </ul>
            </div>
            <p style="margin-top: 24px; text-align: center;">
                <a href="{contract_url}" style="background: #0284c7; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 14px;">
                    View Contract in Desk &rarr;
                </a>
            </p>
        </div>
        """

        try:
            frappe.sendmail(
                recipients=list(recipients),
                subject=subject,
                message=message,
                reference_doctype="Consultant Contract",
                reference_name=c.name,
                now=False
            )
            sent_count += 1
        except Exception as e:
            frappe.log_error(title=f"Error sending 30-day expiry notice for {c.name}", message=str(e))

    frappe.db.commit()
    return sent_count

@frappe.whitelist()
def check_and_mark_expired_contracts():
    from frappe.utils import nowdate
    today = nowdate()

    # 1. Send 30-day expiry reminder emails for contracts nearing completion
    try:
        send_30_day_contract_expiry_reminders()
    except Exception as re:
        frappe.log_error(title="Error in send_30_day_contract_expiry_reminders", message=str(re))

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
        if not c.end_date:
            continue

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
    hr_count = frappe.db.count("Consultant Contract", {"workflow_state": ["in", ["Pending HR Review", "Pending Final HR Review"]]})
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
def get_approver_users(doctype, txt, searchfield, start, page_len, filters=None):
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

    role = (filters or {}).get("role")
    roles = []
    if isinstance(role, list):
        roles = role
    elif role:
        roles = [role]

    role_condition = ""
    role_params = {}
    if roles:
        role_condition = "AND r.role IN %(roles)s"
        role_params["roles"] = tuple(roles)

    query = f"""
        SELECT DISTINCT u.name, u.full_name
        FROM `tabUser` u
        JOIN `tabHas Role` r ON r.parent = u.name
        WHERE u.enabled = 1
          {role_condition}
          AND (u.name LIKE %(txt)s OR u.full_name LIKE %(txt)s OR u.first_name LIKE %(txt)s OR u.last_name LIKE %(txt)s)
        ORDER BY u.full_name ASC
        LIMIT %(start)s, %(page_len)s
    """
    params = {
        "txt": f"%{txt or ''}%",
        "start": start,
        "page_len": page_len,
        **role_params
    }
    return frappe.db.sql(query, params)


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


def generate_consultant_contract_number(company, request_date=None, current_docname=None):
    if not company:
        return ""

    abbr = frappe.db.get_value("Company", company, "abbr")
    if not abbr:
        abbr = company[:4].upper()

    if not request_date:
        request_date = nowdate()

    date_obj = getdate(request_date)
    yymmdd = date_obj.strftime("%y%m%d")

    prefix = f"{abbr}/"
    existing = frappe.db.sql("""
        SELECT name FROM `tabConsultant Contract`
        WHERE name LIKE %s
    """, (f"{prefix}%",), as_dict=True)

    max_serial = 0
    for r in existing:
        doc_name = (r.get("name") or "").strip()
        if current_docname and doc_name == current_docname:
            continue
        parts = doc_name.split("/")
        if len(parts) >= 3 and parts[-1].isdigit():
            val = int(parts[-1])
            if val > max_serial:
                max_serial = val

    next_serial = max_serial + 1
    return f"{abbr}/{yymmdd}/{next_serial}"


@frappe.whitelist()
def get_next_contract_number(company, request_date=None, docname=None):
    return generate_consultant_contract_number(company, request_date, current_docname=docname)
