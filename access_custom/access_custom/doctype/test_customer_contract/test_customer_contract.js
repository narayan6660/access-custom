// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Test Customer Contract", {
    customer_document: function(frm) {
        validate_contract_attachment(frm, "customer_document", ["pdf"], "PDF (.pdf)");
    },
    upload_signed_document: function(frm) {
        let state = frm.doc.workflow_state || "Draft";
        let ceo_status = frm.doc.ceo_approver_status || "";
        let is_ceo_approved = (
            state === "In Progress" ||
            state === "Commenced" ||
            state === "Active/Amendment Initiated" ||
            state === "On Hold" ||
            state === "Terminated" ||
            state === "Closed" ||
            (ceo_status && ceo_status.includes("Approved"))
        );

        if (!is_ceo_approved) {
            frm.set_value("upload_signed_document", null);
            frappe.msgprint({
                title: __("Action Not Allowed"),
                indicator: "red",
                message: __("<b>Complete Counter Signed Contract</b> can only be uploaded once CEO approval is completed.")
            });
            return;
        }

        let is_owner = (frappe.session.user === frm.doc.owner);
        let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
        let has_cm_role = (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));
        let is_admin = (frappe.session.user === "Administrator");
        let is_contract_manager = is_owner || is_contract_owner || has_cm_role || is_admin;

        if (!is_contract_manager) {
            frm.set_value("upload_signed_document", null);
            frappe.msgprint({
                title: __("Not Authorized"),
                indicator: "red",
                message: __("Only the <b>Contract Manager</b> is authorized to upload the Complete Counter Signed Contract.")
            });
            return;
        }

        validate_contract_attachment(frm, "upload_signed_document", ["pdf"], "PDF (.pdf)");
    },
    project__proposal: function(frm) {
        validate_contract_attachment(frm, "project__proposal", ["pdf"], "PDF (.pdf)");
    },
    budget_agreed_with_customer: function(frm) {
        validate_contract_attachment(frm, "budget_agreed_with_customer", ["pdf", "xls", "xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)");
    },
    proposal_budget: function(frm) {
        validate_contract_attachment(frm, "proposal_budget", ["pdf", "xls", "xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)");
    },

    validate: function(frm) {
        let state = frm.doc.workflow_state || "Draft";
        let ceo_status = frm.doc.ceo_approver_status || "";
        let is_ceo_approved = (
            state === "In Progress" ||
            state === "Commenced" ||
            state === "Active/Amendment Initiated" ||
            state === "On Hold" ||
            state === "Terminated" ||
            state === "Closed" ||
            (ceo_status && ceo_status.includes("Approved"))
        );

        let is_owner = (frappe.session.user === frm.doc.owner);
        let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
        let has_cm_role = (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));
        let is_admin = (frappe.session.user === "Administrator");
        let is_contract_manager = is_owner || is_contract_owner || has_cm_role || is_admin;

        if (frm.doc.upload_signed_document && !is_ceo_approved) {
            frm.set_value("upload_signed_document", null);
            frappe.msgprint({
                title: __("Action Not Allowed"),
                indicator: "red",
                message: __("<b>Complete Counter Signed Contract</b> can only be uploaded once CEO approval is completed.")
            });
            frappe.validated = false;
            return false;
        }

        if (frm.doc.upload_signed_document && !is_contract_manager) {
            let orig = frm.__orig_upload_signed_document;
            if (frm.doc.upload_signed_document !== orig) {
                frm.set_value("upload_signed_document", orig || null);
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> is authorized to upload the Complete Counter Signed Contract.")
                });
                frappe.validated = false;
                return false;
            }
        }

        let v1 = validate_contract_attachment(frm, "customer_document", ["pdf"], "PDF (.pdf)");
        let v2 = validate_contract_attachment(frm, "upload_signed_document", ["pdf"], "PDF (.pdf)");
        let v3 = validate_contract_attachment(frm, "project__proposal", ["pdf"], "PDF (.pdf)");
        let v4 = validate_contract_attachment(frm, "budget_agreed_with_customer", ["pdf", "xls", "xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)");
        let v5 = validate_contract_attachment(frm, "proposal_budget", ["pdf", "xls", "xlsx"], "PDF (.pdf), Excel (.xls, .xlsx)");
        if (!v1 || !v2 || !v3 || !v4 || !v5) {
            frappe.validated = false;
            return false;
        }
    },

    onload: function(frm) {
        if (frm.is_new()) {
            frm.save_disabled = false;
            if (typeof frm.enable_save === "function") frm.enable_save();
        } else {
            remove_frappe_default_actions(frm);
        }
    },

    refresh: function(frm) {
        if (frm.is_new()) {
            // On a new unsaved contract:
            // 1. MUST NOT show Actions button
            if (frm.page && frm.page.actions_btn_group) {
                frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                frm.page.actions_btn_group.find(".dropdown-menu").empty();
                let $btn = frm.page.actions_btn_group.find("button");
                $btn.attr("style", "");
            }
            if (frm.page && frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide hidden-xl").hide();
            }

            // 2. Clear any leftover custom action buttons
            if (typeof frm.clear_custom_buttons === "function") frm.clear_custom_buttons();
            if (frm.page && typeof frm.page.clear_custom_actions === "function") frm.page.clear_custom_actions();
            if (frm.page && frm.page.inner_toolbar) $(frm.page.inner_toolbar).empty().addClass("hide").hide();
            if (frm.page && frm.page.wrapper) frm.page.wrapper.find(".custom-actions").empty().hide();

            // 3. Ensure Save button is enabled and visible
            frm.save_disabled = false;
            if (typeof frm.enable_save === "function") frm.enable_save();
            if (frm.toolbar) {
                frm.toolbar.current_status = null;
                frm.toolbar.set_primary_action(true);
            }
            if (frm.page) {
                frm.page.set_primary_action(__("Save"), function() {
                    return frm.save("Save", null, this);
                });
            }

            // 4. Render progress tracker & formatting
            render_contract_progress_tracker(frm);
            setup_auto_expand_textareas(frm);
            setup_contract_attachment_restrictions(frm);

            setTimeout(() => {
                if (frm.is_new()) {
                    frm.save_disabled = false;
                    if (typeof frm.enable_save === "function") frm.enable_save();
                    if (frm.page) {
                        frm.page.set_primary_action(__("Save"), function() {
                            return frm.save("Save", null, this);
                        });
                    }
                    if (frm.page && frm.page.actions_btn_group) {
                        frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                    }
                }
            }, 100);

            return;
        }

        remove_frappe_default_actions(frm);
        // Clean up previous banners and trackers first
        if (frm.dashboard && frm.dashboard.parent) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".contract-rejection-banner, .contract-progress-container").remove();
        }

        // Rejection banner if contract was rejected
        let rejected_stage = get_contract_rejection_stage(frm);
        if (rejected_stage) {
            let banner_html = `
            <div class="contract-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Contract Proposal Rejected
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

        // Render Progress Stepper Tracker
        render_contract_progress_tracker(frm);

        // Apply visual styling pills & review comment cards
        apply_contract_approver_field_locking(frm);
        setup_auto_expand_textareas(frm);
        setTimeout(() => {
            apply_contract_approver_field_locking(frm);
            setup_auto_expand_textareas(frm);
        }, 120);

        // Render visual timeline tree on master contract
        render_contract_timeline_tree(frm);
        enforce_stage_approver_actions(frm);

        frm.__orig_upload_signed_document = frm.doc.upload_signed_document;
        let is_commenced_contract = (frm.doc.workflow_state === "Commenced" || frm.doc.workflow_state === "Active/Amendment Initiated" || frm.doc.contract_status === "Commenced" || frm.doc.docstatus === 1);

        if (!frm.is_new()) {
            delete frm.doc.__unsaved;
            if (!is_commenced_contract) {
                frm.save_disabled = false;
                if (frm.page && frm.page.actions_btn_group) {
                    let $btn = frm.page.actions_btn_group.find("button");
                    $btn.attr("style", "");
                }
                if (frm.states) {
                    frm.states.refresh();
                }
                setTimeout(() => {
                    if (frm.states) {
                        frm.states.show_actions();
                    }
                    if (frm.page && frm.page.actions_btn_group) {
                        frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
                    }
                    if (frm.page && frm.page.actions && frm.page.actions.parent) {
                        frm.page.actions.parent().removeClass("hide hidden-xl").show();
                    }
                    enforce_stage_approver_actions(frm);
                }, 100);
            }
        }

        if (is_commenced_contract) {
            // Once commenced, lock all form fields completely - do not change anything else on the contract!
            frm.set_read_only();
            if (frm.fields) {
                frm.fields.forEach(f => {
                    frm.set_df_property(f.df.fieldname, "read_only", 1);
                });
            }
            frm.disable_save();

            // Setup unified green actions menu (4 lifecycle options: Create Amendment, On Hold, Termination, Close Contract)
            setup_contract_actions_menu(frm);
            check_active_contract_lifecycle(frm);
        }

        setup_signed_document_access(frm);
        remove_frappe_default_actions(frm);
        setup_contract_attachment_restrictions(frm);

        setTimeout(() => {
            if (is_commenced_contract) {
                frm.set_read_only();
                if (frm.fields) {
                    frm.fields.forEach(f => {
                        frm.set_df_property(f.df.fieldname, "read_only", 1);
                    });
                }
                frm.disable_save();
                setup_contract_actions_menu(frm);
            }
            setup_signed_document_access(frm);
            remove_frappe_default_actions(frm);
        }, 120);

        setTimeout(() => {
            if (is_commenced_contract) {
                frm.disable_save();
                setup_contract_actions_menu(frm);
            }
            remove_frappe_default_actions(frm);
        }, 350);
    },

    after_save: function(frm) {
        // Trigger workflow state refresh so Actions dropdown appears immediately after saving a new contract
        delete frm.doc.__unsaved;
        if (frm.states) {
            frm.states.refresh();
        }
        setTimeout(() => {
            delete frm.doc.__unsaved;
            if (frm.states) {
                frm.states.show_actions();
            }
            if (frm.page && frm.page.actions_btn_group) {
                frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            }
            if (frm.page && frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }
            enforce_stage_approver_actions(frm);
        }, 150);
        setTimeout(() => {
            delete frm.doc.__unsaved;
            if (frm.states) {
                frm.states.show_actions();
            }
            if (frm.page && frm.page.actions_btn_group) {
                frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            }
            if (frm.page && frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }
            enforce_stage_approver_actions(frm);
        }, 400);
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "";
        let action_lower = action.toLowerCase();

        // 1. Action: Put On Hold
        if (action === "Put On Hold") {
            return prompt_put_on_hold(frm);
        }

        // 2. Action: Resume Contract
        if (action === "Resume Contract") {
            return prompt_resume_contract(frm);
        }

        // 3. Action: Terminate
        if (action === "Terminate") {
            return prompt_termination(frm);
        }

        // 4. Action: Close Contract
        if (action === "Close Contract") {
            return validate_and_prompt_closure(frm);
        }

        // 5. Action: Commence Contract
        if (action === "Commence Contract" || action_lower.includes("commence")) {
            if (!frm.doc.upload_signed_document) {
                frappe.msgprint({
                    title: __("Document Required"),
                    indicator: "orange",
                    message: __("Please upload the <b>Complete Counter Signed Contract</b> before commencing this contract.")
                });
                return Promise.reject("COUNTER_SIGNED_DOCUMENT_REQUIRED");
            }
            return Promise.resolve();
        }

        // 5. Stage Approvals & Rejections with Date & Time Stamps
        let status_field = "";
        let review_field = "";

        if (state === "Pending Team Lead Approval") {
            status_field = "lead_approver_status";
            review_field = "lead_approver_review";
        } else if (state === "Pending Level 2.1 Legal Approval") {
            status_field = "legal_approver_status";
            review_field = "legal_approver_review";
        } else if (state === "Pending Level 2.2 Finance Approval") {
            status_field = "finance_approver_status";
            review_field = "finance_approver_review";
        } else if (state === "Pending Level 2.3 HR Approval") {
            status_field = "hr_approver_status";
            review_field = "hr_approver_review";
        } else if (state === "Pending CEO Approval") {
            status_field = "ceo_approver_status";
            review_field = "ceo_approver_review";
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        // Handle Approvals
        if (action_lower.includes("approve")) {
            if (status_field) {
                let status_text = "Approved [" + now_str + "]";

                // 1. Capture any comment already typed into the form's DOM textarea or docfield
                let existing_comment = "";
                if (review_field) {
                    let field_obj = frm.fields_dict[review_field];
                    if (field_obj && field_obj.$wrapper) {
                        existing_comment = field_obj.$wrapper.find("textarea").val() || frm.doc[review_field] || "";
                    } else {
                        existing_comment = frm.doc[review_field] || "";
                    }
                    existing_comment = (existing_comment || "").trim();
                }

                // CRITICAL: Unfreeze so modal dialog is interactive and visible
                frappe.dom.freeze_count = 0;
                $("#freeze").removeClass("in").remove();
                frappe.dom.unfreeze();

                return new Promise((resolve, reject) => {
                    let submitted = false;
                    let dialog = new frappe.ui.Dialog({
                        title: __(action),
                        fields: [
                            {
                                label: __("Approval Comments / Remarks (Optional)"),
                                fieldname: "comments",
                                fieldtype: "Small Text",
                                default: existing_comment,
                                description: __("Add your review remarks or feedback for this approval.")
                            }
                        ],
                        primary_action_label: __("Confirm Approval"),
                        primary_action: async function(values) {
                            let final_comment = values.comments ? values.comments.trim() : "";
                            frappe.dom.freeze(__("Recording approval..."));
                            try {
                                await frappe.call({
                                    method: "access_custom.contract_lifecycle.record_approver_decision",
                                    args: {
                                        doctype: frm.doc.doctype,
                                        name: frm.doc.name,
                                        status_field: status_field,
                                        status_val: status_text,
                                        review_field: review_field || "",
                                        review_val: final_comment
                                    }
                                });
                                frm.doc[status_field] = status_text;
                                if (review_field) {
                                    frm.doc[review_field] = final_comment;
                                }
                                submitted = true;
                                dialog.hide();
                                resolve();
                            } catch (e) {
                                frappe.dom.unfreeze();
                                frappe.msgprint(__("Error recording approval decision."));
                                reject(e);
                            }
                        }
                    });

                    dialog.on_page_show = function() {
                        frappe.dom.unfreeze();
                    };

                    dialog.$wrapper.on("hidden.bs.modal", function() {
                        frappe.dom.unfreeze();
                        if (!submitted) {
                            reject();
                        }
                    });

                    dialog.show();
                });
            }
            return Promise.resolve();
        }

        // Handle Rejections
        if (action_lower.includes("reject") || action_lower.includes("return")) {
            if (status_field && review_field) {
                frappe.dom.freeze_count = 0;
                $("#freeze").removeClass("in").remove();
                frappe.dom.unfreeze();

                return new Promise((resolve, reject) => {
                    let submitted = false;
                    let dialog = new frappe.ui.Dialog({
                        title: __("Reject Contract Proposal"),
                        fields: [
                            {
                                label: __("Reason for Rejection"),
                                fieldname: "reason",
                                fieldtype: "Small Text",
                                reqd: 1,
                                description: __("Please enter the specific reason for rejecting this contract.")
                            }
                        ],
                        primary_action_label: __("Submit Rejection"),
                        primary_action: async function(values) {
                            let reason = values.reason ? values.reason.trim() : "";
                            if (!reason) {
                                frappe.msgprint({
                                    title: __("Reason Required"),
                                    indicator: "red",
                                    message: __("Please provide a reason before submitting rejection.")
                                });
                                return;
                            }

                            let status_text = "Rejected [" + now_str + "]";
                            frappe.dom.freeze(__("Recording rejection..."));
                            try {
                                await frappe.call({
                                    method: "access_custom.contract_lifecycle.record_approver_decision",
                                    args: {
                                        doctype: frm.doc.doctype,
                                        name: frm.doc.name,
                                        status_field: status_field,
                                        status_val: status_text,
                                        review_field: review_field,
                                        review_val: reason
                                    }
                                });
                                frm.doc[status_field] = status_text;
                                frm.doc[review_field] = reason;
                                submitted = true;
                                dialog.hide();
                                resolve();
                            } catch (e) {
                                frappe.dom.unfreeze();
                                frappe.msgprint(__("Error recording rejection decision."));
                                reject(e);
                            }
                        }
                    });

                    dialog.show();
                    dialog.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("CANCELLED"); });
                    dialog.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("CANCELLED"); });
                });
            }
        }

        return Promise.resolve();
    }
});

// ==============================================================================
// 1. Rejection Helper & Approval Progress Stepper Tracker
// ==============================================================================
function get_contract_rejection_stage(frm) {
    const check_stages = [
        { name: "Pending CEO Approval", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending Level 2.3 HR Approval", status: frm.doc.hr_approver_status, review: frm.doc.hr_approver_review, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Level 2.2 Finance Approval", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Pending Level 2.1 Legal Approval", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Pending Team Lead Approval", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Rejected")) {
            return cs;
        }
    }
    return null;
}

function render_contract_progress_tracker(frm) {
    if (!frm.dashboard || !frm.dashboard.parent) return;

    frm.dashboard.parent.find(".contract-progress-container").remove();

    let steps = [
        { id: "Draft", label: "Draft" },
        { id: "Pending Team Lead Approval", label: "Team Lead" },
        { id: "Pending Level 2.1 Legal Approval", label: "Legal" },
        { id: "Pending Level 2.2 Finance Approval", label: "Finance" },
        { id: "Pending Level 2.3 HR Approval", label: "HR" },
        { id: "Pending CEO Approval", label: "CEO" },
        { id: "In Progress", label: "Counter Sign" },
        { id: "Commenced", label: "Commenced" }
    ];

    let current_state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let is_rejected = current_state.includes("Reject");
    let rejected_stage = get_contract_rejection_stage(frm);
    if (rejected_stage) is_rejected = true;

    let active_index = 0;
    if (current_state === "Commenced" || current_state === "Active/Amendment Initiated" || current_state === "On Hold" || current_state === "Terminated" || current_state === "Closed") {
        active_index = steps.length - 1;
    } else if (rejected_stage) {
        active_index = steps.findIndex(s => s.id === rejected_stage.name);
        if (active_index < 0) active_index = 1;
    } else {
        let idx = steps.findIndex(s => s.id === current_state || current_state.includes(s.label));
        active_index = idx >= 0 ? idx : 0;
    }

    let percent = (active_index === steps.length - 1) ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

    let status_bg = "#16a34a";
    let bar_color = "#16a34a";
    if (is_rejected) {
        status_bg = "#dc2626";
        bar_color = "#dc2626";
    }

    let nodes_html = steps.map((s, idx) => {
        let is_completed = (idx < active_index) || (active_index === steps.length - 1);
        let is_active = (idx === active_index) && (active_index !== steps.length - 1);

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
                pulse_style = "box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.25);";
            }
        }

        return `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 50px; position: relative; z-index: 2;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background: ${circle_bg}; border: 2px solid ${circle_border}; color: ${circle_color}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-bottom: 5px; ${pulse_style}">
                ${circle_content}
            </div>
            <div style="font-size: 11px; font-weight: ${label_weight}; color: ${label_color}; text-align: center; line-height: 1.2;">
                ${s.label}
            </div>
        </div>
        `;
    }).join("");

    let container_html = `
    <div class="contract-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <span>Contract Approval Workflow Route</span>
            </div>
            <div>
                <span class="badge" style="background: ${status_bg}; color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 12px; font-weight: 600;">
                    ${frappe.utils.escape_html(current_state)} (${percent}%)
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

// ==============================================================================
// 2. Approver Field Locking & High-Contrast Visual Stamping
// ==============================================================================
function apply_contract_approver_field_locking(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Draft";

    const review_matrix = [
        { review: "lead_approver_review", status: "lead_approver_status", approver: "lead_approver", state: "Pending Team Lead Approval" },
        { review: "legal_approver_review", status: "legal_approver_status", approver: "legal_approver", state: "Pending Level 2.1 Legal Approval" },
        { review: "finance_approver_review", status: "finance_approver_status", approver: "finance_approver", state: "Pending Level 2.2 Finance Approval" },
        { review: "hr_approver_review", status: "hr_approver_status", approver: "hr_approver", state: "Pending Level 2.3 HR Approval" },
        { review: "ceo_approver_review", status: "ceo_approver_status", approver: "ceo_approver", state: "Pending CEO Approval" },
    ];

    review_matrix.forEach(item => {
        let status_val = frm.doc[item.status] || "";
        let review_val = frm.doc[item.review] || "";

        frm.set_df_property(item.status, "read_only", 1);
        let is_active_stage = (state === item.state);
        let is_assigned_user = (frm.doc[item.approver] && frappe.session.user === frm.doc[item.approver]) || frappe.session.user === "Administrator";
        let can_edit_comment = is_active_stage && is_assigned_user;

        frm.set_df_property(item.review, "read_only", can_edit_comment ? 0 : 1);

        // Visual badge for status
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
                }
                $disp.html(`
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${badge_bg}; color: ${text_color}; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); margin-top: 2px;">
                        <span>${icon}</span>
                        <span>${frappe.utils.escape_html(status_val)}</span>
                    </div>
                `).css({"border": "none", "background": "transparent", "padding": "0", "color": "inherit"}).show();
                status_field.$wrapper.find(".control-input").hide();
            } else {
                $disp.html(`
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 12px; margin-top: 2px;">
                        <span>Pending Review</span>
                    </div>
                `).css({"border": "none", "background": "transparent", "padding": "0"}).show();
                status_field.$wrapper.find(".control-input").hide();
            }
        }

        // Visual box for comment
        let review_field = frm.get_field(item.review);
        if (review_field && review_field.$wrapper) {
            if (!can_edit_comment) {
                let $disp = review_field.$wrapper.find(".control-value");
                if (!$disp.length) {
                    let $target = review_field.$wrapper.find(".control-input-wrapper");
                    $disp = $('<div class="control-value like-disabled-input"></div>').appendTo($target.length ? $target : review_field.$wrapper);
                }
                if (review_val) {
                    let border_color = "#cbd5e1";
                    let text_color = "#1e293b";
                    let bg_color = "#f8fafc";
                    if (status_val && status_val.includes("Rejected")) {
                        border_color = "#fca5a5";
                        bg_color = "#fef2f2";
                        text_color = "#991b1b";
                    }
                    $disp.html(`
                        <div style="padding: 10px 14px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 13px; color: ${text_color}; white-space: pre-wrap; line-height: 1.5; min-height: 42px; margin-top: 2px;">
                            ${frappe.utils.escape_html(review_val)}
                        </div>
                    `).css({"border": "none", "background": "transparent", "padding": "0"}).show();
                    review_field.$wrapper.find(".control-input").hide();
                } else {
                    $disp.html(`
                        <div style="padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic; margin-top: 2px;">
                            No comments provided
                        </div>
                    `).css({"border": "none", "background": "transparent", "padding": "0"}).show();
                    review_field.$wrapper.find(".control-input").hide();
                }
            } else {
                review_field.$wrapper.find(".control-value").hide();
                review_field.$wrapper.find(".control-input").show();
            }
        }
    });
}

