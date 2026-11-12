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

        render_contract_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        apply_contract_approver_field_locking(frm);
        align_contract_approver_rows(frm);
        apply_section_visibility(frm);
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


// ==============================================================================
// 1. CSS Injection (Matched to Consultant Contract)
// ==============================================================================
function inject_employment_contract_styles() {
    $("#ec-custom-ui-style").remove();
    $(`<style id="ec-custom-ui-style">
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

    if (frm.is_new()) {
        const review_fields = [
            { status: "team_lead_decision", review: "team_lead_remarks" },
            { status: "hr_decision", review: "hr_remarks" },
            { status: "ceo_decision", review: "ceo_remarks" },
            { status: "final_hr_decision", review: "final_hr_remarks" }
        ];
        review_fields.forEach(item => {
            let status_field = frm.get_field(item.status);
            if (status_field && status_field.$wrapper) {
                status_field.$wrapper.find(".approver-decision-badge").remove();
                status_field.$wrapper.find(".control-input-wrapper, .control-input, .control-value").show();
            }
            let review_field = frm.get_field(item.review);
            if (review_field && review_field.$wrapper) {
                review_field.$wrapper.find(".approver-remarks-content").remove();
                review_field.$wrapper.find(".control-input-wrapper, .control-input, .control-value").show();
            }
        });
        if (frm.wrapper) {
            $(frm.wrapper).find(".approver-decision-badge, .approver-remarks-content").remove();
            $(frm.wrapper).find(".control-input-wrapper, .control-input, .control-value").show();
        }
        return;
    }

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
            let status_val = frm.doc[item.status] || "";
            let review_val = frm.doc[item.review] || "";

            frm.set_df_property(item.status, "read_only", 1);
            let is_active_stage = (state === item.state);
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
                        let border_color = "#cbd5e1";
                        let text_color = "#1e293b";
                        let bg_color = "#f8fafc";
                        if (status_val && status_val.includes("Rejected")) {
                            border_color = "#fca5a5";
                            bg_color = "#fef2f2";
                            text_color = "#991b1b";
                        }
                        $rem.html(`
                            <div style="padding: 6px 12px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 13px; color: ${text_color}; line-height: 1.45; min-height: 32px; white-space: pre-wrap;">
                                ${frappe.utils.escape_html(review_val)}
                            </div>
                        `);
                    } else {
                        $rem.html(`
                            <div style="padding: 6px 12px; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic; min-height: 32px;">
                                No remarks entered.
                            </div>
                        `);
                    }
                    let $target = review_field.$wrapper.find(".form-group");
                    if ($target.length) {
                        $target.append($rem);
                    } else {
                        review_field.$wrapper.append($rem);
                    }
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


// ==============================================================================
// 7. Visual Workflow Stepper Tracker
// ==============================================================================
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


// ==============================================================================
// 8. Approver Role Queries
// ==============================================================================
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


// ==============================================================================
// 9. Workflow Action Buttons
// ==============================================================================
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
