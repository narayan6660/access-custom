# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ConsultantContractTermination(Document):
    def validate(self):
        pass

    def on_submit(self):
        if self.contract:
            parent = frappe.get_doc("Consultant Contract", self.contract)
            parent.db_set("status", "Terminated", update_modified=False)
            parent.db_set("workflow_state", "Terminated", update_modified=False)
            frappe.msgprint(
                msg=f"Parent Contract {self.contract} has been marked as TERMINATED.",
                title="Contract Terminated",
                indicator="red"
            )