function setup_auto_expand_textareas(frm) {
    const text_fields = [
        "project_description", "lead_approver_review",
        "legal_approver_review", "finance_approver_review",
        "hr_approver_review", "ceo_approver_review"
    ];

    text_fields.forEach(fieldname => {
        let field = frm.get_field(fieldname);
        if (field && field.$wrapper) {
            let $textarea = field.$wrapper.find("textarea");
            if ($textarea.length) {
                $textarea.css({
                    "min-height": "95px",
                    "resize": "vertical",
                    "overflow-y": "hidden"
                });

                let resize = function() {
                    this.style.height = "auto";
                    this.style.height = Math.max(95, this.scrollHeight) + "px";
                };

                $textarea.off("input.auto_expand").on("input.auto_expand", resize);
                $textarea.each(function() {
                    resize.call(this);
                });
            }
        }
    });
}

// ==============================================================================
// 3. Page 15: Visual Contract Timeline Tree
// ==============================================================================
function render_contract_timeline_tree(frm) {
    if (!frm.fields_dict.timeline_html) return;

    frappe.db.get_list("Contract Amendment", {
        filters: { contract: frm.doc.name },
        fields: ["name", "amendment_type", "new_version", "amendment_date", "value_change", "revised_contract_value", "revised_end_date", "workflow_state", "docstatus"],
        order_by: "creation asc"
    }).then(amendments => {
        let orig_start = frm.doc.start_date || "N/A";
        let orig_budget = format_currency(frm.doc.project_budget || 0);
        let curr_val = format_currency(frm.doc.current_contract_value || frm.doc.project_budget || 0);
        let curr_end = frm.doc.current_end_date || frm.doc.end_date || "N/A";
        let curr_ver = frm.doc.current_version || "1.0";
        let status = frm.doc.workflow_state || "Draft";

        let html = `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 10px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #edf2f7; padding-bottom:12px; margin-bottom:16px;">
                <h6 style="margin:0; font-weight:700; color:#0f172a;">
                    🌿 Contract Lifecycle & Version Audit Timeline (Page 15 Specification)
                </h6>
                <div>
                    <span class="badge" style="background:#0284c7; color:#fff; font-size:12px; padding:4px 10px;">
                        Active Version: v${curr_ver}
                    </span>
                    <span class="badge" style="background:#16a34a; color:#fff; font-size:12px; padding:4px 10px; margin-left:6px;">
                        ${status}
                    </span>
                </div>
            </div>

            <div style="position:relative; padding-left: 28px; border-left: 3px solid #cbd5e1; margin-left: 15px;">
                <!-- Node 1: Original Contract -->
                <div style="position:relative; margin-bottom: 24px;">
                    <span style="position:absolute; left:-36px; top:0; width:16px; height:16px; border-radius:50%; background:#3b82f6; border:3px solid #fff; box-shadow:0 0 0 2px #3b82f6;"></span>
                    <div>
                        <span style="font-weight:700; color:#1e293b; font-size:14px;">Original Contract</span>
                        <span class="badge" style="background:#e2e8f0; color:#475569; margin-left:6px;">Version 1.0</span>
                        <span style="color:#64748b; font-size:12px; margin-left:10px;">Started: ${orig_start}</span>
                    </div>
                    <div style="color:#475569; font-size:13px; margin-top:4px;">
                        Agreed Budget: <b>${orig_budget}</b> &nbsp;|&nbsp; Original End Date: <b>${frm.doc.end_date || 'N/A'}</b>
                    </div>
                </div>
        `;

        if (amendments && amendments.length > 0) {
            amendments.forEach(amd => {
                let badge_bg = amd.docstatus === 1 ? "#22c55e" : "#f59e0b";
                let diff_text = flt(amd.value_change) !== 0 
                    ? `Value Change: ${format_currency(amd.value_change)}` 
                    : (amd.revised_end_date ? `End Date Extended: ${amd.revised_end_date}` : "Scope / Terms Modification");

                html += `
                <div style="position:relative; margin-bottom: 24px;">
                    <span style="position:absolute; left:-36px; top:0; width:16px; height:16px; border-radius:50%; background:${badge_bg}; border:3px solid #fff; box-shadow:0 0 0 2px ${badge_bg};"></span>
                    <div>
                        <a href="/app/contract-amendment/${amd.name}" style="font-weight:700; color:#2563eb; font-size:14px;">
                            ${amd.name}
                        </a>
                        <span class="badge" style="background:#e0e7ff; color:#3730a3; margin-left:6px;">v${amd.new_version || ''}</span>
                        <span class="badge" style="background:${badge_bg}; color:#fff; margin-left:6px; font-size:11px;">${amd.workflow_state}</span>
                        <span style="color:#64748b; font-size:12px; margin-left:10px;">${amd.amendment_date || ''}</span>
                    </div>
                    <div style="color:#475569; font-size:13px; margin-top:4px;">
                        <b>${amd.amendment_type}</b> &nbsp;&bull;&nbsp; ${diff_text}
                    </div>
                </div>
                `;
            });
        }

        html += `
                <!-- Node Final: Current Active State -->
                <div style="position:relative;">
                    <span style="position:absolute; left:-36px; top:0; width:16px; height:16px; border-radius:50%; background:#10b981; border:3px solid #fff; box-shadow:0 0 0 2px #10b981;"></span>
                    <div>
                        <span style="font-weight:700; color:#0f172a; font-size:14px;">Current Active Position</span>
                        <span class="badge" style="background:#dcfce7; color:#15803d; margin-left:6px;">Active Version ${curr_ver}</span>
                    </div>
                    <div style="color:#334155; font-size:13px; margin-top:4px;">
                        Current Total Value: <b>${curr_val}</b> &nbsp;|&nbsp; Current End Date: <b>${curr_end}</b>
                    </div>
                </div>
            </div>
        </div>
        `;

        frm.fields_dict.timeline_html.$wrapper.html(html);
    });
}

