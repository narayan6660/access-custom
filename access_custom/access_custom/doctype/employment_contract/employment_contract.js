// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

const TARGET_TEXT_FIELDS = [
    "reason_for_engagement",
    "scope_summary",
    "key_responsibilities",
    "deliverables",
    "milestones",
    "expected_outputs",
    "performance_acceptance_criteria",
    "team_lead_remarks",
    "hr_remarks",
    "ceo_remarks",
    "final_hr_remarks"
];

frappe.ui.form.on("Employment Contract", {
    validate(frm) {
        let v1 = validate_pdf_attachment(frm, "employee_cv");
        let v2 = validate_pdf_attachment(frm, "employee_signed_contract");
        let v3 = validate_pdf_attachment(frm, "final_executed_contract");
        if (!v1 || !v2 || !v3) {
            frappe.validated = false;
            return false;
        }
    },

    employee_cv(frm) {
        validate_pdf_attachment(frm, "employee_cv");
    },

    employee_signed_contract(frm) {
        validate_pdf_attachment(frm, "employee_signed_contract");
    },

    final_executed_contract(frm) {
        validate_pdf_attachment(frm, "final_executed_contract");
    },
    onload(frm) {
        inject_employment_contract_styles();
        apply_section_visibility(frm);
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
        inject_employment_contract_styles();
        if (frm.wrapper) $(frm.wrapper).addClass("employment-contract-wrapper");
        if (frm.page && frm.page.wrapper) $(frm.page.wrapper).addClass("employment-contract-wrapper");

        setup_leadership_queries(frm);
        setup_status_indicator(frm);
        render_contract_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        apply_contract_approver_field_locking(frm);
        align_contract_approver_rows(frm);
        apply_section_visibility(frm);
        toggle_engagement_type_fields(frm);
        calculate_and_render_salary_breakup(frm);
        setup_workflow_action_buttons(frm);

        setTimeout(() => {
            apply_contract_approver_field_locking(frm);
            align_contract_approver_rows(frm);
        }, 80);
        setTimeout(() => {
            apply_contract_approver_field_locking(frm);
            align_contract_approver_rows(frm);
        }, 250);
        setTimeout(() => {
            apply_contract_approver_field_locking(frm);
            align_contract_approver_rows(frm);
        }, 600);

        $(frm.wrapper).off("render_complete.ec_lock").on("render_complete.ec_lock", function() {
            apply_contract_approver_field_locking(frm);
            align_contract_approver_rows(frm);
        });
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
        calculate_and_render_salary_breakup(frm, false, "compensation_amount");
    },

    annual_ctc(frm) {
        calculate_and_render_salary_breakup(frm, false, "annual_ctc");
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
                            message: __("There is no dedicated Employment Contract template for <b>{0}</b>. Please contact the admin.", [comp])
                        });
                        frm.set_value("requesting_organization", "");
                        frm.set_value("organization", "");
                        frm.set_value("contract_template", "");
                    } else if (res.template_name) {
                        frm.set_value("contract_template", res.template_name);
                    }
                }
            });
        } else {
            frm.set_value("organization", "");
            frm.set_value("contract_template", "");
        }
    },

    team_lead(frm) {
        if (frm.doc.team_lead) {
            frappe.db.get_value("Employee", frm.doc.team_lead, "user_id").then(r => {
                if (r && r.message && r.message.user_id) {
                    frm.set_value("team_lead_approver", r.message.user_id);
                }
            });
        }
    }
});


