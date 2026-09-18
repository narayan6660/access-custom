import frappe
from erpnext.setup.doctype.company.company import Company


class CustomCompany(Company):
    def create_default_cost_center(self):
        # Cost Centers are intentionally not used in this HR/Leave test environment.
        return
    def set_default_accounts(self):
        # Do not automatically populate Company accounting defaults.
        return

    def on_update(self):
        previous_ignore = getattr(
            frappe.local.flags, "ignore_chart_of_accounts", False
        )
        previous_country_change = getattr(
            frappe.flags, "country_change", None
        )

        frappe.local.flags.ignore_chart_of_accounts = True
        frappe.flags.country_change = False

        try:
            super().on_update()
        finally:
            frappe.local.flags.ignore_chart_of_accounts = previous_ignore
            frappe.flags.country_change = previous_country_change
