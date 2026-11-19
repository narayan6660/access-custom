import frappe
from frappe import _
from hrms.hr.doctype.appraisal_cycle.appraisal_cycle import (
    AppraisalCycle,
)
import hrms.hr.doctype.appraisal_cycle.appraisal_cycle as ac_module
import hrms.hr.doctype.appraisal.appraisal as appr_module


def custom_validate_active_appraisal_cycle(appraisal_cycle: str) -> None:
    if frappe.db.get_value("Appraisal Cycle", appraisal_cycle, "status") == "Completed":
        msg = _(
            "This appraisal cycle has been officially closed and completed by HR. "
            "Further changes, submissions, or approvals are no longer accepted."
        )
        frappe.throw(msg, title=_("Appraisal Cycle Closed"))


# Monkey patch to ensure professional message on backend
ac_module.validate_active_appraisal_cycle = custom_validate_active_appraisal_cycle
appr_module.validate_active_appraisal_cycle = custom_validate_active_appraisal_cycle


@frappe.whitelist()
def custom_get_appraisal_cycle_summary(cycle_name: str):
    """
    Whitelisted override for standard summary call.
    Returns None so standard appraisal_cycle.js does not render
    the generic (Self Appraisal Pending, Goals Missing, Feedback Missing) indicators.
    """
    return None


ac_module.get_appraisal_cycle_summary = custom_get_appraisal_cycle_summary


def format_appraisal_status(wf_state: str) -> str:
    if not wf_state:
        return "Objectives Pending"
    status_map = {
        "Pending": "Objectives Pending",
        "Objective Review Pending": "Objectives Review Pending",
        "Objectives Approved": "Objectives Approved",
        "Objectives Rejected": "Objectives Rejected",
        "Mid-Term Review Pending": "Mid-Term Pending",
        "Mid-Term Rejected": "Mid-Term Rejected",
        "Mid-Term Completed": "Mid-Term Completed",
        "Pending Manager Review": "Annual Review Pending",
        "Appraisal Rejected": "Annual Review Rejected",
        "Completed": "Completed",
    }
    return status_map.get(wf_state, wf_state)


def sync_appraisal_status_to_cycle(doc, method=None):
    """Keep tabAppraisee.custom_appraisal_status synchronized whenever an Appraisal is updated or trashed"""
    if doc.appraisal_cycle and doc.employee:
        formatted = format_appraisal_status(doc.workflow_state)
        frappe.db.sql(
            """
            UPDATE `tabAppraisee`
            SET custom_appraisal_status = %s
            WHERE parent = %s AND employee = %s
            """,
            (formatted, doc.appraisal_cycle, doc.employee),
        )


