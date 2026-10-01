import frappe
from frappe.model.document import Document

class TestCustomerContract(Document):
	def validate(self):
		wf_state = getattr(self, 'workflow_state', None)
		if wf_state:
			self.status = wf_state
			if wf_state == "Commenced":
				self.contract_status = "Commenced"
				if not getattr(self, "upload_signed_document", None):
					frappe.throw(
						frappe._("Please upload the 'Complete Counter Signed Contract' document before commencing the contract."),
						title=frappe._("Document Required")
					)
				if not getattr(self, "commenced_on", None):
					self.commenced_on = frappe.utils.now_datetime()
			elif wf_state == "In Progress":
				self.contract_status = "In Progress"
			elif wf_state == "Draft":
				self.contract_status = "Draft"
			elif "Pending" in wf_state:
				self.contract_status = "Pending Approval"
			elif wf_state in ["On Hold", "Terminated", "Closed"]:
				self.contract_status = wf_state
		elif getattr(self, 'contract_status', None):
			self.status = self.contract_status

		if not getattr(self, "current_version", None):
			self.current_version = '1.0'
		if (getattr(self, "current_contract_value", None) is None or self.current_contract_value == 0) and getattr(self, "project_budget", None):
			self.current_contract_value = self.project_budget
		if not getattr(self, "current_end_date", None) and getattr(self, "end_date", None):
			self.current_end_date = self.end_date

		# Strict File Format Validation
		file_rules = [
			("customer_document", "Contract/MOU Provided by Customer", [".pdf"], "PDF (.pdf)"),
			("upload_signed_document", "Complete Counter Signed Contract", [".pdf"], "PDF (.pdf)"),
			("project__proposal", "Project Proposal", [".pdf"], "PDF (.pdf)"),
			("budget_agreed_with_customer", "Budget Agreed with Customer", [".pdf", ".xls", ".xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)"),
			("proposal_budget", "Proposal Budget", [".pdf", ".xls", ".xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)"),
			("hold_supporting_document", "Hold Supporting Document", [".pdf"], "PDF (.pdf)"),
			("termination_supporting_document", "Termination Supporting Document", [".pdf"], "PDF (.pdf)")
		]

		for fn, label, allowed_exts, allowed_label in file_rules:
			val = getattr(self, fn, None)
			if val:
				clean_val = val.split("?")[0].split("#")[0].lower().strip()
				if not any(clean_val.endswith(ext) for ext in allowed_exts):
					frappe.throw(
						frappe._("<b>{0}</b> only accepts <b>{1}</b> files. Please upload a valid document.").format(label, allowed_label),
						title=frappe._("Invalid Document Format")
					)

		# Complete Counter Signed Contract Validation:
		# 1. Can only be uploaded once CEO approval is completed.
		# 2. Can only be uploaded by the Contract Manager.
		# 3. Once Commenced, contract and signed document cannot be modified.
		old_doc = self.get_doc_before_save()
		if not old_doc and not self.is_new() and getattr(self, "name", None) and frappe.db.exists(self.doctype, self.name):
			old_doc = frappe.db.get_value(self.doctype, self.name, ["workflow_state", "docstatus", "upload_signed_document"], as_dict=True)

		old_signed = old_doc.get("upload_signed_document") if isinstance(old_doc, dict) else (getattr(old_doc, "upload_signed_document", None) if old_doc else None)
		old_wf_state = old_doc.get("workflow_state") if isinstance(old_doc, dict) else (getattr(old_doc, "workflow_state", None) if old_doc else None)
		old_docstatus = old_doc.get("docstatus") if isinstance(old_doc, dict) else (getattr(old_doc, "docstatus", None) if old_doc else 0)

		signed_doc_changed = not old_doc or (getattr(self, "upload_signed_document", None) != old_signed)

		if old_doc and old_wf_state == "Commenced" and old_docstatus == 1:
			if signed_doc_changed and getattr(self, "upload_signed_document", None) != old_signed:
				frappe.throw(
					frappe._("Cannot modify the Complete Counter Signed Contract once the contract has Commenced."),
					title=frappe._("Contract Locked")
				)

		if signed_doc_changed and getattr(self, "upload_signed_document", None):
			# Rule 1: Must be after CEO approval
			ceo_status = getattr(self, "ceo_approver_status", None) or ""
			is_ceo_approved = (
				wf_state in ["In Progress", "Commenced", "Active/Amendment Initiated", "On Hold", "Terminated", "Closed"] or
				"Approved" in str(ceo_status)
			)
			if not is_ceo_approved:
				frappe.throw(
					frappe._("<b>Complete Counter Signed Contract</b> can only be uploaded once CEO approval is completed."),
					title=frappe._("Action Not Allowed")
				)

			# Rule 2: Must be uploaded only by Contract Manager (or Admin/Contract Owner)
			user = frappe.session.user
			roles = frappe.get_roles(user)
			is_contract_manager = (
				"Contract Manager" in roles or
				"System Manager" in roles or
				user == "Administrator" or
				(getattr(self, "owner", None) and user == self.owner)
			)
			if not is_contract_manager and getattr(self, "contract_owner", None):
				emp_user = frappe.db.get_value("Employee", self.contract_owner, "user_id")
				if emp_user and user == emp_user:
					is_contract_manager = True

			if not is_contract_manager:
				frappe.throw(
					frappe._("Only the <b>Contract Manager</b> is authorized to upload the Complete Counter Signed Contract."),
					title=frappe._("Not Authorized")
				)

@frappe.whitelist()
def get_contract_version_tree(contract_name):
	if not contract_name:
		return None

	master = frappe.db.get_value(
		"Test Customer Contract",
		contract_name,
		[
			"name", "contract_status", "workflow_state", "creation",
			"project_currency", "project_budget", "start_date", "end_date"
		],
		as_dict=True
	)
	if not master:
		return None

	# Alias project_budget as original_contract_value for UI compatibility
	master["original_contract_value"] = master.get("project_budget") or 0

	amendments = frappe.get_all(
		"Contract Amendment",
		filters={"contract": contract_name},
		fields=[
			"name", "customer_amendment_number", "amendment_type",
			"workflow_state", "amendment_date", "amendment_reason",
			"scope_description", "revised_contract_value", "revised_end_date",
			"creation"
		],
		order_by="creation asc"
	)

	return {
		"master": master,
		"amendments": amendments
	}
