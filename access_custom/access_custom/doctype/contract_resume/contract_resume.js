function setup_pdf_restrictions(frm) {
    let field = frm.get_field("resume_supporting_document");
    if (field && field.df) {
        field.df.options = {
            restrictions: {
                allowed_file_types: [".pdf", "application/pdf"]
            }
        };
    }
}

function validate_supporting_document_pdf(frm) {
    if (!frm.doc.resume_supporting_document) return true;
    let path = String(frm.doc.resume_supporting_document).split("?")[0].split("#")[0].toLowerCase().trim();
    if (!path.endsWith(".pdf")) {
        frm.set_value("resume_supporting_document", "");
        frappe.msgprint({
            title: __("Invalid Document Format"),
            indicator: "red",
            message: __("<b>Resume Supporting Document</b> only accepts <b>PDF (.pdf)</b> files.<br><br>The uploaded file is not permitted and has been removed.")
        });
        return false;
    }
    return true;
}

frappe.ui.form.on("Contract Resume", {
    resume_supporting_document: function(frm) {
        validate_supporting_document_pdf(frm);
    },

    requested_by: function(frm) {
        format_requested_by_display_contract_resume(frm);
    },

    onload: function(frm) {
        setup_pdf_restrictions(frm);
        if (frm.is_new()) {
            frm.doc.lead_approver_status = null;
            frm.doc.lead_approver_review = null;
            frm.doc.legal_approver_status = null;
            frm.doc.legal_approver_review = null;
            frm.doc.finance_approver_status = null;
            frm.doc.finance_approver_review = null;
            frm.doc.hr_approver_status = null;
            frm.doc.hr_approver_review = null;
            frm.doc.ceo_approver_status = null;
            frm.doc.ceo_approver_review = null;
            if (!frm.doc.requested_by && frappe.session.user) {
                frappe.db.get_value("Employee", { user_id: frappe.session.user }, ["name", "employee_name"], (r) => {
                    let data = (r && r.message) ? r.message : r;
                    if (data && data.name) {
                        frm.set_value("requested_by", data.name).then(() => {
                            format_requested_by_display_contract_resume(frm);
                        });
                    }
                });
            }
        }
    },

    onload_post_render: function(frm) {
        setup_auto_expand_textareas(frm);
    },

    resume_remarks: function(frm) {
        setup_auto_expand_textareas(frm);
    },

    on_hold_record: function(frm) {
        if (!frm.doc.on_hold_record) return;
        frappe.db.get_doc("Contract On Hold", frm.doc.on_hold_record).then(h => {
            if (h) {
                frm.set_value("contract", h.contract);
                frm.set_value("customer_name", h.customer_name);
                frm.set_value("project_title", h.project_title);
                frm.set_value("company", h.company);
                frm.set_value("hold_date", h.hold_date);
                frm.set_value("expected_resume_date", h.expected_resume_date);
                frm.set_value("hold_reason", h.hold_reason);
                frm.set_value("hold_supporting_document", h.supporting_document);
                if (h.lead_approver && !frm.doc.lead_approver) frm.set_value("lead_approver", h.lead_approver);
                if (h.legal_approver && !frm.doc.legal_approver) frm.set_value("legal_approver", h.legal_approver);
                if (h.finance_approver && !frm.doc.finance_approver) frm.set_value("finance_approver", h.finance_approver);
                if (h.hr_approver && !frm.doc.hr_approver) frm.set_value("hr_approver", h.hr_approver);
                if (h.ceo_approver && !frm.doc.ceo_approver) frm.set_value("ceo_approver", h.ceo_approver);
            }
        });
    },

    refresh: function(frm) {
        setup_pdf_restrictions(frm);
        setup_auto_expand_textareas(frm);
        inject_approver_stage_styles();
        enforce_stage_approver_actions(frm);
        format_requested_by_display_contract_resume(frm);

        if (frm.dashboard && frm.dashboard.parent) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".resume-rejection-banner").remove();
            frm.dashboard.parent.find(".resume-progress-container").remove();
        }

        if (frm.is_new()) {
            frm.page.clear_actions_menu();
            render_resume_progress_tracker(frm);
            return;
        }

        let rejected_stage = get_resume_rejection_stage(frm);
        if (rejected_stage) {
            let banner_html = `
            <div class="resume-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Resumption Request Rejected
                        </span>
                        <span class="badge" style="background: #dc2626; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                            Rejected by ${rejected_stage.role}
                        </span>
                    </div>
                    <span style="font-size: 12px; color: #64748b; font-weight: 500;">
                        ${frappe.utils.escape_html(rejected_stage.status.replace("Rejected ", ""))}
                    </span>
                </div>
                <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-bottom: 8px;">
                    <div><b>Approver:</b> ${frappe.utils.escape_html(rejected_stage.user || rejected_stage.role)}</div>
                    <div style="margin-top: 4px;"><b>Rejection Reason:</b> <span style="color: #b91c1c; font-weight: 600;">"${frappe.utils.escape_html(rejected_stage.review || 'No specific reason provided')}"</span></div>
                </div>
            </div>`;
            $(banner_html).prependTo(frm.dashboard.parent);
            frm.dashboard.show();
            frm.dashboard.parent.show();
        }

        apply_resume_approver_field_locking(frm);
        render_resume_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        setTimeout(() => {
            apply_resume_approver_field_locking(frm);
            setup_auto_expand_textareas(frm);
        }, 100);

        setup_resume_workflow_actions_guard(frm);
    },

    after_save: function(frm) {
        delete frm.doc.__unsaved;
        setup_resume_workflow_actions_guard(frm);
    },

    validate: function(frm) {
        if (!validate_supporting_document_pdf(frm)) {
            frappe.validated = false;
            return false;
        }

        if (frm.is_new() || frm.doc.workflow_state === "Maker" || !frm.doc.workflow_state) return;

        let check_auth = function(field, state_name, old_val) {
            let current_val = frm.doc[field] || "";
            if (current_val !== old_val) {
                if (!is_stage_approver(frm, state_name)) {
                    frappe.throw({
                        title: __("Not Authorized"),
                        message: __("You are not authorized! Only the assigned approver can write in this section.")
                    });
                }
                if (frm.doc.workflow_state !== state_name) {
                    frappe.throw({
                        title: __("Invalid Workflow Stage"),
                        message: __("You can only modify this review during the '{0}' stage.", [state_name])
                    });
                }
            }
        };

        check_auth("lead_approver_review", "Pending Team Lead Approval", frm.custom_old_lead || "");
        check_auth("legal_approver_review", "Pending Legal Approval", frm.custom_old_legal || "");
        check_auth("finance_approver_review", "Pending Finance Approval", frm.custom_old_finance || "");
        check_auth("hr_approver_review", "Pending HR Approval", frm.custom_old_hr || "");
        check_auth("ceo_approver_review", "Pending CEO Approval", frm.custom_old_ceo || "");
    }
});

