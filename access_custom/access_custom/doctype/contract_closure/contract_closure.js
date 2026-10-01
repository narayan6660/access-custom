frappe.ui.form.on("Contract Closure", {
requested_by: function(frm) {
        format_requested_by_display_contract_closure(frm);
    },
    closure_documents: function(frm) {
        validate_closure_pdf_field(frm, "closure_documents", "Final Deliverable / Closure Report (PDF)");
    },
    client_acceptance_document: function(frm) {
        validate_closure_pdf_field(frm, "client_acceptance_document", "Client Acceptance Sign-off (PDF)");
    },
    final_settlement_document: function(frm) {
        validate_closure_pdf_field(frm, "final_settlement_document", "Final Settlement & Reconciliation (PDF)");
    },
    onload: function(frm) {
        if (frm.is_new()) {
            frm.doc.lead_approver_status = null;
            frm.doc.lead_approver_review = null;
            frm.doc.legal_approver_status = null;
            frm.doc.legal_approver_review = null;
            frm.doc.finance_approver_status = null;
            frm.doc.finance_approver_review = null;
            frm.doc.ceo_approver_status = null;
            frm.doc.ceo_approver_review = null;
            if (!frm.doc.requested_by && frappe.session.user) {
                frappe.db.get_value("Employee", { user_id: frappe.session.user }, ["name", "employee_name"], (r) => {
                let data = (r && r.message) ? r.message : r;
                if (data && data.name) {
                    frm.set_value("requested_by", data.name).then(() => {
                        format_requested_by_display_contract_closure(frm);
                    });
                }
            });
            }
        }
    },

    refresh: function(frm) {
        enforce_stage_approver_actions(frm);
        format_requested_by_display_contract_closure(frm);
        // Always clean up previous banners and trackers first
        if (frm.dashboard && frm.dashboard.parent) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".closure-rejection-banner").remove();
            frm.dashboard.parent.find(".closure-progress-container").remove();
        }

        if (frm.is_new()) {
            frm.page.clear_actions_menu();
            return;
        }

        let rejected_stage = get_closure_rejection_stage(frm);
        if (rejected_stage) {
            let banner_html = `
            <div class="closure-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Closure Request Rejected
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

        frm.custom_old_lead = frm.doc.lead_approver_review || "";
        frm.custom_old_legal = frm.doc.legal_approver_review || "";
        frm.custom_old_finance = frm.doc.finance_approver_review || "";
        frm.custom_old_ceo = frm.doc.ceo_approver_review || "";

        apply_closure_approver_field_locking(frm);
        render_closure_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        setTimeout(() => {
            apply_closure_approver_field_locking(frm);
            setup_auto_expand_textareas(frm);
        }, 100);

        setup_clos_workflow_actions_guard(frm);
        frm.set_df_property("closed_on", "hidden", 1);
        setup_closure_pdf_restrictions(frm);

        $(frm.wrapper).off("dirty.workflow_guard").on("dirty.workflow_guard", function() {
            if (frm.is_new()) return;
            setup_clos_workflow_actions_guard(frm);
        });

        setTimeout(() => {
            apply_closure_approver_field_locking(frm);
            setup_clos_workflow_actions_guard(frm);
        }, 100);
    },

    after_save: function(frm) {
        frm.custom_old_lead = frm.doc.lead_approver_review || "";
        frm.custom_old_legal = frm.doc.legal_approver_review || "";
        frm.custom_old_finance = frm.doc.finance_approver_review || "";
        frm.custom_old_ceo = frm.doc.ceo_approver_review || "";

        delete frm.doc.__unsaved;
        setup_clos_workflow_actions_guard(frm);
    },

    validate: function(frm) {
        if (frm.is_new() || frm.doc.workflow_state === "Closure Initiated" || !frm.doc.workflow_state) return;

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

        check_auth("lead_approver_review", "Team Lead Closure", frm.custom_old_lead || "");
        check_auth("legal_approver_review", "Legal Closure", frm.custom_old_legal || "");
        check_auth("finance_approver_review", "Finance Closure", frm.custom_old_finance || "");
        check_auth("ceo_approver_review", "CEO Closure", frm.custom_old_ceo || "");
    },

    contract: function(frm) {
        if (!frm.doc.contract) return;
        frappe.db.get_doc("Test Customer Contract", frm.doc.contract).then(c => {
            if (c) {
                frm.set_value("customer_name", c.customer_name || c.party_name || "");
                frm.set_value("project_title", c.project_title || "");
                frm.set_value("company", c.access_entity || "");
                frm.set_value("contract_end_date", c.end_date || "");

                // Auto-populate approvers from parent contract
                if (c.lead_approver && !frm.doc.lead_approver) frm.set_value("lead_approver", c.lead_approver);
                if (c.legal_approver && !frm.doc.legal_approver) frm.set_value("legal_approver", c.legal_approver);
                if (c.finance_approver && !frm.doc.finance_approver) frm.set_value("finance_approver", c.finance_approver);
                if (c.hr_approver && !frm.doc.hr_approver) frm.set_value("hr_approver", c.hr_approver);
                if (c.ceo_approver && !frm.doc.ceo_approver) frm.set_value("ceo_approver", c.ceo_approver);
            }
        });
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "";
        let action_lower = action.toLowerCase();

        let status_field = "";
        let review_field = "";
        if (state === "Team Lead Closure") {
            status_field = "lead_approver_status";
            review_field = "lead_approver_review";
        } else if (state === "Legal Closure") {
            status_field = "legal_approver_status";
            review_field = "legal_approver_review";
        } else if (state === "Finance Closure") {
            status_field = "finance_approver_status";
            review_field = "finance_approver_review";
        } else if (state === "CEO Closure") {
            status_field = "ceo_approver_status";
            review_field = "ceo_approver_review";
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        if (!action_lower.startsWith("reject")) {
            if (action === "Submit to Team Lead" || (state === "Document Closure" && action_lower.includes("team lead"))) {
                if (!frm.doc.closure_documents) {
                    frappe.msgprint({
                        title: __("Mandatory Closure Document Required"),
                        indicator: "red",
                        message: __("Please upload the <b>Final Deliverable / Closure Report (PDF)</b> before submitting to Team Lead.")
                    });
                    return Promise.reject("Missing mandatory Final Deliverable / Closure Report.");
                }
            }
        }


        if (action_lower.startsWith("approve")) {
            if (status_field) {
                let status_text = "Approved [" + now_str + "]";
                let review_val = "";
                let field_obj = frm.get_field(review_field);
                if (field_obj && field_obj.$wrapper) {
                    review_val = field_obj.$wrapper.find("textarea").val() || frm.doc[review_field] || "";
                } else {
                    review_val = frm.doc[review_field] || "";
                }
                review_val = review_val.trim();
                frm.doc[review_field] = review_val;

                await frappe.call({
                    method: "access_custom.contract_lifecycle.record_approver_decision",
                    args: {
                        doctype: frm.doc.doctype,
                        name: frm.doc.name,
                        status_field: status_field,
                        status_val: status_text,
                        review_field: review_field || "",
                        review_val: review_val
                    }
                });
                frm.doc[status_field] = status_text;
                if (review_field) {
                    frm.doc[review_field] = review_val;
                    frm.refresh_field(review_field);
                }
                frm.refresh_field(status_field);
            }
            return Promise.resolve();
        }

        if (action_lower.startsWith("reject")) {
            // CRITICAL: Unfreeze and remove freeze backdrop so modal dialog is bright, sharp, and interactive
            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __("Reject Contract Closure"),
                    fields: [
                        {
                            label: __("Reason for Rejection"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            description: __("Provide a clear, mandatory reason for this rejection.")
                        }
                    ],
                    primary_action_label: __("Submit Rejection"),
                    primary_action: async function(values) {
                        let text = values.comments ? values.comments.trim() : "";
                        if (!text) {
                            frappe.msgprint(__("Reason is mandatory."));
                            return;
                        }

                        let status_val = "Rejected [" + now_str + "]";
                        frappe.dom.freeze(__("Submitting rejection..."));

                        try {
                            await frappe.call({
                                method: "access_custom.contract_lifecycle.record_approver_decision",
                                args: {
                                    doctype: frm.doc.doctype,
                                    name: frm.doc.name,
                                    status_field: status_field,
                                    status_val: status_val,
                                    review_field: review_field,
                                    review_val: text
                                }
                            });

                            if (status_field) {
                                frm.doc[status_field] = status_val;
                                frm.refresh_field(status_field);
                            }
                            if (review_field) {
                                frm.doc[review_field] = text;
                                frm.refresh_field(review_field);
                            }

                            submitted = true;
                            dialog.hide();
                            resolve();
                        } catch (err) {
                            frappe.dom.unfreeze();
                            frappe.msgprint(__("Error recording rejection: ") + (err.message || err));
                            reject(err);
                        }
                    }
                });

                dialog.show();
                dialog.$wrapper.css("z-index", "1065");
                dialog.$wrapper.on("shown.bs.modal", function() {
                    $("#freeze").removeClass("in").remove();
                });

                let handle_cancel = function() {
                    if (!submitted) {
                        frappe.dom.unfreeze();
                        frappe.show_alert({
                            message: __("Action cancelled."),
                            indicator: "orange"
                        });
                        reject("ACTION_CANCELLED");
                    }
                };

                dialog.$wrapper.find(".modal-header .close").on("click", handle_cancel);
                dialog.$wrapper.on("hidden.bs.modal", handle_cancel);
            });
        }

        return Promise.resolve();
    }
});

// Helper to check if current logged-in user is authorized for stage
function is_stage_approver(frm, state) {
    if (!frm || !frm.doc || !state) return false;
    if (frappe.session.user === "Administrator") {
        return true;
    }
    const stage_map = {
        "Team Lead Closure": { field: "lead_approver", roles: ["Team Lead"] },
        "Legal Closure": { field: "legal_approver", roles: ["Legal Approver"] },
        "Finance Closure": { field: "finance_approver", roles: ["Finance Approver", "Accounts Manager"] },
        "CEO Closure": { field: "ceo_approver", roles: ["CEO Approver"] }
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

function apply_closure_approver_field_locking(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Closure Initiated";

    let is_in_review = !["Closure Initiated", "Deliverable Closure", "Document Closure"].includes(state);
    if (is_in_review) {
        ["contract", "requested_by", "final_settlement_notes",
         "lead_approver", "legal_approver", "finance_approver", "ceo_approver"
        ].forEach(f => {
            frm.set_df_property(f, "read_only", 1);
        });
    }

    const review_matrix = [
        { review: "lead_approver_review", status: "lead_approver_status", approver: "lead_approver", state: "Team Lead Closure" },
        { review: "legal_approver_review", status: "legal_approver_status", approver: "legal_approver", state: "Legal Closure" },
        { review: "finance_approver_review", status: "finance_approver_status", approver: "finance_approver", state: "Finance Closure" },
        { review: "ceo_approver_review", status: "ceo_approver_status", approver: "ceo_approver", state: "CEO Closure" },
    ];

    review_matrix.forEach(item => {
        let status_val = frm.doc[item.status] || "";
        let review_val = frm.doc[item.review] || "";

        frm.set_df_property(item.status, "read_only", 1);
        let is_auth_approver = is_stage_approver(frm, item.state);
        let is_active_stage = (state === item.state);
        let can_edit_comment = is_active_stage && is_auth_approver;
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

                // Attach input guard on textarea: typing sets form dirty and shows Save button while hiding Actions
                let $ta = review_field.$wrapper.find("textarea");
                $ta.off("input.workflow_guard change.workflow_guard").on("input.workflow_guard change.workflow_guard", function() {
                    let val = $(this).val();
                    frm.doc[item.review] = val;
                    frm.dirty();
                    setup_clos_workflow_actions_guard(frm);
                });
            }
        }
    });

    // High-contrast visual pill & timestamp rendering for Status & Audit
    let is_closed = (state === "Closed" || frm.doc.status === "Closed");
    let closed_time_str = frm.doc.closed_on ? frappe.datetime.str_to_user(frm.doc.closed_on) : (is_closed ? frappe.datetime.str_to_user(frm.doc.modified) : "");
    
    if (is_closed) {
        ["workflow_state", "status"].forEach(f => {
            let fld = frm.get_field(f);
            if (fld && fld.$wrapper) {
                let display_text = `Closed [${closed_time_str}]`;
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

        frm.set_df_property("closed_on", "hidden", 1);
    }
}

function setup_auto_expand_textareas(frm) {
    const text_fields = [
        "final_settlement_notes",
        "lead_approver_review", "legal_approver_review", "finance_approver_review", "ceo_approver_review"
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

function render_closure_progress_tracker(frm) {
    if (!frm.dashboard || !frm.dashboard.parent) return;

    frm.dashboard.parent.find(".closure-progress-container").remove();

    let steps = [
        { id: "Closure Initiated", label: "Initiated" },
        { id: "Deliverable Closure", label: "Deliverables" },
        { id: "Document Closure", label: "Documents" },
        { id: "Team Lead Closure", label: "Team Lead" },
        { id: "Legal Closure", label: "Legal" },
        { id: "Finance Closure", label: "Finance" },
        { id: "CEO Closure", label: "CEO" },
        { id: "Closed", label: "Closed" }
    ];

    let current_state = frm.doc.workflow_state || frm.doc.status || "Closure Initiated";
    let is_rejected = current_state.includes("Reject");
    
    let active_index = 0;
    if (current_state === "Closed") {
        active_index = steps.length - 1;
    } else {
        let idx = steps.findIndex(s => s.id === current_state || current_state.includes(s.label));
        active_index = idx >= 0 ? idx : 0;
    }

    let percent = current_state === "Closed" ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

    let status_bg = "#16a34a";
    let bar_color = "#16a34a";
    if (is_rejected) {
        status_bg = "#dc2626";
        bar_color = "#dc2626";
    }

    let nodes_html = steps.map((s, idx) => {
        let is_completed = (idx < active_index) || (current_state === "Closed");
        let is_active = (idx === active_index) && (current_state !== "Closed");

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
            <div style="font-size: 10px; font-weight: ${label_weight}; color: ${label_color}; text-align: center; line-height: 1.2;">
                ${s.label}
            </div>
        </div>
        `;
    }).join("");

    let completed_time_str = frm.doc.closed_on ? frappe.datetime.str_to_user(frm.doc.closed_on) : (current_state === "Closed" ? frappe.datetime.str_to_user(frm.doc.modified) : "");
    let header_badge_text = current_state === "Closed" && completed_time_str
        ? `Closed [${completed_time_str}] (100%)`
        : `${frappe.utils.escape_html(current_state)} (${percent}%)`;

    let container_html = `
    <div class="closure-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <span>Contract Closure Workflow</span>
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

function get_closure_rejection_stage(frm) {
    const check_stages = [
        { name: "CEO Closure", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Finance Closure", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Legal Closure", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Team Lead Closure", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Rejected")) {
            return cs;
        }
    }
    return null;
}

function setup_clos_workflow_actions_guard(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Closure Initiated";
    let is_cm = (frappe.session.user === frm.doc.owner) ||
        (frappe.user_roles && frappe.user_roles.includes("Contract Manager"));

    let is_active_approver = is_stage_approver(frm, state);
    let is_dirty = frm.is_dirty() || (frm.doc && frm.doc.__unsaved);

    if (state !== "Closure Initiated" && state !== "Deliverable Closure" && state !== "Document Closure") {
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
    } else {
        if (!is_cm) {
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
}


function validate_closure_pdf_field(frm, fieldname, label) {
    let val = frm.doc[fieldname];
    if (!val) return;
    let path = (typeof val === "string") ? val.toLowerCase().trim() : "";
    let is_pdf = path.endsWith(".pdf") || path.includes(".pdf?") || path.includes(".pdf#");
    if (!is_pdf) {
        frm.set_value(fieldname, "");
        frappe.msgprint({
            title: __("PDF Document Required"),
            indicator: "red",
            message: __("Only PDF files (.pdf) are allowed for <b>{0}</b>. Please upload a valid PDF document.", [label])
        });
    }
}

function setup_closure_pdf_restrictions(frm) {
    ["closure_documents", "client_acceptance_document", "final_settlement_document"].forEach(fn => {
        let field = frm.get_field(fn);
        if (field && field.$wrapper) {
            field.$wrapper.find("input[type=file]").attr("accept", ".pdf,application/pdf");
        }
    });
}

function format_requested_by_display_contract_closure(frm) {
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

    const stage_approver_map = {'Team Lead Closure': 'lead_approver', 'Legal Closure': 'legal_approver', 'Finance Closure': 'finance_approver', 'CEO Closure': 'ceo_approver'};
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
