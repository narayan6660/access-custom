// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employment Contract", {
    onload(frm) {
        inject_employment_contract_styles();
        setup_leadership_queries(frm);

        if (frm.is_new() && (!frm.doc.request_id || frm.doc.request_id.startsWith("EC-") || frm.doc.request_id.includes("/"))) {
            frappe.db.get_value("Employee", { "user_id": frappe.session.user }, ["name", "employee_name"]).then(r => {
                if (r && r.message && r.message.name) {
                    frm.set_value("request_id", `${r.message.employee_name} (${r.message.name})`);
                } else {
                    frm.set_value("request_id", frappe.session.user_fullname || frappe.session.user);
                }
            });
        }
    },

    refresh(frm) {
        render_contract_progress_tracker(frm);
        toggle_engagement_type_fields(frm);
        calculate_and_render_salary_breakup(frm);
        setup_workflow_action_buttons(frm);
    },

    engagement_type(frm) {
        toggle_engagement_type_fields(frm);
    },

    proposed_start_date(frm) {
        calculate_contract_tenure(frm);
    },

    proposed_end_date(frm) {
        calculate_contract_tenure(frm);
    },

    initial_tenure_value(frm) {
        calculate_end_date_from_tenure(frm);
    },

    tenure_unit(frm) {
        calculate_end_date_from_tenure(frm);
    },

    compensation_amount(frm) {
        calculate_and_render_salary_breakup(frm, true);
    },

    basic_percent(frm) {
        calculate_and_render_salary_breakup(frm, false, "basic_pct");
    },

    basic_monthly(frm) {
        calculate_and_render_salary_breakup(frm, false, "basic_val");
    },

    hra_percent(frm) {
        calculate_and_render_salary_breakup(frm, false, "hra_pct");
    },

    hra_monthly(frm) {
        calculate_and_render_salary_breakup(frm, false, "hra_val");
    },

    lta_percent(frm) {
        calculate_and_render_salary_breakup(frm, false, "lta_pct");
    },

    lta_monthly(frm) {
        calculate_and_render_salary_breakup(frm, false, "lta_val");
    },

    requesting_organization(frm) {
        let comp = frm.doc.requesting_organization;
        if (comp) {
            frm.set_value("organization", comp);
            frappe.call({
                method: "access_custom.access_custom.doctype.employment_contract.employment_contract.check_company_has_contract_template",
                args: { company: comp },
                callback: function(r) {
                    let res = r.message || {};
                    if (!res.has_template) {
                        frappe.msgprint({
                            title: __("No Dedicated Template"),
                            indicator: "red",
                            message: __("There is no dedicated template for <b>{0}</b>. Please contact the admin.", [comp])
                        });
                        frm.set_value("requesting_organization", "");
                        frm.set_value("organization", "");
                        frm.set_value("contract_template", "");
                    }
                }
            });
        }
    }
});


// -------------------------------------------------------------
// Engagement Type & Tenure Logic
// -------------------------------------------------------------
function toggle_engagement_type_fields(frm) {
    let is_open = (frm.doc.engagement_type === "Open-ended");

    frm.set_df_property("proposed_end_date", "reqd", is_open ? 0 : 1);
    frm.set_df_property("proposed_end_date", "hidden", is_open ? 1 : 0);
    frm.set_df_property("initial_tenure_value", "hidden", is_open ? 1 : 0);
    frm.set_df_property("tenure_unit", "hidden", is_open ? 1 : 0);

    if (is_open) {
        if (frm.doc.contract_tenure !== "Ongoing / Permanent") {
            frm.set_value("contract_tenure", "Ongoing / Permanent");
        }
        if (frm.doc.proposed_end_date) {
            frm.set_value("proposed_end_date", "");
        }
    } else {
        calculate_contract_tenure(frm);
    }
}

