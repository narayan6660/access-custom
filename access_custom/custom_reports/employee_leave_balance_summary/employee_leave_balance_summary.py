# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from hrms.hr.doctype.leave_application.leave_application import get_leave_details


def execute(filters=None):
	filters = frappe._dict(filters or {})

	leave_types = get_relevant_leave_types(filters)
	columns = get_columns(leave_types)
	data = get_data(filters, leave_types)

	return columns, data


def get_relevant_leave_types(filters):
	company = filters.get("company")
	if company:
		# 1. Fetch leave types that are actually allocated in this company
		types = frappe.db.sql_list(
			"""
			SELECT DISTINCT leave_type 
			FROM `tabLeave Allocation` 
			WHERE company = %s AND docstatus = 1
			ORDER BY leave_type ASC
			""",
			(company,)
		)
		if types:
			return types

		# 2. Check Ledger entries if no allocation found
		ledger_types = frappe.db.sql_list(
			"""
			SELECT DISTINCT leave_type 
			FROM `tabLeave Ledger Entry` 
			WHERE company = %s AND docstatus = 1
			ORDER BY leave_type ASC
			""",
			(company,)
		)
		if ledger_types:
			return ledger_types

	# Fallback: All leave types
	return frappe.db.sql_list("select name from `tabLeave Type` order by name asc")


def get_columns(leave_types):
	columns = [
		{
			"label": _("Employee"),
			"fieldname": "employee",
			"fieldtype": "Link",
			"options": "Employee",
			"width": 140,
		},
		{
			"label": _("Employee Name"),
			"fieldname": "employee_name",
			"fieldtype": "Data",
			"width": 220,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 180,
		},
		{
			"label": _("Department"),
			"fieldname": "department",
			"fieldtype": "Link",
			"options": "Department",
			"width": 150,
		},
	]

	for leave_type in leave_types:
		columns.append({
			"label": _(leave_type),
			"fieldname": frappe.scrub(leave_type),
			"fieldtype": "Float",
			"width": 135,
		})

	columns.append({
		"label": _("Total Available"),
		"fieldname": "total_available",
		"fieldtype": "Float",
		"width": 130,
	})

	return columns


def get_conditions(filters):
	conditions = {}
	if filters.get("company"):
		conditions["company"] = filters.company
	if filters.get("employee_status"):
		conditions["status"] = filters.employee_status
	if filters.get("department"):
		conditions["department"] = filters.department
	if filters.get("employee"):
		conditions["name"] = filters.employee

	return conditions


def get_data(filters, leave_types):
	conditions = get_conditions(filters)

	active_employees = frappe.get_list(
		"Employee",
		filters=conditions,
		fields=["name", "employee_name", "department", "company"],
		order_by="employee_name asc",
	)

	as_of_date = filters.get("date") or frappe.utils.nowdate()
	data = []

	for employee in active_employees:
		row = {
			"employee": employee.name,
			"employee_name": employee.employee_name,
			"company": employee.company,
			"department": employee.department,
		}
		available_leave = get_leave_details(employee.name, as_of_date)
		allocations = available_leave.get("leave_allocation", {})

		total_remaining = 0.0

		for leave_type in leave_types:
			field = frappe.scrub(leave_type)
			remaining = 0.0
			if leave_type in allocations:
				remaining = allocations[leave_type].get("remaining_leaves", 0.0)

			row[field] = remaining
			total_remaining += remaining

		row["total_available"] = total_remaining
		data.append(row)

	return data
