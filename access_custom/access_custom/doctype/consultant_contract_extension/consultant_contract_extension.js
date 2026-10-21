// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Contract Extension", {
    onload(frm) {
        inject_extension_styles();
        setup_auto_calc(frm);
        apply_form_lockdown(frm);
        enforce_extension_stage_actions(frm);
        setup_auto_expand_textareas(frm, ["extension_reason", "revised_scope"]);
        setTimeout(() => {
            render_extension_progress_tracker(frm);
            apply_extension_approver_styling(frm);
            enforce_extension_stage_actions(frm);
        }, 120);
        setTimeout(() => {
            enforce_extension_stage_actions(frm);
        }, 400);
    },

    refresh(frm) {
        inject_extension_styles();
        setup_auto_calc(frm);
        apply_status_indicator(frm);
        apply_form_lockdown(frm);
        enforce_extension_stage_actions(frm);
        setup_auto_expand_textareas(frm, ["extension_reason", "revised_scope"]);
        setTimeout(() => {
            render_extension_progress_tracker(frm);
            apply_extension_approver_styling(frm);
            enforce_extension_stage_actions(frm);
        }, 120);
        setTimeout(() => {
            enforce_extension_stage_actions(frm);
        }, 400);
    },

    contract(frm) {
        if (frm.doc.contract) {
            frappe.db.get_value("Consultant Contract", frm.doc.contract, [
                "consultant_name",
                "requesting_organization",
                "organization",
                "project",
                "project_name",
                "end_date",
                "proposed_end_date",
                "proposed_fee",
                "compensation_amount",
                "team_lead_approver",
                "hr_approver",
                "ceo_approver"
            ]).then(r => {
                if (r && r.message) {
                    let m = r.message;
                    if (!frm.doc.consultant_name && m.consultant_name) frm.set_value("consultant_name", m.consultant_name);
                    if (!frm.doc.organization && (m.organization || m.requesting_organization)) {
                        frm.set_value("organization", m.organization || m.requesting_organization);
                    }
                    if (!frm.doc.project_name && (m.project_name || m.project)) {
                        frm.set_value("project_name", m.project_name || m.project);
                    }
                    if (!frm.doc.current_end_date && (m.end_date || m.proposed_end_date)) {
                        frm.set_value("current_end_date", m.end_date || m.proposed_end_date);
                    }
                    if (!frm.doc.current_fee && (m.proposed_fee || m.compensation_amount)) {
                        frm.set_value("current_fee", m.proposed_fee || m.compensation_amount);
                    }
                    if (!frm.doc.team_lead_approver && m.team_lead_approver) {
                        frm.set_value("team_lead_approver", m.team_lead_approver);
                    }
                    if (!frm.doc.hr_approver && m.hr_approver) {
                        frm.set_value("hr_approver", m.hr_approver);
                    }
                    if (!frm.doc.ceo_approver && m.ceo_approver) {
                        frm.set_value("ceo_approver", m.ceo_approver);
                    }
                    setup_auto_calc(frm);
                }
            });
        }
    },

    extension_months(frm) {
        setup_auto_calc(frm);
    },

    revised_fee(frm) {
        setup_auto_calc(frm);
    },

    validate(frm) {
        if (!validate_pdf_attachment(frm, "extension_appendix")) {
            frappe.validated = false;
            return false;
        }
    },

    extension_appendix(frm) {
        validate_pdf_attachment(frm, "extension_appendix");
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let action_lower = action.toLowerCase();
        let user = frappe.session.user;
        let is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));

        let decision_field = "";
        let remarks_field = "";
        let tier_name = "";
        let is_authorized = false;

        if (state === "Pending Team Lead Approval") {
            decision_field = "team_lead_decision";
            remarks_field = "team_lead_remarks";
            tier_name = "Team Lead";
            let assigned_lead = frm.doc.team_lead_approver;
            let is_tl_assigned = (assigned_lead && user === assigned_lead);
            let has_tl_role = frappe.user_roles && frappe.user_roles.includes("Team Lead");
            is_authorized = is_admin || is_tl_assigned || (has_tl_role && (!assigned_lead || user === assigned_lead));
        } else if (state === "Pending HR Review") {
            decision_field = "hr_decision";
            remarks_field = "hr_remarks";
            tier_name = "HR Review";
            let is_hr_assigned = (frm.doc.hr_approver && user === frm.doc.hr_approver);
            let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"));
            is_authorized = is_admin || is_hr_assigned || has_hr_role;
        } else if (state === "Pending CEO Approval") {
            decision_field = "ceo_decision";
            remarks_field = "ceo_remarks";
            tier_name = "CEO Approval";
            let is_ceo_assigned = (frm.doc.ceo_approver && user === frm.doc.ceo_approver);
            let has_ceo_role = frappe.user_roles && frappe.user_roles.includes("CEO Approver");
            is_authorized = is_admin || is_ceo_assigned || has_ceo_role;
        }

                if (action === "Resubmit for Review" || action === "Submit for Review") {
            let is_cm_authorized = (user === frm.doc.owner) ||
                (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
                is_admin;

            if (!is_cm_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> is authorized to resubmit this extension after revision.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }
            return Promise.resolve();
        }

        // If not in an approver decision stage (e.g. initial submit from Draft), proceed normally
        if (!decision_field) {
            return Promise.resolve();
        }

        if (!is_authorized) {
            frappe.msgprint({
                title: __("Not Authorized"),
                indicator: "red",
                message: __(`You are not authorized to action the extension at the <b>${tier_name}</b> stage.`)
            });
            return Promise.reject("NOT_AUTHORIZED");
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        let existing_comment = "";
        if (remarks_field) {
            let field_obj = frm.fields_dict[remarks_field];
            if (field_obj && field_obj.$wrapper) {
                existing_comment = field_obj.$wrapper.find("textarea").val() || frm.doc[remarks_field] || "";
            } else {
                existing_comment = frm.doc[remarks_field] || "";
            }
            existing_comment = (existing_comment || "").trim();
        }

        // Handle Approval
        if (action_lower.includes("approve")) {
            let status_text = "Approved [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Approve Extension — ${tier_name}`),
                    fields: [
                        {
                            label: __("Approval Remarks / Comments (Optional)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            default: existing_comment,
                            description: __("Add any review remarks or notes for this approval.")
                        }
                    ],
                    primary_action_label: __("Confirm Approval"),
                    primary_action: async function(values) {
                        let final_comment = values.comments ? values.comments.trim() : "";
                        frappe.dom.freeze(__("Recording approval..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract_extension.consultant_contract_extension.record_extension_approver_decision",
                                args: {
                                    name: frm.doc.name,
                                    decision_field: decision_field,
                                    decision_val: status_text,
                                    remarks_field: remarks_field,
                                    remarks_val: final_comment
                                }
                            });
                            frm.doc[decision_field] = status_text;
                            if (remarks_field) {
                                frm.doc[remarks_field] = final_comment;
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
                    $("#freeze").removeClass("in").remove();
                };

                dialog.$wrapper.on("hidden.bs.modal", function() {
                    if (!submitted) {
                        frappe.dom.unfreeze();
                        $("#freeze").removeClass("in").remove();
                        reject("APPROVAL_CANCELLED");
                    }
                });

                dialog.show();
            });
        }

        // Handle Rejection
        if (action_lower.includes("reject")) {
            let status_text = "Rejected [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Reject Extension — ${tier_name}`),
                    fields: [
                        {
                            label: __("Rejection Reason / Comments (Mandatory)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: existing_comment,
                            description: __("Please specify the reason for rejecting this extension.")
                        }
                    ],
                    primary_action_label: __("Confirm Rejection"),
                    primary_action: async function(values) {
                        if (!values.comments || !values.comments.trim()) {
                            frappe.msgprint(__("Rejection comments are mandatory."));
                            return;
                        }
                        let final_comment = values.comments.trim();
                        frappe.dom.freeze(__("Recording rejection..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract_extension.consultant_contract_extension.record_extension_approver_decision",
                                args: {
                                    name: frm.doc.name,
                                    decision_field: decision_field,
                                    decision_val: status_text,
                                    remarks_field: remarks_field,
                                    remarks_val: final_comment
                                }
                            });
                            frm.doc[decision_field] = status_text;
                            if (remarks_field) {
                                frm.doc[remarks_field] = final_comment;
                            }
                            submitted = true;
                            dialog.hide();
                            resolve();
                        } catch (e) {
                            frappe.dom.unfreeze();
                            frappe.msgprint(__("Error recording rejection."));
                            reject(e);
                        }
                    }
                });

                dialog.on_page_show = function() {
                    frappe.dom.unfreeze();
                    $("#freeze").removeClass("in").remove();
                };

                dialog.$wrapper.on("hidden.bs.modal", function() {
                    if (!submitted) {
                        frappe.dom.unfreeze();
                        $("#freeze").removeClass("in").remove();
                        reject("REJECTION_CANCELLED");
                    }
                });

                dialog.show();
            });
        }

        // Handle Return for Revision
        if (action_lower.includes("return") || action_lower.includes("revision")) {
            let status_text = "Returned for Revision [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Return for Revision — ${tier_name}`),
                    fields: [
                        {
                            label: __("Revision Feedback / Comments (Mandatory)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: existing_comment,
                            description: __("Specify the changes or corrections required.")
                        }
                    ],
                    primary_action_label: __("Confirm Return"),
                    primary_action: async function(values) {
                        if (!values.comments || !values.comments.trim()) {
                            frappe.msgprint(__("Revision feedback is mandatory."));
                            return;
                        }
                        let final_comment = values.comments.trim();
                        frappe.dom.freeze(__("Recording revision request..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract_extension.consultant_contract_extension.record_extension_approver_decision",
                                args: {
                                    name: frm.doc.name,
                                    decision_field: decision_field,
                                    decision_val: status_text,
                                    remarks_field: remarks_field,
                                    remarks_val: final_comment
                                }
                            });
                            frm.doc[decision_field] = status_text;
                            if (remarks_field) {
                                frm.doc[remarks_field] = final_comment;
                            }
                            submitted = true;
                            dialog.hide();
                            resolve();
                        } catch (e) {
                            frappe.dom.unfreeze();
                            frappe.msgprint(__("Error recording revision request."));
                            reject(e);
                        }
                    }
                });

                dialog.on_page_show = function() {
                    frappe.dom.unfreeze();
                    $("#freeze").removeClass("in").remove();
                };

                dialog.$wrapper.on("hidden.bs.modal", function() {
                    if (!submitted) {
                        frappe.dom.unfreeze();
                        $("#freeze").removeClass("in").remove();
                        reject("RETURN_CANCELLED");
                    }
                });

                dialog.show();
            });
        }

        return Promise.resolve();
    }
});

