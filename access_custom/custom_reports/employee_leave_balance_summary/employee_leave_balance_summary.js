// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Employee Leave Balance Summary"] = {
	filters: [
		{
			fieldname: "date",
			label: __("Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.now_date(),
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company") || frappe.defaults.get_default("company"),
			on_change: function () {
				frappe.query_report.refresh();
			},
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
			get_query: () => {
				var company = frappe.query_report.get_filter_value("company");
				return {
					filters: {
						company: company,
					},
				};
			},
		},
		{
			fieldname: "department",
			label: __("Department"),
			fieldtype: "Link",
			options: "Department",
		},
		{
			fieldname: "employee_status",
			label: __("Employee Status"),
			fieldtype: "Select",
			options: [
				"",
				{ value: "Active", label: __("Active") },
				{ value: "Inactive", label: __("Inactive") },
				{ value: "Suspended", label: __("Suspended") },
				{ value: "Left", label: __("Left", null, "Employee") },
			],
			default: "Active",
		},
	],

	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname === "employee_name" && data && data.employee) {
			value = `
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
					<span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.employee_name || data.employee}</span>
					<button type="button" class="btn btn-xs btn-default btn-view-statement" 
						data-emp="${data.employee}" 
						data-emp-name="${data.employee_name || data.employee}"
						style="padding: 1px 7px; font-size: 10px; font-weight: 600; border-radius: 4px; color: #2563eb; border-color: #bfdbfe; background: #eff6ff; white-space: nowrap; flex-shrink: 0;">
						📊 Statement
					</button>
				</div>
			`;
		}

		if (column.fieldname === "total_available" && data) {
			let val = flt(data.total_available);
			let color = val > 0 ? "#16a34a" : (val < 0 ? "#dc2626" : "#64748b");
			let bg = val > 0 ? "#f0fdf4" : (val < 0 ? "#fef2f2" : "#f8fafc");
			value = `<span style="display: inline-block; padding: 2px 8px; font-weight: 700; border-radius: 4px; color: ${color}; background-color: ${bg}; font-size: 11.5px;">${val} Days</span>`;
		}

		return value;
	},

	onload: function (report) {
		// Widen Company filter box so full company names fit without cut-off
		const widen_company_box = () => {
			let comp = report.page.fields_dict && report.page.fields_dict["company"];
			if (comp && comp.$wrapper) {
				comp.$wrapper.removeClass("col-md-2").css({
					"min-width": "320px",
					"max-width": "420px",
					"flex": "2"
				});
				comp.$input && comp.$input.css({
					"font-size": "12px",
					"font-weight": "500"
				});
			}
		};

		widen_company_box();
		setTimeout(widen_company_box, 100);
		setTimeout(widen_company_box, 300);
		setTimeout(widen_company_box, 600);

		// Event delegation for Statement click
		report.page.wrapper.off("click.view_statement").on("click.view_statement", ".btn-view-statement", function (e) {
			e.preventDefault();
			e.stopPropagation();

			let emp = $(this).attr("data-emp");
			if (!emp) return;

			show_employee_leave_statement_dialog(emp);
		});
	},
};