class CustomAppraisalCycle(AppraisalCycle):
    def validate(self):
        # Keep primary company synchronized with the first applicable company if available
        if hasattr(self, "custom_applicable_companies") and self.custom_applicable_companies:
            first_comp = self.custom_applicable_companies[0].company
            if first_comp:
                self.company = first_comp
        elif not self.company:
            default_comp = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value("Company", {}, "name")
            self.company = default_comp

        # Populate custom_manager and custom_appraisal_status for every appraisee row
        if hasattr(self, "appraisees"):
            for row in self.appraisees:
                if row.employee:
                    if not getattr(row, "custom_manager", None):
                        row.custom_manager = frappe.db.get_value("Employee", row.employee, "reports_to")
                    if not getattr(row, "custom_company", None):
                        row.custom_company = frappe.db.get_value("Employee", row.employee, "company")
                    
                    wf_state = None
                    if self.name:
                        wf_state = frappe.db.get_value(
                            "Appraisal",
                            {"appraisal_cycle": self.name, "employee": row.employee, "docstatus": ["!=", 2]},
                            "workflow_state"
                        )
                    row.custom_appraisal_status = format_appraisal_status(wf_state)

        super().validate()

    def on_update(self):
        if hasattr(super(), "on_update"):
            super().on_update()
        # Automatically create appraisals for any newly added employees anytime while cycle is In Progress
        if self.status == "In Progress":
            create_appraisals_for_multicompany_cycle(self, publish_progress=False)

    def get_employees_for_appraisal(self):
        """Pull employees based on filters across selected applicable companies"""
        companies = []
        if hasattr(self, "custom_applicable_companies") and self.custom_applicable_companies:
            companies = [d.company for d in self.custom_applicable_companies if d.company]

        if not companies and self.company:
            companies = [self.company]

        filters = {
            "status": "Active",
        }

        # 1. Filter by Company
        if hasattr(self, "custom_filter_company") and self.custom_filter_company:
            filters["company"] = self.custom_filter_company
        elif len(companies) == 1:
            filters["company"] = companies[0]
        elif len(companies) > 1:
            filters["company"] = ["in", companies]

        # 2. Filter by Manager (Line Manager)
        if hasattr(self, "custom_filter_manager") and self.custom_filter_manager:
            filters["reports_to"] = self.custom_filter_manager

        # 3. Filter by specific Employee
        if hasattr(self, "custom_filter_employee") and self.custom_filter_employee:
            filters["name"] = self.custom_filter_employee

        employees = frappe.db.get_all(
            "Employee",
            filters=filters,
            fields=[
                "name",
                "employee_name",
                "company",
                "branch",
                "designation",
                "department",
                "reports_to",
            ],
            order_by="company, employee_name",
        )

        return employees

    @frappe.whitelist()
    def set_employees(self):
        """
        Pull employees in appraisee list across companies.
        If existing employees already exist in cycle, PRESERVE them and append new matching ones.
        """
        employees = self.get_employees_for_appraisal()
        appraisal_templates = self.get_appraisal_template_map()
        default_template = (
            frappe.db.get_value("Appraisal Template", {"name": "Default Hidden Template"})
            or frappe.db.get_value("Appraisal Template", {}, "name")
        )

        existing_employees = {row.employee for row in (self.appraisees or []) if row.employee}
        added_count = 0

        for data in (employees or []):
            if data.name in existing_employees:
                continue

            template = (
                appraisal_templates.get(data.designation)
                if data.designation else None
            ) or default_template

            wf_state = None
            if self.name:
                wf_state = frappe.db.get_value(
                    "Appraisal",
                    {"appraisal_cycle": self.name, "employee": data.name, "docstatus": ["!=", 2]},
                    "workflow_state"
                )

            display_status = format_appraisal_status(wf_state)

            self.append(
                "appraisees",
                {
                    "employee": data.name,
                    "employee_name": data.employee_name,
                    "custom_manager": data.reports_to,
                    "custom_company": data.company,
                    "custom_appraisal_status": display_status,
                    "branch": data.branch or "",
                    "designation": data.designation or "",
                    "department": data.department or "",
                    "appraisal_template": template,
                },
            )
            added_count += 1

        if added_count > 0:
            frappe.msgprint(
                _("Added {0} new employee(s) to this cycle.").format(added_count),
                alert=True,
                indicator="green",
            )
        elif not employees:
            frappe.msgprint(
                _("No active employees found matching the selected filter."),
                alert=True,
                indicator="orange",
            )
        else:
            frappe.msgprint(
                _("All {0} matching employee(s) are already in this cycle.").format(len(employees)),
                alert=True,
                indicator="blue",
            )

    @frappe.whitelist()
    def create_appraisals(self):
        self.check_permission("write")
        if not self.appraisees:
            frappe.throw(
                _("Please select employees to create appraisals for"),
                title=_("No Employees Selected"),
            )

        default_template = (
            frappe.db.get_value("Appraisal Template", {"name": "Default Hidden Template"})
            or frappe.db.get_value("Appraisal Template", {}, "name")
        )
        for appraisee in self.appraisees:
            if not appraisee.appraisal_template:
                appraisee.appraisal_template = default_template

        # Create appraisals setting each employee's legal company
        create_appraisals_for_multicompany_cycle(self, publish_progress=True)
        self.reload()

    @frappe.whitelist()
    def complete_cycle(self):
        """
        Allows HR to officially complete and close the cycle,
        even if some employee appraisals remain in progress.
        """
        self.check_permission("write")
        self.status = "Completed"
        self.save()