// ==============================================================================
// 1. CSS Injection (Matched to Consultant Contract)
// ==============================================================================
function inject_employment_contract_styles() {
    $("#ec-custom-ui-style").remove();
    $(`<style id="ec-custom-ui-style">
        .employment-contract-wrapper [data-fieldname="project_contract"],
        .employment-contract-wrapper [data-fieldname="reason_for_engagement"] textarea,
        .employment-contract-wrapper [data-fieldname="scope_summary"] textarea,
        .employment-contract-wrapper [data-fieldname="key_responsibilities"] textarea,
        .employment-contract-wrapper [data-fieldname="deliverables"] textarea,
        .employment-contract-wrapper [data-fieldname="milestones"] textarea,
        .employment-contract-wrapper [data-fieldname="expected_outputs"] textarea,
        .employment-contract-wrapper [data-fieldname="performance_acceptance_criteria"] textarea,
        .employment-contract-wrapper [data-fieldname="team_lead_remarks"] textarea,
        .employment-contract-wrapper [data-fieldname="hr_remarks"] textarea,
        .employment-contract-wrapper [data-fieldname="ceo_remarks"] textarea,
        .employment-contract-wrapper [data-fieldname="final_hr_remarks"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="reason_for_engagement"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="scope_summary"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="key_responsibilities"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="deliverables"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="milestones"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="expected_outputs"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="performance_acceptance_criteria"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="team_lead_remarks"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="hr_remarks"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="ceo_remarks"] textarea,
        .form-page[data-page-route*="employment_contract"] [data-fieldname="final_hr_remarks"] textarea {
            height: 50px !important;
            min-height: 50px !important;
            line-height: 1.45 !important;
            font-size: 13px !important;
            padding: 6px 10px !important;
            resize: vertical !important;
            box-sizing: border-box !important;
        }
        /* Form Controls Outer Border Styling */
        .employment-contract-wrapper .form-control {
            border: 1px solid #d1d5db !important;
            border-radius: 6px !important;
        }
        .employment-contract-wrapper .form-control:focus {
            border-color: #2563eb !important;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
        }

        /* Prevent duplicate display: strictly hide control-value when control-input is active or hidden */
        .employment-contract-wrapper .frappe-control .control-input:not([style*="none"]):not(.hide) ~ .control-value,
        .employment-contract-wrapper .frappe-control .control-input-wrapper:not([style*="none"]):not(.hide) ~ .control-value,
        .employment-contract-wrapper .control-value[style*="none"],
        .employment-contract-wrapper .control-value.hide,
        .employment-contract-wrapper .control-value.hidden {
            display: none !important;
        }

        /* When field is read-only and control-value is shown, keep visible clean border box */
        .employment-contract-wrapper .control-value.like-disabled-input {
            border: 1px solid #d1d5db !important;
            background-color: #f8fafc !important;
            border-radius: 6px !important;
            padding: 6px 12px !important;
            min-height: 32px !important;
            font-size: 13px !important;
            color: #1e293b !important;
            box-sizing: border-box !important;
            width: 100% !important;
        }
        .employment-contract-wrapper [data-fieldtype="Small Text"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldtype="Long Text"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldtype="Text"] .control-value.like-disabled-input {
            min-height: 52px !important;
            white-space: pre-wrap !important;
        }
        .employment-contract-wrapper [data-fieldname="team_lead_decision"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="hr_decision"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="ceo_decision"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="final_hr_decision"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="team_lead_remarks"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="hr_remarks"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="ceo_remarks"] .control-value.like-disabled-input,
        .employment-contract-wrapper [data-fieldname="final_hr_remarks"] .control-value.like-disabled-input {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
        }

        /* Section F - Approver Rows Compact Leveling & Spacing */
        .form-section[data-fieldname="section_f"],
        .form-section[data-fieldname="sec_break_f2"],
        .form-section[data-fieldname="sec_break_f3"],
        .form-section[data-fieldname="sec_break_f4"] {
            margin-bottom: 0px !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
        }

        .form-section[data-fieldname="sec_break_f2"],
        .form-section[data-fieldname="sec_break_f3"],
        .form-section[data-fieldname="sec_break_f4"] {
            border-top: 1px solid #f1f5f9 !important;
        }

        .form-section[data-fieldname="sec_break_f2"] .section-head,
        .form-section[data-fieldname="sec_break_f3"] .section-head,
        .form-section[data-fieldname="sec_break_f4"] .section-head {
            display: none !important;
        }

        .form-section[data-fieldname="section_f"] .frappe-control,
        .form-section[data-fieldname="sec_break_f2"] .frappe-control,
        .form-section[data-fieldname="sec_break_f3"] .frappe-control,
        .form-section[data-fieldname="sec_break_f4"] .frappe-control {
            margin-bottom: 0 !important;
        }

        .form-section[data-fieldname="section_f"] .frappe-control .form-group,
        .form-section[data-fieldname="sec_break_f2"] .frappe-control .form-group,
        .form-section[data-fieldname="sec_break_f3"] .frappe-control .form-group,
        .form-section[data-fieldname="sec_break_f4"] .frappe-control .form-group {
            margin-bottom: 0 !important;
        }

        .form-section[data-fieldname="section_f"] .control-label,
        .form-section[data-fieldname="sec_break_f2"] .control-label,
        .form-section[data-fieldname="sec_break_f3"] .control-label,
        .form-section[data-fieldname="sec_break_f4"] .control-label {
            margin-bottom: 4px !important;
        }

        /* Hide Comments and Activity / Timeline for Non-Admin users */
        .employment-contract-wrapper.hide-comments-activity .form-footer,
        .employment-contract-wrapper.hide-comments-activity .form-timeline,
        .employment-contract-wrapper.hide-comments-activity .timeline,
        .employment-contract-wrapper.hide-comments-activity .comment-box,
        .employment-contract-wrapper.hide-comments-activity .timeline-items,
        .employment-contract-wrapper.hide-comments-activity .timeline-actions {
            display: none !important;
        }

        /* Strictly Hide Section G and all its fields until Final HR Review is approved */
        .employment-contract-wrapper.hide-section-g .form-section[data-fieldname="section_g"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="section_g"],
        .employment-contract-wrapper.hide-section-g .form-section:has([data-fieldname="section_g"]),
        .employment-contract-wrapper.hide-section-g [data-fieldname="employee_signed_contract"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="employee_signed_date"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="employee_received_date"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="col_break_g"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="final_executed_contract"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="countersigned_date"],
        .employment-contract-wrapper.hide-section-g [data-fieldname="sent_to_employee_date"] {
            display: none !important;
        }
        .employment-contract-wrapper.hide-section-g .form-section:has([data-fieldname="section_g"]) {
            display: none !important;
        }

        /* In Active state, hide standalone secondary Cancel button from page header */
        .employment-contract-wrapper.state-active .page-actions > .btn-secondary,
        .employment-contract-wrapper.state-active .page-actions > [data-label="Cancel"] {
            display: none !important;
        }

        /* Child Table Row Popup Styling */
        .employment-contract-wrapper .grid-row-open .form-in-grid,
        .employment-contract-wrapper .form-in-grid {
            background-color: #ffffff !important;
            border: 1.5px solid #00B800 !important;
            border-radius: 8px !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
            max-height: 420px !important;
            overflow-y: scroll !important;
            overflow-x: hidden !important;
            scrollbar-width: thin !important;
            scrollbar-color: #00B800 #f1f5f9 !important;
        }

        .employment-contract-wrapper .form-in-grid::-webkit-scrollbar {
            width: 9px !important;
            display: block !important;
        }

        .employment-contract-wrapper .form-in-grid::-webkit-scrollbar-thumb {
            background-color: #00B800 !important;
            border-radius: 5px !important;
        }

        .employment-contract-wrapper .form-in-grid::-webkit-scrollbar-track {
            background-color: #f1f5f9 !important;
            border-radius: 5px !important;
        }

        .employment-contract-wrapper .form-in-grid .grid-form-heading {
            position: sticky !important;
            top: 0 !important;
            background: #ffffff !important;
            z-index: 10 !important;
            border-bottom: 1px solid #e2e8f0 !important;
        }
    </style>`).appendTo("head");
}


