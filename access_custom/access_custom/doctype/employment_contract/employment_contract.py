# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import re
import frappe
from frappe.model.document import Document
from frappe.utils import add_days, add_months, add_years, getdate, nowdate


class EmploymentContract(Document):
    def validate(self):
        self.calculate_tenure_and_end_date()
        self.calculate_salary_breakup()
        self.calculate_allocation_totals()
        self.sync_rfp_and_sections()
        self.compile_employee_address()
        self.set_request_id_as_requester()
        self.sync_workflow_status()
        self.validate_pdf_attachments()
        self.validate_approver_permissions()
        self.validate_contact_details()
        self.validate_submission_requirements()

    def calculate_tenure_and_end_date(self):
        start = self.get("proposed_start_date") or self.get("start_date")
        end = self.get("proposed_end_date") or self.get("end_date")

        if self.get("engagement_type") == "Open-ended":
            self.contract_tenure = "Ongoing / Permanent"
            self.proposed_end_date = None
            if hasattr(self, "end_date"):
                self.end_date = None
            self.initial_tenure_value = None
            fee = float(self.get("compensation_amount") or 0)
            self.annual_ctc = round(fee * 12, 2)
            self.total_contract_value = self.annual_ctc
            if start:
                self.proposed_start_date = start
                if hasattr(self, "start_date"):
                    self.start_date = start
            return

        # Close-ended logic
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
                self.proposed_start_date = start
                self.proposed_end_date = end
                if hasattr(self, "start_date"):
                    self.start_date = start
                if hasattr(self, "end_date"):
                    self.end_date = end

                total_months = (years * 12) + months
                if days >= 28:
                    total_months += 1
                elif days > 0:
                    total_months += (days / 30.0)
                self.initial_tenure_value = max(1, round(total_months))

                fee = float(self.get("compensation_amount") or 0)
                self.total_contract_value = round(fee * total_months, 2)
        elif start and not end and self.get("initial_tenure_value"):
            from dateutil.relativedelta import relativedelta
            unit = (self.get("tenure_unit") or "Months").lower()
            val = int(self.initial_tenure_value)
            s_date = getdate(start)
            if "year" in unit:
                e_date = s_date + relativedelta(years=val) - relativedelta(days=1)
            elif "day" in unit:
                e_date = s_date + relativedelta(days=val - 1)
            else:
                e_date = s_date + relativedelta(months=val) - relativedelta(days=1)
            self.proposed_end_date = e_date
            self.proposed_start_date = start
            if hasattr(self, "end_date"):
                self.end_date = e_date
            if hasattr(self, "start_date"):
                self.start_date = start
            if not self.get("contract_tenure"):
                self.contract_tenure = f"{val} {self.get('tenure_unit') or 'Months'}"

    def calculate_salary_breakup(self):
        gross = float(self.get("compensation_amount") or 0)
        if gross <= 0:
            return

        b_pct = float(self.get("basic_percent") if self.get("basic_percent") is not None else 50.0)
        h_pct = float(self.get("hra_percent") if self.get("hra_percent") is not None else 50.0)
        l_pct = float(self.get("lta_percent") if self.get("lta_percent") is not None else 10.0)

        # Basic is b_pct of gross
        basic = float(self.get("basic_monthly")) if self.get("basic_monthly") else round(gross * (b_pct / 100.0), 2)
        # HRA is h_pct of Basic
        hra = float(self.get("hra_monthly")) if self.get("hra_monthly") else round(basic * (h_pct / 100.0), 2)
        # LTA is l_pct of gross
        lta = float(self.get("lta_monthly")) if self.get("lta_monthly") else round(gross * (l_pct / 100.0), 2)

        # Other Allowance is balancing amount
        other = round(gross - (basic + hra + lta), 2)
        if other < 0:
            other = 0.0

        self.basic_percent = b_pct
        self.basic_monthly = basic
        self.basic_annual = round(basic * 12, 2)

        self.hra_percent = h_pct
        self.hra_monthly = hra
        self.hra_annual = round(hra * 12, 2)

        self.lta_percent = l_pct
        self.lta_monthly = lta
        self.lta_annual = round(lta * 12, 2)

        self.other_allowance_monthly = other
        self.other_allowance_annual = round(other * 12, 2)

        self.annual_ctc = round(gross * 12, 2)
        if self.get("engagement_type") == "Open-ended" or not self.get("total_contract_value"):
            self.total_contract_value = self.annual_ctc

    def calculate_allocation_totals(self):
        total = 0.0
        for row in (self.get("project_allocations") or []):
            total += float(row.get("allocation_percent") or 0)
        self.total_allocation_percent = total

        if total > 100.0:
            frappe.msgprint(
                msg=frappe._(f"Total project allocation is {total}%, which exceeds 100%. Please review employee capacity."),
                title=frappe._("Over-Allocation Warning"),
                indicator="orange"
            )

    def sync_rfp_and_sections(self):
        req_org = self.get("requesting_organization")
        org = self.get("organization")
        if req_org:
            self.organization = req_org
        elif org:
            self.requesting_organization = org

        proj = self.get("project")
        proj_name = self.get("project_name")
        if proj_name and not proj:
            self.project = proj_name
        elif proj and not proj_name:
            self.project_name = proj

    def compile_employee_address(self):
        parts = [
            str(self.get("address_line_1") or "").strip(),
            str(self.get("address_line_2") or "").strip(),
            str(self.get("city") or "").strip(),
            str(self.get("state") or "").strip(),
            str(self.get("pin_code") or "").strip(),
            str(self.get("country") or "").strip(),
        ]
        self.employee_address = ", ".join([p for p in parts if p])

    def set_request_id_as_requester(self):
        req_id = self.get("request_id")
        if not req_id or req_id.startswith("EC-") or "/" in req_id:
            user = self.get("owner") or frappe.session.user
            emp = frappe.db.get_value("Employee", {"user_id": user}, ["name", "employee_name"], as_dict=True)
            if emp:
                self.request_id = f"{emp.employee_name} ({emp.name})"
            else:
                user_full = frappe.db.get_value("User", user, "full_name") or user
                self.request_id = user_full

    def sync_workflow_status(self):
        wf = self.get("workflow_state")
        st = self.get("status")
        if wf and st != wf:
            self.status = wf
        elif st and not wf:
            self.workflow_state = st

    def validate_pdf_attachments(self):
        attachments_to_check = [
            ("employee_cv", "Employee CV"),
            ("employee_signed_contract", "Employee Signed Contract"),
            ("final_executed_contract", "Final Executed Contract")
        ]
        for fieldname, label in attachments_to_check:
            val = self.get(fieldname)
            if val and not str(val).lower().endswith(".pdf"):
                frappe.throw(
                    frappe._(f"Only PDF files are permitted for <b>{label}</b>. Please upload a valid PDF."),
                    frappe.ValidationError
                )

    def validate_contact_details(self):
        email = self.get("email_id")
        if email:
            from frappe.utils import validate_email_address
            validate_email_address(email, throw=True)

        phone = self.get("contact_number")
        if phone:
            num = re.sub(r"[\s\-\+\(\)]", "", str(phone))
            if len(num) < 7 or not num.isdigit():
                frappe.throw(
                    frappe._(f"<b>{phone}</b> is not a valid contact phone number."),
                    frappe.ValidationError
                )

    def validate_approver_permissions(self):
        pass

    def validate_submission_requirements(self):
        if self.get("engagement_type") == "Close-ended" and not self.get("proposed_end_date"):
            frappe.throw(
                frappe._("Proposed End Date is mandatory for Close-ended contracts."),
                frappe.ValidationError
            )