function show_employee_leave_statement_dialog(employee) {
	frappe.call({
		method: "access_custom.leave_dashboard.get_employee_leave_statement",
		args: { employee: employee },
		freeze: true,
		freeze_message: __("Loading Leave Statement..."),
		callback: function (r) {
			if (!r.message) {
				frappe.msgprint(__("No statement found for this employee."));
				return;
			}

			let d = r.message;
			let rows_html = "";

			if (d.statement && d.statement.length) {
				rows_html = d.statement.map(s => `
					<tr style="border-bottom: 1px solid #e2e8f0;">
						<td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">${s.leave_type}</td>
						<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #64748b;">${s.opening_balance.toFixed(2)}</td>
						<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #16a34a; font-weight: 600;">+${s.leaves_allocated.toFixed(2)}</td>
						<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #dc2626; font-weight: 600;">−${s.leaves_taken.toFixed(2)}</td>
						<td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 700; color: ${s.closing_balance > 0 ? '#16a34a' : (s.closing_balance < 0 ? '#dc2626' : '#64748b')}; font-size: 12.5px;">
							${s.closing_balance.toFixed(2)}
						</td>
					</tr>
				`).join("");
			} else {
				rows_html = `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #94a3b8;">No leave allocations found for this year.</td></tr>`;
			}

			let apps_html = "";
			if (d.applications && d.applications.length) {
				apps_html = d.applications.map(a => {
					let badge_color = a.status === 'Approved' ? 'green' : (a.status === 'Rejected' ? 'red' : 'orange');
					return `
						<tr style="border-bottom: 1px solid #f1f5f9; font-size: 11px;">
							<td style="padding: 6px 8px; font-weight: 500;">
								<a href="/app/leave-application/${a.name}" target="_blank" style="color: #2563eb; text-decoration: underline;">${a.name}</a>
							</td>
							<td style="padding: 6px 8px;">${a.leave_type}</td>
							<td style="padding: 6px 8px;">${a.from_date} to ${a.to_date}</td>
							<td style="padding: 6px 8px; font-weight: 600; text-align: right;">${a.total_leave_days} d</td>
							<td style="padding: 6px 8px; text-align: center;">
								<span class="indicator-pill ${badge_color}">${a.status}</span>
							</td>
						</tr>
					`;
				}).join("");
			} else {
				apps_html = `<tr><td colspan="5" style="text-align: center; padding: 10px; color: #94a3b8; font-size: 11px;">No recent leave applications.</td></tr>`;
			}

			let body_html = `
				<div style="font-family: inherit; color: #1e293b;">
					<!-- Employee Header Card -->
					<div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 14px;">
						<div style="display: flex; justify-content: space-between; align-items: center;">
							<div>
								<h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">${d.employee_name}</h4>
								<div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
									<span style="font-family: monospace; font-weight: 600;">${d.employee}</span> • ${d.designation || 'Staff'} • ${d.department || '-'}
								</div>
								<div style="font-size: 11px; color: #64748b; margin-top: 1px;">
									<b>Company:</b> ${d.company}
								</div>
							</div>
							<div style="text-align: right;">
								<div style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">Net Total Balance</div>
								<div style="font-size: 22px; font-weight: 800; color: ${d.totals.closing > 0 ? '#16a34a' : '#64748b'}; line-height: 1.1; margin-top: 2px;">
									${d.totals.closing.toFixed(2)} <span style="font-size: 12px; font-weight: 500;">Days</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Section 1: Leave Audit Statement Table -->
					<div style="margin-bottom: 14px;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
							<div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">
								📊 2026 Leave Statement (Opening + Allocated − Taken = Closing)
							</div>
						</div>
						<div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
							<table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
								<thead>
									<tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 11px; text-transform: uppercase;">
										<th style="padding: 7px 10px; text-align: left;">Leave Type</th>
										<th style="padding: 7px 10px; text-align: right;">Opening</th>
										<th style="padding: 7px 10px; text-align: right; color: #16a34a;">+ Allocated</th>
										<th style="padding: 7px 10px; text-align: right; color: #dc2626;">− Taken</th>
										<th style="padding: 7px 10px; text-align: right; font-weight: 700;">= Closing Balance</th>
									</tr>
								</thead>
								<tbody>
									${rows_html}
								</tbody>
								<tfoot>
									<tr style="background: #f8fafc; border-top: 2px solid #e2e8f0; font-weight: 700; font-size: 11.5px;">
										<td style="padding: 8px 10px; color: #334155;">TOTALS</td>
										<td style="padding: 8px 10px; text-align: right; font-family: monospace;">${d.totals.opening.toFixed(2)}</td>
										<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #16a34a;">+${d.totals.allocated.toFixed(2)}</td>
										<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #dc2626;">−${d.totals.taken.toFixed(2)}</td>
										<td style="padding: 8px 10px; text-align: right; font-family: monospace; color: ${d.totals.closing > 0 ? '#16a34a' : '#64748b'}; font-size: 13px;">
											${d.totals.closing.toFixed(2)}
										</td>
									</tr>
								</tfoot>
							</table>
						</div>
					</div>

					<!-- Section 2: Recent Leave Applications -->
					<div>
						<div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 6px;">
							📝 Recent Leave Applications & Approvals
						</div>
						<div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; max-height: 160px; overflow-y: auto;">
							<table style="width: 100%; border-collapse: collapse;">
								<thead>
									<tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 10px; text-transform: uppercase;">
										<th style="padding: 5px 8px; text-align: left;">Application #</th>
										<th style="padding: 5px 8px; text-align: left;">Leave Type</th>
										<th style="padding: 5px 8px; text-align: left;">Dates</th>
										<th style="padding: 5px 8px; text-align: right;">Days</th>
										<th style="padding: 5px 8px; text-align: center;">Status</th>
									</tr>
								</thead>
								<tbody>
									${apps_html}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			`;

			let dialog = new frappe.ui.Dialog({
				title: __("{0} — Leave Statement", [d.employee_name]),
				size: "large",
				primary_action_label: __("View in Leave Ledger"),
				primary_action: function () {
					dialog.hide();
					frappe.route_options = {
						employee: d.employee,
						company: d.company,
						from_date: frappe.datetime.year_start(),
						to_date: frappe.datetime.year_end()
					};
					frappe.set_route("query-report", "Leave Ledger");
				},
				secondary_action_label: __("Close"),
				secondary_action: function () {
					dialog.hide();
				},
			});

			dialog.$body.html(body_html);
			dialog.show();
		},
	});
}
