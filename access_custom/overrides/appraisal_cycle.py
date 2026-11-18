import frappe
from frappe import _
from hrms.hr.doctype.appraisal_cycle.appraisal_cycle import (
    AppraisalCycle,
)


class CustomAppraisalCycle(AppraisalCycle):
    def validate(self):
        super().validate()
        # Keep primary company synchronized with the first applicable company if available
        if hasattr(self, "custom_applicable_companies") and self.custom_applicable_companies:
            first_comp = self.custom_applicable_companies[0].company
            if first_comp and not self.company:
                self.company = first_comp

    def get_employees_for_appraisal(self):
        """Pull employees based on filters across all selected applicable companies"""
        companies = []
        if hasattr(self, "custom_applicable_companies") and self.custom_applicable_companies:
            companies = [d.company for d in self.custom_applicable_companies if d.company]

        if not companies and self.company:
            companies = [self.company]

        filters = {
            "status": "Active",
        }
        if len(companies) == 1:
            filters["company"] = companies[0]
        elif len(companies) > 1:
            filters["company"] = ["in", companies]

        if self.department:
            filters["department"] = self.department
        if self.branch:
            filters["branch"] = self.branch
        if self.designation:
            filters["designation"] = self.designation
        if hasattr(self, "custom_grade") and self.custom_grade:
            filters["grade"] = self.custom_grade

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
            ],
            order_by="company, employee_name",
        )

        return employees

    def set_employees(self):
        """Pull employees in appraisee list based on selected filters across companies"""
        employees = self.get_employees_for_appraisal()
        appraisal_templates = self.get_appraisal_template_map()

        if employees:
            self.set("appraisees", [])
            template_missing = False

            for data in employees:
                template = appraisal_templates.get(data.designation)
                if not template:
                    template_missing = True

                self.append(
                    "appraisees",
                    {
                        "employee": data.name,
                        "employee_name": data.employee_name,
                        "custom_company": data.company,
                        "branch": data.branch,
                        "designation": data.designation,
                        "department": data.department,
                        "appraisal_template": template,
                    },
                )

            if template_missing:
                self.show_missing_template_message()

    @frappe.whitelist()
    def create_appraisals(self):
        self.check_permission("write")
        if not self.appraisees:
            frappe.throw(
                _("Please select employees to create appraisals for"),
                title=_("No Employees Selected"),
            )

        if not all(appraisee.appraisal_template for appraisee in self.appraisees):
            self.show_missing_template_message(raise_exception=True)

        # Create appraisals setting each employee's legal company
        create_appraisals_for_multicompany_cycle(self, publish_progress=True)
        self.reload()


def create_appraisals_for_multicompany_cycle(
    appraisal_cycle: CustomAppraisalCycle, publish_progress: bool = False
):
    """
    Creates appraisals for employees in the appraisee list,
    assigning each appraisal to that employee's specific legal company.
    """
    count = 0
    total = len(appraisal_cycle.appraisees)

    for employee in appraisal_cycle.appraisees:
        try:
            # Look up employee's actual legal company
            emp_company = (
                getattr(employee, "custom_company", None)
                or frappe.db.get_value("Employee", employee.employee, "company")
                or appraisal_cycle.company
            )

            appraisal = frappe.get_doc(
                {
                    "doctype": "Appraisal",
                    "company": emp_company,
                    "appraisal_template": employee.appraisal_template,
                    "employee": employee.employee,
                    "appraisal_cycle": appraisal_cycle.name,
                }
            )

            appraisal.rate_goals_manually = (
                1 if appraisal_cycle.kra_evaluation_method == "Manual Rating" else 0
            )
            appraisal.set_kras_and_rating_criteria()
            appraisal.insert()

            if publish_progress:
                count += 1
                frappe.publish_progress(
                    count * 100 / total, title=_("Creating Appraisals") + "..."
                )
        except frappe.DuplicateEntryError:
            # Appraisal already exists for this cycle/period
            pass