function setup_auto_calc(frm) {
    if (frm.doc.current_end_date && frm.doc.extension_months) {
        let new_end = frappe.datetime.add_months(frm.doc.current_end_date, parseInt(frm.doc.extension_months));
        frm.set_value("revised_end_date", new_end);
    }
    let fee = parseFloat(frm.doc.revised_fee || frm.doc.current_fee || 0);
    let months = parseInt(frm.doc.extension_months || 0);
    if (fee > 0 && months > 0) {
        frm.set_value("total_extension_value", fee * months);
    }
}

function apply_status_indicator(frm) {
    let state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let color = "gray";

    if (state === "Draft") {
        color = "gray";
    } else if (state.startsWith("Pending")) {
        color = "orange";
    } else if (state === "Approved") {
        color = "green";
    } else if (state === "Rejected") {
        color = "red";
    } else if (state === "Returned for Revision") {
        color = "yellow";
    }

    frm.page.set_indicator(state, color);
}

function apply_form_lockdown(frm) {
    let state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let user = frappe.session.user;
    let is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));
    let is_draft_or_revision = (state === "Draft" || state === "Returned for Revision");

    // Lock main inputs once submitted into approval pipeline
    let lock_inputs = !is_draft_or_revision && !frm.is_new();
    const core_fields = [
        "contract",
        "extension_months",
        "revised_fee",
        "extension_reason",
        "revised_scope",
        "extension_appendix"
    ];

    core_fields.forEach(f => {
        frm.set_df_property(f, "read_only", lock_inputs ? 1 : 0);
    });

    // Remarks field editability per stage
    let can_edit_tl_remarks = (state === "Pending Team Lead Approval") && (is_admin || (frm.doc.team_lead_approver && user === frm.doc.team_lead_approver) || (frappe.user_roles && frappe.user_roles.includes("Team Lead")));
    let can_edit_hr_remarks = (state === "Pending HR Review") && (is_admin || (frm.doc.hr_approver && user === frm.doc.hr_approver) || (frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"))));
    let can_edit_ceo_remarks = (state === "Pending CEO Approval") && (is_admin || (frm.doc.ceo_approver && user === frm.doc.ceo_approver) || (frappe.user_roles && frappe.user_roles.includes("CEO Approver")));

    frm.set_df_property("team_lead_remarks", "read_only", can_edit_tl_remarks ? 0 : 1);
    frm.set_df_property("hr_remarks", "read_only", can_edit_hr_remarks ? 0 : 1);
    frm.set_df_property("ceo_remarks", "read_only", can_edit_ceo_remarks ? 0 : 1);
}

function validate_pdf_attachment(frm, fieldname) {
    let file_url = frm.doc[fieldname];
    if (!file_url) return true;
    let clean_path = file_url.split("?")[0].split("#")[0].toLowerCase().trim();
    let ext = clean_path.split(".").pop();
    if (ext !== "pdf") {
        let field_label = frm.get_docfield(fieldname)?.label || fieldname;
        frm.set_value(fieldname, null);
        frappe.msgprint({
            title: __("Invalid Document Format"),
            indicator: "red",
            message: __("<b>{0}</b> only accepts PDF (.pdf) files.<br><br>The uploaded file (.<b>{1}</b>) is not permitted and has been removed.", [field_label, ext])
        });
        return false;
    }
    return true;
}

function inject_extension_styles() {
    $("#cce-custom-ui-style").remove();
    $(`
    <style id="cce-custom-ui-style">
        [data-page-route*="consultant-contract-extension"] [data-fieldname="extension_reason"] textarea,
        [data-page-route*="consultant-contract-extension"] [data-fieldname="revised_scope"] textarea,
        [data-page-route*="consultant_contract_extension"] [data-fieldname="extension_reason"] textarea,
        [data-page-route*="consultant_contract_extension"] [data-fieldname="revised_scope"] textarea,
        .form-page[data-page-route*="consultant-contract-extension"] [data-fieldname="extension_reason"] textarea,
        .form-page[data-page-route*="consultant-contract-extension"] [data-fieldname="revised_scope"] textarea {
            height: 52px !important;
            min-height: 52px !important;
            line-height: 1.45 !important;
            font-size: 13px !important;
            padding: 6px 10px !important;
            resize: none !important;
            overflow-y: hidden !important;
            box-sizing: border-box !important;
        }
    </style>
    `).appendTo("head");
}

function setup_auto_expand_textareas(frm, fieldnames) {
    const apply_resize = () => {
        fieldnames.forEach(fieldname => {
            let field = frm.fields_dict[fieldname];
            if (!field || !field.$wrapper) return;
            let textarea = field.$wrapper.find("textarea");
            if (!textarea.length) return;

            textarea.attr("rows", 2);
            textarea.each(function() {
                this.style.setProperty("min-height", "52px", "important");
                this.style.setProperty("line-height", "1.45", "important");
                this.style.setProperty("font-size", "13px", "important");
                this.style.setProperty("padding", "6px 10px", "important");
                this.style.setProperty("box-sizing", "border-box", "important");
                this.style.setProperty("overflow-y", "hidden", "important");
                this.style.setProperty("resize", "none", "important");

                this.style.setProperty("height", "auto", "important");
                let newHeight = Math.max(52, this.scrollHeight);
                this.style.setProperty("height", newHeight + "px", "important");
            });

            textarea.off("input.auto_expand").on("input.auto_expand", function() {
                this.style.setProperty("height", "auto", "important");
                let newHeight = Math.max(52, this.scrollHeight);
                this.style.setProperty("height", newHeight + "px", "important");
            });
        });
    };

    apply_resize();
    setTimeout(apply_resize, 100);
    setTimeout(apply_resize, 300);
}


// ==============================================================================
// Extension UI Enhancement: Progress Tracker & Approver State Cards
// ==============================================================================

function render_extension_progress_tracker(frm) {
    if (!frm || !frm.wrapper) return;

    try {
        // Clean up any prior instances
        $(frm.wrapper).find(".contract-progress-container").remove();

        let steps = [
            { id: "Draft", label: "Draft" },
            { id: "Pending Team Lead Approval", label: "Team Lead" },
            { id: "Pending HR Review", label: "HR Review" },
            { id: "Pending CEO Approval", label: "CEO" },
            { id: "Approved", label: "Approved" }
        ];

        let current_state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let is_rejected = current_state.includes("Reject") || (frm.doc.status === "Rejected");
        let is_revision = (current_state === "Returned for Revision") || (frm.doc.status === "Returned for Revision");

        let rejected_stage = get_extension_rejection_stage(frm);
        if (rejected_stage) is_rejected = true;

        let revision_stage = get_extension_revision_stage(frm);
        if (revision_stage && !is_rejected) is_revision = true;

        let active_index = 0;
        if (current_state === "Approved") {
            active_index = steps.length - 1;
        } else if (rejected_stage) {
            active_index = steps.findIndex(s => s.id === rejected_stage.name);
            if (active_index < 0) active_index = 1;
        } else if (revision_stage && is_revision) {
            active_index = steps.findIndex(s => s.id === revision_stage.name);
            if (active_index < 0) active_index = 1;
        } else {
            let idx = steps.findIndex(s => s.id === current_state || current_state.includes(s.label));
            active_index = idx >= 0 ? idx : 0;
        }

        let percent = (active_index === steps.length - 1 && current_state === "Approved") ? 100 : Math.round((active_index / (steps.length - 1)) * 100);

        let status_bg = "#16a34a";
        let bar_color = "#16a34a";
        if (is_rejected) {
            status_bg = "#dc2626";
            bar_color = "#dc2626";
        } else if (is_revision) {
            status_bg = "#d97706";
            bar_color = "#d97706";
        }

        let nodes_html = steps.map((s, idx) => {
            let is_completed = (idx < active_index) || (active_index === steps.length - 1 && current_state === "Approved");
            let is_active = (idx === active_index) && !(active_index === steps.length - 1 && current_state === "Approved");

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
                    <span>Consultant Contract Extension Workflow Route</span>
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
        console.error("Error in render_extension_progress_tracker:", e);
    }
}

function get_extension_rejection_stage(frm) {
    const check_stages = [
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

function get_extension_revision_stage(frm) {
    const check_stages = [
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

function apply_extension_approver_styling(frm) {
    if (!frm || !frm.wrapper) return;

    if (frm.is_new()) {
        $(frm.wrapper).find(".approver-decision-badge, .approver-remarks-content").remove();
        $(frm.wrapper).find(".control-input-wrapper, .control-input, .control-value").show();
        return;
    }

    try {
        let state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let user = frappe.session.user;
        let is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));

        const stage_mapping = [
            {
                role: "Team Lead",
                state: "Pending Team Lead Approval",
                approver: "team_lead_approver",
                status: "team_lead_decision",
                review: "team_lead_remarks"
            },
            {
                role: "HR",
                state: "Pending HR Review",
                approver: "hr_approver",
                status: "hr_decision",
                review: "hr_remarks"
            },
            {
                role: "CEO",
                state: "Pending CEO Approval",
                approver: "ceo_approver",
                status: "ceo_decision",
                review: "ceo_remarks"
            }
        ];

        stage_mapping.forEach(item => {
            let status_val = frm.doc[item.status] || "";
            let review_val = frm.doc[item.review] || "";

            frm.set_df_property(item.status, "read_only", 1);
            let is_active_stage = (state === item.state);
            let assigned_user = frm.doc[item.approver];

            let is_assigned_user = (assigned_user && user === assigned_user) || is_admin;
            if (item.role === "HR") {
                if (frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"))) {
                    is_assigned_user = true;
                }
            } else if (item.role === "Team Lead") {
                if (frappe.user_roles && frappe.user_roles.includes("Team Lead")) {
                    is_assigned_user = true;
                }
            } else if (item.role === "CEO") {
                if (frappe.user_roles && frappe.user_roles.includes("CEO Approver")) {
                    is_assigned_user = true;
                }
            }

            let can_edit_comment = is_active_stage && is_assigned_user;
            frm.set_df_property(item.review, "read_only", can_edit_comment ? 0 : 1);

            // Visual badge for decision status
            let status_field = frm.get_field(item.status);
            if (status_field && status_field.$wrapper) {
                status_field.$wrapper.find(".approver-decision-badge").remove();
                status_field.$wrapper.find(".control-input-wrapper").hide();
                status_field.$wrapper.find(".control-input").hide();
                status_field.$wrapper.find(".control-value").hide();

                let $badge = $('<div class="approver-decision-badge" style="margin-top: 4px; display: block !important;"></div>');
                if (status_val && status_val !== "Pending") {
                    let badge_bg = "#16a34a";
                    let text_color = "#ffffff";
                    let icon = "&#10003;";
                    if (status_val.includes("Reject")) {
                        badge_bg = "#dc2626";
                        icon = "&#10007;";
                    } else if (status_val.includes("Return") || status_val.includes("Revision")) {
                        badge_bg = "#d97706";
                        icon = "&#8635;";
                    }
                    $badge.html(`
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: ${badge_bg}; color: ${text_color}; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">
                            <span>${icon}</span>
                            <span>${frappe.utils.escape_html(status_val)}</span>
                        </div>
                    `);
                } else {
                    $badge.html(`
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 12px;">
                            <span>Pending Review</span>
                        </div>
                    `);
                }
                status_field.$wrapper.append($badge);
            }

            // Visual box for comment / remarks
            let review_field = frm.get_field(item.review);
            if (review_field && review_field.$wrapper) {
                review_field.$wrapper.find(".approver-remarks-content").remove();
                if (!can_edit_comment) {
                    review_field.$wrapper.find(".control-input-wrapper").hide();
                    review_field.$wrapper.find(".control-input").hide();
                    review_field.$wrapper.find(".control-value").hide();

                    let $rem = $('<div class="approver-remarks-content" style="margin-top: 4px; display: block !important;"></div>');
                    if (review_val && review_val.trim()) {
                        let border_color = "#cbd5e1";
                        let text_color = "#1e293b";
                        let bg_color = "#f8fafc";
                        if (status_val && status_val.includes("Reject")) {
                            border_color = "#fca5a5";
                            bg_color = "#fef2f2";
                            text_color = "#991b1b";
                        }
                        $rem.html(`
                            <div style="padding: 10px 14px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 13px; color: ${text_color}; white-space: pre-wrap; line-height: 1.5; min-height: 42px;">
                                ${frappe.utils.escape_html(review_val)}
                            </div>
                        `);
                    } else {
                        $rem.html(`
                            <div style="padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic;">
                                No comments provided
                            </div>
                        `);
                    }
                    review_field.$wrapper.append($rem);
                } else {
                    review_field.$wrapper.find(".control-input-wrapper").show();
                    review_field.$wrapper.find(".control-input").show();
                }
            }
        });
    } catch (e) {
        console.error("Error in apply_extension_approver_styling:", e);
    }
}


function enforce_extension_stage_actions(frm) {
    if (!frm.doc || frm.is_new()) return;

    const state = frm.doc.workflow_state || frm.doc.status || "Draft";
    const user = frappe.session.user;
    const is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));

    function hide_actions() {
        if (frm.page && frm.page.actions_btn_group) {
            frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
        }
        if (frm.page && frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().addClass("hide hidden-xl").hide();
        }
    }

    function show_actions() {
        if (frm.page && frm.page.actions_btn_group) {
            frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
        }
        if (frm.page && frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().removeClass("hide hidden-xl").show();
        }
    }

    // 1. If in Draft state or Returned for Revision -> ONLY Contract Manager / Owner / Admin
    if (state === "Draft" || state === "Returned for Revision") {
        let is_owner = (user === frm.doc.owner);
        let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");

        if (!is_owner && !has_cm_role && !is_admin) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 2. Stage: Pending Team Lead Approval -> ONLY assigned Team Lead / Admin
    if (state === "Pending Team Lead Approval") {
        let assigned_user = frm.doc.team_lead_approver;
        let is_tl_assigned = (assigned_user && user === assigned_user);
        let has_tl_role = frappe.user_roles && frappe.user_roles.includes("Team Lead");
        let is_tl_authorized = is_admin || is_tl_assigned || (has_tl_role && (!assigned_user || user === assigned_user));

        if (!is_tl_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 3. Stage: Pending HR Review -> ONLY assigned HR Approver / Admin
    if (state === "Pending HR Review") {
        let assigned_user = frm.doc.hr_approver;
        let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"));
        let is_hr_authorized = is_admin || (assigned_user && user === assigned_user) || (has_hr_role && (!assigned_user || user === assigned_user));
        if (!is_hr_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 4. Stage: Pending CEO Approval -> ONLY assigned CEO Approver / Admin
    if (state === "Pending CEO Approval") {
        let assigned_user = frm.doc.ceo_approver;
        let has_ceo_role = frappe.user_roles && frappe.user_roles.includes("CEO Approver");
        let is_ceo_authorized = is_admin || (assigned_user && user === assigned_user) || (has_ceo_role && (!assigned_user || user === assigned_user));
        if (!is_ceo_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // Completed or rejected states -> Hide Actions
    if (state === "Approved" || state === "Terminated" || state === "Rejected") {
        hide_actions();
        return;
    }
}