function format_requested_by_display_contract_resume(frm) {
    if (!frm.doc.requested_by) return;
    frappe.db.get_value("Employee", frm.doc.requested_by, ["name", "employee_name"], (r) => {
        let data = (r && r.message) ? r.message : r;
        if (data && data.employee_name) {
            let $input = frm.get_field("requested_by")?.$input;
            if ($input && $input.length) {
                let display_text = `${data.employee_name} (${data.name})`;
                $input.val(display_text);
            }
        }
    });
}

function get_resume_rejection_stage(frm) {
    const check_stages = [
        { name: "Pending CEO Approval", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending HR Approval", status: frm.doc.hr_approver_status, review: frm.doc.hr_approver_review, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Finance Approval", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Pending Legal Approval", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Pending Team Lead Approval", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Rejected")) {
            return cs;
        }
    }
    return null;
}

function is_stage_approver(frm, state) {
    let user = frappe.session.user;
    if (user === "Administrator") return true;

    if (state === "Pending Team Lead Approval" && frm.doc.lead_approver) {
        return (user === frm.doc.lead_approver);
    }
    if (state === "Pending Legal Approval" && frm.doc.legal_approver) {
        return (user === frm.doc.legal_approver);
    }
    if (state === "Pending Finance Approval" && frm.doc.finance_approver) {
        return (user === frm.doc.finance_approver);
    }
    if (state === "Pending HR Approval" && frm.doc.hr_approver) {
        return (user === frm.doc.hr_approver);
    }
    if (state === "Pending CEO Approval" && frm.doc.ceo_approver) {
        return (user === frm.doc.ceo_approver);
    }
    return false;
}