@frappe.whitelist()
def check_company_has_contract_template(company):
    if not company:
        return {"has_template": False, "count": 0}
    clean_company = company.strip()
    templates = frappe.get_all(
        "Contract Template",
        filters={"company": clean_company},
        fields=["name", "company"]
    )
    if templates:
        return {"has_template": True, "count": len(templates), "matched_company": templates[0].company}
    all_tpls = frappe.get_all("Contract Template", fields=["name", "company"])
    for t in all_tpls:
        if (t.company or "").strip().lower() == clean_company.lower():
            return {"has_template": True, "count": 1, "matched_company": t.company}
    return {"has_template": False, "count": 0}


@frappe.whitelist()
def get_approver_users(doctype, txt, searchfield, start, page_len, filters):
    role_to_filter = filters.get("role") if filters else None
    if not role_to_filter:
        return frappe.get_all("User", filters={"enabled": 1}, fields=["name", "full_name"], as_list=True)

    users = frappe.db.sql("""
        SELECT DISTINCT u.name, u.full_name
        FROM `tabUser` u
        INNER JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE hr.role = %s
          AND u.enabled = 1
          AND u.name NOT IN ('Administrator', 'Guest')
          AND (u.name LIKE %s OR u.full_name LIKE %s)
        ORDER BY u.full_name ASC
        LIMIT %s, %s
    """, (role_to_filter, f"%{txt}%", f"%{txt}%", int(start), int(page_len)), as_list=True)
    return users