// ==============================================================================
// 4. Lifecycle Dialogs (On Hold, Resume, Terminate, Close)
// ==============================================================================
function prompt_put_on_hold(frm) {
    return new Promise((resolve, reject) => {
        let submitted = false;
        let d = new frappe.ui.Dialog({
            title: __("Put Contract On Hold (Page 17)"),
            fields: [
                {
                    label: __("Hold Date"),
                    fieldname: "hold_date",
                    fieldtype: "Date",
                    default: frappe.datetime.get_today(),
                    reqd: 1
                },
                {
                    label: __("Expected Resume Date"),
                    fieldname: "expected_resume_date",
                    fieldtype: "Date"
                },
                {
                    label: __("Hold Reason / Justification"),
                    fieldname: "hold_reason",
                    fieldtype: "Small Text",
                    reqd: 1
                },
                {
                    label: __("Supporting Document"),
                    fieldname: "hold_supporting_document",
                    fieldtype: "Attach"
                }
            ],
            primary_action_label: __("Confirm Put On Hold"),
            primary_action: async function(values) {
                await frm.set_value("hold_date", values.hold_date);
                await frm.set_value("hold_reason", values.hold_reason);
                if (values.expected_resume_date) await frm.set_value("expected_resume_date", values.expected_resume_date);
                if (values.hold_supporting_document) await frm.set_value("hold_supporting_document", values.hold_supporting_document);
                await frm.set_value("hold_requested_by", frappe.session.user);
                await frm.set_value("contract_status", "On Hold");
                await frm.save();
                submitted = true;
                d.hide();
                resolve();
            }
        });

        d.show();
        d.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("CANCELLED"); });
        d.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("CANCELLED"); });
    });
}