function apply_resume_approver_field_locking(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Maker";

    const review_matrix = [
        { review: "lead_approver_review", status: "lead_approver_status", approver: "lead_approver", state: "Pending Team Lead Approval" },
        { review: "legal_approver_review", status: "legal_approver_status", approver: "legal_approver", state: "Pending Legal Approval" },
        { review: "finance_approver_review", status: "finance_approver_status", approver: "finance_approver", state: "Pending Finance Approval" },
        { review: "hr_approver_review", status: "hr_approver_status", approver: "hr_approver", state: "Pending HR Approval" },
        { review: "ceo_approver_review", status: "ceo_approver_status", approver: "ceo_approver", state: "Pending CEO Approval" }
    ];

    review_matrix.forEach(item => {
        let is_current_stage = (state === item.state);
        let is_user_approver = is_stage_approver(frm, item.state);

        if (is_current_stage && is_user_approver) {
            frm.set_df_property(item.review, "read_only", 0);
        } else {
            frm.set_df_property(item.review, "read_only", 1);
        }

        let st_val = frm.doc[item.status] || "Pending Review";
        let color = "#64748b";
        let bg = "#f1f5f9";
        let border = "#cbd5e1";

        if (st_val.includes("Approved")) {
            color = "#16a34a";
            bg = "#dcfce7";
            border = "#86efac";
        } else if (st_val.includes("Rejected")) {
            color = "#dc2626";
            bg = "#fee2e2";
            border = "#fca5a5";
        }

        let $status_wrapper = frm.get_field(item.status)?.$wrapper;
        if ($status_wrapper) {
            $status_wrapper.find(".custom-status-badge").remove();
            let $input = $status_wrapper.find("input");
            if ($input.length) {
                $input.hide();
                $(`
                    <div class="custom-status-badge" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        padding: 5px 12px;
                        border-radius: 16px;
                        font-size: 12px;
                        font-weight: 600;
                        color: ${color};
                        background: ${bg};
                        border: 1px solid ${border};
                        margin-top: 4px;
                    ">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${color};"></span>
                        ${frappe.utils.escape_html(st_val)}
                    </div>
                `).insertAfter($input);
            }
        }
    });

    if (state !== "Maker") {
        ["actual_resume_date", "resume_remarks", "resume_supporting_document"].forEach(f => {
            frm.set_df_property(f, "read_only", 1);
        });
    }
}

function setup_auto_expand_textareas(frm) {
    const text_fields = [
        "resume_remarks", "lead_approver_review",
        "legal_approver_review", "finance_approver_review",
        "hr_approver_review", "ceo_approver_review"
    ];

    text_fields.forEach(fieldname => {
        let field = frm.get_field(fieldname);
        if (field && field.$wrapper) {
            let $textarea = field.$wrapper.find("textarea");
            if ($textarea.length) {
                $textarea.attr("rows", 2);
                $textarea.css({
                    "min-height": "52px",
                    "height": "52px",
                    "resize": "vertical",
                    "overflow-y": "hidden",
                    "line-height": "1.45"
                });

                let resize = function() {
                    this.style.height = "auto";
                    this.style.height = Math.max(52, this.scrollHeight) + "px";
                };

                $textarea.off("input.auto_expand").on("input.auto_expand", resize);
                $textarea.each(function() {
                    resize.call(this);
                });
            }
        }
    });
}

