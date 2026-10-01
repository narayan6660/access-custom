# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ConsultantContractAmendment(Document):
    def validate(self):
        curr = float(self.current_contract_value or 0)
        rev = float(self.revised_contract_value or 0)
        if rev > 0:
            self.impact_on_value = rev - curr

    def on_submit(self):
        if self.contract and self.revised_contract_value:
            parent = frappe.get_doc("Consultant Contract", self.contract)
            parent.db_set("total_contract_value", self.revised_contract_value, update_modified=False)
            frappe.msgprint(
                msg=f"Parent Contract {self.contract} value updated to: {self.revised_contract_value}",
                title="Contract Amended",
                indicator="green"
            )