function prompt_resume_contract(frm) {
    return new Promise((resolve, reject) => {
        let submitted = false;
        let hold_date = frm.doc.hold_date || frappe.datetime.get_today();
        let d = new frappe.ui.Dialog({
            title: __("Resume Contract (Page 17)"),
            fields: [
                {
                    label: __("Actual Resume Date"),
                    fieldname: "actual_resume_date",
                    fieldtype: "Date",
                    default: frappe.datetime.get_today(),
                    reqd: 1
                },
                {
                    label: __("Auto-extend End Date by Hold Duration?"),
                    fieldname: "extend_end_date",
                    fieldtype: "Check",
                    default: 1
                }
            ],
            primary_action_label: __("Resume Contract"),
            primary_action: async function(values) {
                let res_date = values.actual_resume_date;
                let days = frappe.datetime.get_day_diff(res_date, hold_date);
                if (days < 0) days = 0;

                await frm.set_value("actual_resume_date", res_date);
                await frm.set_value("impact_on_end_date", days);
                await frm.set_value("contract_status", "Commenced");

                if (values.extend_end_date && days > 0 && frm.doc.current_end_date) {
                    let new_end = frappe.datetime.add_days(frm.doc.current_end_date, days);
                    await frm.set_value("current_end_date", new_end);
                }

                await frm.save();
                submitted = true;
                d.hide();
                resolve();
            }
        });

        d.show();
        d.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("CANCELLED"); });
        d.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("CANCELLED"); });
    });
}

