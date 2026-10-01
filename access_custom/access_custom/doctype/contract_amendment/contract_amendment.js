// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Contract Amendment", {
requested_by: function(frm) {
        format_requested_by_display_contract_amendment(frm);
    },
    setup: function(frm) {
        // Filter contracts to only show submitted/commenced contracts
        frm.set_query("contract", function() {
            return {
                filters: {
                    docstatus: 1
                }
            };
        });
    },

    onload: function(frm) {
        if (frm.is_new()) {
            if (!frm.doc.requested_by && frappe.session.user) {
                frappe.db.get_value("Employee", { user_id: frappe.session.user }, ["name", "employee_name"], (r) => {
                let data = (r && r.message) ? r.message : r;
                if (data && data.name) {
                    frm.set_value("requested_by", data.name).then(() => {
                        format_requested_by_display_contract_amendment(frm);
                    });
                }
            });
            }
            if (!frm.doc.amendment_date) {
                frm.set_value("amendment_date", frappe.datetime.nowdate());
            }
            if (!frm.doc.amendment_effective_date) {
                frm.set_value("amendment_effective_date", frappe.datetime.nowdate());
            }
        }
    },

    refresh: function(frm) {
        enforce_stage_approver_actions(frm);
        format_requested_by_display_contract_amendment(frm);
        if (frm.is_new()) {
            apply_field_rules(frm);
            update_approver_visibility(frm);
            render_approval_progress_tracker(frm);
            setup_auto_expand_textareas(frm);
            return;
        }

        // Add button to view parent contract if linked
        if (frm.doc.contract) {
            frm.add_custom_button(__("View Contract"), function() {
                frappe.set_route("Form", "Test Customer Contract", frm.doc.contract);
            }, __("Contract"));
        }

        // Clear any previous headline/intro/banners to prevent duplicate alerts
        if (frm.dashboard) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".amendment-rejection-banner, .amendment-revision-banner").remove();
        }

        // Check if amendment was rejected or returned for revision in previous stages
        let rejected_stage = get_rejection_stage(frm);
        let returned_stage = get_revision_stage(frm);

        if (rejected_stage) {
            let banner_html = `
            <div class="amendment-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Amendment Rejected
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
                <div style="font-size: 12px; color: #64748b; border-top: 1px dashed #fca5a5; padding-top: 8px; margin-top: 8px;">
                    <i>This amendment has been returned to <b>Draft</b>. As Contract Manager, you can review the feedback, update the contract details, and click <b>'Submit to Team Lead'</b> to restart the approval workflow.</i>
                </div>
            </div>`;
            $(banner_html).prependTo(frm.dashboard.parent);
            frm.dashboard.show();
        } else if (returned_stage) {
            let banner_html = `
            <div class="amendment-revision-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fffbeb; border: 1px solid #fcd34d; border-left: 6px solid #d97706; border-radius: 8px; box-shadow: 0 1px 3px rgba(217, 119, 6, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #d97706; display: flex; align-items: center; gap: 6px;">
                            <span>&#8635;</span> Returned for Revision
                        </span>
                        <span class="badge" style="background: #d97706; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                            Returned by ${returned_stage.role}
                        </span>
                    </div>
                    <span style="font-size: 12px; color: #64748b; font-weight: 500;">
                        ${frappe.utils.escape_html(returned_stage.status.replace("Returned for Revision ", ""))}
                    </span>
                </div>
                <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-bottom: 8px;">
                    <div><b>Reviewer:</b> ${frappe.utils.escape_html(returned_stage.user || returned_stage.role)}</div>
                    <div style="margin-top: 4px;"><b>Revision Feedback:</b> <span style="color: #92400e; font-weight: 600;">"${frappe.utils.escape_html(returned_stage.review || 'No specific feedback provided')}"</span></div>
                </div>
                <div style="font-size: 12px; color: #64748b; border-top: 1px dashed #fde68a; padding-top: 8px; margin-top: 8px;">
                    <i>This amendment has been returned to <b>Draft</b> for required modifications. Make the necessary updates and click <b>'Submit to Team Lead'</b> to resubmit.</i>
                </div>
            </div>`;
            $(banner_html).prependTo(frm.dashboard.parent);
            frm.dashboard.show();
        } else if (frm.doc.current_version && frm.doc.new_version) {
            frm.set_intro(
                __("Contract Version Transition: <b>{0}</b> &rarr; <b class='text-primary'>{1}</b>", 
                [frm.doc.current_version, frm.doc.new_version]), 
                "green"
            );
        }

        // If requested_by is an email, fix to Employee ID
        if (frm.doc.requested_by && frm.doc.requested_by.includes("@")) {
            frappe.db.get_value("Employee", { user_id: frm.doc.requested_by }, "name", (r) => {
                if (r && r.name) {
                    safe_set(frm, "requested_by", r.name);
                }
            });
        }

        // Store original review values for validation
        frm.custom_old_lead = frm.doc.lead_approver_review || "";
        frm.custom_old_legal = frm.doc.legal_approver_review || "";
        frm.custom_old_finance = frm.doc.finance_approver_review || "";
        frm.custom_old_hr = frm.doc.hr_approver_review || "";
        frm.custom_old_ceo = frm.doc.ceo_approver_review || "";

        // Apply native field rules, approver visibility, and dynamic progress bar
        apply_field_rules(frm);
        update_approver_visibility(frm);
        apply_approver_field_locking(frm);
        render_approval_progress_tracker(frm);
        setup_auto_expand_textareas(frm);
        setTimeout(() => setup_auto_expand_textareas(frm), 150);

        // ======================================================================
        // WORKFLOW ACTIONS & ACTIONS MENU GUARD (PREVENTS GHOST ACTIONS & STOPS BUTTON DISAPPEARING)
        // ======================================================================
        setup_workflow_actions_guard(frm);

        $(frm.wrapper).off("dirty.workflow_guard").on("dirty.workflow_guard", function() {
            if (frm.is_new()) return;
            setup_workflow_actions_guard(frm);
        });

        setTimeout(() => {
            apply_approver_field_locking(frm);
            setup_workflow_actions_guard(frm);
        }, 100);
    },

    amendment_reason: function(frm) {
        setup_auto_expand_textareas(frm);
    },

    scope_description: function(frm) {
        setup_auto_expand_textareas(frm);
    },

    amendment_type: function(frm) {
        apply_field_rules(frm);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    },

    contract: function(frm) {
        if (!frm.doc.contract) {
            frm.set_value("customer_name", "");
            frm.set_value("project_title", "");
            frm.set_value("current_version", "1.0");
            frm.set_value("new_version", "1.1");
            frm.set_value("original_contract_value", 0);
            frm.set_value("current_contract_value", 0);
            frm.set_value("original_start_date", "");
            frm.set_value("current_end_date", "");
            return;
        }

        frappe.db.get_doc("Test Customer Contract", frm.doc.contract).then(c => {
            frm.set_value("customer_name", c.customer_name || c.party_name || "");
            frm.set_value("project_title", c.project_title || "");
            frm.set_value("original_contract_value", c.project_budget || 0);
            frm.set_value("current_contract_value", c.current_contract_value || c.project_budget || 0);
            frm.set_value("original_start_date", c.start_date || "");
            frm.set_value("current_end_date", c.current_end_date || c.end_date || "");

            // Copy lead and ceo approvers always
            if (c.lead_approver && !frm.doc.lead_approver) frm.set_value("lead_approver", c.lead_approver);
            if (c.ceo_approver && !frm.doc.ceo_approver) frm.set_value("ceo_approver", c.ceo_approver);

            // Set requested_by from contract owner if not set
            if (!frm.doc.requested_by && c.contract_owner) {
                frm.set_value("requested_by", c.contract_owner);
            }
            
            let cur_ver = c.current_version || "1.0";
            frm.set_value("current_version", cur_ver);

            let parts = cur_ver.split(".");
            let major = parseInt(parts[0]) || 1;
            let minor = parseInt(parts[1]) || 0;
            let next_ver = major + "." + (minor + 1);
            frm.set_value("new_version", next_ver);

            apply_field_rules(frm);
            update_approver_visibility(frm);
            render_approval_progress_tracker(frm);
        });
    },

    is_no_cost_extension: function(frm) {
        apply_field_rules(frm);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    },

    revised_end_date: function(frm) {
        calculate_extension_days(frm);
    },

    current_end_date: function(frm) {
        calculate_extension_days(frm);
    },

    has_cost_impact: function(frm) {
        if (frm.doc.has_cost_impact) {
            frm.set_value("impact_value", 1);
        } else {
            frm.set_value("value_change", 0);
            calculate_financials(frm);
        }
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    },

    value_change: function(frm) {
        let base_val = flt(frm.doc.current_contract_value) || flt(frm.doc.original_contract_value);
        let rev_val = base_val + flt(frm.doc.value_change);
        frm.set_value("revised_contract_value", rev_val);
        if (base_val > 0) {
            let pct = (flt(frm.doc.value_change) / base_val) * 100;
            frm.set_value("percentage_change", flt(pct, 2));
        } else {
            frm.set_value("percentage_change", 0);
        }
        if (flt(frm.doc.value_change) !== 0) {
            frm.set_value("has_cost_impact", 1);
            frm.set_value("impact_value", 1);
        }
    },

    revised_contract_value: function(frm) {
        let base_val = flt(frm.doc.current_contract_value) || flt(frm.doc.original_contract_value);
        let diff = flt(frm.doc.revised_contract_value) - base_val;
        frm.set_value("value_change", diff);
        if (base_val > 0) {
            let pct = (diff / base_val) * 100;
            frm.set_value("percentage_change", flt(pct, 2));
        } else {
            frm.set_value("percentage_change", 0);
        }
        if (diff !== 0) {
            frm.set_value("has_cost_impact", 1);
            frm.set_value("impact_value", 1);
        }
    },

    impact_scope: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_services: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_deliverables: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_timeline: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_value: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_budget_dist: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_payment_terms: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_staffing: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_fte: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_reporting: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_locations: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_legal: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },
    impact_other: function(frm) { update_approver_visibility(frm); render_approval_progress_tracker(frm); },

    signed_amendment_document: function(frm) {
        if (frm.doc.signed_amendment_document) {
            let path = frm.doc.signed_amendment_document.toLowerCase();
            if (!path.endsWith(".pdf")) {
                frappe.msgprint({
                    title: __("Invalid File Format"),
                    indicator: "red",
                    message: __("Please upload a PDF document for the signed amendment.")
                });
                frm.set_value("signed_amendment_document", "");
                return;
            }
            // Automatically save so the uploaded document is persisted to database
            frm.save().then(() => {
                setup_workflow_actions_guard(frm);
                if (frm.states) {
                    frm.states.show_actions();
                }
            });
        }
    },

    after_save: function(frm) {
        frm.custom_old_lead = frm.doc.lead_approver_review || "";
        frm.custom_old_legal = frm.doc.legal_approver_review || "";
        frm.custom_old_finance = frm.doc.finance_approver_review || "";
        frm.custom_old_hr = frm.doc.hr_approver_review || "";
        frm.custom_old_ceo = frm.doc.ceo_approver_review || "";

        delete frm.doc.__unsaved;
        setup_workflow_actions_guard(frm);
    },

    validate: function(frm) {
        if (frm.is_new() || frm.doc.workflow_state === "Draft" || !frm.doc.workflow_state) return;

        // Enforce strict approver authorization check
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

        check_auth("lead_approver_review", "Under Team Lead Review", frm.custom_old_lead || "");
        check_auth("legal_approver_review", "Pending Legal Review", frm.custom_old_legal || "");
        check_auth("finance_approver_review", "Pending Finance Review", frm.custom_old_finance || "");
        check_auth("hr_approver_review", "Pending HR Review", frm.custom_old_hr || "");
        check_auth("ceo_approver_review", "Pending CEO Review", frm.custom_old_ceo || "");
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "";
        let action_lower = action.toLowerCase();

        // Check authorization for Submit to Team Lead
        if (action === "Submit to Team Lead") {
            let is_contract_manager = (frappe.session.user === frm.doc.owner) ||
                frappe.user_roles.includes("Contract Manager") ||
                frappe.user_roles.includes("System Manager");
            if (!is_contract_manager) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the Contract Manager or document creator is authorized to modify and submit this amendment.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }
        }

        // 1. If executing amendment, require signed PDF
        if (action === "Execute Amendment") {
            if (!frm.doc.signed_amendment_document) {
                frappe.msgprint({
                    title: __("Missing Attachment"),
                    indicator: "red",
                    message: __("Please attach the Counter Signed Amendment Document (PDF) before executing.")
                });
                return Promise.reject("MISSING_SIGNED_DOCUMENT");
            }
            return Promise.resolve();
        }

        // 2. Identify approver fields for the current state
        let status_field = "";
        let review_field = "";
        if (state === "Under Team Lead Review") {
            status_field = "lead_approver_status";
            review_field = "lead_approver_review";
        } else if (state === "Pending Legal Review") {
            status_field = "legal_approver_status";
            review_field = "legal_approver_review";
        } else if (state === "Pending Finance Review") {
            status_field = "finance_approver_status";
            review_field = "finance_approver_review";
        } else if (state === "Pending HR Review") {
            status_field = "hr_approver_status";
            review_field = "hr_approver_review";
        } else if (state === "Pending CEO Review") {
            status_field = "ceo_approver_status";
            review_field = "ceo_approver_review";
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        // 3. Handle Approvals: Stamp timestamp atomically on backend (including any typed comments)
        if (action_lower.startsWith("approve")) {
            if (status_field) {
                let status_text = "Approved [" + now_str + "]";
                let review_val = "";
                let field_obj = frm.fields_dict[review_field];
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
                frm.refresh_field(status_field);
                if (review_field) {
                    frm.doc[review_field] = review_val;
                    frm.refresh_field(review_field);
                }
            }
            return Promise.resolve();
        }

        // 4. Handle Rejection or Return for Revision with Interactive Modal Dialog
        if (action_lower.includes("reject") || action_lower.includes("return")) {
            let is_return = action_lower.includes("return");
            let title = is_return ? __("Return Amendment for Revision") : __("Reject Contract Amendment");
            let label = is_return ? __("Revision Feedback / Comments") : __("Reason for Rejection");
            let btn_label = is_return ? __("Return for Revision") : __("Submit Rejection");

            // CRITICAL: Unfreeze and remove freeze backdrop so modal dialog is bright, sharp, and interactive
            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: title,
                    fields: [
                        {
                            label: label,
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: (review_field && frm.doc[review_field]) ? frm.doc[review_field].trim() : "",
                            description: is_return
                                ? __("Provide specific feedback and required modifications before resubmission.")
                                : __("Provide a clear, mandatory reason for rejecting this amendment.")
                        }
                    ],
                    primary_action_label: btn_label,
                    primary_action: async function(values) {
                        let text = values.comments ? values.comments.trim() : "";
                        if (!text) {
                            frappe.msgprint(__("Reason / Comments are mandatory."));
                            return;
                        }

                        let status_val = (is_return ? "Returned for Revision" : "Rejected") + " [" + now_str + "]";

                        // Freeze during saving
                        frappe.dom.freeze(is_return ? __("Returning for revision...") : __("Submitting rejection..."));

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
                            frappe.msgprint(__("Error recording decision: ") + (err.message || err));
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

// Child Table: Amendment Type Item (for Multiple Types)
frappe.ui.form.on("Amendment Type Item", {
    amendment_type: function(frm) {
        apply_field_rules(frm);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    },
    amendment_types_add: function(frm) {
        apply_field_rules(frm);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    },
    amendment_types_remove: function(frm) {
        apply_field_rules(frm);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    }
});

// Child Table: Amendment Scope Change
frappe.ui.form.on("Amendment Scope Change", {
    scope_changes_add: function(frm) {
        frm.set_value("impact_scope", 1);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    }
});

// Child Table: Amendment Budget Reallocation
frappe.ui.form.on("Amendment Budget Reallocation", {
    revised_amount: function(frm, cdt, cdn) {
        calculate_budget_row(frm, cdt, cdn);
    },
    original_amount: function(frm, cdt, cdn) {
        calculate_budget_row(frm, cdt, cdn);
    },
    budget_reallocations_add: function(frm) {
        frm.set_value("impact_budget_dist", 1);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    }
});

function calculate_budget_row(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let variance = flt(row.revised_amount) - flt(row.original_amount);
    frappe.model.set_value(cdt, cdn, "variance", variance);
}

// Child Table: Amendment Resource Change
frappe.ui.form.on("Amendment Resource Change", {
    revised_fte: function(frm, cdt, cdn) {
        calculate_resource_row(frm, cdt, cdn);
    },
    existing_fte: function(frm, cdt, cdn) {
        calculate_resource_row(frm, cdt, cdn);
    },
    monthly_rate: function(frm, cdt, cdn) {
        calculate_resource_row(frm, cdt, cdn);
    },
    resource_changes_add: function(frm) {
        frm.set_value("impact_staffing", 1);
        frm.set_value("impact_fte", 1);
        update_approver_visibility(frm);
        render_approval_progress_tracker(frm);
    }
});

function calculate_resource_row(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let fte_diff = flt(row.revised_fte) - flt(row.existing_fte);
    frappe.model.set_value(cdt, cdn, "fte_change", fte_diff);
    if (row.monthly_rate) {
        frappe.model.set_value(cdt, cdn, "cost_impact", fte_diff * flt(row.monthly_rate));
    }
    update_approver_visibility(frm);
    render_approval_progress_tracker(frm);
}

function safe_set(frm, field, val) {
    if (frm.doc[field] !== val) {
        if (frm.is_new()) {
            frm.set_value(field, val);
        } else {
            frm.doc[field] = val;
            frm.refresh_field(field);
        }
    }
}

function get_rejection_stage(frm) {
    const check_stages = [
        { name: "Pending CEO Review", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending HR Review", status: frm.doc.hr_approver_status, review: frm.doc.hr_approver_review, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Finance Review", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Pending Legal Review", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Under Team Lead Review", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Rejected")) {
            return cs;
        }
    }
    return null;
}

function get_revision_stage(frm) {
    const check_stages = [
        { name: "Pending CEO Review", status: frm.doc.ceo_approver_status, review: frm.doc.ceo_approver_review, role: "CEO", user: frm.doc.ceo_approver },
        { name: "Pending HR Review", status: frm.doc.hr_approver_status, review: frm.doc.hr_approver_review, role: "HR", user: frm.doc.hr_approver },
        { name: "Pending Finance Review", status: frm.doc.finance_approver_status, review: frm.doc.finance_approver_review, role: "Finance", user: frm.doc.finance_approver },
        { name: "Pending Legal Review", status: frm.doc.legal_approver_status, review: frm.doc.legal_approver_review, role: "Legal", user: frm.doc.legal_approver },
        { name: "Under Team Lead Review", status: frm.doc.lead_approver_status, review: frm.doc.lead_approver_review, role: "Team Lead", user: frm.doc.lead_approver },
    ];
    for (let cs of check_stages) {
        if (cs.status && cs.status.includes("Returned for Revision")) {
            return cs;
        }
    }
    return null;
}

function calculate_extension_days(frm) {
    if (frm.doc.revised_end_date && frm.doc.current_end_date) {
        let days = frappe.datetime.get_day_diff(frm.doc.revised_end_date, frm.doc.current_end_date);
        if (days <= 0 && frm.doc.is_no_cost_extension) {
            frappe.show_alert({
                message: __("Warning: Revised End Date should be later than Current End Date for an extension."),
                indicator: "orange"
            });
        }
        safe_set(frm, "extension_days", days);
    }
}

function calculate_financials(frm) {
    let base_val = flt(frm.doc.current_contract_value) || flt(frm.doc.original_contract_value);
    safe_set(frm, "revised_contract_value", base_val);
    safe_set(frm, "percentage_change", 0);
}

// ==============================================================================
// 1. Native Field Rules (Timeline Revision, Financial Impact, Impact Matrix)
// ==============================================================================
function apply_field_rules(frm) {
    let type = frm.doc.amendment_type || "";
    let multi_types = (frm.doc.amendment_types || []).map(r => r.amendment_type).filter(Boolean);

    let is_no_cost = type.includes("No Cost") || type.includes("No-Cost");
    let is_realloc = type === "Budget Reallocation";
    let is_cost_change = type === "Cost / Contract Value Change" || type.includes("Payment");
    let is_scope = type === "Change in Scope / Services";
    let is_resource = type === "Resource Change";

    // Handle Timeline Revision & Financial Impact fields directly
    if (is_no_cost) {
        safe_set(frm, "is_no_cost_extension", 1);
        safe_set(frm, "impact_timeline", 1);
        safe_set(frm, "has_cost_impact", 0);
        safe_set(frm, "value_change", 0);
        safe_set(frm, "impact_value", 0);
        safe_set(frm, "impact_budget_dist", 0);
        safe_set(frm, "impact_staffing", 0);
        safe_set(frm, "impact_fte", 0);
        safe_set(frm, "impact_scope", 0);
        safe_set(frm, "impact_services", 0);
        safe_set(frm, "impact_deliverables", 0);
        safe_set(frm, "impact_payment_terms", 0);
        safe_set(frm, "impact_legal", 0);
        calculate_financials(frm);

        // Lock financial fields
        frm.set_df_property("has_cost_impact", "read_only", 1);
        frm.set_df_property("value_change", "read_only", 1);
        frm.set_df_property("revised_contract_value", "read_only", 1);
    } else if (is_realloc) {
        safe_set(frm, "is_no_cost_extension", 0);
        safe_set(frm, "has_cost_impact", 0);
        safe_set(frm, "value_change", 0);
        safe_set(frm, "impact_value", 0);
        safe_set(frm, "impact_budget_dist", 1);
        safe_set(frm, "impact_timeline", 0);
        safe_set(frm, "impact_staffing", 0);
        safe_set(frm, "impact_fte", 0);
        safe_set(frm, "impact_scope", 0);
        safe_set(frm, "impact_services", 0);
        safe_set(frm, "impact_deliverables", 0);
        safe_set(frm, "impact_payment_terms", 0);
        safe_set(frm, "impact_legal", 0);
        calculate_financials(frm);

        // Net cost change is zero for budget reallocation
        frm.set_df_property("has_cost_impact", "read_only", 1);
        frm.set_df_property("value_change", "read_only", 1);
        frm.set_df_property("revised_contract_value", "read_only", 1);
    } else if (is_cost_change) {
        safe_set(frm, "is_no_cost_extension", 0);
        safe_set(frm, "has_cost_impact", 1);
        safe_set(frm, "impact_value", 1);

        // Unlock financial fields
        frm.set_df_property("has_cost_impact", "read_only", 0);
        frm.set_df_property("value_change", "read_only", 0);
        frm.set_df_property("revised_contract_value", "read_only", 0);
    } else {
        // Scope / Resource / Other
        frm.set_df_property("has_cost_impact", "read_only", 0);
        frm.set_df_property("value_change", "read_only", 0);
        frm.set_df_property("revised_contract_value", "read_only", 0);

        if (is_scope) safe_set(frm, "impact_scope", 1);
        if (is_resource) {
            safe_set(frm, "impact_staffing", 1);
            safe_set(frm, "impact_fte", 1);
        }
    }
}

// ==============================================================================
// 2. Native Approver Visibility (Hides non-required approvers, enforces required)
// ==============================================================================
function update_approver_visibility(frm) {
    let type = frm.doc.amendment_type || "";
    let multi_types = (frm.doc.amendment_types || []).map(r => r.amendment_type).filter(Boolean);

    let is_no_cost = (type.includes("No Cost") || type.includes("No-Cost")) && type !== "Multiple types";
    let is_multi = (type === "Multiple types" || (type === "" && multi_types.length > 1));

    let needs_legal = false;
    let needs_fin = false;
    let needs_hr = false;

    if (is_no_cost) {
        // Contract Extension – No Cost -> Strictly Team Lead + Legal + CEO (Finance & HR Hidden/Not Required)
        needs_legal = true;
        needs_fin = false;
        needs_hr = false;
    } else if (is_multi) {
        needs_legal = true;
        needs_fin = true;
        needs_hr = true;
    } else if (type === "Resource Change" || multi_types.some(t => t.includes("Resource") || t.includes("Staffing"))) {
        // Resource Change -> Team Lead + HR + Finance + CEO (Legal bypassed)
        needs_legal = false;
        needs_fin = true;
        needs_hr = true;
    } else if (type === "Budget Reallocation" || multi_types.includes("Budget Reallocation")) {
        // Budget Reallocation -> Team Lead + Finance + CEO (Legal & HR bypassed)
        needs_legal = false;
        needs_fin = true;
        needs_hr = false;
    } else if (type === "Cost / Contract Value Change" || type.includes("Payment") || multi_types.some(t => t.includes("Cost / Contract Value") || t.includes("Payment"))) {
        // Cost / Contract Value Change -> Team Lead + Legal + Finance + CEO (HR bypassed)
        needs_legal = true;
        needs_fin = true;
        needs_hr = false;
    } else if (type === "Change in Scope / Services" || multi_types.some(t => t.includes("Scope") || t.includes("Services"))) {
        // Change in Scope / Services -> Team Lead + Legal + CEO (Finance & HR bypassed)
        needs_legal = true;
        needs_fin = false;
        needs_hr = false;
    } else if (type === "Timeline / Milestone Change") {
        needs_legal = true;
        needs_fin = false;
        needs_hr = false;
    } else {
        // Default / Other -> Team Lead + Legal + CEO
        needs_legal = true;
        needs_fin = false;
        needs_hr = false;
    }

    // Set requires_* flags on the doc so depends_on triggers immediately
    safe_set(frm, "requires_legal", needs_legal ? 1 : 0);
    safe_set(frm, "requires_finance", needs_fin ? 1 : 0);
    safe_set(frm, "requires_hr", needs_hr ? 1 : 0);

    // Always Required: Lead Approver & CEO Approver
    frm.set_df_property("lead_approver", "reqd", 1);
    frm.set_df_property("ceo_approver", "reqd", 1);

    // 1. Legal Review Visibility & Mandatory
    frm.toggle_display(["section_break_app_legal", "legal_approver", "legal_approver_status", "legal_approver_review"], needs_legal);
    frm.toggle_reqd("legal_approver", needs_legal);
    if (!needs_legal) {
        safe_set(frm, "legal_approver_status", "Not Required");
        safe_set(frm, "legal_approver", "");
    } else {
        if (frm.doc.legal_approver_status === "Not Required") {
            safe_set(frm, "legal_approver_status", "");
        }
    }

    // 2. Finance Review Visibility & Mandatory
    frm.toggle_display(["section_break_app_fin", "finance_approver", "finance_approver_status", "finance_approver_review"], needs_fin);
    frm.toggle_reqd("finance_approver", needs_fin);
    if (!needs_fin) {
        safe_set(frm, "finance_approver_status", "Not Required");
        safe_set(frm, "finance_approver", "");
    } else {
        if (frm.doc.finance_approver_status === "Not Required") {
            safe_set(frm, "finance_approver_status", "");
        }
    }

    // 3. HR Review Visibility & Mandatory
    frm.toggle_display(["section_break_app_hr", "hr_approver", "hr_approver_status", "hr_approver_review"], needs_hr);
    frm.toggle_reqd("hr_approver", needs_hr);
    if (!needs_hr) {
        safe_set(frm, "hr_approver_status", "Not Required");
        safe_set(frm, "hr_approver", "");
    } else {
        if (frm.doc.hr_approver_status === "Not Required") {
            safe_set(frm, "hr_approver_status", "");
        }
    }

    // If parent contract is selected, automatically populate approver fields only for new documents
    if (frm.doc.contract && frm.is_new()) {
        frappe.db.get_doc("Test Customer Contract", frm.doc.contract).then(c => {
            if (c) {
                if (c.lead_approver && !frm.doc.lead_approver) frm.set_value("lead_approver", c.lead_approver);
                if (c.ceo_approver && !frm.doc.ceo_approver) frm.set_value("ceo_approver", c.ceo_approver);
                if (needs_legal && c.legal_approver && !frm.doc.legal_approver) frm.set_value("legal_approver", c.legal_approver);
                if (needs_fin && c.finance_approver && !frm.doc.finance_approver) frm.set_value("finance_approver", c.finance_approver);
                if (needs_hr && c.hr_approver && !frm.doc.hr_approver) frm.set_value("hr_approver", c.hr_approver);
            }
        });
    }
}

// ==============================================================================
// 3. Dynamic Progress Bar & Stepper Track (Native Form Dashboard Header)
// ==============================================================================
function render_approval_progress_tracker(frm) {
    if (!frm.dashboard || !frm.dashboard.parent) return;

    frm.dashboard.parent.find(".amendment-progress-container").remove();

    let type = frm.doc.amendment_type || "No-Cost Extension";
    let multi_types = (frm.doc.amendment_types || []).map(r => r.amendment_type).filter(Boolean);

    let steps = [
        { id: "Draft", label: "Draft" },
        { id: "Under Team Lead Review", label: "Team Lead" }
    ];

    if (type === "Multiple types" || multi_types.length > 1) {
        steps.push({ id: "Pending Legal Review", label: "Legal" });
        steps.push({ id: "Pending Finance Review", label: "Finance" });
        steps.push({ id: "Pending HR Review", label: "HR" });
    } else if (type === "Resource Change" || multi_types.some(t => t.includes("Resource") || t.includes("Staffing"))) {
        steps.push({ id: "Pending HR Review", label: "HR" });
        steps.push({ id: "Pending Finance Review", label: "Finance" });
    } else if (type === "Budget Reallocation" || multi_types.includes("Budget Reallocation")) {
        steps.push({ id: "Pending Finance Review", label: "Finance" });
    } else if (type === "Cost / Contract Value Change" || type.includes("Payment") || multi_types.some(t => t.includes("Cost / Contract Value") || t.includes("Payment"))) {
        steps.push({ id: "Pending Legal Review", label: "Legal" });
        steps.push({ id: "Pending Finance Review", label: "Finance" });
    } else {
        // Scope / No-Cost Extension / Timeline / Other
        steps.push({ id: "Pending Legal Review", label: "Legal" });
    }

    steps.push({ id: "Pending CEO Review", label: "CEO" });
    steps.push({ id: "Pending Client Signature", label: "Client Signature" });
    steps.push({ id: "Executed", label: "Executed" });

    let current_state = frm.doc.workflow_state || (frm.doc.docstatus === 1 ? "Executed" : "Draft");
    let rejected_stage = get_rejection_stage(frm);
    let returned_stage = get_revision_stage(frm);

    let is_rejected = (current_state === "Rejected") || (rejected_stage !== null);
    let is_returned = (current_state === "Returned for Revision") || (returned_stage !== null);

    let active_index = 0;
    if (current_state === "Executed") {
        active_index = steps.length - 1;
    } else if (rejected_stage) {
        active_index = steps.findIndex(s => s.id === rejected_stage.name);
        if (active_index < 0) active_index = 1;
    } else if (returned_stage) {
        active_index = steps.findIndex(s => s.id === returned_stage.name);
        if (active_index < 0) active_index = 1;
    } else {
        let idx = steps.findIndex(s => s.id === current_state);
        active_index = idx >= 0 ? idx : 0;
    }

    let percent = current_state === "Executed" ? 100 : Math.round((active_index / (steps.length - 1)) * 100);
    let exec_time_str = frm.doc.executed_on ? frappe.datetime.str_to_user(frm.doc.executed_on) : frappe.datetime.str_to_user(frm.doc.modified);

    let status_label = current_state;
    let status_bg = "#16a34a";
    let bar_color = "#16a34a";
    if (current_state === "Executed") {
        status_label = exec_time_str ? `Executed [${exec_time_str}]` : "Executed";
        status_bg = "#16a34a";
        bar_color = "#16a34a";
    } else if (rejected_stage) {
        status_label = `Rejected at ${rejected_stage.role} (Draft)`;
        status_bg = "#dc2626";
        bar_color = "#dc2626";
    } else if (returned_stage) {
        status_label = `Returned by ${returned_stage.role} (Draft)`;
        status_bg = "#d97706";
        bar_color = "#d97706";
    }

    let nodes_html = steps.map((s, idx) => {
        let is_completed = (idx < active_index) || (current_state === "Executed");
        let is_active = (idx === active_index) && (current_state !== "Executed");

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
            circle_content = "&#10003;"; // Checkmark
            label_color = "#15803d";
            label_weight = "600";
        } else if (is_active) {
            if (is_rejected) {
                circle_bg = "#dc2626";
                circle_border = "#dc2626";
                circle_color = "#ffffff";
                circle_content = "&#10007;"; // Cross
                label_color = "#dc2626";
                label_weight = "700";
                pulse_style = "box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.25);";
            } else if (is_returned) {
                circle_bg = "#d97706";
                circle_border = "#d97706";
                circle_color = "#ffffff";
                circle_content = "&#8635;"; // Return arrow
                label_color = "#d97706";
                label_weight = "700";
                pulse_style = "box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.25);";
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
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 55px; position: relative; z-index: 2;">
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
    <div class="amendment-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <span>Approval Route: <b style="color: #15803d;">${frappe.utils.escape_html(type)}</b></span>
            </div>
            <div>
                <span class="badge" style="background: ${status_bg}; color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 12px; font-weight: 600;">
                    ${frappe.utils.escape_html(status_label)} (${percent}%)
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
// 4. Approver Field Locking & High-Contrast Visual Stamping
// ==============================================================================
function apply_approver_field_locking(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Draft";

    // 1. If beyond Draft, lock all master/amendment definition fields
    let is_contract_manager = (frappe.session.user === frm.doc.owner) ||
        frappe.user_roles.includes("Contract Manager") ||
        frappe.user_roles.includes("System Manager");

    let is_in_review = state !== "Draft";
    let locked_fields = [
        "contract", "amendment_type", "amendment_date", "amendment_effective_date",
        "requested_by", "amendment_reason", "scope_description",
        "has_cost_impact", "value_change", "revised_contract_value",
        "is_no_cost_extension", "revised_end_date", "lead_approver",
        "legal_approver", "finance_approver", "hr_approver", "ceo_approver"
    ];
    if (is_in_review) {
        locked_fields.forEach(f => {
            frm.set_df_property(f, "read_only", 1);
        });
    } else {
        // In Draft:
        // ONLY Contract Manager / document creator can edit the form fields!
        if (is_contract_manager) {
            locked_fields.forEach(f => {
                if (f === "has_cost_impact" && frm.doc.is_no_cost_extension) {
                    frm.set_df_property(f, "read_only", 1);
                } else {
                    frm.set_df_property(f, "read_only", 0);
                }
            });
        } else {
            // Other employees see read-only view
            locked_fields.forEach(f => {
                frm.set_df_property(f, "read_only", 1);
            });
        }
    }

    // 2. Strict Approver Review Comment Matrix:
    // Only the assigned approver for the CURRENT active stage can write in their own comment box.
    // All other comment boxes are read-only!
    const review_matrix = [
        { review: "lead_approver_review", status: "lead_approver_status", approver: "lead_approver", state: "Under Team Lead Review", role: "Team Lead" },
        { review: "legal_approver_review", status: "legal_approver_status", approver: "legal_approver", state: "Pending Legal Review", role: "Legal" },
        { review: "finance_approver_review", status: "finance_approver_status", approver: "finance_approver", state: "Pending Finance Review", role: "Finance" },
        { review: "hr_approver_review", status: "hr_approver_status", approver: "hr_approver", state: "Pending HR Review", role: "HR" },
        { review: "ceo_approver_review", status: "ceo_approver_status", approver: "ceo_approver", state: "Pending CEO Review", role: "CEO" },
    ];

    review_matrix.forEach(item => {
        let status_val = frm.doc[item.status] || "";
        let review_val = frm.doc[item.review] || "";

        // Status is always read-only
        frm.set_df_property(item.status, "read_only", 1);
        frm.set_df_property("executed_on", "hidden", 1);

        // Review field: writeable ONLY if user is assigned/role approver AND document is in this exact review stage
        let is_assigned_user = is_stage_approver(frm, item.state);
        let is_active_stage = (state === item.state);
        let can_edit_comment = is_active_stage && is_assigned_user;

        frm.set_df_property(item.review, "read_only", can_edit_comment ? 0 : 1);

        // Force Frappe refresh so display areas update
        frm.refresh_field(item.status);
        frm.refresh_field(item.review);

        // High-contrast custom visual pill rendering for Status:
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
                $disp.html(`
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 12px; margin-top: 2px;">
                        <span>Pending Review</span>
                    </div>
                `).css({
                    "border": "none",
                    "background": "transparent",
                    "padding": "0"
                }).show();
                status_field.$wrapper.find(".control-input").hide();
            }
        }

        // High-contrast custom visual card rendering for Comments / Review:
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
                    } else if (status_val && status_val.includes("Returned")) {
                        border_color = "#fcd34d";
                        bg_color = "#fffbeb";
                        text_color = "#92400e";
                    }
                    $disp.html(`
                        <div style="padding: 10px 14px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 13px; color: ${text_color}; white-space: pre-wrap; line-height: 1.5; min-height: 42px; margin-top: 2px;">
                            ${frappe.utils.escape_html(review_val)}
                        </div>
                    `).css({
                        "border": "none",
                        "background": "transparent",
                        "padding": "0"
                    }).show();
                    review_field.$wrapper.find(".control-input").hide();
                } else {
                    $disp.html(`
                        <div style="padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic; margin-top: 2px;">
                            No comments provided
                        </div>
                    `).css({
                        "border": "none",
                        "background": "transparent",
                        "padding": "0"
                    }).show();
                    review_field.$wrapper.find(".control-input").hide();
                }
            } else {
                review_field.$wrapper.find(".control-value").hide();
                review_field.$wrapper.find(".control-input").show();
            }
        }
    });
}

// ==============================================================================
// 5. Auto-Expand Textareas (Initial 4 lines ~95px, extends on typing)
// ==============================================================================
function setup_auto_expand_textareas(frm) {
    const approver_reviews = [
        "lead_approver_review",
        "legal_approver_review",
        "finance_approver_review",
        "hr_approver_review",
        "ceo_approver_review"
    ];

    [
        "amendment_reason", 
        "scope_description",
        ...approver_reviews
    ].forEach(fieldname => {
        let field = frm.fields_dict[fieldname];
        if (field && field.$input && field.$input.length) {
            let $textarea = field.$input;
            
            // Set initial 2 lines height (~52px)
            $textarea.attr("rows", 2);
            $textarea.css({
                "height": "52px",
                "min-height": "52px",
                "resize": "vertical",
                "overflow-y": "hidden",
                "line-height": "1.45"
            });

            function auto_resize() {
                $textarea.css("height", "auto");
                let scroll_h = $textarea[0].scrollHeight;
                let target_h = Math.max(52, scroll_h);
                $textarea.css("height", target_h + "px");
            }

            $textarea.off("input.autoresize").on("input.autoresize", auto_resize);
            auto_resize();
        }
    });
}

function is_stage_approver(frm, state) {
    if (!frm || !frm.doc || !state) return false;
    if (frappe.session.user === "Administrator") {
        return true;
    }
    const stage_map = {
        "Under Team Lead Review": { field: "lead_approver", roles: ["Team Lead"] },
        "Pending Legal Review": { field: "legal_approver", roles: ["Legal Approver"] },
        "Pending Finance Review": { field: "finance_approver", roles: ["Finance Approver", "Accounts Manager"] },
        "Pending HR Review": { field: "hr_approver", roles: ["HR Approver", "HR Manager", "HR User"] },
        "Pending CEO Review": { field: "ceo_approver", roles: ["CEO Approver"] }
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

// ==============================================================================
// 6. Comprehensive Workflow Actions Guard
// ==============================================================================
function setup_workflow_actions_guard(frm) {
    if (frm.is_new()) return;
    let state = frm.doc.workflow_state || "Draft";
    let is_contract_manager = (frappe.session.user === frm.doc.owner) ||
        (frappe.user_roles && frappe.user_roles.includes("Contract Manager"));

    let is_active_approver = is_stage_approver(frm, state);
    let is_dirty = frm.is_dirty() || (frm.doc && frm.doc.__unsaved);

    if (state === "Pending Client Signature") {
        if (!is_contract_manager) {
            frm.page.clear_actions_menu();
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide");
            }
            frm.disable_save();
        } else {
            // Contract Manager is authorized to upload signed document and execute
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
                // Prominent primary button for executing amendment
                frm.remove_custom_button(__("Execute Amendment"));
                frm.add_custom_button(__("Execute Amendment"), function() {
                    if (!frm.doc.signed_amendment_document) {
                        frappe.msgprint({
                            title: __("Missing Attachment"),
                            indicator: "red",
                            message: __("Please attach the Counter Signed Amendment Document (PDF) before executing.")
                        });
                        return;
                    }
                    frappe.xcall("frappe.model.workflow.apply_workflow", {
                        doc: frm.doc,
                        action: "Execute Amendment"
                    }).then(() => {
                        frm.reload_doc();
                    });
                }).addClass("btn-primary");
            }
        }
    } else if (state === "Executed") {
        frm.page.clear_actions_menu();
        if (frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().addClass("hide");
        }
        frm.disable_save();
    } else if (state !== "Draft") {
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
        // In Draft:
        if (!is_contract_manager) {
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



function format_requested_by_display_contract_amendment(frm) {
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

    const stage_approver_map = {'Under Team Lead Review': 'lead_approver', 'Pending Legal Review': 'legal_approver', 'Pending Finance Review': 'finance_approver', 'Pending HR Review': 'hr_approver', 'Pending CEO Review': 'ceo_approver'};
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
