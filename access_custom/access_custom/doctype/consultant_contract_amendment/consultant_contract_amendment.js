// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Contract Amendment", {
    onload(frm) {
        inject_amendment_styles();
        setup_value_calculation(frm);
        apply_form_lockdown(frm);
        setup_auto_expand_textareas(frm, ["amendment_reason", "scope_change_summary"]);
    },

    refresh(frm) {
        inject_amendment_styles();
        setup_value_calculation(frm);
        apply_status_indicator(frm);
        apply_form_lockdown(frm);
        setup_auto_expand_textareas(frm, ["amendment_reason", "scope_change_summary"]);
    },

    contract(frm) {
        if (frm.doc.contract) {
            frappe.db.get_value("Consultant Contract", frm.doc.contract, [
                "consultant_name",
                "organization",
                "requesting_organization",
                "total_contract_value",
                "compensation_amount",
                "proposed_fee",
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
                    let val = m.total_contract_value || m.compensation_amount || m.proposed_fee || 0;
                    if (!frm.doc.current_contract_value && val) {
                        frm.set_value("current_contract_value", val);
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
                    setup_value_calculation(frm);
                }
            });
        }
    },

    revised_contract_value(frm) {
        setup_value_calculation(frm);
    },

    current_contract_value(frm) {
        setup_value_calculation(frm);
    },

    validate(frm) {
        if (!validate_pdf_attachment(frm, "signed_amendment_document")) {
            frappe.validated = false;
            return false;
        }
    },

    signed_amendment_document(frm) {
        validate_pdf_attachment(frm, "signed_amendment_document");
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

        // If not in an approver decision stage (e.g. initial submit from Draft), proceed normally
        if (!decision_field) {
            return Promise.resolve();
        }

        if (!is_authorized) {
            frappe.msgprint({
                title: __("Not Authorized"),
                indicator: "red",
                message: __(`You are not authorized to action the amendment at the <b>${tier_name}</b> stage.`)
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
                    title: __(`Approve Amendment — ${tier_name}`),
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
                                method: "access_custom.access_custom.doctype.consultant_contract_amendment.consultant_contract_amendment.record_amendment_approver_decision",
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
                    title: __(`Reject Amendment — ${tier_name}`),
                    fields: [
                        {
                            label: __("Rejection Reason / Comments (Mandatory)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: existing_comment,
                            description: __("Please specify the reason for rejecting this amendment.")
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
                                method: "access_custom.access_custom.doctype.consultant_contract_amendment.consultant_contract_amendment.record_amendment_approver_decision",
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
                                method: "access_custom.access_custom.doctype.consultant_contract_amendment.consultant_contract_amendment.record_amendment_approver_decision",
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

function setup_value_calculation(frm) {
    let curr = parseFloat(frm.doc.current_contract_value || 0);
    let rev = parseFloat(frm.doc.revised_contract_value || 0);
    if (rev > 0) {
        frm.set_value("impact_on_value", rev - curr);
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
        "amendment_type",
        "effective_date",
        "revised_contract_value",
        "impact_on_end_date",
        "amendment_reason",
        "scope_change_summary",
        "signed_amendment_document"
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
    let clean_path = file_url.split("?")[0].split("#")[0].lower ? file_url.split("?")[0].split("#")[0].toLowerCase().trim() : file_url.split("?")[0].split("#")[0].toLowerCase().trim();
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

function inject_amendment_styles() {
    $("#cca-custom-ui-style").remove();
    $(`
    <style id="cca-custom-ui-style">
        [data-page-route*="consultant-contract-amendment"] [data-fieldname="amendment_reason"] textarea,
        [data-page-route*="consultant-contract-amendment"] [data-fieldname="scope_change_summary"] textarea,
        [data-page-route*="consultant_contract_amendment"] [data-fieldname="amendment_reason"] textarea,
        [data-page-route*="consultant_contract_amendment"] [data-fieldname="scope_change_summary"] textarea,
        .form-page[data-page-route*="consultant-contract-amendment"] [data-fieldname="amendment_reason"] textarea,
        .form-page[data-page-route*="consultant-contract-amendment"] [data-fieldname="scope_change_summary"] textarea {
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