function prompt_termination(frm) {
    return new Promise((resolve, reject) => {
        let submitted = false;
        let d = new frappe.ui.Dialog({
            title: __("Terminate Contract (Page 18)"),
            fields: [
                {
                    label: __("Termination Type"),
                    fieldname: "termination_type",
                    fieldtype: "Select",
                    options: "\nConvenience\nCause\nMutual Agreement\nForce Majeure\nNon-Performance",
                    reqd: 1
                },
                {
                    label: __("Notice Date"),
                    fieldname: "termination_notice_date",
                    fieldtype: "Date",
                    default: frappe.datetime.get_today(),
                    reqd: 1
                },
                {
                    label: __("Effective Termination Date"),
                    fieldname: "effective_termination_date",
                    fieldtype: "Date",
                    default: frappe.datetime.get_today(),
                    reqd: 1
                },
                {
                    label: __("Termination Reason"),
                    fieldname: "termination_reason",
                    fieldtype: "Small Text",
                    reqd: 1
                },
                {
                    label: __("Financial Settlement Required?"),
                    fieldname: "financial_settlement_required",
                    fieldtype: "Check"
                },
                {
                    label: __("Final Settlement Amount"),
                    fieldname: "final_settlement_amount",
                    fieldtype: "Currency",
                    depends_on: "eval:doc.financial_settlement_required==1"
                },
                {
                    label: __("Termination Supporting Document"),
                    fieldname: "termination_supporting_document",
                    fieldtype: "Attach"
                }
            ],
            primary_action_label: __("Confirm Termination"),
            primary_action: async function(values) {
                await frm.set_value("termination_type", values.termination_type);
                await frm.set_value("termination_notice_date", values.termination_notice_date);
                await frm.set_value("effective_termination_date", values.effective_termination_date);
                await frm.set_value("termination_reason", values.termination_reason);
                await frm.set_value("financial_settlement_required", values.financial_settlement_required ? 1 : 0);
                if (values.final_settlement_amount) await frm.set_value("final_settlement_amount", values.final_settlement_amount);
                if (values.termination_supporting_document) await frm.set_value("termination_supporting_document", values.termination_supporting_document);
                await frm.set_value("termination_approved_by", frappe.session.user);
                await frm.set_value("contract_status", "Terminated");
                await frm.save();
                submitted = true;
                d.hide();
                resolve();
            }
        });

        d.show();
        d.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("CANCELLED"); });
        d.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("CANCELLED"); });
    });
}