// ==============================================================================
// 2. Auto-Expand Textareas
// ==============================================================================
function setup_auto_expand_textareas(frm) {
    if (!frm || !frm.wrapper) return;

    if (frm.wrapper) $(frm.wrapper).addClass("employment-contract-wrapper");
    if (frm.page && frm.page.wrapper) $(frm.page.wrapper).addClass("employment-contract-wrapper");

    TARGET_TEXT_FIELDS.forEach(fieldname => {
        let field = frm.get_field(fieldname);
        let $ta = null;
        if (field && field.$input && field.$input.length) {
            $ta = field.$input;
        } else if (field && field.$wrapper && field.$wrapper.length) {
            $ta = field.$wrapper.find("textarea");
        } else {
            $ta = $(frm.wrapper).find(`[data-fieldname="${fieldname}"] textarea`);
        }

        if ($ta && $ta.length) {
            $ta.attr("rows", 2);
            $ta.css({
                "min-height": "50px",
                "line-height": "1.45",
                "font-size": "13px",
                "padding": "6px 10px",
                "resize": "vertical",
                "box-sizing": "border-box"
            });

            $ta.off("input.auto_expand change.auto_expand keyup.auto_expand paste.auto_expand")
               .on("input.auto_expand change.auto_expand keyup.auto_expand paste.auto_expand", function() {
                   adjust_single_textarea(this);
               });

            $ta.each(function() {
                adjust_single_textarea(this);
            });
        }
    });

    $(frm.wrapper).off("click.ec_expand").on("click.ec_expand", ".section-head, .nav-link, .tab-link", function() {
        setTimeout(() => {
            TARGET_TEXT_FIELDS.forEach(fn => trigger_auto_expand(frm, fn));
        }, 50);
    });
}

function adjust_single_textarea(ta) {
    if (!ta) return;
    let val = ta.value || "";
    if (!val || !val.trim()) {
        ta.style.setProperty("height", "50px", "important");
        ta.style.overflowY = "hidden";
        return;
    }
    ta.style.setProperty("height", "auto", "important");
    let scroll_h = ta.scrollHeight;
    let new_h = Math.max(50, scroll_h);
    ta.style.setProperty("height", new_h + "px", "important");
    ta.style.overflowY = (scroll_h > 350) ? "auto" : "hidden";
}

function trigger_auto_expand(frm, fieldname) {
    if (!frm || !frm.wrapper) return;
    let field = frm.get_field(fieldname);
    let $ta = null;
    if (field && field.$input && field.$input.length) {
        $ta = field.$input;
    } else if (field && field.$wrapper && field.$wrapper.length) {
        $ta = field.$wrapper.find("textarea");
    } else {
        $ta = $(frm.wrapper).find(`[data-fieldname="${fieldname}"] textarea`);
    }
    if ($ta && $ta.length) {
        $ta.each(function() {
            adjust_single_textarea(this);
        });
    }
}


// ==============================================================================
// 3. Approver Rows Alignment & Section F Formatting
// ==============================================================================
function align_contract_approver_rows(frm) {
    if (!frm || !frm.wrapper) return;
    let $w = $(frm.wrapper);
    let rows = [
        ["team_lead_approver", "team_lead_decision", "team_lead_remarks"],
        ["hr_approver", "hr_decision", "hr_remarks"],
        ["ceo_approver", "ceo_decision", "ceo_remarks"],
        ["final_hr_approver", "final_hr_decision", "final_hr_remarks"]
    ];

    rows.forEach(r => {
        r.forEach(f => {
            let $el = $w.find(`[data-fieldname="${f}"]`);
            $el.css({ "min-height": "", "height": "" });
        });
    });

    rows.forEach(r => {
        let max_h = 0;
        let els = r.map(f => $w.find(`[data-fieldname="${f}"]`));
        els.forEach($el => {
            if ($el.length) {
                let h = $el.outerHeight();
                if (h > max_h) max_h = h;
            }
        });
        if (max_h > 0) {
            els.forEach($el => {
                if ($el.length) {
                    $el.css({
                        "min-height": max_h + "px",
                        "margin-bottom": "0px"
                    });
                }
            });
        }
    });
}