function render_resume_progress_tracker(frm) {
    if (!frm.dashboard || !frm.dashboard.parent) return;

    frm.dashboard.parent.find(".resume-progress-container").remove();

    let steps = [
        { id: "Maker", label: "Maker" },
        { id: "Pending Team Lead Approval", label: "Team Lead" },
        { id: "Pending Legal Approval", label: "Legal" },
        { id: "Pending Finance Approval", label: "Finance" },
        { id: "Pending HR Approval", label: "HR" },
        { id: "Pending CEO Approval", label: "CEO" },
        { id: "Resumed", label: "Resumed" }
    ];

    let current_state = frm.doc.workflow_state || frm.doc.status || "Maker";
    let is_rejected = current_state.includes("Reject");
    let active_index = 0;

    if (current_state === "Resumed") {
        active_index = steps.length - 1;
    } else {
        let idx = steps.findIndex(s => s.id === current_state || (s.id === "Maker" && (current_state === "Maker" || current_state === "Draft")) || current_state.includes(s.label));
        active_index = idx >= 0 ? idx : 0;
    }

    let percent = current_state === "Resumed" ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

    let status_label = current_state;
    let status_bg = "#2563eb";
    let bar_color = "#2563eb";

    if (current_state === "Resumed") {
        status_label = "Resumed (100%)";
        status_bg = "#16a34a";
        bar_color = "#16a34a";
    } else if (is_rejected) {
        status_label = "Resumption Rejected";
        status_bg = "#dc2626";
        bar_color = "#dc2626";
    } else if (current_state === "Maker") {
        status_label = "Maker (Draft)";
        status_bg = "#16a34a";
        bar_color = "#16a34a";
    }

    let nodes_html = steps.map((s, i) => {
        let is_done = (i < active_index) || (current_state === "Resumed");
        let is_curr = (i === active_index) && (current_state !== "Resumed");

        let circle_bg = "#f1f5f9";
        let circle_border = "#cbd5e1";
        let icon_color = "#94a3b8";
        let icon = `${i + 1}`;

        if (is_done) {
            circle_bg = "#16a34a";
            circle_border = "#16a34a";
            icon_color = "#ffffff";
            icon = "&#10003;";
        } else if (is_curr) {
            if (is_rejected) {
                circle_bg = "#dc2626";
                circle_border = "#dc2626";
                icon_color = "#ffffff";
                icon = "&#10007;";
            } else {
                circle_bg = "#2563eb";
                circle_border = "#2563eb";
                icon_color = "#ffffff";
            }
        }

        return `
            <div style="display: flex; flex-direction: column; align-items: center; position: relative; z-index: 2; flex: 1;">
                <div style="
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: ${circle_bg};
                    border: 2px solid ${circle_border};
                    color: ${icon_color};
                    font-size: 12px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                ">${icon}</div>
                <div style="
                    font-size: 11px;
                    font-weight: ${is_curr ? "700" : "500"};
                    color: ${is_curr ? (is_rejected ? "#dc2626" : "#0f172a") : (is_done ? "#16a34a" : "#64748b")};
                    margin-top: 6px;
                    text-align: center;
                    white-space: nowrap;
                ">${s.label}</div>
            </div>
        `;
    }).join("");

    let tracker_html = `
        <div class="resume-progress-container" style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px 20px 14px;
            margin: 10px 0 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 13px; font-weight: 700; color: #1e293b; letter-spacing: 0.3px;">
                    CONTRACT RESUMPTION WORKFLOW ROUTE
                </span>
                <span style="
                    font-size: 11px;
                    font-weight: 700;
                    padding: 3px 10px;
                    border-radius: 12px;
                    color: #ffffff;
                    background: ${status_bg};
                    letter-spacing: 0.3px;
                ">${status_label}</span>
            </div>

            <div style="position: relative; margin-top: 6px; padding: 0 10px;">
                <div style="
                    position: absolute;
                    top: 14px;
                    left: 40px;
                    right: 40px;
                    height: 4px;
                    background: #e2e8f0;
                    z-index: 1;
                    border-radius: 2px;
                ">
                    <div style="
                        width: ${percent}%;
                        height: 100%;
                        background: ${bar_color};
                        border-radius: 2px;
                        transition: width 0.4s ease;
                    "></div>
                </div>

                <div style="display: flex; justify-content: space-between; position: relative;">
                    ${nodes_html}
                </div>
            </div>
        </div>
    `;

    $(tracker_html).prependTo(frm.dashboard.parent);
    frm.dashboard.show();
    frm.dashboard.parent.show();
}