function validate_and_prompt_closure(frm) {
    let all_checked = (
        frm.doc.closure_deliverables_completed &&
        frm.doc.closure_final_invoice_submitted &&
        frm.doc.closure_payments_received &&
        frm.doc.closure_reconciliation_completed &&
        frm.doc.closure_assets_returned &&
        frm.doc.closure_client_acceptance &&
        frm.doc.closure_final_report_submitted &&
        frm.doc.closure_documents_archived &&
        frm.doc.closure_obligations_cleared
    );

    if (all_checked) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let submitted = false;
        let d = new frappe.ui.Dialog({
            title: __("Contract Closure Checklist (Page 19)"),
            fields: [
                { fieldtype: "HTML", options: `<p style="color:#b91c1c; font-size:13px;"><b>Mandatory Audit:</b> Please confirm all 9 closure criteria are completed before formally closing this contract.</p>` },
                { label: __("Closure Date"), fieldname: "closure_date", fieldtype: "Date", default: frappe.datetime.get_today(), reqd: 1 },
                { label: __("1. All deliverables completed"), fieldname: "c1", fieldtype: "Check", default: frm.doc.closure_deliverables_completed || 0 },
                { label: __("2. Final invoice submitted"), fieldname: "c2", fieldtype: "Check", default: frm.doc.closure_final_invoice_submitted || 0 },
                { label: __("3. Payments received"), fieldname: "c3", fieldtype: "Check", default: frm.doc.closure_payments_received || 0 },
                { label: __("4. Financial reconciliation completed"), fieldname: "c4", fieldtype: "Check", default: frm.doc.closure_reconciliation_completed || 0 },
                { label: __("5. Assets returned"), fieldname: "c5", fieldtype: "Check", default: frm.doc.closure_assets_returned || 0 },
                { label: __("6. Client acceptance received"), fieldname: "c6", fieldtype: "Check", default: frm.doc.closure_client_acceptance || 0 },
                { label: __("7. Final report submitted"), fieldname: "c7", fieldtype: "Check", default: frm.doc.closure_final_report_submitted || 0 },
                { label: __("8. Contract documents archived"), fieldname: "c8", fieldtype: "Check", default: frm.doc.closure_documents_archived || 0 },
                { label: __("9. Outstanding obligations cleared"), fieldname: "c9", fieldtype: "Check", default: frm.doc.closure_obligations_cleared || 0 },
                { label: __("Closure Audit Notes"), fieldname: "closure_notes", fieldtype: "Small Text" }
            ],
            primary_action_label: __("Verify & Close Contract"),
            primary_action: async function(values) {
                let missing = [];
                if (!values.c1) missing.push("All deliverables completed");
                if (!values.c2) missing.push("Final invoice submitted");
                if (!values.c3) missing.push("Payments received");
                if (!values.c4) missing.push("Financial reconciliation completed");
                if (!values.c5) missing.push("Assets returned");
                if (!values.c6) missing.push("Client acceptance received");
                if (!values.c7) missing.push("Final report submitted");
                if (!values.c8) missing.push("Contract documents archived");
                if (!values.c9) missing.push("Outstanding obligations cleared");

                if (missing.length > 0) {
                    frappe.msgprint({
                        title: __("Incomplete Checklist"),
                        indicator: "red",
                        message: __("The following items must be verified before closure:<br><b>• " + missing.join("<br>• ") + "</b>")
                    });
                    return;
                }

                await frm.set_value("closure_date", values.closure_date);
                await frm.set_value("closure_deliverables_completed", 1);
                await frm.set_value("closure_final_invoice_submitted", 1);
                await frm.set_value("closure_payments_received", 1);
                await frm.set_value("closure_reconciliation_completed", 1);
                await frm.set_value("closure_assets_returned", 1);
                await frm.set_value("closure_client_acceptance", 1);
                await frm.set_value("closure_final_report_submitted", 1);
                await frm.set_value("closure_documents_archived", 1);
                await frm.set_value("closure_obligations_cleared", 1);
                if (values.closure_notes) await frm.set_value("closure_notes", values.closure_notes);
                await frm.set_value("contract_status", "Closed");

                await frm.save();
                submitted = true;
                d.hide();
                resolve();
            }
        });

        d.show();
        d.$wrapper.find(".modal-header .close").on("click", () => { if (!submitted) reject("CANCELLED"); });
        d.$wrapper.on("hidden.bs.modal", () => { if (!submitted) reject("CANCELLED"); });
    });
}

function validate_contract_attachment(frm, fieldname, allowed_extensions, allowed_label) {
    let file_url = frm.doc[fieldname];
    if (!file_url) return true;

    let clean_path = file_url.split("?")[0].split("#")[0].toLowerCase().trim();
    let ext = clean_path.split(".").pop();

    if (!allowed_extensions.includes(ext)) {
        let field_label = frm.get_docfield(fieldname)?.label || fieldname;
        // Immediately remove invalid document so it cannot be uploaded or stored
        frm.set_value(fieldname, null);
        frappe.msgprint({
            title: __("Invalid Document Format"),
            indicator: "red",
            message: __("<b>{0}</b> only accepts <b>{1}</b> files.<br><br>The uploaded file (.<b>{2}</b>) is not permitted and cannot be uploaded here.", [field_label, allowed_label, ext])
        });
        return false;
    }
    return true;
}

function setup_signed_document_access(frm) {
    if (!frm.doc) return;

    let state = frm.doc.workflow_state || "Draft";
    let ceo_status = frm.doc.ceo_approver_status || "";
    let is_ceo_approved = (
        state === "In Progress" ||
        state === "Commenced" ||
        state === "Active/Amendment Initiated" ||
        state === "On Hold" ||
        state === "Terminated" ||
        state === "Closed" ||
        (ceo_status && ceo_status.includes("Approved"))
    );

    let is_owner = (frappe.session.user === frm.doc.owner);
    let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
    let has_cm_role = (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));
    let is_admin = (frappe.session.user === "Administrator");
    let is_contract_manager = is_owner || is_contract_owner || has_cm_role || is_admin;

    if (!is_ceo_approved) {
        // Before CEO approval is completed: hide and lock
        frm.toggle_display("upload_signed_document", false);
        frm.set_df_property("upload_signed_document", "read_only", 1);
    } else {
        // CEO approval is completed: show
        frm.toggle_display("upload_signed_document", true);

        // Once Commenced, contract and document are locked (no changes allowed)
        if (state === "Commenced" || frm.doc.contract_status === "Commenced" || frm.doc.docstatus === 1) {
            frm.set_df_property("upload_signed_document", "read_only", 1);
        } else if (is_contract_manager) {
            // In Progress: Contract Manager uploads counter-signed contract
            frm.set_df_property("upload_signed_document", "read_only", 0);
        } else {
            // Other approvers/users can only view the attached document
            frm.set_df_property("upload_signed_document", "read_only", 1);
        }
    }
}

function setup_contract_attachment_restrictions(frm) {
    const configs = [
        { field: "customer_document", types: [".pdf"], notes: "Only PDF (.pdf) files are allowed." },
        { field: "upload_signed_document", types: [".pdf"], notes: "Only PDF (.pdf) files are allowed." },
        { field: "project__proposal", types: [".pdf"], notes: "Only PDF (.pdf) files are allowed." },
        { field: "budget_agreed_with_customer", types: [".pdf", ".xls", ".xlsx"], notes: "Allowed: PDF (.pdf), Excel (.xls, .xlsx)" },
        { field: "proposal_budget", types: [".pdf", ".xls", ".xlsx"], notes: "Allowed: PDF (.pdf), Excel (.xls, .xlsx)" },
    ];

    configs.forEach(cfg => {
        let f = frm.get_field(cfg.field);
        if (f) {
            if (f.$wrapper) {
                f.$wrapper.find("input[type=file]").attr("accept", cfg.types.join(","));
            }
            f.on_attach_click = function() {
                if (cfg.field === "upload_signed_document") {
                    let state = frm.doc.workflow_state || "Draft";
                    let ceo_status = frm.doc.ceo_approver_status || "";
                    let is_ceo_approved = (
                        state === "In Progress" ||
                        state === "Commenced" ||
                        state === "Active/Amendment Initiated" ||
                        state === "On Hold" ||
                        state === "Terminated" ||
                        state === "Closed" ||
                        (ceo_status && ceo_status.includes("Approved"))
                    );
                    if (!is_ceo_approved) {
                        frappe.msgprint({
                            title: __("Action Not Allowed"),
                            indicator: "red",
                            message: __("<b>Complete Counter Signed Contract</b> can only be uploaded once CEO approval is completed.")
                        });
                        return;
                    }
                    let is_owner = (frappe.session.user === frm.doc.owner);
                    let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
                    let has_cm_role = (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));
                    let is_admin = (frappe.session.user === "Administrator");
                    let is_contract_manager = is_owner || is_contract_owner || has_cm_role || is_admin;
                    if (!is_contract_manager) {
                        frappe.msgprint({
                            title: __("Not Authorized"),
                            indicator: "red",
                            message: __("Only the <b>Contract Manager</b> is authorized to upload the Complete Counter Signed Contract.")
                        });
                        return;
                    }
                }

                this.set_upload_options();
                this.upload_options.restrictions = {
                    allowed_file_types: cfg.types
                };
                this.upload_options.upload_notes = cfg.notes;
                this.file_uploader = new frappe.ui.FileUploader(this.upload_options);
            };
        }
    });
}