function apply_contract_approver_field_locking(frm) {
    if (!frm || !frm.doc) return;

    try {
        let state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let user = frappe.session.user;
        let is_admin = (user === "Administrator");

        const review_matrix = [
            { approver: "team_lead_approver", status: "team_lead_decision", review: "team_lead_remarks", state: "Pending Team Lead Approval", role: "Team Lead" },
            { approver: "hr_approver", status: "hr_decision", review: "hr_remarks", state: "Pending HR Review", role: "HR" },
            { approver: "ceo_approver", status: "ceo_decision", review: "ceo_remarks", state: "Pending CEO Approval", role: "CEO" },
            { approver: "final_hr_approver", status: "final_hr_decision", review: "final_hr_remarks", state: "Pending Final HR Review", role: "Final HR" }
        ];

        review_matrix.forEach(item => {
            let status_val = frm.doc[item.status] || "Pending";
            let review_val = frm.doc[item.review] || "";

            frm.set_df_property(item.status, "read_only", 1);
            let is_active_stage = !frm.is_new() && (state === item.state);
            let assigned_user = frm.doc[item.approver];
            if (item.role === "Final HR" && !assigned_user) {
                assigned_user = frm.doc.hr_approver;
            }

            let is_assigned_user = (assigned_user && user === assigned_user) || is_admin;
            if (item.role === "HR" || item.role === "Final HR") {
                if (frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"))) {
                    is_assigned_user = true;
                }
            }

            let can_edit_comment = is_active_stage && is_assigned_user;
            frm.set_df_property(item.review, "read_only", can_edit_comment ? 0 : 1);

            // Visual badge for status
            let status_field = frm.get_field(item.status);
            if (status_field && status_field.$wrapper) {
                status_field.$wrapper.find(".approver-decision-badge").remove();
                status_field.$wrapper.find(".control-input-wrapper").hide();
                status_field.$wrapper.find(".control-input").hide();
                status_field.$wrapper.find(".control-value").hide();

                let $badge = $('<div class="approver-decision-badge" style="margin-top: 0px; display: block !important;"></div>');
                if (status_val && status_val !== "Pending") {
                    let badge_bg = "#16a34a";
                    let text_color = "#ffffff";
                    let icon = "&#10003;";
                    if (status_val.includes("Rejected")) {
                        badge_bg = "#dc2626";
                        icon = "&#10007;";
                    } else if (status_val.includes("Returned") || status_val.includes("Revision")) {
                        badge_bg = "#d97706";
                        icon = "&#8635;";
                    }
                    $badge.html(`
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: ${badge_bg}; color: ${text_color}; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">
                            <span>${icon}</span>
                            <span>${frappe.utils.escape_html(status_val)}</span>
                        </div>
                    `);
                } else {
                    $badge.html(`
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 12px;">
                            <span>Pending Review</span>
                        </div>
                    `);
                }
                let $target = status_field.$wrapper.find(".form-group");
                if ($target.length) {
                    $target.append($badge);
                } else {
                    status_field.$wrapper.append($badge);
                }
            }

            // Visual box for comment / remarks
            let review_field = frm.get_field(item.review);
            if (review_field && review_field.$wrapper) {
                review_field.$wrapper.find(".approver-remarks-content").remove();
                if (!can_edit_comment) {
                    review_field.$wrapper.find(".control-input-wrapper").hide();
                    review_field.$wrapper.find(".control-input").hide();
                    review_field.$wrapper.find(".control-value").hide();

                    let $rem = $('<div class="approver-remarks-content" style="margin-top: 0px; display: block !important;"></div>');
                    if (review_val && review_val.trim()) {
                        let bg_color = "#f8fafc";
                        let border_color = "#e2e8f0";
                        let text_color = "#334155";
                        if (status_val && status_val.includes("Rejected")) {
                            bg_color = "#fef2f2";
                            border_color = "#fca5a5";
                            text_color = "#991b1b";
                        } else if (status_val && (status_val.includes("Returned") || status_val.includes("Revision"))) {
                            bg_color = "#fffbeb";
                            border_color = "#fcd34d";
                            text_color = "#92400e";
                        }
                        $rem.html(`
                            <div style="padding: 6px 12px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 12px; color: ${text_color}; line-height: 1.45; white-space: pre-wrap; word-break: break-word;">
                                "${frappe.utils.escape_html(review_val)}"
                            </div>
                        `);
                    } else {
                        $rem.html(`
                            <div style="padding: 6px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic;">
                                No comments provided
                            </div>
                        `);
                    }
                    let $target = review_field.$wrapper.find(".form-group");
                    if ($target.length) {
                        $target.append($rem);
                    } else {
                        review_field.$wrapper.append($rem);
                    }
                } else {
                    review_field.$wrapper.find(".control-input-wrapper, .control-input").show();
                }
            }
        });
    } catch (e) {
        console.error("Error in apply_contract_approver_field_locking:", e);
    }
}


// ==============================================================================
// 4. Section Visibility Enforcement
// ==============================================================================
function apply_section_visibility(frm) {
    if (frm.dashboard && typeof frm.dashboard.clear_headline === "function") {
        frm.dashboard.clear_headline();
    }
    frm.set_df_property("naming_series", "hidden", 1);
    frm.set_df_property("status", "hidden", 1);
    frm.set_df_property("project_contract", "hidden", 1);
    $(frm.wrapper).find('.form-section:has([data-fieldname="naming_series"])').hide();

    if (!frm.doc) return;

    let state = frm.doc.workflow_state || frm.doc.status || "Draft";

    // Section F (Approval Section): visible
    frm.toggle_display([
        "section_f", "sec_break_f2", "sec_break_f3", "sec_break_f4"
    ], true);

    // Section G (Employee Signed Contract): strictly hidden until approved by Final HR
    let is_after_final_hr = ["Approved for Issuance", "Contract Issued", "Awaiting Employee Signature", "Signed by Employee", "Active"].includes(state);

    const SECTION_G_FIELDS = [
        "section_g",
        "employee_signed_contract",
        "employee_signed_date",
        "employee_received_date",
        "col_break_g",
        "final_executed_contract",
        "countersigned_date",
        "sent_to_employee_date"
    ];

    SECTION_G_FIELDS.forEach(fn => {
        frm.toggle_display(fn, is_after_final_hr);
        frm.set_df_property(fn, "hidden", is_after_final_hr ? 0 : 1);
    });

    if (frm.wrapper) {
        if (!is_after_final_hr) {
            $(frm.wrapper).addClass("hide-section-g");
        } else {
            $(frm.wrapper).removeClass("hide-section-g");
        }
    }
}


// ==============================================================================
// 5. Engagement Type & Tenure Logic
// ==============================================================================
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