@frappe.whitelist()
def get_cycle_stage_summary(cycle_name: str) -> dict:
    """
    Returns exact counts of employees assigned and in each step/state of the appraisal cycle,
    and synchronizes tabAppraisee.custom_appraisal_status in real-time.
    """
    appraisees_count = frappe.db.count("Appraisee", {"parent": cycle_name})
    appraisals = frappe.get_all(
        "Appraisal",
        filters={"appraisal_cycle": cycle_name, "docstatus": ["!=", 2]},
        fields=["name", "employee", "workflow_state"]
    )

    state_counts = {}
    status_by_employee = {}
    for a in appraisals:
        st = a.workflow_state or "Pending"
        state_counts[st] = state_counts.get(st, 0) + 1
        fmt_st = format_appraisal_status(st)
        if a.employee:
            status_by_employee[a.employee] = fmt_st
            frappe.db.sql(
                """
                UPDATE `tabAppraisee`
                SET custom_appraisal_status = %s
                WHERE parent = %s AND employee = %s
                """,
                (fmt_st, cycle_name, a.employee),
            )
    frappe.db.commit()

    # Stage 1: Objectives
    obj_pending = (
        state_counts.get("Pending", 0)
        + state_counts.get("Objective Review Pending", 0)
        + state_counts.get("Objectives Rejected", 0)
    )
    obj_approved = state_counts.get("Objectives Approved", 0)

    # Stage 2: Mid-Term
    mid_pending = (
        state_counts.get("Mid-Term Review Pending", 0)
        + state_counts.get("Mid-Term Rejected", 0)
    )
    mid_completed = state_counts.get("Mid-Term Completed", 0)

    # Stage 3: Annual Review
    annual_pending = (
        state_counts.get("Pending Manager Review", 0)
        + state_counts.get("Appraisal Rejected", 0)
    )
    completed = state_counts.get("Completed", 0)

    # Unstarted (in appraisees list but no appraisal record created yet)
    total_appraisals = len(appraisals)
    not_created = max(0, appraisees_count - total_appraisals)

    return {
        "total": appraisees_count,
        "appraisals_created": total_appraisals,
        "obj_pending": obj_pending + not_created,
        "obj_approved": obj_approved,
        "mid_pending": mid_pending,
        "mid_completed": mid_completed,
        "annual_pending": annual_pending,
        "completed": completed,
        "status_by_employee": status_by_employee,
    }


@frappe.whitelist()
def get_incomplete_appraisals(cycle_name: str) -> list:
    """Returns appraisals in this cycle that are not yet Completed"""
    return frappe.get_all(
        "Appraisal",
        filters={
            "appraisal_cycle": cycle_name,
            "workflow_state": ["!=", "Completed"],
        },
        fields=["name", "employee", "employee_name", "company", "workflow_state"],
        order_by="employee_name asc",
    )


def create_appraisals_for_multicompany_cycle(
    appraisal_cycle: CustomAppraisalCycle, publish_progress: bool = False
):
    """
    Creates appraisals for employees in the appraisee list,
    assigning each appraisal to that employee's specific legal company.
    """
    count = 0
    total = len(appraisal_cycle.appraisees)

    default_template = (
        frappe.db.get_value("Appraisal Template", {"name": "Default Hidden Template"})
        or frappe.db.get_value("Appraisal Template", {}, "name")
    )

    created_employees = []

    for employee in appraisal_cycle.appraisees:
        if not employee.employee:
            continue

        # Check if appraisal already exists for this cycle to avoid duplicate errors
        existing = frappe.db.exists(
            "Appraisal",
            {
                "employee": employee.employee,
                "appraisal_cycle": appraisal_cycle.name,
                "docstatus": ["!=", 2],
            },
        )
        if existing:
            continue

        try:
            # Look up employee's actual legal company
            emp_company = (
                getattr(employee, "custom_company", None)
                or frappe.db.get_value("Employee", employee.employee, "company")
                or appraisal_cycle.company
            )

            template = employee.appraisal_template or default_template
            emp_name = employee.employee_name or frappe.db.get_value("Employee", employee.employee, "employee_name")
            emp_mgr = getattr(employee, "custom_manager", None) or frappe.db.get_value("Employee", employee.employee, "reports_to")

            if getattr(employee, "name", None):
                updates = {}
                if not getattr(employee, "custom_company", None):
                    updates["custom_company"] = emp_company
                if not getattr(employee, "custom_manager", None) and emp_mgr:
                    updates["custom_manager"] = emp_mgr
                if not employee.appraisal_template:
                    updates["appraisal_template"] = template
                if not employee.employee_name and emp_name:
                    updates["employee_name"] = emp_name
                if not getattr(employee, "custom_appraisal_status", None):
                    updates["custom_appraisal_status"] = "Objectives Pending"
                if updates:
                    frappe.db.set_value("Appraisee", employee.name, updates)

            appraisal = frappe.get_doc(
                {
                    "doctype": "Appraisal",
                    "company": emp_company,
                    "appraisal_template": template,
                    "employee": employee.employee,
                    "appraisal_cycle": appraisal_cycle.name,
                }
            )

            appraisal.rate_goals_manually = (
                1 if appraisal_cycle.kra_evaluation_method == "Manual Rating" else 0
            )
            appraisal.set_kras_and_rating_criteria()
            appraisal.flags.ignore_permissions = True
            appraisal.insert(ignore_permissions=True)
            created_employees.append(emp_name or employee.employee)

            if publish_progress:
                count += 1
                frappe.publish_progress(
                    count * 100 / total, title=_("Creating Appraisals") + "..."
                )
        except frappe.DuplicateEntryError:
            # Appraisal already exists for this cycle/period
            pass

    if created_employees and not publish_progress:
        frappe.msgprint(
            _("Appraisal document automatically created for newly added employee: {0}").format(", ".join(created_employees)),
            alert=True,
        )
