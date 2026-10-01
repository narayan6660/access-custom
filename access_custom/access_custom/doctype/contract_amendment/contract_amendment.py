# Copyright (c) 2026, Charan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate, date_diff, today, now_datetime
from dateutil.relativedelta import relativedelta

class ContractAmendment(Document):
	def _validate_links(self):
		self.resolve_requested_by()
		super()._validate_links()

	def validate(self):
		if not self.amendment_date:
			self.amendment_date = today()
		if not self.amendment_effective_date:
			self.amendment_effective_date = self.amendment_date or today()
		if (self.workflow_state == "Executed" or self.docstatus == 1) and not getattr(self, "executed_on", None):
			self.executed_on = now_datetime()
		self.resolve_requested_by()
		self.set_contract_details()
		self.sync_amendment_types()
		self.compute_dynamic_routing()
		self.calculate_new_version()
		self.calculate_totals()
		self.validate_dates()
		self.validate_approvers()
		self.validate_reviewer_comments()

	def resolve_requested_by(self):
		"""Ensure requested_by is a valid Employee ID, not a User email"""
		if not self.requested_by or not frappe.db.exists("Employee", self.requested_by):
			user_to_check = self.requested_by if (self.requested_by and "@" in self.requested_by) else (self.owner or frappe.session.user)
			emp = frappe.db.get_value("Employee", {"user_id": user_to_check}, "name")
			if emp:
				self.requested_by = emp
			elif self.contract:
				self.requested_by = frappe.db.get_value("Test Customer Contract", self.contract, "contract_owner")
			if not self.requested_by:
				first_emp = frappe.db.get_value("Employee", {"status": "Active"}, "name")
				if first_emp:
					self.requested_by = first_emp

	def set_contract_details(self):
		if not self.contract:
			return
		c = frappe.get_doc("Test Customer Contract", self.contract)
		if not self.customer_name:
			self.customer_name = c.customer_name or c.party_name
		if not self.project_title:
			self.project_title = c.project_title
		if not self.current_version:
			self.current_version = c.current_version or "1.0"
		if not self.original_contract_value:
			self.original_contract_value = c.project_budget
		if not self.current_contract_value:
			self.current_contract_value = c.current_contract_value or c.project_budget
		if not self.current_end_date:
			self.current_end_date = c.current_end_date or c.end_date
		if not self.original_start_date and c.start_date:
			self.original_start_date = c.start_date

	def sync_amendment_types(self):
		"""Sync between multi-select table and single select / impact checkboxes"""
		if self.amendment_type and self.amendment_type != "Multiple types":
			self.amendment_types = []
			self.append("amendment_types", {"amendment_type": self.amendment_type})
			type_names = [self.amendment_type]
		else:
			type_names = [row.amendment_type for row in (self.amendment_types or []) if row.amendment_type]
			if not self.amendment_type and type_names:
				self.amendment_type = type_names[0] if len(type_names) == 1 else "Multiple types"

		is_no_cost = any("No Cost" in t or "No-Cost" in t for t in type_names) or (self.amendment_type and ("No Cost" in self.amendment_type or "No-Cost" in self.amendment_type))
		if is_no_cost and self.amendment_type != "Multiple types":
			self.is_no_cost_extension = 1
			self.impact_timeline = 1
			self.has_cost_impact = 0
			self.value_change = 0
			self.impact_value = 0
			self.impact_budget_dist = 0
			self.impact_staffing = 0
			self.impact_fte = 0
			self.impact_scope = 0
			self.impact_services = 0
			self.impact_deliverables = 0
			return

		is_realloc = self.amendment_type == "Budget Reallocation" or (len(type_names) == 1 and type_names[0] == "Budget Reallocation")
		if is_realloc:
			self.is_no_cost_extension = 0
			self.has_cost_impact = 0
			self.value_change = 0
			self.impact_value = 0
			self.impact_budget_dist = 1
			self.impact_timeline = 0
			self.impact_staffing = 0
			self.impact_fte = 0
			self.impact_scope = 0
			self.impact_services = 0
			self.impact_deliverables = 0
			return

		is_resource = self.amendment_type == "Resource Change" or (len(type_names) == 1 and type_names[0] == "Resource Change")
		if is_resource:
			self.is_no_cost_extension = 0
			self.has_cost_impact = 0
			self.value_change = 0
			self.impact_value = 0
			self.impact_budget_dist = 0
			self.impact_timeline = 0
			self.impact_staffing = 1
			self.impact_fte = 1
			self.impact_scope = 0
			self.impact_services = 0
			self.impact_deliverables = 0
			return

		is_scope = self.amendment_type == "Change in Scope / Services" or (len(type_names) == 1 and type_names[0] == "Change in Scope / Services")
		if is_scope:
			self.is_no_cost_extension = 0
			self.has_cost_impact = 0
			self.value_change = 0
			self.impact_value = 0
			self.impact_budget_dist = 0
			self.impact_timeline = 0
			self.impact_staffing = 0
			self.impact_fte = 0
			self.impact_scope = 1
			return

		is_timeline = self.amendment_type == "Timeline / Milestone Change" or (len(type_names) == 1 and type_names[0] == "Timeline / Milestone Change")
		if is_timeline:
			self.is_no_cost_extension = 0
			self.has_cost_impact = 0
			self.value_change = 0
			self.impact_value = 0
			self.impact_budget_dist = 0
			self.impact_timeline = 1
			self.impact_staffing = 0
			self.impact_fte = 0
			self.impact_scope = 0
			return

		# Generic / Multiple types:
		if any(t in ["Change in Scope / Services", "Scope Change", "Service Addition", "Service Removal", "Deliverable Change", "Scope Amendment"] for t in type_names):
			self.impact_scope = 1

		if "Budget Reallocation" in type_names:
			self.impact_budget_dist = 1

		if any(t in ["Cost / Contract Value Change", "Payment / Commercial Terms Change", "Cost Extension / Budget Increase", "Contract Value Increase", "Contract Value Reduction", "Rate Change", "Currency Change"] for t in type_names):
			self.has_cost_impact = 1
			self.impact_value = 1

		if any(t in ["Resource Change", "Staffing Change", "FTE Change", "Role Change", "Personnel Cost Change", "Rate Revision / Key Personnel", "Consultant Change"] for t in type_names):
			self.impact_staffing = 1
			self.impact_fte = 1

		if any(t in ["Timeline / Milestone Change", "Revised Milestone Dates"] for t in type_names):
			self.impact_timeline = 1

	def calculate_new_version(self):
		if not self.contract:
			return
		curr_ver = self.current_version or "1.0"
		if not self.new_version:
			try:
				parts = curr_ver.split(".")
				major = int(parts[0])
				minor = int(parts[1]) if len(parts) > 1 else 0
				self.new_version = f"{major}.{minor + 1}"
			except Exception:
				self.new_version = "1.1"

	def calculate_totals(self):
		# Calculate financial impact if has_cost_impact
		base_val = flt(self.current_contract_value) or flt(self.original_contract_value)
		if self.is_no_cost_extension or not self.has_cost_impact:
			self.value_change = 0
			self.revised_contract_value = base_val
			self.percentage_change = 0
		else:
			if self.revised_contract_value and not self.value_change:
				self.value_change = flt(self.revised_contract_value) - base_val
			elif self.value_change:
				self.revised_contract_value = base_val + flt(self.value_change)
			else:
				self.revised_contract_value = base_val

			if base_val > 0:
				self.percentage_change = flt((flt(self.value_change) / base_val) * 100, 2)
			else:
				self.percentage_change = 0

		# Calculate extension days
		if (self.is_no_cost_extension or self.impact_timeline) and self.revised_end_date and self.current_end_date:
			self.extension_days = date_diff(self.revised_end_date, self.current_end_date)

		# Calculate budget reallocation row variances
		orig_realloc_total = 0
		rev_realloc_total = 0
		for row in (self.budget_reallocations or []):
			row.variance = flt(row.revised_amount) - flt(row.original_amount)
			orig_realloc_total += flt(row.original_amount)
			rev_realloc_total += flt(row.revised_amount)

		if self.budget_reallocations and len(self.budget_reallocations) > 0:
			self.impact_budget_dist = 1

		# Calculate resource change FTE & cost impacts
		for row in (self.resource_changes or []):
			row.fte_change = flt(row.revised_fte) - flt(row.existing_fte)
			if row.monthly_rate:
				row.cost_impact = row.fte_change * flt(row.monthly_rate)

	def validate_dates(self):
		if (self.is_no_cost_extension or self.impact_timeline) and self.revised_end_date and self.current_end_date:
			if getdate(self.revised_end_date) <= getdate(self.current_end_date):
				frappe.throw("Revised Contract End Date must be after the Current End Date for an extension.")

	def validate_approvers(self):
		"""Validate approvers matching the Slide Approval Table exactly"""
		if not self.lead_approver:
			frappe.throw("Level 1 Lead Approver is required.")

		if self.requires_legal and not self.legal_approver:
			frappe.throw("Level 2.1 Legal Approver is required for the selected Amendment Type(s).")
		elif not self.requires_legal:
			self.legal_approver = None
			self.legal_approver_status = "Not Required"

		if self.requires_finance and not self.finance_approver:
			frappe.throw("Level 2.2 Finance Approver is required for the selected Amendment Type(s).")
		elif not self.requires_finance:
			self.finance_approver = None
			self.finance_approver_status = "Not Required"

		if self.requires_hr and not self.hr_approver:
			frappe.throw("Level 2.3 HR Approver is required because Resource / Staffing changes are selected.")
		elif not self.requires_hr:
			self.hr_approver = None
			self.hr_approver_status = "Not Required"

		if not self.ceo_approver:
			frappe.throw("Level 3 CEO Approver is required.")

	def validate_reviewer_comments(self):
		"""Ensure reviewer comments are provided on reject or return for revision"""
		state = self.workflow_state or ""
		if "Rejected" in state or "Returned" in state:
			comments = (
				(self.lead_approver_review or "").strip() or
				(self.legal_approver_review or "").strip() or
				(self.finance_approver_review or "").strip() or
				(self.hr_approver_review or "").strip() or
				(self.ceo_approver_review or "").strip()
			)
			if not comments:
				frappe.throw("Reviewer comments are mandatory when rejecting or returning an amendment for revision.")

	# -------------------------------------------------------------
	# DYNAMIC APPROVAL MATRIX LOGIC (Matching Image 1 Slide Table)
	# -------------------------------------------------------------
	def get_selected_type_names(self):
		names = set([row.amendment_type for row in (self.amendment_types or []) if row.amendment_type])
		if self.amendment_type and self.amendment_type != "Multiple types":
			names.add(self.amendment_type)
		return list(names)

	@property
	def has_scope_impact(self):
		types = self.get_selected_type_names()
		scope_triggers = [
			"Change in Scope / Services", "Scope Change", "Service Addition",
			"Service Removal", "Deliverable Change", "Milestone Change",
			"Geographic/Location Change", "Beneficiary/Target Change", "Scope Amendment"
		]
		return bool(self.impact_scope or self.impact_services or self.impact_deliverables or any(t in types for t in scope_triggers))

	@property
	def has_financial_impact(self):
		types = self.get_selected_type_names()
		finance_triggers = [
			"Budget Reallocation", "Cost / Contract Value Change", "Payment / Commercial Terms Change",
			"Cost Extension / Budget Increase", "Contract Value Increase", "Contract Value Reduction",
			"Cost Category Change", "Payment Schedule Change", "Rate Change", "Currency Change"
		]
		return bool(self.has_cost_impact or self.impact_value or self.impact_budget_dist or (self.budget_reallocations and len(self.budget_reallocations) > 0) or any(t in types for t in finance_triggers))

	@property
	def has_resource_impact(self):
		types = self.get_selected_type_names()
		hr_triggers = [
			"Resource Change", "Staffing Change", "FTE Change", "Role Change",
			"Personnel Cost Change", "Consultant Change", "Rate Revision / Key Personnel"
		]
		return bool(self.impact_staffing or self.impact_fte or (self.resource_changes and len(self.resource_changes) > 0) or any(t in types for t in hr_triggers))

	@property
	def has_time_impact(self):
		types = self.get_selected_type_names()
		time_triggers = [
			"Contract Extension – No Cost", "No-Cost Extension", "Timeline / Milestone Change",
			"Contract Extension", "Contract Reduction", "Suspension", "Revised Milestone Dates"
		]
		return bool(self.is_no_cost_extension or self.impact_timeline or any(t in types for t in time_triggers))

	def compute_dynamic_routing(self):
		"""
		Image 1 Exact Table:
		- Change in Scope / Services -> TL + Legal + CEO
		- Budget Reallocation -> TL + Finance + CEO
		- Cost / Contract Value Change -> TL + Finance + Legal + CEO
		- Resource Change -> TL + HR + Finance + CEO
		- Contract Extension - No Cost -> TL + Legal + CEO
		- Timeline / Milestone Change -> TL + Legal + CEO
		- Payment / Commercial Terms Change -> TL + Finance + Legal + CEO
		- Multiple types -> TL + Legal + Finance + HR + CEO
		"""
		types = self.get_selected_type_names()
		single_type = self.amendment_type if (self.amendment_type and self.amendment_type != "Multiple types") else None

		# 1. Budget Reallocation -> Strictly Team Lead + Finance + CEO (Legal & HR bypassed)
		if single_type == "Budget Reallocation" or (not single_type and len(types) == 1 and types[0] == "Budget Reallocation"):
			self.is_multiple_types = 0
			self.requires_legal = 0
			self.requires_finance = 1
			self.requires_hr = 0
			self.legal_approver = None
			self.legal_approver_status = "Not Required"
			self.hr_approver = None
			self.hr_approver_status = "Not Required"
			return

		# 2. Resource Change -> Strictly Team Lead + HR + Finance + CEO (Legal bypassed)
		if single_type == "Resource Change" or (not single_type and len(types) == 1 and types[0] == "Resource Change"):
			self.is_multiple_types = 0
			self.requires_legal = 0
			self.requires_finance = 1
			self.requires_hr = 1
			self.legal_approver = None
			self.legal_approver_status = "Not Required"
			return

		# 3. Contract Extension - No Cost -> Strictly Team Lead + Legal + CEO (Finance & HR bypassed)
		if (single_type and any(k in single_type for k in ["No Cost", "No-Cost"])) or (not single_type and len(types) == 1 and any("No Cost" in t or "No-Cost" in t for t in types)):
			self.is_multiple_types = 0
			self.requires_legal = 1
			self.requires_finance = 0
			self.requires_hr = 0
			self.finance_approver = None
			self.finance_approver_status = "Not Required"
			self.hr_approver = None
			self.hr_approver_status = "Not Required"
			return

		# 4. Change in Scope / Services -> Strictly Team Lead + Legal + CEO (Finance & HR bypassed)
		if single_type == "Change in Scope / Services" or (not single_type and len(types) == 1 and types[0] == "Change in Scope / Services"):
			self.is_multiple_types = 0
			self.requires_legal = 1
			self.requires_finance = 0
			self.requires_hr = 0
			self.finance_approver = None
			self.finance_approver_status = "Not Required"
			self.hr_approver = None
			self.hr_approver_status = "Not Required"
			return

		# 5. Timeline / Milestone Change -> Strictly Team Lead + Legal + CEO (Finance & HR bypassed)
		if single_type == "Timeline / Milestone Change" or (not single_type and len(types) == 1 and types[0] == "Timeline / Milestone Change"):
			self.is_multiple_types = 0
			self.requires_legal = 1
			self.requires_finance = 0
			self.requires_hr = 0
			self.finance_approver = None
			self.finance_approver_status = "Not Required"
			self.hr_approver = None
			self.hr_approver_status = "Not Required"
			return

		# 6. Cost / Contract Value Change & Payment / Commercial Terms Change -> Strictly Team Lead + Legal + Finance + CEO (HR bypassed)
		if single_type in ["Cost / Contract Value Change", "Payment / Commercial Terms Change"] or (not single_type and len(types) == 1 and types[0] in ["Cost / Contract Value Change", "Payment / Commercial Terms Change"]):
			self.is_multiple_types = 0
			self.requires_legal = 1
			self.requires_finance = 1
			self.requires_hr = 0
			self.hr_approver = None
			self.hr_approver_status = "Not Required"
			return

		# 7. Multiple types or fallback
		self.is_multiple_types = 1
		self.requires_legal = 1
		self.requires_finance = 1
		self.requires_hr = 1

	def on_update(self):
		state = self.workflow_state or ""
		if (state == "Executed" or self.docstatus == 1) and not getattr(self, "executed_on", None):
			self.executed_on = now_datetime()
			frappe.db.set_value(self.doctype, self.name, "executed_on", self.executed_on, update_modified=False)
		self.sync_contract_status()

	def sync_contract_status(self):
		if not self.contract:
			return

		state = self.workflow_state or ""
		if state not in ["Draft", "Executed", "Rejected", "Cancelled"]:
			current_state = frappe.db.get_value("Test Customer Contract", self.contract, "workflow_state")
			if current_state not in ["Active/Amendment Initiated"]:
				frappe.db.set_value("Test Customer Contract", self.contract, {
					"workflow_state": "Active/Amendment Initiated"
				}, update_modified=False)
		elif state in ["Executed"]:
			frappe.db.set_value("Test Customer Contract", self.contract, {
				"workflow_state": "Commenced",
				"contract_status": "Commenced"
			}, update_modified=False)
		elif state in ["Rejected", "Cancelled"]:
			other_active = frappe.db.exists("Contract Amendment", {
				"contract": self.contract,
				"name": ["!=", self.name],
				"workflow_state": ["not in", ["Draft", "Executed", "Rejected", "Cancelled"]],
				"docstatus": 0
			})
			if not other_active:
				current_c_state = frappe.db.get_value("Test Customer Contract", self.contract, "workflow_state")
				if current_c_state == "Active/Amendment Initiated":
					frappe.db.set_value("Test Customer Contract", self.contract, {
						"workflow_state": "Commenced",
						"contract_status": "Commenced"
					}, update_modified=False)

	# -------------------------------------------------------------
	# SUBMIT & EXECUTE
	# -------------------------------------------------------------
	def on_submit(self):
		self.apply_amendment_to_contract()

	def apply_amendment_to_contract(self):
		if not self.contract:
			return

		contract_doc = frappe.get_doc("Test Customer Contract", self.contract)
		
		# 1. Update Version
		contract_doc.current_version = self.new_version
		contract_doc.workflow_state = "Commenced"
		contract_doc.contract_status = "Commenced"
		
		# 2. Update End Date if Extended
		if self.revised_end_date:
			contract_doc.current_end_date = self.revised_end_date
			contract_doc.contract_end_date = self.revised_end_date
			
		# 3. Update Financial Value if Changed
		if self.has_cost_impact and self.revised_contract_value:
			contract_doc.current_contract_value = self.revised_contract_value
			
		# 4. Save and add Comment to Contract
		contract_doc.flags.ignore_permissions = True
		contract_doc.flags.ignore_validate_update_after_submit = True
		contract_doc.save(ignore_permissions=True)
		
		contract_doc.add_comment(
			"Comment",
			f"Contract Amendment {self.name} ({self.amendment_type}) executed successfully. Version updated to {self.new_version}."
		)