// ==============================================================================
// 6. Salary Breakup Calculation & HTML Table
// ==============================================================================
function calculate_and_render_salary_breakup(frm, reset_all = false, source = "") {
    let gross = flt(frm.doc.compensation_amount);
    let annual_ctc = flt(frm.doc.annual_ctc);

    if (source === "annual_ctc") {
        if (annual_ctc > 0) {
            gross = Math.round(annual_ctc / 12.0);
            frm.doc.compensation_amount = gross;
        }
    } else if (source === "compensation_amount") {
        if (gross > 0) {
            if (!annual_ctc || Math.abs(annual_ctc - (gross * 12.0)) > 12.0) {
                annual_ctc = Math.round(gross * 12.0);
                frm.doc.annual_ctc = annual_ctc;
            }
        }
    } else {
        if (annual_ctc > 0 && (!gross || gross === 0)) {
            gross = Math.round(annual_ctc / 12.0);
            frm.doc.compensation_amount = gross;
        } else if (gross > 0 && (!annual_ctc || annual_ctc === 0)) {
            annual_ctc = Math.round(gross * 12.0);
            frm.doc.annual_ctc = annual_ctc;
        }
    }

    if (annual_ctc <= 0 && gross <= 0) return;

    let b_pct = flt(frm.doc.basic_percent != null && frm.doc.basic_percent !== "" ? frm.doc.basic_percent : 50.0);
    let h_pct = flt(frm.doc.hra_percent != null && frm.doc.hra_percent !== "" ? frm.doc.hra_percent : 50.0);
    let l_pct = flt(frm.doc.lta_percent != null && frm.doc.lta_percent !== "" ? frm.doc.lta_percent : 10.0);

    // Exact unrounded monthly base for formula fidelity to Excel
    let d4 = annual_ctc > 0 ? (annual_ctc / 12.0) : gross;
    let e4 = annual_ctc > 0 ? annual_ctc : (gross * 12.0);

    // 1. Basic: D5 = D4 * b_pct, E5 = D5 * 12
    let d5 = 0;
    let e5 = 0;
    if (source === "basic_val") {
        d5 = flt(frm.doc.basic_monthly);
        e5 = d5 * 12.0;
        b_pct = d4 > 0 ? flt(((d5 / d4) * 100).toFixed(2)) : 50.0;
    } else {
        d5 = d4 * (b_pct / 100.0);
        e5 = d5 * 12.0;
    }

    // 2. HRA: D6 = D5 * h_pct, E6 = D6 * 12
    let d6 = 0;
    let e6 = 0;
    if (source === "hra_val") {
        d6 = flt(frm.doc.hra_monthly);
        e6 = d6 * 12.0;
        h_pct = d5 > 0 ? flt(((d6 / d5) * 100).toFixed(2)) : 50.0;
    } else {
        d6 = d5 * (h_pct / 100.0);
        e6 = d6 * 12.0;
    }

    // 3. LTA: D7 = D4 * l_pct, E7 = D7 * 12
    let d7 = 0;
    let e7 = 0;
    if (source === "lta_val") {
        d7 = flt(frm.doc.lta_monthly);
        e7 = d7 * 12.0;
        l_pct = d4 > 0 ? flt(((d7 / d4) * 100).toFixed(2)) : 10.0;
    } else {
        d7 = d4 * (l_pct / 100.0);
        e7 = d7 * 12.0;
    }

    // 4. Other Allowance: balancing amount
    // D8 = D4 - (D5 + D6 + D7)
    // E8 = E4 - (E5 + E6 + E7)
    let d8 = d4 - (d5 + d6 + d7);
    let e8 = e4 - (e5 + e6 + e7);
    if (d8 < 0) d8 = 0;
    if (e8 < 0) e8 = 0;

    let basic_mon = Math.round(d5);
    let basic_ann = Math.round(e5);
    let hra_mon = Math.round(d6);
    let hra_ann = Math.round(e6);
    let lta_mon = Math.round(d7);
    let lta_ann = Math.round(e7);
    let other_mon = Math.round(d8);
    let other_ann = Math.round(e8);

    let display_gross = Math.round(d4);
    let display_annual = Math.round(e4);

    frm.doc.basic_percent = b_pct;
    frm.doc.basic_monthly = basic_mon;
    frm.doc.basic_annual = basic_ann;

    frm.doc.hra_percent = h_pct;
    frm.doc.hra_monthly = hra_mon;
    frm.doc.hra_annual = hra_ann;

    frm.doc.lta_percent = l_pct;
    frm.doc.lta_monthly = lta_mon;
    frm.doc.lta_annual = lta_ann;

    frm.doc.other_allowance_monthly = other_mon;
    frm.doc.other_allowance_annual = other_ann;

    frm.doc.compensation_amount = display_gross;
    frm.doc.annual_ctc = display_annual;

    if (frm.doc.engagement_type === "Open-ended" || !frm.doc.total_contract_value) {
        frm.doc.total_contract_value = display_annual;
    }

    frm.refresh_fields([
        "compensation_amount", "annual_ctc", "total_contract_value",
        "basic_percent", "basic_monthly", "basic_annual",
        "hra_percent", "hra_monthly", "hra_annual",
        "lta_percent", "lta_monthly", "lta_annual",
        "other_allowance_monthly", "other_allowance_annual"
    ]);

    render_salary_html_table(frm, display_gross, display_annual, b_pct, basic_mon, basic_ann, h_pct, hra_mon, hra_ann, l_pct, lta_mon, lta_ann, other_mon, other_ann);
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


// ==============================================================================
// 7. Visual Workflow Stepper Tracker
// ==============================================================================
function get_contract_rejection_stage(frm) {
    const check_stages = [
        { name: "Pending Final HR Review", status: frm.doc.final_hr_decision, review: frm.doc.final_hr_remarks, role: "Final HR", user: frm.doc.final_hr_approver || frm.doc.hr_approver },
        { name: "Pending CEO Approval", status: frm.doc.ceo_decision, review: frm.doc.ceo_remarks, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending HR Review", status: frm.doc.hr_decision, review: frm.doc.hr_remarks, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Team Lead Approval", status: frm.doc.team_lead_decision, review: frm.doc.team_lead_remarks, role: "Team Lead", user: frm.doc.team_lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Reject")) {
            return cs;
        }
    }
    return null;
}

function get_contract_revision_stage(frm) {
    const check_stages = [
        { name: "Pending Final HR Review", status: frm.doc.final_hr_decision, review: frm.doc.final_hr_remarks, role: "Final HR", user: frm.doc.final_hr_approver || frm.doc.hr_approver },
        { name: "Pending CEO Approval", status: frm.doc.ceo_decision, review: frm.doc.ceo_remarks, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending HR Review", status: frm.doc.hr_decision, review: frm.doc.hr_remarks, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Team Lead Approval", status: frm.doc.team_lead_decision, review: frm.doc.team_lead_remarks, role: "Team Lead", user: frm.doc.team_lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && (cs.status.includes("Return") || cs.status.includes("Revision"))) {
            return cs;
        }
    }
    return null;
}


function render_contract_progress_tracker(frm) {
    if (!frm || !frm.wrapper) return;

    try {
        // Clean up any prior instances
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
        let is_revision = (current_state === "Returned for Revision") || (frm.doc.status === "Returned for Revision");

        let rejected_stage = get_contract_rejection_stage(frm);
        if (rejected_stage) is_rejected = true;

        let revision_stage = get_contract_revision_stage(frm);
        if (revision_stage && !is_rejected) is_revision = true;

        let has_all_section_g = !!(
            frm.doc.sent_to_employee_date &&
            frm.doc.employee_signed_contract &&
            frm.doc.employee_signed_date &&
            frm.doc.employee_received_date &&
            frm.doc.final_executed_contract &&
            frm.doc.countersigned_date
        );

        let active_index = 0;
        if (current_state === "Active") {
            active_index = steps.length - 1;
        } else if (rejected_stage) {
            active_index = steps.findIndex(s => s.id === rejected_stage.name);
            if (active_index < 0) active_index = 1;
        } else if (revision_stage && is_revision) {
            active_index = steps.findIndex(s => s.id === revision_stage.name);
            if (active_index < 0) active_index = 1;
        } else if (current_state === "CEO Approved" || current_state === "Pending Final HR Review") {
            active_index = 4;
        } else if (current_state === "Signed by Employee" || current_state === "Approved for Issuance" || current_state === "Contract Issued") {
            active_index = 5;
        } else {
            let idx = steps.findIndex(s => s.id === current_state || current_state.includes(s.label));
            active_index = idx >= 0 ? idx : 0;
        }

        let percent = (active_index === steps.length - 1 && current_state === "Active") ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

        let status_bg = "#16a34a";
        let bar_color = "#16a34a";
        if (is_rejected) {
            status_bg = "#dc2626";
            bar_color = "#dc2626";
        } else if (is_revision) {
            status_bg = "#d97706";
            bar_color = "#d97706";
        }

        let display_status = current_state;
        if (current_state === "Signed by Employee" || current_state === "Approved for Issuance" || current_state === "Contract Issued") {
            display_status = has_all_section_g ? "Signed Contract (Ready to Activate)" : "Signed Contract (Pending Uploads)";
        }

        let nodes_html = steps.map((s, idx) => {
            let is_completed = (idx < active_index) || (active_index === steps.length - 1 && current_state === "Active");
            let is_active = (idx === active_index) && !(active_index === steps.length - 1 && current_state === "Active");

            let circle_bg = "#f1f5f9";
            let circle_border = "#cbd5e1";
            let circle_color = "#64748b";
            let circle_content = idx + 1;
            let label_color = "#64748b";
            let label_weight = "500";
            let pulse_style = "";

            if (is_completed) {
                circle_bg = "#16a34a";
                circle_border = "#16a34a";
                circle_color = "#ffffff";
                circle_content = "&#10003;";
                label_color = "#15803d";
                label_weight = "600";
            } else if (is_active) {
                if (is_rejected) {
                    circle_bg = "#dc2626";
                    circle_border = "#dc2626";
                    circle_color = "#ffffff";
                    circle_content = "&#10007;";
                    label_color = "#dc2626";
                    label_weight = "700";
                } else if (is_revision) {
                    circle_bg = "#d97706";
                    circle_border = "#d97706";
                    circle_color = "#ffffff";
                    circle_content = "&#8635;";
                    label_color = "#d97706";
                    label_weight = "700";
                    pulse_style = "box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.25);";
                } else {
                    circle_bg = "#16a34a";
                    circle_border = "#15803d";
                    circle_color = "#ffffff";
                    circle_content = (s.id === "Signed by Employee" && has_all_section_g) ? "&#10003;" : (idx + 1);
                    label_color = "#15803d";
                    label_weight = "700";
                    pulse_style = "box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.25);";
                }
            }

            let extra_hint = "";
            if (s.id === "Signed by Employee" && is_active) {
                extra_hint = has_all_section_g ?
                    `<div style="font-size: 10px; color: #16a34a; font-weight: 600; margin-top: 2px;">(Uploaded)</div>` :
                    `<div style="font-size: 10px; color: #d97706; font-weight: 600; margin-top: 2px;">(Pending)</div>`;
            }

            return `
            <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 50px; position: relative; z-index: 2;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: ${circle_bg}; border: 2px solid ${circle_border}; color: ${circle_color}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-bottom: 5px; ${pulse_style}">
                    ${circle_content}
                </div>
                <div style="font-size: 11px; font-weight: ${label_weight}; color: ${label_color}; text-align: center; line-height: 1.2;">
                    ${s.label}
                    ${extra_hint}
                </div>
            </div>
            `;
        }).join("");

        let container_html = `
        <div class="contract-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                    <span>Employment Contract Approval Workflow Route</span>
                </div>
                <div>
                    <span class="badge" style="background: ${status_bg}; color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 12px; font-weight: 600;">
                        ${frappe.utils.escape_html(display_status)} (${percent}%)
                    </span>
                </div>
            </div>

            <!-- Progress Line Bar -->
            <div style="position: relative; height: 5px; background: #e2e8f0; border-radius: 3px; margin: 6px 12px 12px 12px;">
                <div style="position: absolute; top: 0; left: 0; height: 100%; width: ${percent}%; background: ${bar_color}; border-radius: 3px; transition: width 0.3s ease;"></div>
            </div>

            <!-- Stepper Nodes -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative;">
                ${nodes_html}
            </div>
        </div>
        `;

        let $container = $(container_html);

        if (frm.layout && typeof frm.layout.show_dashboard === "function") {
            frm.layout.show_dashboard();
        }

        if (frm.dashboard && frm.dashboard.parent && frm.dashboard.parent.length) {
            $container.prependTo(frm.dashboard.parent);
            frm.dashboard.show();
            frm.dashboard.parent.show().removeClass("hide hidden");
            frm.dashboard.parent.closest(".form-dashboard-wrapper").show().removeClass("hide hidden");
        } else {
            let $target = $(frm.wrapper).find(".form-layout");
            if ($target.length) {
                $container.insertBefore($target.first());
            } else {
                $container.prependTo($(frm.wrapper).find(".form-page"));
            }
        }
    } catch (e) {
        console.error("Error in render_contract_progress_tracker:", e);
    }
}

// ==============================================================================
// 2. Approver Field Locking & High-Contrast Visual Stamping
// ==============================================================================


// ==============================================================================
// 8. Approver Role Queries
// ==============================================================================
function setup_leadership_queries(frm) {
    frm.set_query("contract_template", function() {
        let comp = frm.doc.requesting_organization || frm.doc.organization;
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_employment_contract_templates",
            filters: {
                company: comp || ""
            }
        };
    });

    frm.set_query("team_lead", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_leadership_employees",
            filters: { role: "Team Lead" }
        };
    });

    frm.set_query("project_manager", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_leadership_employees",
            filters: { role: "Projects Manager" }
        };
    });

    frm.set_query("reporting_manager", function() {
        return {
            query: "access_custom.access_custom.doctype.employment_contract.employment_contract.get_leadership_employees",
            filters: { role: "Reporting Manager" }
        };
    });

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
}


