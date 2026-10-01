# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet


class Department(NestedSet):
	def autoname(self):
		if self.company:
			abbr = frappe.get_cached_value("Company", self.company, "abbr") or self.company
			self.name = f"{self.department_name} - {abbr}"
		else:
			self.name = self.department_name
