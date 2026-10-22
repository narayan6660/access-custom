// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Contract Termination", {
    onload(frm) {
        inject_termination_styles();
        apply_form_lockdown(frm);
        apply_section_visibility(frm);
        enforce_termination_stage_actions(frm);
        setup_auto_expand_textareas(frm, ["termination_reason", "outstanding_deliverables"]);
        setTimeout(() => {
            render_termination_progress_tracker(frm);
            apply_termination_approver_styling(frm);
            enforce_termination_stage_actions(frm);
            apply_section_visibility(frm);
            align_approver_rows(frm);
        }, 120);
        setTimeout(() => {
            enforce_termination_stage_actions(frm);
            apply_section_visibility(frm);
            align_approver_rows(frm);
        }, 400);
    },

    refresh(frm) {
        inject_termination_styles();
        apply_status_indicator(frm);
        apply_form_lockdown(frm);
        apply_section_visibility(frm);
        setup_auto_expand_textareas(frm, ["termination_reason", "outstanding_deliverables"]);
        setTimeout(() => {
            render_termination_progress_tracker(frm);
            apply_termination_approver_styling(frm);
            enforce_termination_stage_actions(frm);
            apply_section_visibility(frm);
            align_approver_rows(frm);
        }, 120);
        setTimeout(() => {
            enforce_termination_stage_actions(frm);
            apply_section_visibility(frm);
            align_approver_rows(frm);
        }, 400);
    },

    contract(frm) {
        if (frm.doc.contract) {
            frappe.db.get_value("Consultant Contract", frm.doc.contract, [
                "consultant_name",
                "organization",
                "requesting_organization",
                "end_date",
                "proposed_end_date",
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
                    if (!frm.doc.effective_termination_date && (m.end_date || m.proposed_end_date)) {
                        frm.set_value("effective_termination_date", m.end_date || m.proposed_end_date);
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
                }
            });
        }
    },

    validate(frm) {
        if (!validate_pdf_attachment(frm, "termination_letter")) {
            frappe.validated = false;
            return false;
        }
    },

    termination_letter(frm) {
        if (!validate_pdf_attachment(frm, "termination_letter")) {
            return;
        }
        apply_section_visibility(frm);
        render_termination_progress_tracker(frm);
        if (frm.doc.termination_letter && frm.doc.docstatus === 1) {
            frm.save();
        }
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
                    message: __("Only the <b>Contract Manager</b> is authorized to resubmit this termination after revision.")
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
                message: __(`You are not authorized to action the termination at the <b>${tier_name}</b> stage.`)
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

        // Handle Approval (Approve Team Lead, Approve HR, Approve CEO -> Terminated)
        if (action_lower.includes("approve")) {
            let status_text = "Approved [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Approve Termination — ${tier_name}`),
                    fields: [
                        {
                            label: __("Approval Remarks / Clearance Notes (Optional)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            default: existing_comment,
                            description: __("Add any clearance or handover review remarks.")
                        }
                    ],
                    primary_action_label: __("Confirm Approval"),
                    primary_action: async function(values) {
                        let final_comment = values.comments ? values.comments.trim() : "";
                        frappe.dom.freeze(__("Recording approval..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract_termination.consultant_contract_termination.record_termination_approver_decision",
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
                    title: __(`Reject Termination — ${tier_name}`),
                    fields: [
                        {
                            label: __("Rejection Reason / Comments (Mandatory)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: existing_comment,
                            description: __("Please specify the reason for rejecting this termination request.")
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
                                method: "access_custom.access_custom.doctype.consultant_contract_termination.consultant_contract_termination.record_termination_approver_decision",
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
                                method: "access_custom.access_custom.doctype.consultant_contract_termination.consultant_contract_termination.record_termination_approver_decision",
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

function apply_status_indicator(frm) {
    let state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let color = "gray";

    if (state === "Draft") {
        color = "gray";
    } else if (state.startsWith("Pending")) {
        color = "orange";
    } else if (state === "Terminated") {
        color = "red";
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

    // Lock main inputs once submitted into review pipeline
    let lock_inputs = !is_draft_or_revision && !frm.is_new();
    const core_fields = [
        "contract",
        "termination_type",
        "notice_date",
        "effective_termination_date",
        "notice_period_days",
        "last_working_date",
        "deliverables_handed_over",
        "assets_returned",
        "access_revocation_confirmed",
        "finance_clearance_confirmed",
        "final_settlement_amount",
        "outstanding_payment",
        "outstanding_deliverables",
        "termination_reason"
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

function apply_section_visibility(frm) {
    if (!frm.doc) return;
    let state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let is_ceo_approved = (state === "Terminated") || (frm.doc.ceo_decision && frm.doc.ceo_decision.includes("Approved"));

    // Documentation section & termination_letter: strictly hidden until CEO approval is completed
    frm.toggle_display("custom_section_break_krjui", is_ceo_approved);
    frm.toggle_display("termination_letter", is_ceo_approved);
    frm.set_df_property("custom_section_break_krjui", "hidden", is_ceo_approved ? 0 : 1);
    frm.set_df_property("termination_letter", "hidden", is_ceo_approved ? 0 : 1);

    if (is_ceo_approved) {
        let user = frappe.session.user;
        let is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));
        let is_cm = (user === frm.doc.owner) ||
            (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
            is_admin;

        // Render message banner directly BELOW the progressbar at the top
        render_documentation_top_banner(frm, "termination");

        // Clear any duplicate banner from the bottom section
        let field_obj = frm.fields_dict["termination_letter"];
        if (field_obj && field_obj.$wrapper) {
            field_obj.$wrapper.find(".section-completion-banner").remove();
        }

        let has_doc = !!frm.doc.termination_letter;

        if (has_doc) {
            // Once document is uploaded by Contract Manager, show the attached file link and lock actions
            let fld = frm.get_field("termination_letter");
            if (fld) {
                fld.disp_status = "Write";
                if (typeof fld.set_input === "function") {
                    fld.set_input(frm.doc.termination_letter);
                } else if (typeof fld.refresh === "function") {
                    fld.refresh();
                }
                if (fld.$wrapper) {
                    fld.$wrapper.addClass("locked-attachment");
                    fld.$wrapper.find(".control-input-wrapper, .control-input, .input-area").show();
                    fld.$wrapper.find(".attached-file").show().css("display", "flex");
                    fld.$wrapper.find(".attached-file-link").show();
                    fld.$wrapper.find(".btn-attach, [data-action='reload_attachment'], [data-action='clear_attachment'], .attached-file > div:last-child").hide();
                }
            }
            frm.read_only = true;
            if (typeof frm.disable_save === "function") frm.disable_save();
            if (frm.page) frm.page.clear_primary_action();
        } else if (is_cm) {
            frm.read_only = false;
            frm.set_df_property("termination_letter", "read_only", 0);
            frm.set_df_property("termination_letter", "allow_on_submit", 1);
            let fld = frm.get_field("termination_letter");
            if (fld) {
                fld.df.read_only = 0;
                fld.df.allow_on_submit = 1;
                fld.disp_status = "Write";
                if (!fld.df.options || typeof fld.df.options !== "object") {
                    fld.df.options = {};
                }
                fld.df.options.restrictions = {
                    allowed_file_types: [".pdf", "application/pdf"]
                };
                if (typeof fld.refresh === "function") {
                    fld.refresh();
                }
                if (fld.$wrapper) {
                    fld.$wrapper.removeClass("locked-attachment");
                    fld.$wrapper.find(".control-value").hide();
                    fld.$wrapper.find(".control-input-wrapper").show();
                    fld.$wrapper.find(".control-input").show();
                    fld.$wrapper.find(".input-area").show();
                    fld.$wrapper.find(".btn-attach").show();
                }
            }
        } else {
            frm.set_df_property("termination_letter", "read_only", 1);
            let fld = frm.get_field("termination_letter");
            if (fld && fld.$wrapper) {
                fld.$wrapper.find(".btn-attach, .attached-file-link + .btn, .btn-browse, [data-action='reload_attachment']").hide();
            }
        }
    } else {
        $(frm.wrapper).find(".contract-info-banner").remove();
    }

    if (frm.wrapper) {
        let $w = $(frm.wrapper);
        $w.find('.form-section[data-fieldname="custom_section_break_krjui"]').toggle(is_ceo_approved);
        $w.find('[data-fieldname="custom_section_break_krjui"]').closest(".form-section").toggle(is_ceo_approved);
        $w.find('.section-head:contains("Documentation")').closest(".form-section").toggle(is_ceo_approved);
    }
}

function render_documentation_top_banner(frm, doctype_type) {
    if (!frm || !frm.wrapper) return;
    $(frm.wrapper).find(".contract-info-banner").remove();

    let state = frm.doc.workflow_state || frm.doc.status || "Draft";
    let is_ceo_approved = (state === "Approved" || state === "Terminated") || 
        (frm.doc.ceo_decision && frm.doc.ceo_decision.includes("Approved"));

    if (!is_ceo_approved) return;

    let attach_field = (doctype_type === "amendment") ? "signed_amendment_document" :
                       (doctype_type === "extension") ? "extension_appendix" : "termination_letter";
    let doc_title = (doctype_type === "amendment") ? "Signed Amendment Document (PDF)" :
                    (doctype_type === "extension") ? "Extension Agreement / Appendix (PDF)" : "Termination / Release Letter (PDF)";
    let sec_name = (doctype_type === "amendment") ? "Signed Document" : "Documentation";

    let user = frappe.session.user;
    let is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));
    let is_cm = (user === frm.doc.owner) ||
        (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
        is_admin;

    let has_file = !!frm.doc[attach_field];

    let banner_html = has_file ? `
        <div class="contract-info-banner" style="margin-bottom: 15px; padding: 13px 18px; background: #f0fdf4; border: 1px solid #86efac; border-left: 5px solid #16a34a; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; font-size: 13px; color: #166534; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">&#10003;</span>
                    <span>${sec_name} &mdash; Stage Completed & Finalized</span>
                </div>
                <span class="badge" style="background: #16a34a; color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: 600;">
                    Finalized
                </span>
            </div>
            <div style="font-size: 12px; color: #1e293b; margin-top: 5px;">
                The <b>${doc_title}</b> has been successfully uploaded by the Contract Manager. This document is finalized and locked from any further changes.
            </div>
        </div>
    ` : `
        <div class="contract-info-banner" style="margin-bottom: 15px; padding: 13px 18px; background: ${is_cm ? '#eff6ff' : '#f8fafc'}; border: 1px solid ${is_cm ? '#bfdbfe' : '#e2e8f0'}; border-left: 5px solid ${is_cm ? '#2563eb' : '#94a3b8'}; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; font-size: 13px; color: ${is_cm ? '#1e40af' : '#475569'}; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 15px;">&#9203;</span>
                    <span>Pending Termination Letter Upload</span>
                </div>
                <span class="badge" style="background: ${is_cm ? '#2563eb' : '#94a3b8'}; color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: 600;">
                    ${is_cm ? "Action Required" : "Awaiting Contract Manager"}
                </span>
            </div>
            <div style="font-size: 12px; color: #1e293b; margin-top: 5px; line-height: 1.5;">
                ${is_cm ? `CEO approval completed. <b>Contract Manager:</b> Please upload the signed PDF document below in <b>${sec_name}</b> section to complete this stage.` : `CEO approval completed. Awaiting Contract Manager to upload the termination letter in <b>${sec_name}</b> section.`}
            </div>
            ${is_cm ? `
                <div style="margin-top: 10px;">
                    <button type="button" class="btn btn-primary btn-xs" onclick="cur_frm.get_field('${attach_field}')?.$input?.click();" style="font-weight: 600; padding: 4px 12px; font-size: 11px; border-radius: 4px;">
                        &#128206; Attach Document Now
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    let $banner = $(banner_html);
    let $progress = $(frm.wrapper).find(".contract-progress-container");
    if ($progress.length) {
        $banner.insertAfter($progress);
    } else if (frm.dashboard && frm.dashboard.parent && frm.dashboard.parent.length) {
        $banner.appendTo(frm.dashboard.parent);
    } else {
        let $target = $(frm.wrapper).find(".form-layout");
        if ($target.length) {
            $banner.insertBefore($target.first());
        } else {
            $banner.prependTo($(frm.wrapper).find(".form-page"));
        }
    }
}

function validate_pdf_attachment(frm, fieldname) {
    let file_url = frm.doc[fieldname];
    if (!file_url) return true;
    let clean_path = file_url.split("?")[0].split("#")[0].toLowerCase().trim();
    let ext = clean_path.split(".").pop();
    if (ext !== "pdf") {
        let field_label = frm.get_docfield(fieldname)?.label || fieldname;

        // Immediately clear value in doc and control
        frm.doc[fieldname] = null;
        frm.set_value(fieldname, null);
        let fld = frm.fields_dict[fieldname];
        if (fld) {
            fld.set_input(null);
            fld.value = null;
            if (typeof fld.refresh === "function") {
                fld.refresh();
            }
        }

        // Deduplicate: prevent multiple error modals firing within 1.5 seconds
        let now = Date.now();
        if (frm._last_pdf_err_time && (now - frm._last_pdf_err_time < 1500) && frm._last_pdf_err_field === fieldname) {
            return false;
        }
        frm._last_pdf_err_time = now;
        frm._last_pdf_err_field = fieldname;

        if (frm._pdf_err_timer) {
            clearTimeout(frm._pdf_err_timer);
        }

        // Delay showing the modal slightly so background upload/save cleanup does not dismiss it.
        // Using an independent frappe.ui.Dialog ensures frappe.hide_msgprint() cannot wipe it.
        frm._pdf_err_timer = setTimeout(() => {
            let d = new frappe.ui.Dialog({
                title: __("Invalid Document Format"),
                indicator: "red"
            });
            d.$body.html(
                "<div style='font-size: 14px; line-height: 1.6; padding: 12px 6px; color: #1e293b;'>" +
                "<p style='margin-bottom: 8px;'><b>" + frappe.utils.escape_html(field_label) + "</b> only accepts <b>PDF (.pdf)</b> files.</p>" +
                "<p style='color: #dc2626; margin-bottom: 8px;'>The uploaded file (<b>." + frappe.utils.escape_html(ext) + "</b>) is not permitted and has been removed.</p>" +
                "<p style='color: #64748b; font-size: 13px; margin-bottom: 0;'>Please select and upload a valid PDF document.</p>" +
                "</div>"
            );
            d.set_primary_action(__("Understood"), function() {
                d.hide();
            });
            d.show();
        }, 350);

        return false;
    }
    return true;
}

function inject_termination_styles() {
    $("#cct-custom-ui-style").remove();
    $(`
    <style id="cct-custom-ui-style">
        [data-page-route*="consultant-contract-termination"] [data-fieldname="termination_reason"] textarea,
        [data-page-route*="consultant-contract-termination"] [data-fieldname="outstanding_deliverables"] textarea,
        [data-page-route*="consultant_contract_termination"] [data-fieldname="termination_reason"] textarea,
        [data-page-route*="consultant_contract_termination"] [data-fieldname="outstanding_deliverables"] textarea,
        .form-page[data-page-route*="consultant-contract-termination"] [data-fieldname="termination_reason"] textarea,
        .form-page[data-page-route*="consultant-contract-termination"] [data-fieldname="outstanding_deliverables"] textarea {
            height: 52px !important;
            min-height: 52px !important;
            line-height: 1.45 !important;
            font-size: 13px !important;
            padding: 6px 10px !important;
            resize: none !important;
            overflow-y: hidden !important;
            box-sizing: border-box !important;
        }

        /* Approver Section Grid Alignment */
        .form-section[data-fieldname="sec_approvals"] .section-body {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr) !important;
            row-gap: 16px !important;
            column-gap: 20px !important;
            align-items: start !important;
        }
        .form-section[data-fieldname="sec_approvals"] .section-body > .form-column,
        .form-section[data-fieldname="sec_approvals"] .section-body > .form-column > form {
            display: contents !important;
        }
        .form-section[data-fieldname="sec_approvals"] .frappe-control {
            margin-bottom: 0 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="team_lead_approver"] {
            grid-row: 1 !important; grid-column: 1 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="team_lead_decision"] {
            grid-row: 1 !important; grid-column: 2 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="team_lead_remarks"] {
            grid-row: 1 !important; grid-column: 3 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="hr_approver"] {
            grid-row: 2 !important; grid-column: 1 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="hr_decision"] {
            grid-row: 2 !important; grid-column: 2 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="hr_remarks"] {
            grid-row: 2 !important; grid-column: 3 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="ceo_approver"] {
            grid-row: 3 !important; grid-column: 1 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="ceo_decision"] {
            grid-row: 3 !important; grid-column: 2 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        .form-section[data-fieldname="sec_approvals"] [data-fieldname="ceo_remarks"] {
            grid-row: 3 !important; grid-column: 3 !important;
            padding-top: 14px !important;
            border-top: 1px solid #f1f5f9 !important;
        }
        @media (max-width: 767px) {
            .form-section[data-fieldname="sec_approvals"] .section-body {
                display: flex !important;
                flex-direction: column !important;
            }
            .form-section[data-fieldname="sec_approvals"] .section-body > .form-column {
                display: block !important;
            }
        }

        /* Permanently lock down uploaded document controls once attached while displaying file link */
        .locked-attachment .btn-attach,
        .locked-attachment [data-action="reload_attachment"],
        .locked-attachment [data-action="clear_attachment"],
        .locked-attachment .attached-file > div:last-child,
        .locked-attachment .attached-file-link + .btn,
        .locked-attachment .clear-button,
        .locked-attachment .btn-browse,
        [data-fieldname="termination_letter"].locked-attachment .btn-attach,
        [data-fieldname="termination_letter"].locked-attachment [data-action="reload_attachment"],
        [data-fieldname="termination_letter"].locked-attachment [data-action="clear_attachment"],
        [data-fieldname="termination_letter"].locked-attachment .attached-file > div:last-child,
        [data-fieldname="termination_letter"].locked-attachment .attached-file-link + .btn,
        [data-fieldname="termination_letter"].locked-attachment .clear-button {
            display: none !important;
        }
        .locked-attachment .attached-file {
            display: flex !important;
            padding: 8px 12px !important;
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
        }
        .locked-attachment .attached-file-link {
            display: inline-block !important;
            font-weight: 600 !important;
            color: #2563eb !important;
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
// Termination UI Enhancement: Progress Tracker & Approver State Cards
// ==============================================================================

function render_termination_progress_tracker(frm) {
    if (!frm || !frm.wrapper) return;

    try {
        $(frm.wrapper).find(".contract-progress-container").remove();

        let steps = [
            { id: "Draft", label: "Draft" },
            { id: "Pending Team Lead Approval", label: "Team Lead" },
            { id: "Pending HR Review", label: "HR Review" },
            { id: "Pending CEO Approval", label: "CEO" },
            { id: "Terminated", label: "Documentation" }
        ];

        let current_state = frm.doc.workflow_state || frm.doc.status || "Draft";
        let is_rejected = current_state.includes("Reject") || (frm.doc.status === "Rejected");
        let is_revision = (current_state === "Returned for Revision") || (frm.doc.status === "Returned for Revision");
        let has_doc_uploaded = !!frm.doc.termination_letter;

        let rejected_stage = get_termination_rejection_stage(frm);
        if (rejected_stage) is_rejected = true;

        let revision_stage = get_termination_revision_stage(frm);
        if (revision_stage && !is_rejected) is_revision = true;

        let active_index = 0;
        if (current_state === "Terminated") {
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

        let percent = 0;
        if (current_state === "Terminated") {
            percent = has_doc_uploaded ? 100 : 85;
        } else {
            percent = Math.round((active_index / (steps.length - 1)) * 100);
        }

        let status_bg = "#16a34a";
        let bar_color = "#16a34a";
        let status_label = `${frappe.utils.escape_html(current_state)} (${percent}%)`;
        if (is_rejected) {
            status_bg = "#dc2626";
            bar_color = "#dc2626";
        } else if (is_revision) {
            status_bg = "#d97706";
            bar_color = "#d97706";
        } else if (current_state === "Terminated") {
            if (has_doc_uploaded) {
                status_bg = "#16a34a";
                bar_color = "#16a34a";
                status_label = "Documentation Uploaded &mdash; Completed (100%)";
            } else {
                status_bg = "#2563eb";
                bar_color = "#2563eb";
                status_label = "CEO Approved &mdash; Awaiting Documentation (85%)";
            }
        }

        let nodes_html = steps.map((s, idx) => {
            let is_terminated_state = (current_state === "Terminated");
            let is_completed = (idx < active_index) || (is_terminated_state && idx === active_index && has_doc_uploaded);
            let is_active = (idx === active_index) && !(is_terminated_state && has_doc_uploaded);

            let circle_bg = "#f1f5f9";
            let circle_border = "#cbd5e1";
            let circle_color = "#64748b";
            let circle_content = idx + 1;
            let label_color = "#64748b";
            let label_weight = "500";
            let pulse_style = "";
            let extra_hint = "";

            if (is_completed) {
                circle_bg = "#16a34a";
                circle_border = "#16a34a";
                circle_color = "#ffffff";
                circle_content = "&#10003;";
                label_color = "#15803d";
                label_weight = "600";
                if (s.id === "Terminated") {
                    extra_hint = `<div style="font-size: 10px; color: #16a34a; font-weight: 600; margin-top: 2px;">(Completed)</div>`;
                }
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
                } else if (is_terminated_state && !has_doc_uploaded) {
                    circle_bg = "#eff6ff";
                    circle_border = "#2563eb";
                    circle_color = "#1d4ed8";
                    circle_content = idx + 1;
                    label_color = "#1d4ed8";
                    label_weight = "700";
                    pulse_style = "box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25);";
                    extra_hint = `<div style="font-size: 10px; color: #2563eb; font-weight: 600; margin-top: 2px;">(Contract Manager)</div>`;
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
                ${extra_hint}
            </div>
            `;
        }).join("");

        let container_html = `
        <div class="contract-progress-container" style="margin-bottom: 14px; padding: 12px 18px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                    <span>Consultant Contract Termination Workflow Route</span>
                </div>
                <div>
                    <span class="badge" style="background: ${status_bg}; color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 12px; font-weight: 600;">
                        ${status_label}
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
        console.error("Error in render_termination_progress_tracker:", e);
    }
}

function get_termination_rejection_stage(frm) {
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

function get_termination_revision_stage(frm) {
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

function apply_termination_approver_styling(frm) {
    if (!frm || !frm.wrapper) return;

    if (frm.is_new()) {
        const stage_mapping = [
            { status: "team_lead_decision", review: "team_lead_remarks" },
            { status: "hr_decision", review: "hr_remarks" },
            { status: "ceo_decision", review: "ceo_remarks" }
        ];
        stage_mapping.forEach(item => {
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
        align_approver_rows(frm);
    } catch (e) {
        console.error("Error in apply_termination_approver_styling:", e);
    }
}

function align_approver_rows(frm) {
    if (!frm || !frm.wrapper) return;
    let $w = $(frm.wrapper);
    let rows = [
        ["team_lead_approver", "team_lead_decision", "team_lead_remarks"],
        ["hr_approver", "hr_decision", "hr_remarks"],
        ["ceo_approver", "ceo_decision", "ceo_remarks"]
    ];

    // Reset min-heights first to measure natural content height
    rows.forEach(r => {
        r.forEach(f => {
            let $el = $w.find(`[data-fieldname="${f}"]`);
            $el.css({ "min-height": "", "height": "" });
        });
    });

    // Measure and apply matched height for each row
    rows.forEach((r, idx) => {
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
                        "margin-bottom": "18px"
                    });
                    if (idx > 0) {
                        $el.css({
                            "padding-top": "14px",
                            "border-top": "1px solid #f1f5f9"
                        });
                    }
                }
            });
        }
    });
}


function enforce_termination_stage_actions(frm) {
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