// ==============================================================================
// 9. Workflow Action Buttons
// ==============================================================================
function setup_workflow_action_buttons(frm) {
    if (frm.is_new()) return;

    // Remove any default Frappe primary submit action & clear custom actions
    if (frm.page) {
        frm.page.clear_primary_action();
        frm.page.clear_custom_actions();
        frm.page.clear_actions_menu();
        frm.page.hide_actions_menu();
    }

    let state = frm.doc.status || "Draft";
    let user = frappe.session.user;
    let roles = frappe.user_roles || [];
    let is_admin = roles.includes("Administrator") || roles.includes("System Manager");

    function show_actions() {
        if (frm.page) {
            frm.page.show_actions_menu();
            if (frm.page.actions_btn_group) {
                frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            }
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }
        }
    }

    if (state === "Draft" || state.includes("Returned for Revision")) {
        // Single clean primary button labeled "Submit"
        if (frm.page) {
            frm.page.set_primary_action(__("Submit"), function() {
                frm.set_value("status", "Pending Team Lead Approval");
                if (frm.fields_dict["workflow_state"]) {
                    frm.set_value("workflow_state", "Pending Team Lead Approval");
                }
                frm.save().then(() => {
                    frappe.show_alert({
                        message: __("Employment Contract submitted to Team Lead for approval"),
                        indicator: "green"
                    });
                });
            });
        }
    } else if (state === "Pending Team Lead Approval") {
        let is_tl_authorized = is_admin || (frm.doc.team_lead_approver ? user === frm.doc.team_lead_approver : roles.includes("Team Lead"));
        if (is_tl_authorized && frm.page) {
            frm.page.add_action_item(__("Approve (Team Lead)"), function() {
                let now_str = frappe.datetime.now_datetime();
                frm.set_value("team_lead_decision", `Approved [${now_str}]`);
                frm.set_value("status", "Pending HR Review");
                frm.save();
            });

            frm.page.add_action_item(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "Team Lead");
            });

            frm.page.add_action_item(__("Reject"), function() {
                prompt_rejection_reason(frm, "Team Lead");
            });

            show_actions();
        }
    } else if (state === "Pending HR Review") {
        let is_hr_authorized = is_admin || (frm.doc.hr_approver ? user === frm.doc.hr_approver : (roles.includes("HR Manager") || roles.includes("HR User")));
        if (is_hr_authorized && frm.page) {
            frm.page.add_action_item(__("Approve (HR Review)"), function() {
                let now_str = frappe.datetime.now_datetime();
                frm.set_value("hr_decision", `Approved [${now_str}]`);
                frm.set_value("status", "Pending CEO Approval");
                frm.save();
            });

            frm.page.add_action_item(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "HR Review");
            });

            frm.page.add_action_item(__("Reject"), function() {
                prompt_rejection_reason(frm, "HR Review");
            });

            show_actions();
        }
    } else if (state === "Pending CEO Approval") {
        let is_ceo_authorized = is_admin || (frm.doc.ceo_approver ? user === frm.doc.ceo_approver : roles.includes("CEO Approver"));
        if (is_ceo_authorized && frm.page) {
            frm.page.add_action_item(__("Approve (CEO)"), function() {
                let now_str = frappe.datetime.now_datetime();
                frm.set_value("ceo_decision", `Approved [${now_str}]`);
                frm.set_value("status", "CEO Approved");
                frm.save();
            });

            frm.page.add_action_item(__("Return for Revision"), function() {
                prompt_revision_reason(frm, "CEO");
            });

            frm.page.add_action_item(__("Reject"), function() {
                prompt_rejection_reason(frm, "CEO");
            });

            show_actions();
        }
    } else if (state === "CEO Approved" || state === "Pending Final HR Review") {
        let is_final_hr_authorized = is_admin || (frm.doc.final_hr_approver ? user === frm.doc.final_hr_approver : (frm.doc.hr_approver ? user === frm.doc.hr_approver : roles.includes("HR Manager")));
        if (is_final_hr_authorized && frm.page) {
            frm.page.add_action_item(__("Issue for Employee Signature"), function() {
                let now_str = frappe.datetime.now_datetime();
                frm.set_value("final_hr_decision", `Approved [${now_str}]`);
                frm.set_value("status", "Awaiting Employee Signature");
                frm.save();
            });

            frm.page.add_action_item(__("Reject"), function() {
                prompt_rejection_reason(frm, "Final HR");
            });

            show_actions();
        }
    } else if (state === "Awaiting Employee Signature" || state === "Signed by Employee") {
        if ((is_admin || roles.includes("HR Manager")) && frm.page) {
            frm.page.add_action_item(__("Countersign & Activate"), function() {
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
            });

            show_actions();
        }
    } else if (state === "Rejected" && (is_admin || user === frm.doc.owner)) {
        if (frm.page) {
            frm.page.add_action_item(__("Reopen as Draft"), function() {
                frappe.confirm(__("Are you sure you want to reopen this rejected contract as Draft?"), function() {
                    frm.set_value("status", "Draft");
                    frm.set_value("team_lead_decision", "Pending");
                    frm.set_value("hr_decision", "Pending");
                    frm.set_value("ceo_decision", "Pending");
                    frm.set_value("final_hr_decision", "Pending");
                    frm.save();
                });
            });

            show_actions();
        }
    }
}