function remove_frappe_default_actions(frm) {
    if (!frm || !frm.doc || frm.is_new()) return;
    let allowed_states = ["Commenced", "Active/Amendment Initiated"];
    let is_eligible = allowed_states.includes(frm.doc.workflow_state) || frm.doc.contract_status === "Commenced" || frm.doc.docstatus === 1;
    if (!is_eligible) return;
    try {
        if (frm.toolbar) {
            frm.toolbar.can_amend = function() { return false; };
            frm.toolbar.can_cancel = function() { return false; };
            frm.toolbar.current_status = null;
        }
        if (frm.page) {
            frm.page.clear_primary_action();
            frm.page.clear_secondary_action();
            if (frm.page.btn_secondary) frm.page.btn_secondary.addClass("hide").hide();
            if (frm.page.btn_primary) frm.page.btn_primary.addClass("hide").hide();
        }
        if (typeof frm.clear_custom_buttons === "function") {
            frm.clear_custom_buttons();
        }
        if (frm.page && typeof frm.page.clear_custom_actions === "function") {
            frm.page.clear_custom_actions();
        }
        if (frm.page && frm.page.inner_toolbar) {
            $(frm.page.inner_toolbar).empty().addClass("hide hidden-xs hidden-md").hide();
        }
        if (frm.page && frm.page.wrapper) {
            frm.page.wrapper.find(".custom-actions").empty().hide();
        }
        if (typeof frm.remove_custom_button === "function") {
            frm.remove_custom_button(__("Amend"));
            frm.remove_custom_button("Amend");
            frm.remove_custom_button(__("Cancel"));
            frm.remove_custom_button("Cancel");
            frm.remove_custom_button(__("Actions"));
            frm.remove_custom_button("Actions");
        }
        if (frm.page && frm.page.wrapper) {
            frm.page.wrapper.find('.btn-primary:contains("Amend"), .btn-secondary:contains("Amend"), button[data-label="Amend"]').remove();
            frm.page.wrapper.find('.btn-secondary:contains("Cancel"), button[data-label="Cancel"], button[data-label="cancel"]').remove();
            frm.page.wrapper.find('button:contains("Cancel")').remove();
            frm.page.wrapper.find('button:contains("Amend")').remove();
        }
    } catch(e) {
        console.error("Error in remove_frappe_default_actions:", e);
    }
}