function calculate_contract_tenure(frm) {
    if (frm.doc.engagement_type === "Open-ended") {
        frm.set_value("contract_tenure", "Ongoing / Permanent");
        return;
    }

    let start = frm.doc.proposed_start_date;
    let end = frm.doc.proposed_end_date;

    if (start && end) {
        let s = frappe.datetime.str_to_obj(start);
        let e = frappe.datetime.str_to_obj(end);
        if (e >= s) {
            let diffDays = frappe.datetime.get_day_diff(end, start) + 1;
            let months = Math.floor(diffDays / 30);
            let remDays = diffDays % 30;

            let tenure_str = "";
            if (months > 0) tenure_str += `${months} Month${months > 1 ? "s" : ""}`;
            if (remDays > 0) tenure_str += (tenure_str ? ", " : "") + `${remDays} Day${remDays > 1 ? "s" : ""}`;

            frm.set_value("contract_tenure", tenure_str || `${diffDays} Days`);
            frm.set_value("initial_tenure_value", months || 1);
        }
    }
}

function calculate_end_date_from_tenure(frm) {
    if (frm.doc.engagement_type === "Open-ended") return;

    let start = frm.doc.proposed_start_date;
    let val = parseInt(frm.doc.initial_tenure_value, 10);
    let unit = frm.doc.tenure_unit || "Months";

    if (start && val && !frm.doc.proposed_end_date) {
        let end_date;
        if (unit === "Years") {
            end_date = frappe.datetime.add_months(start, val * 12);
        } else if (unit === "Days") {
            end_date = frappe.datetime.add_days(start, val - 1);
        } else if (unit === "Weeks") {
            end_date = frappe.datetime.add_days(start, (val * 7) - 1);
        } else {
            end_date = frappe.datetime.add_months(start, val);
            end_date = frappe.datetime.add_days(end_date, -1);
        }
        frm.set_value("proposed_end_date", end_date);
    }
}


// -------------------------------------------------------------
// Salary Breakup Calculation & HTML Table
// -------------------------------------------------------------
function calculate_and_render_salary_breakup(frm, reset_all = false, source = "") {
    let gross = flt(frm.doc.compensation_amount);
    let annual_ctc = Math.round(gross * 12);

    let b_pct = flt(frm.doc.basic_percent || 50.0);
    let h_pct = flt(frm.doc.hra_percent || 50.0);
    let l_pct = flt(frm.doc.lta_percent || 10.0);

    let basic = 0;
    let hra = 0;
    let lta = 0;

    if (reset_all || source === "basic_pct" || !frm.doc.basic_monthly) {
        basic = Math.round(gross * (b_pct / 100.0));
    } else if (source === "basic_val") {
        basic = flt(frm.doc.basic_monthly);
        b_pct = gross > 0 ? ((basic / gross) * 100).toFixed(2) : 50.0;
    } else {
        basic = flt(frm.doc.basic_monthly) || Math.round(gross * (b_pct / 100.0));
    }

    if (reset_all || source === "hra_pct" || source === "basic_pct" || source === "basic_val" || !frm.doc.hra_monthly) {
        hra = Math.round(basic * (h_pct / 100.0));
    } else if (source === "hra_val") {
        hra = flt(frm.doc.hra_monthly);
        h_pct = basic > 0 ? ((hra / basic) * 100).toFixed(2) : 50.0;
    } else {
        hra = flt(frm.doc.hra_monthly) || Math.round(basic * (h_pct / 100.0));
    }

    if (reset_all || source === "lta_pct" || !frm.doc.lta_monthly) {
        lta = Math.round(gross * (l_pct / 100.0));
    } else if (source === "lta_val") {
        lta = flt(frm.doc.lta_monthly);
        l_pct = gross > 0 ? ((lta / gross) * 100).toFixed(2) : 10.0;
    } else {
        lta = flt(frm.doc.lta_monthly) || Math.round(gross * (l_pct / 100.0));
    }

    let other = Math.round(gross - (basic + hra + lta));
    if (other < 0) other = 0;

    let basic_ann = Math.round(basic * 12);
    let hra_ann = Math.round(hra * 12);
    let lta_ann = Math.round(lta * 12);
    let other_ann = Math.round(other * 12);

    // Silently update fields without triggering loops
    frm.doc.basic_percent = b_pct;
    frm.doc.basic_monthly = basic;
    frm.doc.basic_annual = basic_ann;

    frm.doc.hra_percent = h_pct;
    frm.doc.hra_monthly = hra;
    frm.doc.hra_annual = hra_ann;

    frm.doc.lta_percent = l_pct;
    frm.doc.lta_monthly = lta;
    frm.doc.lta_annual = lta_ann;

    frm.doc.other_allowance_monthly = other;
    frm.doc.other_allowance_annual = other_ann;

    frm.doc.annual_ctc = annual_ctc;
    if (frm.doc.engagement_type === "Open-ended" || !frm.doc.total_contract_value) {
        frm.doc.total_contract_value = annual_ctc;
    }

    frm.refresh_fields([
        "basic_percent", "basic_monthly", "basic_annual",
        "hra_percent", "hra_monthly", "hra_annual",
        "lta_percent", "lta_monthly", "lta_annual",
        "other_allowance_monthly", "other_allowance_annual",
        "annual_ctc", "total_contract_value"
    ]);

    render_salary_html_table(frm, gross, annual_ctc, b_pct, basic, basic_ann, h_pct, hra, hra_ann, l_pct, lta, lta_ann, other, other_ann);
}

