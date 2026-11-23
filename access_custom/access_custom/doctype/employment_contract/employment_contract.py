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
            if not self.get("annual_ctc") or abs(float(self.annual_ctc) - (fee * 12.0)) > 12.0:
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
        annual = float(self.get("annual_ctc") or 0)

        if annual <= 0 and gross <= 0:
            return

        if annual > 0 and (gross <= 0 or abs(annual - (gross * 12.0)) <= 12.0):
            d4 = annual / 12.0
            e4 = annual
        else:
            d4 = gross
            e4 = gross * 12.0

        b_pct = float(self.get("basic_percent") if self.get("basic_percent") is not None else 50.0)
        h_pct = float(self.get("hra_percent") if self.get("hra_percent") is not None else 50.0)
        l_pct = float(self.get("lta_percent") if self.get("lta_percent") is not None else 10.0)

        def r_up(val):
            return int(val + 0.5) if val >= 0 else int(val - 0.5)

        # 1. Basic
        if self.get("basic_monthly") and not self.get("basic_percent"):
            d5 = float(self.basic_monthly)
            e5 = d5 * 12.0
            b_pct = round((d5 / d4) * 100, 2) if d4 > 0 else 50.0
        else:
            d5 = d4 * (b_pct / 100.0)
            e5 = d5 * 12.0

        # 2. HRA
        if self.get("hra_monthly") and not self.get("hra_percent"):
            d6 = float(self.hra_monthly)
            e6 = d6 * 12.0
            h_pct = round((d6 / d5) * 100, 2) if d5 > 0 else 50.0
        else:
            d6 = d5 * (h_pct / 100.0)
            e6 = d6 * 12.0

        # 3. LTA
        if self.get("lta_monthly") and not self.get("lta_percent"):
            d7 = float(self.lta_monthly)
            e7 = d7 * 12.0
            l_pct = round((d7 / d4) * 100, 2) if d4 > 0 else 10.0
        else:
            d7 = d4 * (l_pct / 100.0)
            e7 = d7 * 12.0

        # 4. Other Allowance
        d8 = d4 - (d5 + d6 + d7)
        e8 = e4 - (e5 + e6 + e7)
        if d8 < 0:
            d8 = 0.0
        if e8 < 0:
            e8 = 0.0

        self.basic_percent = b_pct
        self.basic_monthly = float(r_up(d5))
        self.basic_annual = float(r_up(e5))

        self.hra_percent = h_pct
        self.hra_monthly = float(r_up(d6))
        self.hra_annual = float(r_up(e6))

        self.lta_percent = l_pct
        self.lta_monthly = float(r_up(d7))
        self.lta_annual = float(r_up(e7))

        self.other_allowance_monthly = float(r_up(d8))
        self.other_allowance_annual = float(r_up(e8))

        self.compensation_amount = float(r_up(d4))
        self.annual_ctc = float(r_up(e4))

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
        if st and st != wf:
            self.workflow_state = st
        elif wf and not st:
            self.status = wf

    def validate_pdf_attachments(self):
        attachments_to_check = [
            ("employee_cv", "Employee CV"),
            ("employee_signed_contract", "Employee Signed Contract"),
            ("final_executed_contract", "Final Executed Contract")
        ]
        for fieldname, label in attachments_to_check:
            val = self.get(fieldname)
            if val:
                clean_val = str(val).split("?")[0].split("#")[0].strip().lower()
                if not clean_val.endswith(".pdf"):
                    ext = clean_val.split(".")[-1] if "." in clean_val else "unknown"
                    frappe.throw(
                        frappe._(f"Only PDF (.pdf) files are permitted for <b>{label}</b>. The uploaded file (<b>.{ext}</b>) is not permitted."),
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
        return {"has_template": False, "template_name": None}
    clean_company = company.strip()

    # Filter strictly for Employment Contract Template (never match Consultant templates)
    res = frappe.db.sql("""
        SELECT name, company FROM `tabContract Template`
        WHERE (company = %(company)s OR LOWER(TRIM(company)) = LOWER(TRIM(%(company)s)))
          AND (name LIKE '%%Employment%%' OR title LIKE '%%Employment%%')
          AND name NOT LIKE '%%Consultant%%'
        ORDER BY creation DESC
        LIMIT 1
    """, {"company": clean_company}, as_dict=True)

    if res and res[0].get("name"):
        return {
            "has_template": True,
            "template_name": res[0]["name"],
            "matched_company": res[0].get("company")
        }
    return {"has_template": False, "template_name": None}


@frappe.whitelist()
def get_employment_contract_templates(doctype, txt, searchfield, start, page_len, filters=None):
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

    company = filters.get("company")

    conds = [
        "(name LIKE %(emp_pattern)s OR title LIKE %(emp_pattern)s)",
        "(name NOT LIKE %(con_pattern)s AND title NOT LIKE %(con_pattern)s)"
    ]
    params = {
        "emp_pattern": "%Employment%",
        "con_pattern": "%Consultant%",
        "txt": f"%{txt or ''}%",
        "start": start,
        "page_len": page_len
    }

    if company:
        conds.append("(company = %(company)s OR LOWER(TRIM(company)) = LOWER(TRIM(%(company)s)))")
        params["company"] = company.strip()

    cond_sql = " AND ".join(conds)

    return frappe.db.sql(f"""
        SELECT name, company
        FROM `tabContract Template`
        WHERE {cond_sql}
          AND (name LIKE %(txt)s OR title LIKE %(txt)s)
        ORDER BY name ASC
        LIMIT %(start)s, %(page_len)s
    """, params)


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
    elif role in ["Reporting Manager", "Reporting Managers"]:
        return get_reporting_managers(doctype, txt, searchfield, start, page_len, filters)

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
          AND (r.role = 'Team Lead' OR e.designation LIKE '%%Team Lead%%')
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
          AND (r.role IN ('Project Manager', 'Projects Manager') OR e.designation LIKE '%%Project Manager%%' OR e.designation LIKE '%%Projects Manager%%')
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
        GROUP BY e.name
        ORDER BY e.employee_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {"txt": f"%{txt or ''}%", "start": start, "page_len": page_len})


@frappe.whitelist()
def get_reporting_managers(doctype, txt, searchfield, start, page_len, filters=None):
    start = int(start or 0)
    page_len = int(page_len or 20)
    return frappe.db.sql("""
        SELECT e.name, e.employee_name
        FROM `tabEmployee` e
        LEFT JOIN `tabUser` u ON e.user_id = u.name
        LEFT JOIN `tabHas Role` r ON r.parent = u.name
        WHERE e.status = 'Active'
          AND (r.role IN ('Reporting Manager', 'Team Lead', 'Projects Manager', 'Project Manager') 
               OR e.designation LIKE '%%Manager%%' 
               OR e.designation LIKE '%%Lead%%' 
               OR e.designation LIKE '%%Director%%' 
               OR e.designation LIKE '%%Head%%')
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
        GROUP BY e.name
        ORDER BY e.employee_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {"txt": f"%{txt or ''}%", "start": start, "page_len": page_len})
