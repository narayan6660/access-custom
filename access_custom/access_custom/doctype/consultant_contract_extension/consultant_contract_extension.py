# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_months, getdate

class ConsultantContractExtension(Document):
    def validate(self):
        if self.current_end_date and self.extension_months and not self.revised_end_date:
            self.revised_end_date = add_months(getdate(self.current_end_date), int(self.extension_months))
        
        fee = self.revised_fee or self.current_fee or 0
        if fee and self.extension_months:
            self.total_extension_value = float(fee) * int(self.extension_months)

    def on_submit(self):
        # Update parent contract's end date and log extension
        if self.contract and self.revised_end_date:
            parent = frappe.get_doc("Consultant Contract", self.contract)
            parent.db_set("end_date", self.revised_end_date, update_modified=False)
            parent.db_set("proposed_end_date", self.revised_end_date, update_modified=False)
            if self.revised_fee:
                parent.db_set("proposed_fee", self.revised_fee, update_modified=False)
                parent.db_set("compensation_amount", self.revised_fee, update_modified=False)
            frappe.msgprint(
                msg=f"Parent Contract {self.contract} updated with revised end date: {self.revised_end_date}",
                title="Contract Extended",
                indicator="green"
            )