function prompt_revision_reason(frm, tier_name) {
    let now_str = frappe.datetime.now_datetime();
    let d = new frappe.ui.Dialog({
        title: __(`Return for Revision — ${tier_name}`),
        fields: [
            {
                label: __("Revision Instructions / Remarks (Mandatory)"),
                fieldname: "comments",
                fieldtype: "Small Text",
                reqd: 1
            }
        ],
        primary_action_label: __("Return for Revision"),
        primary_action: function(values) {
            if (!values.comments || !values.comments.trim()) {
                frappe.msgprint(__("Revision instructions are mandatory."));
                return;
            }
            if (tier_name.includes("Team Lead")) {
                frm.set_value("team_lead_decision", `Returned for Revision [${now_str}]`);
                frm.set_value("team_lead_remarks", values.comments);
            } else if (tier_name.includes("HR")) {
                frm.set_value("hr_decision", `Returned for Revision [${now_str}]`);
                frm.set_value("hr_remarks", values.comments);
            } else if (tier_name.includes("CEO")) {
                frm.set_value("ceo_decision", `Returned for Revision [${now_str}]`);
                frm.set_value("ceo_remarks", values.comments);
            }
            frm.set_value("status", "Returned for Revision");
            frm.save();
            d.hide();
        }
    });
    d.show();
}