// ==============================================================================
// 5. Single Green Actions Menu Setup (Strictly 4 Options)
// ==============================================================================
function setup_contract_actions_menu(frm) {
    if (!frm || !frm.doc || frm.is_new()) return;
    let allowed_states = ["Commenced", "Active/Amendment Initiated"];
    let is_eligible = allowed_states.includes(frm.doc.workflow_state) || frm.doc.contract_status === "Commenced" || frm.doc.docstatus === 1;
    if (!is_eligible) {
        if (frm.page && frm.page.actions_btn_group) {
            let $btn = frm.page.actions_btn_group.find("button");
            $btn.attr("style", "");
        }
        return;
    }

    let is_owner = (frappe.session.user === frm.doc.owner);
    let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
    let has_cm_role = (frappe.user && (frappe.user.has_role("Contract Manager") || frappe.user.has_role("System Manager"))) ||
                      (frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager")));
    let is_admin = (frappe.session.user === "Administrator");
    let is_contract_manager = is_owner || is_contract_owner || has_cm_role || is_admin;

    remove_frappe_default_actions(frm);

    if (!is_contract_manager) {
        if (frm.page && frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
        return;
    }

    function inject_actions() {
        if (!frm.doc || !is_eligible) return;
        if (!frm.page) return;

        remove_frappe_default_actions(frm);

        // 1. Direct DOM population of .actions-btn-group
        let $actions_grp = frm.page.actions_btn_group || (frm.page.wrapper && frm.page.wrapper.find(".actions-btn-group"));

        if ($actions_grp && $actions_grp.length) {
            $actions_grp.removeClass("hide hidden-xl hidden-xs").show().css({
                "display": "inline-block",
                "visibility": "visible",
                "opacity": "1"
            });

            let $btn = $actions_grp.find("button");
            $btn.removeClass("hide hidden-xl btn-default")
                .addClass("btn-primary")
                .css({
                    "background-color": "#16a34a",
                    "border-color": "#16a34a",
                    "color": "#ffffff",
                    "font-weight": "600",
                    "display": "inline-flex",
                    "align-items": "center",
                    "gap": "6px",
                    "visibility": "visible",
                    "opacity": "1"
                }).show();

            let $ul = $actions_grp.find(".dropdown-menu");
            $ul.empty();

            const lifecycle_actions = [
                { label: __("Create Amendment"), dt: "Contract Amendment" },
                { label: __("On Hold"), dt: "Contract On Hold" },
                { label: __("Termination"), dt: "Contract Termination" },
                { label: __("Close Contract"), dt: "Contract Closure" }
            ];

            lifecycle_actions.forEach(act => {
                let $li = $(`
                    <li>
                        <a class="grey-link dropdown-item" href="#" onclick="return false;" style="padding: 8px 16px; font-weight: 500; cursor: pointer; color: #1e293b;">
                            <span class="menu-item-label">${act.label}</span>
                        </a>
                    </li>
                `);
                $li.find("a").on("click", function(e) {
                    e.preventDefault();
                    frappe.new_doc(act.dt, { contract: frm.doc.name });
                });
                $ul.append($li);
            });
        }

        // 2. Remove the 1st Actions button on the left (clear inner / custom-actions toolbar completely)
        if (typeof frm.clear_custom_buttons === "function") {
            frm.clear_custom_buttons();
        }
        if (frm.page && typeof frm.page.clear_custom_actions === "function") {
            frm.page.clear_custom_actions();
        }
        if (frm.page && frm.page.inner_toolbar) {
            $(frm.page.inner_toolbar).empty().addClass("hide hidden-xs hidden-md").hide();
        }
        if (frm.page && frm.page.wrapper) {
            frm.page.wrapper.find(".custom-actions").empty().hide();
        }

        remove_frappe_default_actions(frm);
    }

    // Hook frm.toolbar.set_primary_action
    if (frm.toolbar && !frm.toolbar._contract_hooked) {
        frm.toolbar._contract_hooked = true;
        let orig_set_primary_action = frm.toolbar.set_primary_action.bind(frm.toolbar);
        frm.toolbar.set_primary_action = function(dirty) {
            if (frm.is_new()) {
                frm.save_disabled = false;
                orig_set_primary_action(dirty);
                return;
            }
            let state = frm.doc ? frm.doc.workflow_state : "";
            let is_commenced = (state === "Commenced" || state === "Active/Amendment Initiated" || (frm.doc && frm.doc.docstatus === 1));
            if (is_commenced) {
                frm.toolbar.can_cancel = function() { return false; };
                frm.toolbar.can_amend = function() { return false; };
                frm.page.clear_actions();
                inject_actions();
                return;
            }
            orig_set_primary_action(dirty);
        };
    }

    // Hook frm.states.show_actions
    if (frm.states && !frm.states._contract_actions_hooked) {
        frm.states._contract_actions_hooked = true;
        let orig_show_actions = frm.states.show_actions.bind(frm.states);
        frm.states.show_actions = function() {
            if (frm.is_new()) {
                if (frm.page && frm.page.actions_btn_group) {
                    frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                }
                return;
            }
            let state = frm.doc ? frm.doc.workflow_state : "";
            if (state === "Commenced" || state === "Active/Amendment Initiated" || (frm.doc && frm.doc.docstatus === 1)) {
                inject_actions();
                return;
            }
            orig_show_actions();
        };
    }

    inject_actions();
    setTimeout(inject_actions, 50);
    setTimeout(inject_actions, 150);
    setTimeout(inject_actions, 350);
    setTimeout(inject_actions, 700);
}

function check_active_contract_lifecycle(frm) {
    if (!frm.doc || !frm.doc.name) return;

    // Check Active Amendment
    frappe.db.get_list("Contract Amendment", {
        filters: { contract: frm.doc.name, docstatus: 0 },
        fields: ["name", "workflow_state", "amendment_type"]
    }).then(amends => {
        if (amends && amends.length > 0) {
            let a = amends[0];
            frm.dashboard.clear_headline();
            frm.dashboard.set_headline(
                __("Active Amendment: <a href='/app/contract-amendment/{0}'><b>{0}</b></a> ({1}) is currently <b>{2}</b>",
                [a.name, a.amendment_type, a.workflow_state]),
                "blue"
            );
            return;
        }

        // Check Active Hold
        frappe.db.get_list("Contract On Hold", {
            filters: { contract: frm.doc.name, status: ["in", ["Pending Approval", "On Hold"]] },
            fields: ["name", "workflow_state", "status", "hold_reason", "expected_resume_date"]
        }).then(holds => {
            if (holds && holds.length > 0) {
                let h = holds[0];
                let color = h.status === "On Hold" ? "orange" : "blue";
                let msg = h.status === "On Hold"
                    ? __("⚠️ Contract is currently <b>ON HOLD</b> (<a href='/app/contract-on-hold/{0}'><b>{0}</b></a>) | Reason: {1} {2}",
                        [h.name, h.hold_reason || "", h.expected_resume_date ? `| Expected Resume: ${h.expected_resume_date}` : ""])
                    : __("Hold Request in review: <a href='/app/contract-on-hold/{0}'><b>{0}</b></a> ({1})", [h.name, h.workflow_state]);
                frm.dashboard.clear_headline();
                frm.dashboard.set_headline(msg, color);
                return;
            }

            // Check Active Termination
            frappe.db.get_list("Contract Termination", {
                filters: { contract: frm.doc.name, docstatus: 0 },
                fields: ["name", "workflow_state", "termination_type"]
            }).then(terms => {
                if (terms && terms.length > 0) {
                    let t = terms[0];
                    frm.dashboard.clear_headline();
                    frm.dashboard.set_headline(
                        __("⚠️ Termination Request in progress: <a href='/app/contract-termination/{0}'><b>{0}</b></a> ({1}) is currently <b>{2}</b>",
                        [t.name, t.termination_type, t.workflow_state]),
                        "red"
                    );
                    return;
                }

                // Check Active Closure
                frappe.db.get_list("Contract Closure", {
                    filters: { contract: frm.doc.name, docstatus: 0 },
                    fields: ["name", "workflow_state"]
                }).then(closes => {
                    if (closes && closes.length > 0) {
                        let c = closes[0];
                        frm.dashboard.clear_headline();
                        frm.dashboard.set_headline(
                            __("ℹ️ Contract Closure in progress: <a href='/app/contract-closure/{0}'><b>{0}</b></a> ({1})",
                            [c.name, c.workflow_state]),
                            "blue"
                        );
                    }
                });
            });
        });
    });
}


function enforce_stage_approver_actions(frm) {
    if (!frm.doc || !frm.doc.workflow_state || frm.is_new()) return;

    const state = frm.doc.workflow_state;

    // Commenced / Active lifecycle actions
    if (state === "Commenced" || state === "Active/Amendment Initiated" || frm.doc.docstatus === 1) {
        setup_contract_actions_menu(frm);
        return;
    }

    // 1. If in Draft state, Returned for Revision, or In Progress (Counter Signing)
    if (state === "Draft" || state === "Returned for Revision" || state === "In Progress") {
        let is_owner = (frappe.session.user === frm.doc.owner);
        let is_contract_owner = (frm.doc.contract_owner && frappe.session.user === frm.doc.contract_owner);
        let has_cm_role = frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("System Manager");
        let is_admin = (frappe.session.user === "Administrator");

        if (!is_owner && !is_contract_owner && !has_cm_role && !is_admin) {
            frm.page.clear_actions_menu();
            if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
            if (frm.page.actions && frm.page.actions.parent) frm.page.actions.parent().addClass("hide").hide();
            if (frm.states) {
                frm.states.show_actions = function() {
                    frm.page.clear_actions_menu();
                    if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                };
            }
        } else {
            // Authorized Contract Manager / Creator: ensure Actions menu is visible and displayed
            if (frm.page && frm.page.actions_btn_group) {
                frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            }
            if (frm.page && frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }
        }
        return;
    }

    // 2. Active Approval Stages
    const stage_approver_map = {
        "Pending Team Lead Approval": "lead_approver",
        "Pending Level 2.1 Legal Approval": "legal_approver",
        "Pending Level 2.2 Finance Approval": "finance_approver",
        "Pending Level 2.3 HR Approval": "hr_approver",
        "Pending CEO Approval": "ceo_approver"
    };

    const approver_field = stage_approver_map[state];
    if (approver_field) {
        const assigned_user = frm.doc[approver_field];
        const is_authorized = (frappe.session.user === "Administrator") || 
                              (assigned_user && frappe.session.user === assigned_user);

        if (!is_authorized) {
            frm.page.clear_actions_menu();
            if (frm.page.actions_btn_group) {
                frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
            }
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide").hide();
            }

            if (frm.workflow) {
                frm.workflow.show_actions = function() {
                    frm.page.clear_actions_menu();
                    if (frm.page.actions_btn_group) {
                        frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                    }
                };
                frm.workflow.setup_btn = function() {
                    frm.page.clear_actions_menu();
                    if (frm.page.actions_btn_group) {
                        frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                    }
                };
            }
        }
    }
}
