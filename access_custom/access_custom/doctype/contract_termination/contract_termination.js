// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

function validate_pdf_upload(frm, fieldname, label) {
    let val = frm.doc[fieldname];
    if (val && !val.toLowerCase().endsWith(".pdf")) {
        frm.set_value(fieldname, "");
        frappe.msgprint({
            title: __("Invalid File Format"),
            indicator: "red",
            message: __("Only PDF files (<b>.pdf</b>) are allowed for <b>" + label + "</b>.<br><br>Please select and upload a document in <b>.pdf</b> format.")
        });
        return false;
    }
    return true;
}

function setup_pdf_restrictions(frm) {
    ["closure_documents", "client_communication_document"].forEach(fn => {
        let field = frm.get_field(fn);
        if (field && field.df) {
            field.df.options = {
                restrictions: {
                    allowed_file_types: [".pdf", "application/pdf"]
                }
            };
        }
    });
}

frappe.ui.form.on("Contract Termination", {
requested_by: function(frm) {
        format_requested_by_display_contract_termination(frm);
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
                        format_requested_by_display_contract_termination(frm);
                    });
                }
            });
            }
        }
    },

    closure_documents: function(frm) {
        validate_pdf_upload(frm, "closure_documents", "Closure Documents");
        setup_term_workflow_actions_guard(frm);
    },

    client_communication_document: function(frm) {
        validate_pdf_upload(frm, "client_communication_document", "Client Communication Upload");
        setup_term_workflow_actions_guard(frm);
    },

    refresh: function(frm) {
        enforce_stage_approver_actions(frm);
        format_requested_by_display_contract_termination(frm);
        setup_pdf_restrictions(frm);

        if (frm.dashboard && frm.dashboard.parent) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".termination-rejection-banner").remove();
            frm.dashboard.parent.find(".termination-progress-container").remove();
        }

        if (frm.is_new()) {
            frm.page.clear_actions_menu();
            return;
        }

        let rejected_stage = get_termination_rejection_stage(frm);
        if (rejected_stage) {
            let banner_html = `
            <div class="termination-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Termination Request Rejected
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

        apply_termination_approver_field_locking(frm);
        render_termination_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        setTimeout(() => setup_auto_expand_textareas(frm), 150);

        setup_term_workflow_actions_guard(frm);

        $(frm.wrapper).off("dirty.term_workflow_guard").on("dirty.term_workflow_guard", function() {
            if (frm.is_new()) return;
            setup_term_workflow_actions_guard(frm);
        });

        setTimeout(() => {
            apply_termination_approver_field_locking(frm);
            setup_term_workflow_actions_guard(frm);
        }, 120);
    },

    after_save: function(frm) {
        if (frm.is_new()) return;
        setup_term_workflow_actions_guard(frm);
        setTimeout(() => {
            setup_term_workflow_actions_guard(frm);
        }, 120);
    },

    contract: function(frm) {
        if (!frm.doc.contract) {
            frm.set_value("customer_name", "");
            frm.set_value("project_title", "");
            frm.set_value("contract_value", 0);
            return;
        }

        frappe.db.get_doc("Test Customer Contract", frm.doc.contract).then(c => {
            frm.set_value("customer_name", c.customer_name || c.party_name || "");
            frm.set_value("project_title", c.project_title || "");
            frm.set_value("contract_value", c.current_contract_value || c.project_budget || 0);

            if (c.lead_approver && !frm.doc.lead_approver) frm.set_value("lead_approver", c.lead_approver);
            if (c.legal_approver && !frm.doc.legal_approver) frm.set_value("legal_approver", c.legal_approver);
            if (c.finance_approver && !frm.doc.finance_approver) frm.set_value("finance_approver", c.finance_approver);
            if (c.hr_approver && !frm.doc.hr_approver) frm.set_value("hr_approver", c.hr_approver);
            if (c.ceo_approver && !frm.doc.ceo_approver) frm.set_value("ceo_approver", c.ceo_approver);
        });
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "";
        let action_lower = action.toLowerCase();

        // 1. If executing termination, require signed PDF client communication document
        if (action === "Execute Termination" || action === "Upload Client Communication") {
            if (!frm.doc.client_communication_document) {
                frappe.msgprint({
                    title: __("Missing Attachment"),
                    indicator: "red",
                    message: __("Please attach the formal <b>Client Communication Document (PDF)</b> before executing termination.")
                });
                return Promise.reject("MISSING_CLIENT_COMMUNICATION");
            }
            if (!frm.doc.client_communication_document.toLowerCase().endsWith(".pdf")) {
                frappe.msgprint({
                    title: __("Invalid File Format"),
                    indicator: "red",
                    message: __("Only PDF files (<b>.pdf</b>) are allowed for Client Communication Upload.")
                });
                return Promise.reject("INVALID_FILE_FORMAT");
            }
            return Promise.resolve();
        }

        // 2. Identify approver fields for the current state
        let status_field = "";
        let review_field = "";
        if (state === "Termination Under TL Review") {
            status_field = "lead_approver_status";
            review_field = "lead_approver_review";
        } else if (state === "Termination Under Legal Review") {
            status_field = "legal_approver_status";
            review_field = "legal_approver_review";
        } else if (state === "Termination Under Finance Review") {
            status_field = "finance_approver_status";
            review_field = "finance_approver_review";
        } else if (state === "Termination Under HR Review") {
            status_field = "hr_approver_status";
            review_field = "hr_approver_review";
        } else if (state === "Termination Under CEO Review") {
            status_field = "ceo_approver_status";
            review_field = "ceo_approver_review";
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        // 3. Handle Approvals: Stamp timestamp
        if (action_lower.includes("approve")) {
            if (status_field) {
                let status_text = "Approved [" + now_str + "]";
                await frappe.call({
                    method: "frappe.client.set_value",
                    args: {
                        doctype: frm.doc.doctype,
                        name: frm.doc.name,
                        fieldname: {
                            [status_field]: status_text,
                            [review_field]: frm.doc[review_field] || ""
                        }
                    }
                });
                frm.doc[status_field] = status_text;
            }
            return Promise.resolve();
        }

        // 4. Handle Rejections: Prompt for reason & stamp timestamp
        if (action_lower.includes("reject")) {
            if (status_field && review_field) {
                return new Promise((resolve, reject) => {
                    let submitted = false;
                    let dialog = new frappe.ui.Dialog({
                        title: __("Reject Termination Request"),
                        fields: [
                            {
                                label: __("Reason for Rejection"),
                                fieldname: "reason",
                                fieldtype: "Small Text",
                                reqd: 1,
                                description: __("Please provide the specific reason for rejecting this termination request.")
                            }
                        ],
                        primary_action_label: __("Submit Rejection"),
                        primary_action: async function(values) {
                            let reason = values.reason ? values.reason.trim() : "";
                            if (!reason) {
                                frappe.msgprint({
                                    title: __("Reason Required"),
                                    indicator: "red",
                                    message: __("Please enter a reason before submitting the rejection.")
                                });
                                return;
                            }

                            let status_val = "Rejected [" + now_str + "]";
                            await frappe.call({
                                method: "frappe.client.set_value",
                                args: {
                                    doctype: frm.doc.doctype,
                                    name: frm.doc.name,
                                    fieldname: {
                                        [status_field]: status_val,
                                        [review_field]: reason
                                    }
                                }
                            });

                            frm.doc[status_field] = status_val;
                            frm.doc[review_field] = reason;
                            submitted = true;
                            dialog.hide();
                            resolve();
                        }
                    });

                    dialog.show();
                    dialog.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("REJECTION_CANCELLED"); });
                    dialog.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("REJECTION_CANCELLED"); });
                });
            }
        }

        return Promise.resolve();
    }
});

// ==============================================================================
// 1. Rejection Helper & Modern Connected Stepper Tracker
// ==============================================================================
function render_termination_progress_tracker(frm) {
    if (!frm.dashboard || !frm.dashboard.parent) return;

    frm.dashboard.parent.find(".termination-progress-container").remove();

    let steps = [
        { id: "Termination Requested", label: "Requested" },
        { id: "Termination Under TL Review", label: "Team Lead" },
        { id: "Termination Under Legal Review", label: "Legal" },
        { id: "Termination Under Finance Review", label: "Finance" },
        { id: "Termination Under HR Review", label: "HR" },
        { id: "Termination Under CEO Review", label: "CEO" },
        { id: "Termination Pending Client Comm", label: "Client Comm" },
        { id: "Termination Executed", label: "Executed" }
    ];

    let current_state = frm.doc.workflow_state || frm.doc.status || "Termination Requested";
    let is_rejected = current_state.includes("Reject");
    let rejected_stage = get_termination_rejection_stage(frm);
    if (rejected_stage) is_rejected = true;
    
    let active_index = 0;
    if (current_state === "Termination Executed" || current_state === "Terminated" || frm.doc.docstatus === 1) {
        active_index = steps.length - 1;
    } else if (current_state === "Termination Pending Client Comm") {
        active_index = 6;
    } else if (rejected_stage) {
        active_index = steps.findIndex(s => s.id === rejected_stage.name);
        if (active_index < 0) active_index = 1;
    } else {
        let idx = steps.findIndex(s => s.id === current_state || current_state.includes(s.label));
        active_index = idx >= 0 ? idx : 0;
    }

    let is_fully_completed = (current_state === "Termination Executed" || current_state === "Terminated" || frm.doc.docstatus === 1);
    let percent = is_fully_completed ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

    let status_bg = "#16a34a";
    let bar_color = "#16a34a";
    if (is_rejected) {
        status_bg = "#dc2626";
        bar_color = "#dc2626";
    }

    let nodes_html = steps.map((s, idx) => {
        let is_completed = (idx < active_index) || is_fully_completed;
        let is_active = (idx === active_index) && !is_fully_completed;

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
            } else {
                circle_bg = "#16a34a";
                circle_border = "#15803d";
                circle_color = "#ffffff";
                circle_content = idx + 1;
                label_color = "#15803d";
                label_weight = "700";
                pulse_style = "box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.25);";
            }
        }

        return `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 48px; position: relative; z-index: 2;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background: ${circle_bg}; border: 2px solid ${circle_border}; color: ${circle_color}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-bottom: 5px; ${pulse_style}">
                ${circle_content}
            </div>
            <div style="font-size: 10px; font-weight: ${label_weight}; color: ${label_color}; text-align: center; line-height: 1.2;">
                ${s.label}
            </div>
        </div>
        `;
    }).join("");

    let is_executed_state = (current_state === "Termination Executed" || current_state === "Terminated");
    let term_time_str = frm.doc.executed_on ? frappe.datetime.str_to_user(frm.doc.executed_on) : (is_executed_state ? frappe.datetime.str_to_user(frm.doc.modified) : "");
    let header_badge_text = is_executed_state && term_time_str
        ? `Termination Executed [${term_time_str}] (100%)`
        : `${frappe.utils.escape_html(current_state)} (${percent}%)`;

    let container_html = `
    <div class="termination-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <span>Contract Termination Review Workflow</span>
            </div>
            <div>
                <span class="badge" style="background: ${status_bg}; color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 12px; font-weight: 600;">
                    ${header_badge_text}
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
    $container.prependTo(frm.dashboard.parent);
    frm.dashboard.show();
}