function prompt_rejection_reason(frm, tier_name) {
    let now_str = frappe.datetime.now_datetime();
    let d = new frappe.ui.Dialog({
        title: __(`Reject Employment Contract — ${tier_name}`),
        fields: [
            {
                label: __("Rejection Reason / Comments (Mandatory)"),
                fieldname: "comments",
                fieldtype: "Small Text",
                reqd: 1
            }
        ],
        primary_action_label: __("Confirm Rejection"),
        primary_action: function(values) {
            if (!values.comments || !values.comments.trim()) {
                frappe.msgprint(__("Rejection comments are mandatory."));
                return;
            }
            if (tier_name.includes("Team Lead")) {
                frm.set_value("team_lead_decision", `Rejected [${now_str}]`);
                frm.set_value("team_lead_remarks", values.comments);
            } else if (tier_name.includes("HR")) {
                frm.set_value("hr_decision", `Rejected [${now_str}]`);
                frm.set_value("hr_remarks", values.comments);
            } else if (tier_name.includes("CEO")) {
                frm.set_value("ceo_decision", `Rejected [${now_str}]`);
                frm.set_value("ceo_remarks", values.comments);
            }
            frm.set_value("status", "Rejected");
            frm.save();
            d.hide();
        }
    });
    d.show();
}


// ==============================================================================
// 10. PDF Attachment Validation (Strict PDF-Only)
// ==============================================================================
function validate_pdf_attachment(frm, fieldname) {
    let file_url = frm.doc[fieldname];
    if (!file_url) return true;

    let clean_path = file_url.split("?")[0].split("#")[0].toLowerCase().trim();
    let ext = clean_path.split(".").pop();

    if (ext !== "pdf") {
        let field_label = frm.get_docfield(fieldname)?.label || fieldname;
        frm.set_value(fieldname, null);

        // Deduplicate: prevent firing duplicate popups within 1.5 seconds
        let now = Date.now();
        if (frm._last_pdf_err_time && (now - frm._last_pdf_err_time < 1500) && frm._last_pdf_err_field === fieldname) {
            return false;
        }
        frm._last_pdf_err_time = now;
        frm._last_pdf_err_field = fieldname;

        if (frm._pdf_err_timer) {
            clearTimeout(frm._pdf_err_timer);
        }

        frm._pdf_err_timer = setTimeout(() => {
            if (frappe.msg_dialog && typeof frappe.msg_dialog.clear === "function") {
                frappe.msg_dialog.clear();
            }

            frappe.msgprint({
                title: __("Invalid Document Format"),
                indicator: "red",
                message: __(
                    "<div style='font-size: 14px; line-height: 1.6; padding: 4px 0;'>" +
                    "<p style='margin-bottom: 8px;'><b>" + frappe.utils.escape_html(field_label) + "</b> only accepts <b>PDF (.pdf)</b> files.</p>" +
                    "<p style='color: #dc2626; margin-bottom: 8px;'>The uploaded file (<b>." + frappe.utils.escape_html(ext) + "</b>) is not permitted and has been removed.</p>" +
                    "<p style='color: #475569; font-size: 13px;'>Please select and upload a valid PDF document.</p>" +
                    "</div>"
                ),
                primary_action: {
                    label: __("Understood"),
                    action: function() {
                        frappe.hide_msgprint(true);
                        if (frappe.msg_dialog && typeof frappe.msg_dialog.hide === "function") {
                            frappe.msg_dialog.hide();
                        }
                    }
                }
            });
        }, 400);

        return false;
    }
    return true;
}

function setup_status_indicator(frm) {
    let s = frm.doc.status || frm.doc.workflow_state || "Draft";
    let color = "blue";
    if (s === "Active" || s.includes("Approved")) color = "green";
    else if (s.includes("Revision") || s.includes("Pending") || s.includes("Issued") || s.includes("Signature")) color = "orange";
    else if (s.includes("Reject") || s === "Expired" || s === "Terminated") color = "red";
    else if (s === "Draft") color = "gray";

    frm.page.set_indicator(__(s), color);
}