function setup_resume_workflow_actions_guard(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || frm.doc.status || "Maker";

    if (state === "Resumed") {
        if (frm.page && frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide").hide();
        if (frm.page && frm.page.actions && frm.page.actions.parent) frm.page.actions.parent().addClass("hide").hide();
        frm.disable_save();
        return;
    }

    if (state === "Maker") {
        let approvers = [
            frm.doc.lead_approver,
            frm.doc.legal_approver,
            frm.doc.finance_approver,
            frm.doc.hr_approver,
            frm.doc.ceo_approver
        ].filter(Boolean);

        let is_approver = approvers.includes(frappe.session.user);
        let is_creator = (frappe.session.user === frm.doc.owner);
        let has_cm_role = Boolean(frappe.user_roles && frappe.user_roles.includes("Contract Manager"));

        if (is_approver || (!is_creator && !has_cm_role && frappe.session.user !== "Administrator")) {
            frm.page.clear_actions_menu();
            if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide").hide();
            if (frm.page.actions && frm.page.actions.parent) frm.page.actions.parent().addClass("hide").hide();
            frm.disable_save();
        }
        return;
    }

    if (state !== "Maker") {
        let is_approver = is_stage_approver(frm, state);
        if (!is_approver && frappe.session.user !== "Administrator") {
            frm.page.clear_actions_menu();
            if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide").hide();
            if (frm.page.actions && frm.page.actions.parent) frm.page.actions.parent().addClass("hide").hide();
            frm.disable_save();
        }
    }
}

function enforce_stage_approver_actions(frm) {
    setup_resume_workflow_actions_guard(frm);
}

function inject_approver_stage_styles() {
    $("#contract-resume-stage-style").remove();
    $(`
    <style id="contract-resume-stage-style">
        .form-section[data-fieldname="section_break_approvals"],
        .form-section[data-fieldname="section_break_app_legal"],
        .form-section[data-fieldname="section_break_app_fin"],
        .form-section[data-fieldname="section_break_app_hr"],
        .form-section[data-fieldname="section_break_app_ceo"] {
            margin-bottom: 0px !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
        }

        .form-section[data-fieldname="section_break_app_legal"],
        .form-section[data-fieldname="section_break_app_fin"],
        .form-section[data-fieldname="section_break_app_hr"],
        .form-section[data-fieldname="section_break_app_ceo"] {
            border-top: 1px solid #f1f5f9 !important;
        }

        .form-section[data-fieldname="section_break_app_legal"] .section-head,
        .form-section[data-fieldname="section_break_app_fin"] .section-head,
        .form-section[data-fieldname="section_break_app_hr"] .section-head,
        .form-section[data-fieldname="section_break_app_ceo"] .section-head {
            display: none !important;
        }

        .form-section[data-fieldname="section_break_resume_remarks"] {
            border-top: none !important;
            padding-top: 0px !important;
            margin-top: -6px !important;
            margin-bottom: 0px !important;
        }

        .form-section[data-fieldname="section_break_resume_remarks"] .section-head {
            display: none !important;
        }

        [data-fieldname="resume_remarks"] .frappe-control,
        [data-fieldname="resume_remarks"] textarea {
            width: 100% !important;
            box-sizing: border-box !important;
        }
    </style>
    `).appendTo("head");
}