function get_termination_rejection_stage(frm) {
    const check_stages = [
        { name: "Termination Under CEO Review", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Termination Under HR Review", status: frm.doc.hr_approver_status, review: frm.doc.hr_approver_review, role: "HR", user: frm.doc.hr_approver },
        { name: "Termination Under Finance Review", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Termination Under Legal Review", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Termination Under TL Review", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Rejected")) {
            return cs;
        }
    }
    return null;
}

// ==============================================================================
// 2. Strict Approver Isolation & Authorized Stage Checking
// ==============================================================================
function is_stage_approver(frm, state) {
    if (!frm || !frm.doc || !state) return false;
    if (frappe.session.user === "Administrator") {
        return true;
    }

    let is_cm = (frappe.session.user === frm.doc.owner) ||
        (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));

    // Contract Manager manages Initiation, Client Comm, and Final Execution
    if (state === "Termination Requested" || state === "Termination Pending Client Comm") {
        return is_cm;
    }

    const stage_map = {
        "Termination Under TL Review": { field: "lead_approver", roles: ["Team Lead"] },
        "Termination Under Legal Review": { field: "legal_approver", roles: ["Legal Approver"] },
        "Termination Under Finance Review": { field: "finance_approver", roles: ["Finance Approver", "Accounts Manager"] },
        "Termination Under HR Review": { field: "hr_approver", roles: ["HR Approver", "HR Manager", "HR User"] },
        "Termination Under CEO Review": { field: "ceo_approver", roles: ["CEO Approver"] }
    };

    let cfg = stage_map[state];
    if (!cfg) return false;

    if (cfg.field && frm.doc[cfg.field] && frappe.session.user === frm.doc[cfg.field]) {
        return true;
    }

    if (cfg.roles && cfg.roles.some(r => frappe.user_roles && frappe.user_roles.includes(r))) {
        return true;
    }

    return false;
}