function render_salary_html_table(frm, gross, annual_ctc, b_pct, basic, basic_ann, h_pct, hra, hra_ann, l_pct, lta, lta_ann, other, other_ann) {
    if (!frm.fields_dict.salary_breakup_html) return;

    let fmt = (val) => format_currency(val, "INR");

    let html = `
        <div style="margin: 10px 0; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #f8fafc; padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
                <span>Salary Breakup for Employment Contract</span>
                <span style="font-size: 12px; color: #64748b; font-weight: normal;">All amounts in INR</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="background: #f1f5f9; color: #475569; font-weight: 600; border-bottom: 1px solid #cbd5e1;">
                        <th style="padding: 10px 18px;">Description</th>
                        <th style="padding: 10px 14px; text-align: center;">%</th>
                        <th style="padding: 10px 18px; text-align: right;">Monthly (INR)</th>
                        <th style="padding: 10px 18px; text-align: right;">Annually (INR)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 18px; font-weight: 600; color: #1e293b;">Basic</td>
                        <td style="padding: 10px 14px; text-align: center; color: #64748b;">${b_pct}%</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(basic)}</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(basic_ann)}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 18px; font-weight: 600; color: #1e293b;">HRA</td>
                        <td style="padding: 10px 14px; text-align: center; color: #64748b;">${h_pct}%</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(hra)}</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(hra_ann)}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 18px; font-weight: 600; color: #1e293b;">LTA</td>
                        <td style="padding: 10px 14px; text-align: center; color: #64748b;">${l_pct}%</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(lta)}</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(lta_ann)}</td>
                    </tr>
                    <tr style="border-bottom: 2px solid #cbd5e1; background: #fafafa;">
                        <td style="padding: 10px 18px; font-weight: 600; color: #1e293b;">Other Allowance</td>
                        <td style="padding: 10px 14px; text-align: center; color: #94a3b8;">-</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(other)}</td>
                        <td style="padding: 10px 18px; text-align: right; font-weight: 500;">${fmt(other_ann)}</td>
                    </tr>
                    <tr style="background: #f8fafc; font-weight: 700; color: #0f172a; font-size: 14px;">
                        <td style="padding: 12px 18px;">Total CTC</td>
                        <td style="padding: 12px 14px; text-align: center;">100%</td>
                        <td style="padding: 12px 18px; text-align: right; color: #16a34a;">${fmt(gross)}</td>
                        <td style="padding: 12px 18px; text-align: right; color: #16a34a;">${fmt(annual_ctc)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    frm.fields_dict.salary_breakup_html.$wrapper.html(html);
}


// -------------------------------------------------------------
// Visual Workflow Stepper Tracker
// -------------------------------------------------------------
function render_contract_progress_tracker(frm) {
    if (!frm || !frm.wrapper) return;

    try {
        $(".contract-progress-container").remove();

        let steps = [
            { id: "Draft", label: "Draft" },
            { id: "Pending Team Lead Approval", label: "Team Lead" },
            { id: "Pending HR Review", label: "HR Review" },
            { id: "Pending CEO Approval", label: "CEO" },
            { id: "Pending Final HR Review", label: "Final HR" },
            { id: "Signed by Employee", label: "Signed Contract" },
            { id: "Active", label: "Active" }
        ];

        let current_state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let is_rejected = current_state.includes("Reject") || (frm.doc.status === "Rejected");
        let is_revision = current_state.includes("Returned for Revision") || (frm.doc.status === "Returned for Revision");

        let active_index = 0;
        if (current_state === "Active") {
            active_index = 6;
        } else if (current_state === "Signed by Employee" || current_state === "Approved for Issuance" || current_state === "Awaiting Employee Signature") {
            active_index = 5;
        } else if (current_state === "CEO Approved" || current_state === "Pending Final HR Review") {
            active_index = 4;
        } else if (current_state === "Pending CEO Approval") {
            active_index = 3;
        } else if (current_state === "Pending HR Review") {
            active_index = 2;
        } else if (current_state === "Pending Team Lead Approval") {
            active_index = 1;
        } else {
            active_index = 0;
        }

        let percent = (active_index === 6 && current_state === "Active") ? 100 : Math.round((active_index / 6) * 100);

        let status_bg = "#16a34a";
        let bar_color = "#16a34a";
        if (is_rejected) {
            status_bg = "#dc2626";
            bar_color = "#dc2626";
        } else if (is_revision) {
            status_bg = "#f59e0b";
            bar_color = "#f59e0b";
        }

        let progress_html = `
            <div class="contract-progress-container" style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:18px 24px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                    <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#4b5563;">
                        Employment Contract Approval Workflow Route
                    </div>
                    <div>
                        <span style="background:${status_bg}; color:#fff; font-size:11px; font-weight:700; padding:4px 10px; border-radius:12px;">
                            ${frappe.utils.escape_html(current_state)} (${percent}%)
                        </span>
                    </div>
                </div>
                <div style="position:relative; display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="position:absolute; top:13px; left:25px; right:25px; height:2px; background:#e5e7eb; z-index:1;"></div>
                    <div style="position:absolute; top:13px; left:25px; width:${Math.min(active_index * 16.66, 100)}%; height:2px; background:${bar_color}; z-index:2; transition:width 0.4s ease;"></div>
        `;

        steps.forEach((step, idx) => {
            let is_completed = idx < active_index || (active_index === 6 && current_state === "Active");
            let is_current = idx === active_index && current_state !== "Active";

            let circle_bg = "#fff";
            let circle_border = "#e5e7eb";
            let circle_color = "#9ca3af";

            if (is_completed) {
                circle_bg = "#16a34a";
                circle_border = "#16a34a";
                circle_color = "#fff";
            } else if (is_current) {
                if (is_rejected) {
                    circle_bg = "#dc2626";
                    circle_border = "#dc2626";
                } else if (is_revision) {
                    circle_bg = "#f59e0b";
                    circle_border = "#f59e0b";
                } else {
                    circle_bg = "#16a34a";
                    circle_border = "#16a34a";
                }
                circle_color = "#fff";
            }

            progress_html += `
                <div style="position:relative; z-index:3; display:flex; flex-direction:column; align-items:center; width:65px;">
                    <div style="width:28px; height:28px; border-radius:50%; background:${circle_bg}; border:2px solid ${circle_border}; color:${circle_color}; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; margin-bottom:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                        ${is_completed ? "✓" : idx + 1}
                    </div>
                    <div style="font-size:11px; font-weight:${is_current ? "700" : "500"}; color:${is_current ? "#111827" : "#6b7280"}; text-align:center; white-space:nowrap;">
                        ${step.label}
                    </div>
                </div>
            `;
        });

        progress_html += `
                </div>
            </div>
        `;

        let $target = frm.page.wrapper.find(".form-tabs-list, .nav-tabs, .form-tabs").first();
        if ($target.length) {
            $target.before(progress_html);
        } else {
            frm.dashboard.set_headline_alert(progress_html);
        }
    } catch (e) {
        console.error("Progress tracker render error:", e);
    }
}


// -------------------------------------------------------------
// Approver Role Queries
// -------------------------------------------------------------
function setup_leadership_queries(frm) {
    frm.set_query("team_lead_approver", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_approver_users",
            filters: { role: "Team Lead" }
        };
    });

    frm.set_query("hr_approver", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_approver_users",
            filters: { role: "HR Manager" }
        };
    });

    frm.set_query("ceo_approver", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_approver_users",
            filters: { role: "CEO Approver" }
        };
    });

    frm.set_query("final_hr_approver", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_approver_users",
            filters: { role: "HR Manager" }
        };
    });

    frm.set_query("work_location", function() {
        return { filters: { is_active: 1 } };
    });
}


// -------------------------------------------------------------
// Workflow Actions & Buttons
// -------------------------------------------------------------
function setup_workflow_action_buttons(frm) {
    if (frm.is_new()) return;

    let state = frm.doc.status || "Draft";
    let user = frappe.session.user;
    let roles = frappe.user_roles || [];
    let is_admin = roles.includes("Administrator") || roles.includes("System Manager");

    if (state === "Draft" || state.includes("Returned for Revision")) {
        frm.add_custom_button(__("Submit for Approval"), function() {
            frappe.confirm(__("Are you sure you want to submit this contract to Team Lead?"), function() {
                frm.set_value("status", "Pending Team Lead Approval");
                frm.save();
            });
        }).addClass("btn-primary");
    } else if (state === "Pending Team Lead Approval") {
        if (is_admin || roles.includes("Team Lead") || user === frm.doc.team_lead_approver) {
            frm.add_custom_button(__("Approve (Team Lead)"), function() {
                frm.set_value("team_lead_decision", "Approved");
                frm.set_value("status", "Pending HR Review");
                frm.save();
            }).addClass("btn-success");

            frm.add_custom_button(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "Returned for Revision (Team Lead)");
            }).addClass("btn-warning");
        }
    } else if (state === "Pending HR Review") {
        if (is_admin || roles.includes("HR Manager") || user === frm.doc.hr_approver) {
            frm.add_custom_button(__("Approve (HR Review)"), function() {
                frm.set_value("hr_decision", "Approved");
                frm.set_value("status", "Pending CEO Approval");
                frm.save();
            }).addClass("btn-success");

            frm.add_custom_button(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "Returned for Revision (HR)");
            }).addClass("btn-warning");
        }
    } else if (state === "Pending CEO Approval") {
        if (is_admin || roles.includes("CEO Approver") || user === frm.doc.ceo_approver) {
            frm.add_custom_button(__("Approve (CEO)"), function() {
                frm.set_value("ceo_decision", "Approved");
                frm.set_value("status", "CEO Approved");
                frm.save();
            }).addClass("btn-success");

            frm.add_custom_button(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "Returned for Revision (CEO)");
            }).addClass("btn-warning");
        }
    } else if (state === "CEO Approved" || state === "Pending Final HR Review") {
        if (is_admin || roles.includes("HR Manager") || user === frm.doc.final_hr_approver) {
            frm.add_custom_button(__("Issue for Employee Signature"), function() {
                frm.set_value("final_hr_decision", "Approved");
                frm.set_value("status", "Awaiting Employee Signature");
                frm.save();
            }).addClass("btn-primary");
        }
    } else if (state === "Awaiting Employee Signature" || state === "Signed by Employee") {
        if (is_admin || roles.includes("HR Manager")) {
            frm.add_custom_button(__("Countersign & Activate"), function() {
                if (!frm.doc.employee_signed_contract) {
                    frappe.msgprint({
                        title: __("Missing Signed Contract"),
                        indicator: "red",
                        message: __("Please upload the <b>Employee Signed Contract</b> in Section G before activating.")
                    });
                    return;
                }
                frm.set_value("status", "Active");
                frm.save();
            }).addClass("btn-success");
        }
    }
}

function prompt_revision_reason(frm, target_state) {
    frappe.prompt([
        {
            fieldname: "remarks",
            fieldtype: "Small Text",
            label: __("Revision Remarks / Feedback"),
            reqd: 1
        }
    ], function(values) {
        if (target_state.includes("Team Lead")) frm.set_value("team_lead_remarks", values.remarks);
        if (target_state.includes("HR")) frm.set_value("hr_remarks", values.remarks);
        if (target_state.includes("CEO")) frm.set_value("ceo_remarks", values.remarks);
        frm.set_value("status", target_state);
        frm.save();
    }, __("Return for Revision"), __("Submit Feedback"));
}

function inject_employment_contract_styles() {
    if (!$("#employment-contract-styles").length) {
        $("head").append(`
            <style id="employment-contract-styles">
                .contract-progress-container {
                    animation: fadeIn 0.3s ease-in-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        `);
    }
}