function apply_termination_approver_field_locking(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Termination Requested";
    let is_submitted = frm.doc.docstatus === 1 || state === "Termination Executed";

    let is_cm = (frappe.session.user === frm.doc.owner) ||
        (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager"))) ||
        frappe.session.user === "Administrator";

    let is_in_review = state !== "Termination Requested";
    let locked_fields = [
        "contract", "termination_type", "termination_notice_date", "effective_termination_date",
        "requested_by", "reason", "outstanding_deliverables", "assets_to_be_returned",
        "financial_settlement_required", "outstanding_payment", "final_settlement",
        "lead_approver", "legal_approver", "finance_approver", "hr_approver", "ceo_approver"
    ];

    if (is_in_review || is_submitted) {
        locked_fields.forEach(f => {
            frm.set_df_property(f, "read_only", 1);
        });
    } else {
        if (is_cm) {
            locked_fields.forEach(f => {
                frm.set_df_property(f, "read_only", 0);
            });
        } else {
            locked_fields.forEach(f => {
                frm.set_df_property(f, "read_only", 1);
            });
        }
    }

    // Document attachments: only editable by Contract Manager in Client Comm or Termination Requested
    let can_edit_docs = !is_submitted && is_cm && (state === "Termination Requested" || state === "Termination Pending Client Comm");
    frm.set_df_property("closure_documents", "read_only", can_edit_docs ? 0 : 1);
    frm.set_df_property("client_communication_document", "read_only", can_edit_docs ? 0 : 1);

    const review_matrix = [
        { review: "lead_approver_review", status: "lead_approver_status", approver: "lead_approver", state: "Termination Under TL Review", role: "Team Lead" },
        { review: "legal_approver_review", status: "legal_approver_status", approver: "legal_approver", state: "Termination Under Legal Review", role: "Legal" },
        { review: "finance_approver_review", status: "finance_approver_status", approver: "finance_approver", state: "Termination Under Finance Review", role: "Finance" },
        { review: "hr_approver_review", status: "hr_approver_status", approver: "hr_approver", state: "Termination Under HR Review", role: "HR" },
        { review: "ceo_approver_review", status: "ceo_approver_status", approver: "ceo_approver", state: "Termination Under CEO Review", role: "CEO" },
    ];

    review_matrix.forEach(item => {
        let status_val = frm.doc[item.status] || "";
        let review_val = frm.doc[item.review] || "";

        frm.set_df_property(item.status, "read_only", 1);

        let is_assigned_user = is_stage_approver(frm, item.state);
        let is_active_stage = (state === item.state);
        let can_edit_comment = !is_submitted && is_active_stage && is_assigned_user;

        frm.set_df_property(item.review, "read_only", can_edit_comment ? 0 : 1);

        frm.refresh_field(item.status);
        frm.refresh_field(item.review);

        let status_field = frm.get_field(item.status);
        if (status_field && status_field.$wrapper) {
            let $disp = status_field.$wrapper.find(".control-value");
            if (!$disp.length) {
                let $target = status_field.$wrapper.find(".control-input-wrapper");
                $disp = $('<div class="control-value like-disabled-input"></div>').appendTo($target.length ? $target : status_field.$wrapper);
            }
            if (status_val) {
                let badge_bg = "#16a34a";
                let text_color = "#ffffff";
                let icon = "&#10003;";
                if (status_val.includes("Rejected")) {
                    badge_bg = "#dc2626";
                    icon = "&#10007;";
                } else if (status_val.includes("Returned")) {
                    badge_bg = "#d97706";
                    icon = "&#8635;";
                } else if (status_val.includes("Not Required")) {
                    badge_bg = "#64748b";
                    icon = "&ndash;";
                }
                $disp.html(`
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${badge_bg}; color: ${text_color}; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); margin-top: 2px;">
                        <span>${icon}</span>
                        <span>${frappe.utils.escape_html(status_val)}</span>
                    </div>
                `).css({
                    "border": "none",
                    "background": "transparent",
                    "padding": "0",
                    "color": "inherit"
                }).show();
                status_field.$wrapper.find(".control-input").hide();
            } else {
                $disp.html(`<span style="color:#94a3b8; font-style:italic; font-size:12px;">Pending</span>`).show();
            }
        }

        let review_field = frm.get_field(item.review);
        if (review_field && review_field.$wrapper) {
            if (!can_edit_comment && review_val) {
                let border_color = status_val.includes("Rejected") ? "#f87171" : "#86efac";
                let bg_color = status_val.includes("Rejected") ? "#fef2f2" : "#f0fdf4";
                let text_color = status_val.includes("Rejected") ? "#991b1b" : "#166534";
                let left_accent = status_val.includes("Rejected") ? "#dc2626" : "#16a34a";

                review_field.$wrapper.find(".control-value, textarea").css({
                    "background-color": bg_color,
                    "border": `1px solid ${border_color}`,
                    "border-left": `4px solid ${left_accent}`,
                    "border-radius": "6px",
                    "padding": "8px 12px",
                    "font-size": "12px",
                    "color": text_color,
                    "line-height": "1.4",
                    "min-height": "45px",
                    "box-shadow": "0 1px 2px rgba(0,0,0,0.02)"
                });
            }
        }
    });

    // High-contrast visual pill & timestamp rendering for Status & Audit
    let is_terminated = (state === "Termination Executed" || state === "Terminated" || frm.doc.status === "Terminated" || frm.doc.docstatus === 1);
    let term_time_str = frm.doc.executed_on ? frappe.datetime.str_to_user(frm.doc.executed_on) : (is_terminated ? frappe.datetime.str_to_user(frm.doc.modified) : "");

    if (is_terminated) {
        ["workflow_state", "status"].forEach(f => {
            let fld = frm.get_field(f);
            if (fld && fld.$wrapper) {
                let display_text = (f === "workflow_state" ? "Termination Executed" : "Terminated") + ` [${term_time_str}]`;
                let $disp = fld.$wrapper.find(".control-value");
                if (!$disp.length) {
                    let $target = fld.$wrapper.find(".control-input-wrapper");
                    $disp = $('<div class="control-value like-disabled-input"></div>').appendTo($target.length ? $target : fld.$wrapper);
                }
                $disp.html(`
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #16a34a; color: #ffffff; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); margin-top: 2px;">
                        <span>&#10003;</span>
                        <span>${frappe.utils.escape_html(display_text)}</span>
                    </div>
                `).css({"border": "none", "background": "transparent", "padding": "0", "color": "inherit"}).show();
                fld.$wrapper.find(".control-input").hide();
            }
        });

        frm.set_df_property("executed_on", "hidden", 1);
    }
}

function setup_auto_expand_textareas(frm) {
    ["lead_approver_review", "legal_approver_review", "finance_approver_review", "hr_approver_review", "ceo_approver_review", "reason", "outstanding_deliverables", "assets_to_be_returned"].forEach(fn => {
        let field = frm.get_field(fn);
        if (field && field.$wrapper) {
            let $ta = field.$wrapper.find("textarea");
            if ($ta.length) {
                $ta.attr("rows", 2);
                $ta.css({
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

                $ta.off("input.auto_expand").on("input.auto_expand", resize);
                $ta.each(function() {
                    resize.call(this);
                });
            }
        }
    });
}

function setup_term_workflow_actions_guard(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Termination Requested";
    let is_submitted = frm.doc.docstatus === 1 || state === "Termination Executed";

    if (is_submitted) {
        frm.page.clear_actions_menu();
        if (frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().addClass("hide");
        }
        frm.disable_save();
        return;
    }

    let is_active_approver = is_stage_approver(frm, state);
    let is_dirty = frm.is_dirty() || (frm.doc && frm.doc.__unsaved);

    if (!is_active_approver) {
        frm.page.clear_actions_menu();
        if (frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().addClass("hide");
        }
        frm.disable_save();
    } else {
        if (is_dirty) {
            frm.enable_save();
            frm.page.clear_actions_menu();
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide");
            }
        } else {
            frm.disable_save();
            delete frm.doc.__unsaved;
            if (frm.states) {
                frm.states.show_actions();
            }
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl");
            }
        }
    }
}

function format_requested_by_display_contract_termination(frm) {
    let emp_id = frm.doc.requested_by;
    if (!emp_id) return;

    frm.set_df_property("requested_by", "description", "");
    if (frm.fields_dict.requested_by_name) {
        frm.set_df_property("requested_by_name", "hidden", 1);
    }

    frappe.db.get_value("Employee", emp_id, ["name", "employee_name", "first_name", "last_name"], function(r) {
        let data = (r && r.message) ? r.message : r;
        let emp_name = (data && (data.employee_name || data.first_name)) ? (data.employee_name || data.first_name) : "";
        let display_text = emp_name ? `${emp_name} (${emp_id})` : emp_id;

        if (frm.fields_dict.requested_by_name && !frm.doc.requested_by_name && emp_name) {
            frm.set_value("requested_by_name", emp_name);
        }

        let fld = frm.get_field("requested_by");
        if (fld && fld.$wrapper) {
            fld.$wrapper.find(".help-box").remove();
            let $input = fld.$wrapper.find("input");
            let $val = fld.$wrapper.find(".control-value, .like-disabled-input");
            
            if ($input.length && $input.is(":visible")) {
                $input.val(display_text);
                $val.hide();
            } else if ($val.length) {
                $val.text(display_text).show();
            }
        }
    });
}


function enforce_stage_approver_actions(frm) {
    if (!frm.doc || !frm.doc.workflow_state) return;

    const stage_approver_map = {'Termination Under TL Review': 'lead_approver', 'Termination Under Legal Review': 'legal_approver', 'Termination Under Finance Review': 'finance_approver', 'Termination Under HR Review': 'hr_approver', 'Termination Under CEO Review': 'ceo_approver'};
    const state = frm.doc.workflow_state;
    const approver_field = stage_approver_map[state];

    if (approver_field) {
        const assigned_user = frm.doc[approver_field];
        const is_authorized = (frappe.session.user === "Administrator") || 
                              (assigned_user && frappe.session.user === assigned_user);

        if (!is_authorized) {
            frm.page.clear_actions_menu();
            if (frm.page.actions_btn_group) {
                frm.page.actions_btn_group.addClass("hide hidden-xl");
            }
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide");
            }
            if (frm.workflow) {
                frm.workflow.setup_btn = function() {
                    frm.page.clear_actions_menu();
                    if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide hidden-xl");
                };
            }
        }
    }
}
