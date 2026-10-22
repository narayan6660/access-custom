// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Contract", {
    onload(frm) {
        // Inject custom scoped CSS for Consultant Contract textareas and UI badges
        inject_consultant_contract_styles();
        apply_section_visibility(frm);

        // Pre-fill Request ID with the creator / Contract Manager's name & employee ID
        if (frm.is_new() && (!frm.doc.request_id || frm.doc.request_id.startsWith("CC-") || frm.doc.request_id.includes("/"))) {
            frappe.db.get_value("Employee", { "user_id": frappe.session.user }, ["name", "employee_name"]).then(r => {
                if (r && r.message && r.message.name) {
                    frm.set_value("request_id", `${r.message.employee_name} (${r.message.name})`);
                } else {
                    frm.set_value("request_id", frappe.session.user_fullname || frappe.session.user);
                }
            });
        }
    },



    requesting_organization(frm) {
        if (frm.doc.requesting_organization) {
            frm.set_value("organization", frm.doc.requesting_organization);
        }
    },

    address_line_1(frm) { update_consultant_full_address(frm); },
    address_line_2(frm) { update_consultant_full_address(frm); },
    city(frm) { update_consultant_full_address(frm); },
    state(frm) { update_consultant_full_address(frm); },
    country(frm) { update_consultant_full_address(frm); },
    pin_code(frm) { update_consultant_full_address(frm); },

    contract_template(frm) {
        if (frm.doc.contract_template) {
            frappe.show_alert({
                message: __(`Selected Template: <b>${frappe.utils.escape_html(frm.doc.contract_template)}</b>`),
                indicator: "green"
            }, 3);
        }
    },

    validate(frm) {
        if (frm.doc.project && !frm.doc.project_name) {
            frm.doc.project_name = frm.doc.project;
        }
        if (frm.doc.requesting_organization && !frm.doc.organization) {
            frm.doc.organization = frm.doc.requesting_organization;
        }
        let v1 = validate_pdf_attachment(frm, "consultant_cv");
        let v2 = validate_pdf_attachment(frm, "consultant_signed_contract");
        let v3 = validate_pdf_attachment(frm, "final_executed_contract");
        if (!v1 || !v2 || !v3) {
            frappe.validated = false;
            return false;
        }
    },

    consultant_cv(frm) {
        validate_pdf_attachment(frm, "consultant_cv");
    },

    consultant_signed_contract(frm) {
        validate_pdf_attachment(frm, "consultant_signed_contract");
    },

    final_executed_contract(frm) {
        validate_pdf_attachment(frm, "final_executed_contract");
    },

    refresh(frm) {
        if (frm.wrapper) $(frm.wrapper).addClass("consultant-contract-wrapper");
        if (frm.page && frm.page.wrapper) $(frm.page.wrapper).addClass("consultant-contract-wrapper");
        inject_consultant_contract_styles();
        apply_section_visibility(frm);
        setup_leadership_queries(frm);
        setup_expenses_allowed_multiselect(frm);
        setup_status_indicator(frm);

        if (frm.is_new()) {
            // New unsaved contract: hide action buttons, enable save, render progress tracker
            if (frm.page && frm.page.actions_btn_group) {
                frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
                frm.page.actions_btn_group.find(".dropdown-menu").empty();
            }
            if (frm.page && frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().addClass("hide hidden-xl").hide();
            }

            frm.save_disabled = false;
            if (typeof frm.enable_save === "function") frm.enable_save();
            if (frm.page) {
                frm.page.clear_primary_action();
                frm.page.set_primary_action(__("Save"), function() {
                    frm.save();
                });
            }

            apply_section_visibility(frm);
            render_contract_progress_tracker(frm);
            setup_auto_expand_textareas(frm);

            setTimeout(() => {
                apply_section_visibility(frm);
                render_contract_progress_tracker(frm);
                setup_auto_expand_textareas(frm);
            }, 80);
            setTimeout(() => {
                apply_section_visibility(frm);
                render_contract_progress_tracker(frm);
                setup_auto_expand_textareas(frm);
            }, 250);
            setTimeout(() => {
                apply_section_visibility(frm);
                render_contract_progress_tracker(frm);
                setup_auto_expand_textareas(frm);
            }, 600);

            $(frm.wrapper).off("render_complete.cc_lock").on("render_complete.cc_lock", function() {
                apply_section_visibility(frm);
                render_contract_progress_tracker(frm);
                setup_auto_expand_textareas(frm);
            });
            return;
        }

        // Clean up previous banners first
        if (frm.dashboard && frm.dashboard.parent) {
            frm.dashboard.clear_headline();
            frm.dashboard.parent.find(".contract-rejection-banner, .contract-info-banner").remove();
        }

        // Rejection / Revision banner
        let rejected_stage = get_contract_rejection_stage(frm);
        if (rejected_stage) {
            let banner_html = `
            <div class="contract-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fef2f2; border: 1px solid #f87171; border-left: 6px solid #dc2626; border-radius: 8px; box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                            <span>&#10007;</span> Consultant Contract Rejected
                        </span>
                        <span class="badge" style="background: #dc2626; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                            Rejected by ${rejected_stage.role}
                        </span>
                    </div>
                    <span style="font-size: 12px; color: #64748b; font-weight: 500;">
                        Action required: Review feedback and revise contract
                    </span>
                </div>
                <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-bottom: 8px;">
                    <div><b>Approver:</b> ${frappe.utils.escape_html(rejected_stage.user || rejected_stage.role)}</div>
                    <div style="margin-top: 4px;"><b>Rejection Reason:</b> <span style="color: #b91c1c; font-weight: 600;">"${frappe.utils.escape_html(rejected_stage.review || 'No specific reason provided')}"</span></div>
                </div>
            </div>`;
            if (frm.dashboard && frm.dashboard.parent) {
                $(banner_html).prependTo(frm.dashboard.parent);
                frm.dashboard.show();
                frm.dashboard.parent.show();
            }
        } else {
            let revision_stage = get_contract_revision_stage(frm);
            if (revision_stage && (frm.doc.workflow_state === "Returned for Revision" || frm.doc.status === "Returned for Revision")) {
                let banner_html = `
                <div class="contract-rejection-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #fffbeb; border: 1px solid #fde68a; border-left: 6px solid #d97706; border-radius: 8px; box-shadow: 0 1px 3px rgba(217, 119, 6, 0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 15px; font-weight: 700; color: #d97706; display: flex; align-items: center; gap: 6px;">
                                <span>&#8635;</span> Returned for Revision
                            </span>
                            <span class="badge" style="background: #d97706; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                                Returned by ${revision_stage.role}
                            </span>
                        </div>
                        <span style="font-size: 12px; color: #64748b; font-weight: 500;">
                            Action required: Update contract and resubmit
                        </span>
                    </div>
                    <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-bottom: 8px;">
                        <div><b>Approver:</b> ${frappe.utils.escape_html(revision_stage.user || revision_stage.role)}</div>
                        <div style="margin-top: 4px;"><b>Feedback / Reason:</b> <span style="color: #92400e; font-weight: 600;">"${frappe.utils.escape_html(revision_stage.review || 'Please revise and resubmit')}"</span></div>
                    </div>
                </div>`;
                if (frm.dashboard && frm.dashboard.parent) {
                    $(banner_html).prependTo(frm.dashboard.parent);
                    frm.dashboard.show();
                    frm.dashboard.parent.show();
                }
            } else if (frm.doc.workflow_state === "CEO Approved") {
                let current_user = frappe.session.user;
                let is_ceo = (frm.doc.ceo_approver && current_user === frm.doc.ceo_approver);
                let is_lead = (frm.doc.team_lead_approver && current_user === frm.doc.team_lead_approver);
                let is_hr = (frm.doc.hr_approver && current_user === frm.doc.hr_approver) || (frm.doc.final_hr_approver && current_user === frm.doc.final_hr_approver);
                let is_owner = (current_user === frm.doc.owner);
                let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
                let is_admin = (current_user === "Administrator" || (frappe.user_roles && frappe.user_roles.includes("System Manager")));
                let is_cm_authorized = !is_ceo && !is_lead && !is_hr && (is_owner || has_cm_role || is_admin);

                let action_buttons_html = "";
                if (is_cm_authorized) {
                    action_buttons_html = `
                    <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-xs btn-default btn-download-preview-pdf" style="font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                            <span>&#128196;</span> Download Preview Form (PDF)
                        </button>
                        <button type="button" class="btn btn-xs btn-primary btn-submit-to-final-hr" style="font-weight: 600; background: #0284c7; border-color: #0284c7; display: inline-flex; align-items: center; gap: 5px;">
                            <span>&#10148;</span> Send to HR Manager for Final Review
                        </button>
                    </div>
                    `;
                }

                let banner_html = `
                <div class="contract-info-banner" style="margin-bottom: 15px; padding: 14px 18px; background: #f0fdf4; border: 1px solid #86efac; border-left: 6px solid #16a34a; border-radius: 8px; box-shadow: 0 1px 3px rgba(22, 163, 74, 0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 15px; font-weight: 700; color: #16a34a; display: flex; align-items: center; gap: 6px;">
                                <span>&#10003;</span> CEO Approved
                            </span>
                            <span class="badge" style="background: #16a34a; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                                Ready for Final HR Review
                            </span>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-top: 6px;">
                        The CEO has formally approved this contract. ${is_cm_authorized ? '<b>Contract Manager:</b> Please download and review the agreement preview (verified up to CEO approval), then click <b>Send to HR Manager for Final Review</b> below.' : 'Awaiting Contract Manager to preview the form and submit to HR for Final Review.'}
                    </div>
                    ${action_buttons_html}
                </div>`;
                if (frm.dashboard && frm.dashboard.parent) {
                    let $b = $(banner_html).prependTo(frm.dashboard.parent);
                    if (is_cm_authorized) {
                        $b.find(".btn-download-preview-pdf").on("click", function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            download_contract_preview_pdf(frm);
                        });
                        $b.find(".btn-submit-to-final-hr").on("click", function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            trigger_send_to_final_hr(frm);
                        });
                    }
                    frm.dashboard.show();
                    frm.dashboard.parent.show();
                }
            } else if (["Signed by Consultant", "Approved for Issuance", "Contract Issued"].includes(frm.doc.workflow_state)) {
                let has_all_section_g = !!(
                    frm.doc.sent_to_consultant_date &&
                    frm.doc.consultant_signed_contract &&
                    frm.doc.consultant_signed_date &&
                    frm.doc.consultant_received_date &&
                    frm.doc.final_executed_contract &&
                    frm.doc.countersigned_date
                );

                let banner_bg = has_all_section_g ? "#f0fdf4" : "#eff6ff";
                let banner_border = has_all_section_g ? "#86efac" : "#93c5fd";
                let accent_color = has_all_section_g ? "#16a34a" : "#2563eb";
                let badge_text = has_all_section_g ? "Ready to Activate" : "Pending Section G Uploads";

                let instruction = has_all_section_g ?
                    "All 6 Section G documents and dates have been verified. <b>Contract Manager:</b> You can now activate the contract by clicking <b>Actions &rarr; Execute Contract</b>." :
                    "Final HR Review has been approved. <b>Contract Manager:</b> Please upload the signed contract documents and fill in all dates in <b>Section G &mdash; Consultant Signed Contract</b> below. Once all 6 fields are completed, click <b>Actions &rarr; Execute Contract</b> to activate.";

                let banner_html = `
                <div class="contract-info-banner" style="margin-bottom: 15px; padding: 14px 18px; background: ${banner_bg}; border: 1px solid ${banner_border}; border-left: 6px solid ${accent_color}; border-radius: 8px; box-shadow: 0 1px 3px rgba(37, 99, 235, 0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 15px; font-weight: 700; color: ${accent_color}; display: flex; align-items: center; gap: 6px;">
                                <span>&#128221;</span> Signed Contract &mdash; Section G
                            </span>
                            <span class="badge" style="background: ${accent_color}; color: #ffffff; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                                ${badge_text}
                            </span>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #1e293b; line-height: 1.5; margin-top: 6px;">
                        ${instruction}
                    </div>
                </div>`;
                if (frm.dashboard && frm.dashboard.parent) {
                    $(banner_html).prependTo(frm.dashboard.parent);
                    frm.dashboard.show();
                    frm.dashboard.parent.show();
                }
            }
        }

        // Render progress tracker & formatting & section visibility
        apply_section_visibility(frm);
        render_contract_progress_tracker(frm);
        apply_contract_approver_field_locking(frm);
        setup_auto_expand_textareas(frm);
        setup_print_agreement_button(frm);
        enforce_stage_approver_actions(frm);

        setTimeout(() => {
            apply_section_visibility(frm);
            render_contract_progress_tracker(frm);
            apply_contract_approver_field_locking(frm);
            setup_auto_expand_textareas(frm);
            setup_print_agreement_button(frm);
            enforce_stage_approver_actions(frm);
        }, 120);

        setTimeout(() => {
            apply_section_visibility(frm);
            render_contract_progress_tracker(frm);
            align_contract_approver_rows(frm);
            enforce_stage_approver_actions(frm);
        }, 300);

        setTimeout(() => {
            apply_section_visibility(frm);
            enforce_stage_approver_actions(frm);
        }, 600);

        // Bind to Frappe's render_complete event
        $(frm.wrapper).off("render_complete.cc_lock").on("render_complete.cc_lock", function() {
            apply_section_visibility(frm);
            render_contract_progress_tracker(frm);
            apply_contract_approver_field_locking(frm);
            enforce_stage_approver_actions(frm);
            setup_auto_expand_textareas(frm);
        });
    },

    after_workflow_action(frm) {
        setTimeout(() => {
            frm.reload_doc();
        }, 150);
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "Draft";
        let action_lower = action.toLowerCase();
        let user = frappe.session.user;
        let is_admin = (user === "Administrator");

        // Fast check: if the contract already transitioned in DB (e.g. from multiple clicks), reload cleanly
        if (frm.doc && frm.doc.name && !frm.is_new()) {
            try {
                let r = await frappe.db.get_value(frm.doctype, frm.doc.name, "workflow_state");
                let db_state = r && r.message ? r.message.workflow_state : null;
                if (db_state && db_state !== state) {
                    frappe.show_alert({
                        message: __(`Contract is already in status: <b>${frappe.utils.escape_html(db_state)}</b>. Refreshing...`),
                        indicator: "blue"
                    }, 4);
                    frm.reload_doc();
                    return Promise.reject("ALREADY_TRANSITIONED");
                }
            } catch (e) {
                console.warn("Could not check current workflow_state:", e);
            }
        }

        // 1. Submit from Draft or Resubmit from Revision
        if (action === "Submit for Approval" || action === "Resubmit for Approval") {
            let is_authorized = (user === frm.doc.owner) ||
                (frappe.user_roles && (frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("Contract Manager"))) ||
                is_admin;

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the document creator or HR / System Manager is authorized to submit this contract.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            if (!frm.doc.team_lead_approver && frm.doc.team_lead) {
                try {
                    let r = await frappe.db.get_value("Employee", frm.doc.team_lead, "user_id");
                    if (r && r.message && r.message.user_id) {
                        frm.doc.team_lead_approver = r.message.user_id;
                    }
                } catch (e) {}
            }

            return Promise.resolve();
        }

        // 2. Submit for HR Review (Post-CEO Approval: Contract Manager previews and submits to HR)
        if (action === "Submit for HR Review") {
            let is_authorized = (user === frm.doc.owner) ||
                (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
                is_admin;

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> or document creator is authorized to submit for Final HR Review.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            if (!frm.doc.final_hr_approver) {
                frm.doc.final_hr_approver = frm.doc.hr_approver;
                frm.refresh_field("final_hr_approver");
            }

            frappe.show_alert({
                message: __("Submitted for Final HR Review."),
                indicator: "green"
            }, 5);
            return Promise.resolve();
        }

        // 3. Issue Contract to Consultant (Post-Final HR Review: Strictly Contract Manager)
        if (action === "Issue Contract") {
            let is_authorized = (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) || is_admin;

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> is authorized to issue the contract to the consultant.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            // Once in Section G all the fields are filled then only the contract manager can issue the contract
            let missing_fields = [];
            if (!frm.doc.sent_to_consultant_date) missing_fields.push(__("Sent to Consultant Date"));
            if (!frm.doc.consultant_signed_contract) missing_fields.push(__("Consultant Signed Contract (Upload PDF)"));
            if (!frm.doc.consultant_signed_date) missing_fields.push(__("Consultant Signed Date"));
            if (!frm.doc.consultant_received_date) missing_fields.push(__("Received Date"));
            if (!frm.doc.final_executed_contract) missing_fields.push(__("Final Executed Contract (Upload PDF)"));
            if (!frm.doc.countersigned_date) missing_fields.push(__("Management Countersigned Date"));

            if (missing_fields.length > 0) {
                frappe.msgprint({
                    title: __("Section G Incomplete"),
                    indicator: "red",
                    message: __("Please fill all required fields in <b>Section G &mdash; Consultant Signed Contract</b> before issuing the contract:<br><br><ul style='margin-left: 18px;'><li>" + missing_fields.join("</li><li>") + "</li></ul>")
                });
                return Promise.reject("INCOMPLETE_SECTION_G");
            }

            frappe.show_alert({
                message: __("Contract issued successfully."),
                indicator: "green"
            }, 5);
            return Promise.resolve();
        }

        // 4. Consultant Signed -> Submit for Countersigning (Contract Manager)
        if (action === "Submit Signed Contract") {
            let is_authorized = (user === frm.doc.owner) ||
                (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
                is_admin;

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> is authorized to submit the signed contract.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            if (!frm.doc.consultant_signed_contract) {
                frappe.msgprint({
                    title: __("Attachment Required"),
                    indicator: "red",
                    message: __("Please upload the <b>Consultant Signed Contract (PDF)</b> in Section G before continuing.")
                });
                return Promise.reject("MISSING_SIGNED_CONTRACT");
            }
            if (!frm.doc.consultant_signed_date) {
                frm.doc.consultant_signed_date = frappe.datetime.nowdate();
                frm.refresh_field("consultant_signed_date");
            }
            return Promise.resolve();
        }

        // 5. Countersigning Complete -> Active (Contract Manager)
        if (action === "Execute Contract") {
            let is_authorized = (user === frm.doc.owner) ||
                (frappe.user_roles && frappe.user_roles.includes("Contract Manager")) ||
                is_admin;

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the <b>Contract Manager</b> is authorized to execute the contract.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            // Enforce all 6 Section G fields before activating
            let missing_fields = [];
            if (!frm.doc.sent_to_consultant_date) missing_fields.push(__("Sent to Consultant Date"));
            if (!frm.doc.consultant_signed_contract) missing_fields.push(__("Consultant Signed Contract (Upload PDF)"));
            if (!frm.doc.consultant_signed_date) missing_fields.push(__("Consultant Signed Date"));
            if (!frm.doc.consultant_received_date) missing_fields.push(__("Received Date"));
            if (!frm.doc.final_executed_contract) missing_fields.push(__("Final Executed Contract (Upload PDF)"));
            if (!frm.doc.countersigned_date) missing_fields.push(__("Management Countersigned Date"));

            if (missing_fields.length > 0) {
                frappe.msgprint({
                    title: __("Section G Incomplete"),
                    indicator: "red",
                    message: __("Please fill all required fields in <b>Section G &mdash; Consultant Signed Contract</b> before activating the contract:<br><br><ul style='margin-left: 18px;'><li>" + missing_fields.join("</li><li>") + "</li></ul>")
                });
                return Promise.reject("INCOMPLETE_SECTION_G");
            }

            return Promise.resolve();
        }

        // 6. Approver Stages (Team Lead, HR, CEO, Final HR)
        let decision_field = "";
        let remarks_field = "";
        let tier_name = "";
        let is_approver_authorized = false;

        if (state === "Pending Team Lead Approval") {
            decision_field = "team_lead_decision";
            remarks_field = "team_lead_remarks";
            tier_name = "Team Lead";
            let assigned_user = frm.doc.team_lead_approver;
            let is_tl_assigned = (assigned_user && user === assigned_user);
            let has_tl_role = frappe.user_roles && frappe.user_roles.includes("Team Lead");
            is_approver_authorized = is_admin || is_tl_assigned || (has_tl_role && (!assigned_user || user === assigned_user));
        } else if (state === "Pending HR Review") {
            decision_field = "hr_decision";
            remarks_field = "hr_remarks";
            tier_name = "HR Review";
            let is_hr_approver = (frm.doc.hr_approver && user === frm.doc.hr_approver);
            let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"));
            is_approver_authorized = is_hr_approver || has_hr_role || is_admin;
        } else if (state === "Pending CEO Approval") {
            decision_field = "ceo_decision";
            remarks_field = "ceo_remarks";
            tier_name = "CEO Approval";
            is_approver_authorized = (frm.doc.ceo_approver && user === frm.doc.ceo_approver) || is_admin;
        } else if (state === "Pending Final HR Review") {
            decision_field = "final_hr_decision";
            remarks_field = "final_hr_remarks";
            tier_name = "Final HR Review";
            let is_final_hr = (frm.doc.final_hr_approver && user === frm.doc.final_hr_approver) ||
                              (frm.doc.hr_approver && user === frm.doc.hr_approver);
            let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"));
            is_approver_authorized = is_final_hr || has_hr_role || is_admin;
        }

        if (!decision_field) {
            return Promise.resolve();
        }

        if (!is_approver_authorized) {
            frappe.msgprint({
                title: __("Not Authorized"),
                indicator: "red",
                message: __(`You are not authorized to take action during the <b>${tier_name}</b> stage.`)
            });
            return Promise.reject("NOT_AUTHORIZED");
        }

        let now_str = frappe.datetime.str_to_user(frappe.datetime.now_datetime());

        // Capture any remarks already typed into the form
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

        // Handle Approvals
        if (action_lower.includes("approve")) {
            let status_text = "Approved [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Approve Consultant Contract — ${tier_name}`),
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
                        if (submitted) return;
                        submitted = true;

                        let $btn = dialog.get_primary_btn();
                        if ($btn && $btn.length) {
                            $btn.prop("disabled", true).addClass("disabled");
                        }

                        let final_comment = values.comments ? values.comments.trim() : "";
                        frappe.dom.freeze(__("Recording approval..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.record_consultant_approver_decision",
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
                            dialog.hide();
                            resolve();
                        } catch (e) {
                            submitted = false;
                            if ($btn && $btn.length) {
                                $btn.prop("disabled", false).removeClass("disabled");
                            }
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

        // Handle Rejections
        if (action_lower.includes("reject")) {
            let status_text = "Rejected [" + now_str + "]";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let submitted = false;
                let dialog = new frappe.ui.Dialog({
                    title: __(`Reject Consultant Contract — ${tier_name}`),
                    fields: [
                        {
                            label: __("Rejection Reason / Comments (Mandatory)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: existing_comment,
                            description: __("Please specify the reason for rejecting this contract.")
                        }
                    ],
                    primary_action_label: __("Confirm Rejection"),
                    primary_action: async function(values) {
                        if (submitted) return;
                        if (!values.comments || !values.comments.trim()) {
                            frappe.msgprint(__("Rejection comments are mandatory."));
                            return;
                        }
                        submitted = true;

                        let $btn = dialog.get_primary_btn();
                        if ($btn && $btn.length) {
                            $btn.prop("disabled", true).addClass("disabled");
                        }

                        let final_comment = values.comments.trim();
                        frappe.dom.freeze(__("Recording rejection..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.record_consultant_approver_decision",
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
                            dialog.hide();
                            resolve();
                        } catch (e) {
                            submitted = false;
                            if ($btn && $btn.length) {
                                $btn.prop("disabled", false).removeClass("disabled");
                            }
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
                        if (submitted) return;
                        if (!values.comments || !values.comments.trim()) {
                            frappe.msgprint(__("Revision feedback is mandatory."));
                            return;
                        }
                        submitted = true;

                        let $btn = dialog.get_primary_btn();
                        if ($btn && $btn.length) {
                            $btn.prop("disabled", true).addClass("disabled");
                        }

                        let final_comment = values.comments.trim();
                        frappe.dom.freeze(__("Recording revision request..."));
                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.record_consultant_approver_decision",
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
                            dialog.hide();
                            resolve();
                        } catch (e) {
                            submitted = false;
                            if ($btn && $btn.length) {
                                $btn.prop("disabled", false).removeClass("disabled");
                            }
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
                        reject("REVISION_CANCELLED");
                    }
                });

                dialog.show();
            });
        }

        return Promise.resolve();
    },

    team_lead(frm) {
        if (frm.doc.team_lead) {
            frappe.db.get_value("Employee", frm.doc.team_lead, "user_id").then(r => {
                if (r && r.message && r.message.user_id) {
                    frm.set_value("team_lead_approver", r.message.user_id);
                }
            });
        }
    },

    existing_consultant(frm) {
        if (frm.doc.existing_consultant === "No") {
            frm.set_value("consultant_id", null);
        }
    },

    consultant_id(frm) {
        if (frm.doc.consultant_id) {
            frappe.db.get_doc("Consultant Master", frm.doc.consultant_id).then(cm => {
                if (cm) {
                    frm.set_value("consultant_name", cm.consultant_name);
                    frm.set_value("email_id", cm.email);
                    frm.set_value("contact_number", cm.mobile);
                    frm.set_value("consultant_address", cm.address);
                    frm.set_value("area_of_expertise", cm.area_of_expertise);
                    frm.set_value("gstin_number", cm.gstin);
                    if (cm.cv_attachment && !frm.doc.consultant_cv) {
                        frm.set_value("consultant_cv", cm.cv_attachment);
                    }
                }
            });
        }
    },

    proposed_start_date(frm) {
        calculate_contract_tenure(frm);
    },

    proposed_end_date(frm) {
        calculate_contract_tenure(frm);
    },

    compensation_type(frm) {
        calculate_total_contract_value(frm);
    },

    start_date(frm) {
        if (frm.doc.start_date && !frm.doc.proposed_start_date) {
            frm.set_value("proposed_start_date", frm.doc.start_date);
        }
    },

    end_date(frm) {
        if (frm.doc.end_date && !frm.doc.proposed_end_date) {
            frm.set_value("proposed_end_date", frm.doc.end_date);
        }
    },

    contract_start_date(frm) {
        if (frm.doc.contract_start_date && !frm.doc.proposed_start_date) {
            frm.set_value("proposed_start_date", frm.doc.contract_start_date);
        }
    },

    contract_end_date(frm) {
        if (frm.doc.contract_end_date && !frm.doc.proposed_end_date) {
            frm.set_value("proposed_end_date", frm.doc.contract_end_date);
        }
    },

    proposed_fee(frm) {
        calculate_total_contract_value(frm);
    },

    compensation_amount(frm) {
        if (frm.doc.compensation_amount && !frm.doc.proposed_fee) {
            frm.set_value("proposed_fee", frm.doc.compensation_amount);
        }
        calculate_total_contract_value(frm);
    },

    reason_for_engagement(frm) { trigger_auto_expand(frm, "reason_for_engagement"); },
    scope_summary(frm) { trigger_auto_expand(frm, "scope_summary"); },
    key_responsibilities(frm) { trigger_auto_expand(frm, "key_responsibilities"); },
    deliverables(frm) { trigger_auto_expand(frm, "deliverables"); },
    milestones(frm) { trigger_auto_expand(frm, "milestones"); },
    expected_outputs(frm) { trigger_auto_expand(frm, "expected_outputs"); },
    performance_acceptance_criteria(frm) { trigger_auto_expand(frm, "performance_acceptance_criteria"); },
    final_hr_remarks(frm) { trigger_auto_expand(frm, "final_hr_remarks"); }
});

// Child Table Events: Project Allocation
frappe.ui.form.on("Project Allocation Item", {
    allocation_percent(frm, cdt, cdn) {
        calculate_total_allocation(frm);
    },
    project_allocations_add(frm) {
        calculate_total_allocation(frm);
    },
    project_allocations_remove(frm) {
        calculate_total_allocation(frm);
    }
});

// ==============================================================================
// 1. Rejection Helper & Approval Progress Stepper Tracker
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
            { id: "Signed by Consultant", label: "Signed Contract" },
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
            frm.doc.sent_to_consultant_date &&
            frm.doc.consultant_signed_contract &&
            frm.doc.consultant_signed_date &&
            frm.doc.consultant_received_date &&
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
        } else if (current_state === "Signed by Consultant" || current_state === "Approved for Issuance" || current_state === "Contract Issued") {
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
        if (current_state === "Signed by Consultant" || current_state === "Approved for Issuance" || current_state === "Contract Issued") {
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
                    circle_content = (s.id === "Signed by Consultant" && has_all_section_g) ? "&#10003;" : (idx + 1);
                    label_color = "#15803d";
                    label_weight = "700";
                    pulse_style = "box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.25);";
                }
            }

            let extra_hint = "";
            if (s.id === "Signed by Consultant" && is_active) {
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
                    <span>Consultant Contract Approval Workflow Route</span>
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
        let state = frm.doc.workflow_state || "Draft";
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

            // Strict authorization: only assigned user or Administrator (or HR role for HR steps)
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
                            <div style="padding: 6px 12px; background: ${bg_color}; border: 1px solid ${border_color}; border-radius: 6px; font-size: 13px; color: ${text_color}; white-space: pre-wrap; line-height: 1.45; min-height: 32px;">
                                ${frappe.utils.escape_html(review_val)}
                            </div>
                        `);
                    } else {
                        $rem.html(`
                            <div style="padding: 6px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; color: #94a3b8; font-style: italic; min-height: 32px;">
                                No comments provided
                            </div>
                        `);
                    }
                    let $rem_target = review_field.$wrapper.find(".form-group");
                    if ($rem_target.length) {
                        $rem_target.append($rem);
                    } else {
                        review_field.$wrapper.append($rem);
                    }
                } else {
                    review_field.$wrapper.find(".control-input-wrapper").show();
                    review_field.$wrapper.find(".control-input").show();
                }
            }
        });
        align_contract_approver_rows(frm);

        // General field read-only rules across approval stages
        let is_in_approval = ["Pending Team Lead Approval", "Pending HR Review", "Pending CEO Approval", "Pending Final HR Review"].includes(state);
        const section_g_fieldnames = [
            "consultant_signed_contract", "consultant_signed_date", "consultant_received_date",
            "final_executed_contract", "countersigned_date", "sent_to_consultant_date"
        ];

        if (is_in_approval || state === "CEO Approved" || state === "Rejected") {
            const editable_in_approval = ["team_lead_remarks", "hr_remarks", "ceo_remarks", "final_hr_remarks"];
            (frm.fields || []).forEach(f => {
                if (f && f.df && f.df.fieldname && !editable_in_approval.includes(f.df.fieldname)) {
                    frm.set_df_property(f.df.fieldname, "read_only", 1);
                }
            });
        } else if (state === "Approved for Issuance") {
            // Once in Approved for Issuance, strictly Contract Manager and Admin can fill Section G fields
            let is_cm = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
            let is_cm_or_admin = is_admin || is_cm;
            (frm.fields || []).forEach(f => {
                if (f && f.df && f.df.fieldname) {
                    if (section_g_fieldnames.includes(f.df.fieldname)) {
                        frm.set_df_property(f.df.fieldname, "read_only", is_cm_or_admin ? 0 : 1);
                    } else {
                        frm.set_df_property(f.df.fieldname, "read_only", 1);
                    }
                }
            });
        } else if (state === "Contract Issued" || state === "Signed by Consultant") {
            let is_cm = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
            let is_cm_or_admin = is_admin || is_cm;
            (frm.fields || []).forEach(f => {
                if (f && f.df && f.df.fieldname) {
                    if (section_g_fieldnames.includes(f.df.fieldname)) {
                        frm.set_df_property(f.df.fieldname, "read_only", is_cm_or_admin ? 0 : 1);
                    } else {
                        frm.set_df_property(f.df.fieldname, "read_only", 1);
                    }
                }
            });
        } else if (state === "Draft" || state === "Returned for Revision") {
            let is_creator_or_hr = (user === frm.doc.owner) ||
                (frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("Contract Manager"))) ||
                is_admin;
            if (!is_creator_or_hr) {
                frm.set_read_only();
            }
        }
    } catch (e) {
        console.error("Error in apply_contract_approver_field_locking:", e);
    }
}

function align_contract_approver_rows(frm) {
    if (!frm || !frm.wrapper) return;
    let $w = $(frm.wrapper);
    let rows = [
        ["team_lead_approver", "team_lead_decision", "team_lead_remarks"],
        ["hr_approver", "hr_decision", "hr_remarks"],
        ["ceo_approver", "ceo_decision", "ceo_remarks"],
        ["final_hr_approver", "final_hr_decision", "final_hr_remarks"]
    ];

    // Reset min-heights first to measure natural content height
    rows.forEach(r => {
        r.forEach(f => {
            let $el = $w.find(`[data-fieldname="${f}"]`);
            $el.css({ "min-height": "", "height": "" });
        });
    });

    // Measure and apply matched height for each row
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

// ==============================================================================
// 3. Section Visibility Enforcement (Admin Only for Approvals & Cleanup)
// ==============================================================================
function apply_section_visibility(frm) {
    if (!frm.doc) return;

    let state = frm.doc.workflow_state || frm.doc.status || "Draft";

    // 1. Section F (Approval Section): visible
    frm.toggle_display([
        "section_f", "sec_break_f2", "sec_break_f3", "sec_break_f4"
    ], true);

    // 2. Section G (Consultant Signed Contract):
    // Strictly hidden until Final HR Review is approved (visible ONLY in Approved for Issuance, Contract Issued, Signed by Consultant, Active)
    let is_after_final_hr = ["Approved for Issuance", "Contract Issued", "Signed by Consultant", "Active"].includes(state);

    const SECTION_G_FIELDS = [
        "section_g",
        "consultant_signed_contract",
        "consultant_signed_date",
        "consultant_received_date",
        "col_break_g",
        "final_executed_contract",
        "countersigned_date",
        "sent_to_consultant_date"
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

    // Direct DOM toggle for Section G wrapper
    let sec_g_field = frm.get_field("section_g");
    if (sec_g_field && sec_g_field.$wrapper) {
        sec_g_field.$wrapper.closest(".form-section").toggle(is_after_final_hr);
        sec_g_field.$wrapper.toggle(is_after_final_hr);
    }
    if (frm.wrapper) {
        let $w = $(frm.wrapper);
        $w.find('.form-section[data-fieldname="section_g"]').toggle(is_after_final_hr);
        $w.find('[data-fieldname="section_g"]').closest(".form-section").toggle(is_after_final_hr);
        $w.find('.section-head:contains("Section G")').closest(".form-section").toggle(is_after_final_hr);
        $w.find('.section-head:contains("Section G")').toggle(is_after_final_hr);
    }

    // 3. Legacy RFP fields: NEVER show (redundant legacy fields from previous doctype)
    const LEGACY_RFP_FIELDS = [
        "section_rfp_summary", "organization", "project_name", "grade",
        "contract_type", "start_date", "end_date",
        "budget_line_item", "proposed_fee", "scope_deliverables_summary",
        "justification", "amended_from", "initial_tenure_value", "tenure_unit"
    ];
    LEGACY_RFP_FIELDS.forEach(fn => {
        frm.set_df_property(fn, "hidden", 1);
    });

    // Contract Tenure is visible & read-only; Proposed End Date label is clean
    frm.set_df_property("contract_tenure", "hidden", 0);
    frm.set_df_property("contract_tenure", "read_only", 1);
    frm.set_df_property("proposed_end_date", "label", __("Proposed End Date"));

    // Maintain row alignment in Section C
    if (frm.fields_dict.tenure_unit && frm.fields_dict.tenure_unit.$wrapper) {
        frm.fields_dict.tenure_unit.$wrapper.css({
            "visibility": "hidden",
            "pointer-events": "none"
        });
    }

    // 4. Comments and Activity Section: strictly visible ONLY to Admin
    apply_comments_and_activity_visibility(frm);
}


function apply_comments_and_activity_visibility(frm) {
    if (!frm) return;

    const user = frappe.session.user;
    const is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));

    if (frm.wrapper) {
        if (!is_admin) {
            $(frm.wrapper).addClass("hide-comments-activity");
            $(frm.wrapper).find(".form-footer, .form-timeline, .timeline, .comment-box, .timeline-items, .timeline-actions").hide();
        } else {
            $(frm.wrapper).removeClass("hide-comments-activity");
            $(frm.wrapper).find(".form-footer, .form-timeline, .timeline, .comment-box, .timeline-items, .timeline-actions").show();
        }
    }

    if (frm.footer && frm.footer.wrapper) {
        if (!is_admin) {
            frm.footer.wrapper.hide();
        } else {
            frm.footer.wrapper.show();
        }
    }
}

// ==============================================================================
// 4. Stage Approver Actions Enforcement (Strict Approver Only)
// ==============================================================================
function populate_workflow_actions(frm) {
    if (!frm.doc || !frm.doc.workflow_state || frm.is_new()) return;

    // Call standard Frappe workflow show_actions if available
    if (frm.states && typeof frm.states.show_actions === "function") {
        try {
            frm.states.show_actions();
        } catch (e) {
            console.warn("frm.states.show_actions error:", e);
        }
    }

    // Direct fallback: fetch transitions and ensure dropdown has items
    frappe.workflow.get_transitions(frm.doc).then(transitions => {
        if (!transitions || !transitions.length) return;

        let $menu = frm.page.actions_btn_group ? frm.page.actions_btn_group.find(".dropdown-menu") : null;
        if (!$menu) return;

        let existing_actions = [];
        $menu.find(".menu-item-label, .dropdown-item").each(function() {
            let t = $(this).text().trim();
            if (t) existing_actions.push(t);
        });

        const user = frappe.session.user;
        const is_admin = (user === "Administrator") || (frappe.user_roles && frappe.user_roles.includes("System Manager"));

        transitions.forEach(d => {
            let has_role = frappe.user_roles && frappe.user_roles.includes(d.allowed);
            let has_access = is_admin || d.allow_self_approval || (user !== frm.doc.owner);

            if ((has_role || is_admin) && has_access) {
                if (!existing_actions.includes(__(d.action)) && !existing_actions.includes(d.action)) {
                    frm.page.add_action_item(__(d.action), function() {
                        frappe.dom.freeze();
                        frm.selected_workflow_action = d.action;
                        if (!frappe.ui.form.check_mandatory(frm)) return frappe.dom.unfreeze();
                        frm.script_manager.trigger("before_workflow_action").then(() => {
                            frappe.xcall("frappe.model.workflow.apply_workflow", {
                                doc: frm.doc,
                                action: d.action
                            }).then(doc => {
                                frappe.model.sync(doc);
                                frm.refresh();
                                frm.selected_workflow_action = null;
                                frm.script_manager.trigger("after_workflow_action");
                            }).finally(() => {
                                frappe.dom.unfreeze();
                            });
                        }).catch(() => {
                            frappe.dom.unfreeze();
                        });
                    });
                }
            }
        });

        if ($menu.find("li:not(.dropdown-divider)").length > 0) {
            frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }
        }
    });
}

function enforce_stage_approver_actions(frm) {
    if (!frm.doc || !frm.doc.workflow_state || frm.is_new()) return;

    const state = frm.doc.workflow_state;
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
        populate_workflow_actions(frm);
    }

    // Active lifecycle actions (Post-Approval / Execution)
    if (state === "Active" || frm.doc.docstatus === 1) {
        if (frm.wrapper) $(frm.wrapper).addClass("state-active");

        let is_owner = (user === frm.doc.owner);
        let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
        let is_cm_authorized = is_admin || is_owner || has_cm_role;

        // Hide standalone secondary Cancel button in page header
        if (frm.page) {
            frm.page.clear_secondary_action();
            if (frm.page.btn_secondary) {
                frm.page.btn_secondary.addClass("hide").hide();
            }
        }

        if (!is_cm_authorized) {
            hide_actions();
            return;
        }

        // Show Actions button group with the 3 lifecycle options + Cancel option
        if (frm.page && frm.page.actions_btn_group) {
            frm.page.clear_actions_menu();
            frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
            if (frm.page.actions && frm.page.actions.parent) {
                frm.page.actions.parent().removeClass("hide hidden-xl").show();
            }

            // 1. Contract Extension
            frm.page.add_action_item(__("Contract Extension"), function() {
                frappe.new_doc("Consultant Contract Extension", {
                    contract: frm.doc.name,
                    consultant_name: frm.doc.consultant_name,
                    organization: frm.doc.requesting_organization || frm.doc.organization,
                    project_name: frm.doc.project || frm.doc.project_name,
                    current_end_date: frm.doc.proposed_end_date || frm.doc.end_date,
                    current_fee: frm.doc.compensation_amount || frm.doc.proposed_fee
                });
            });

            // 2. Contract Amendment
            frm.page.add_action_item(__("Contract Amendment"), function() {
                frappe.new_doc("Consultant Contract Amendment", {
                    contract: frm.doc.name,
                    consultant_name: frm.doc.consultant_name,
                    organization: frm.doc.requesting_organization || frm.doc.organization,
                    current_contract_value: frm.doc.total_contract_value || frm.doc.compensation_amount
                });
            });

            // 3. Contract Termination
            frm.page.add_action_item(__("Contract Termination"), function() {
                frappe.new_doc("Consultant Contract Termination", {
                    contract: frm.doc.name,
                    consultant_name: frm.doc.consultant_name,
                    organization: frm.doc.requesting_organization || frm.doc.organization
                });
            });

        }
        return;
    }

    if (frm.wrapper) $(frm.wrapper).removeClass("state-active");

    // 1. If in Draft state or Returned for Revision
    if (state === "Draft" || state === "Returned for Revision") {
        let is_owner = (user === frm.doc.owner);
        let has_cm_role = frappe.user_roles && (frappe.user_roles.includes("Contract Manager") || frappe.user_roles.includes("HR Manager"));

        if (!is_owner && !has_cm_role && !is_admin) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 2. Stage: Pending Team Lead Approval -> ONLY Team Lead Approver
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

    // 3. Stage: Pending HR Review -> ONLY HR Approver / HR roles
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

    // 4. Stage: Pending CEO Approval -> ONLY CEO Approver
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

    // 5. Stage: Pending Final HR Review -> ONLY Final HR Approver / HR roles
    if (state === "Pending Final HR Review") {
        frm.page.remove_inner_button(__("Download Preview Form (PDF)"));
        frm.page.remove_inner_button(__("Send to HR for Final Review"));

        let assigned_user = frm.doc.final_hr_approver || frm.doc.hr_approver;
        let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("HR User"));
        let is_final_hr_authorized = is_admin || (assigned_user && user === assigned_user) || (has_hr_role && (!assigned_user || user === assigned_user));
        if (!is_final_hr_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 6. Stage: CEO Approved -> Strictly ONLY Contract Manager (CEO, Lead, and HR must NEVER see action button)
    if (state === "CEO Approved") {
        let is_ceo = (frm.doc.ceo_approver && user === frm.doc.ceo_approver);
        let is_lead = (frm.doc.team_lead_approver && user === frm.doc.team_lead_approver);
        let is_hr = (frm.doc.hr_approver && user === frm.doc.hr_approver) || (frm.doc.final_hr_approver && user === frm.doc.final_hr_approver);
        if (is_ceo || is_lead || is_hr) {
            hide_actions();
            return;
        }

        let is_owner = (user === frm.doc.owner);
        let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
        let is_cm_authorized = !is_ceo && !is_lead && !is_hr && (is_owner || has_cm_role || is_admin);

        if (!is_cm_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 7. Stages: Approved for Issuance (Issue Contract)
    // Strictly ONLY Contract Manager (and System Manager / Admin)
    if (state === "Approved for Issuance") {
        let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
        let is_cm_authorized = is_admin || has_cm_role;

        if (!is_cm_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }

    // 8. Subsequent execution stages: Contract Issued, Signed by Consultant
    if (state === "Contract Issued" || state === "Signed by Consultant") {
        let is_owner = (user === frm.doc.owner);
        let has_cm_role = frappe.user_roles && frappe.user_roles.includes("Contract Manager");
        let is_authorized = is_admin || is_owner || has_cm_role;

        if (!is_authorized) {
            hide_actions();
        } else {
            show_actions();
        }
        return;
    }
}

// ==============================================================================
// 4. Compact 2-Line Initial & Auto-Expanding Textareas
// ==============================================================================
const TARGET_TEXT_FIELDS = [
    "reason_for_engagement", "scope_summary", "key_responsibilities",
    "deliverables", "milestones", "expected_outputs",
    "performance_acceptance_criteria",
    "team_lead_remarks", "hr_remarks", "ceo_remarks", "final_hr_remarks"
];

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

function setup_auto_expand_textareas(frm) {
    if (!frm || !frm.wrapper) return;

    if (frm.wrapper) $(frm.wrapper).addClass("consultant-contract-wrapper");
    if (frm.page && frm.page.wrapper) $(frm.page.wrapper).addClass("consultant-contract-wrapper");

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

    $(frm.wrapper).off("click.cc_expand").on("click.cc_expand", ".section-head, .nav-link, .tab-link", function() {
        setTimeout(() => {
            TARGET_TEXT_FIELDS.forEach(fn => trigger_auto_expand(frm, fn));
        }, 50);
    });
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

function inject_consultant_contract_styles() {
    $("#cc-custom-ui-style").remove();

    $(`
    <style id="cc-custom-ui-style">
        .consultant-contract-wrapper [data-fieldname="reason_for_engagement"] textarea,
        .consultant-contract-wrapper [data-fieldname="scope_summary"] textarea,
        .consultant-contract-wrapper [data-fieldname="key_responsibilities"] textarea,
        .consultant-contract-wrapper [data-fieldname="deliverables"] textarea,
        .consultant-contract-wrapper [data-fieldname="milestones"] textarea,
        .consultant-contract-wrapper [data-fieldname="expected_outputs"] textarea,
        .consultant-contract-wrapper [data-fieldname="performance_acceptance_criteria"] textarea,
        .consultant-contract-wrapper [data-fieldname="team_lead_remarks"] textarea,
        .consultant-contract-wrapper [data-fieldname="hr_remarks"] textarea,
        .consultant-contract-wrapper [data-fieldname="ceo_remarks"] textarea,
        .consultant-contract-wrapper [data-fieldname="final_hr_remarks"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="reason_for_engagement"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="scope_summary"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="key_responsibilities"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="deliverables"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="milestones"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="expected_outputs"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="performance_acceptance_criteria"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="team_lead_remarks"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="hr_remarks"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="ceo_remarks"] textarea,
        .form-page[data-page-route*="consultant_contract"] [data-fieldname="final_hr_remarks"] textarea {
            height: 50px !important;
            min-height: 50px !important;
            line-height: 1.45 !important;
            font-size: 13px !important;
            padding: 6px 10px !important;
            resize: vertical !important;
            box-sizing: border-box !important;
        }
        /* Form Controls Outer Border Styling */
        .consultant-contract-wrapper .form-control {
            border: 1px solid #d1d5db !important;
            border-radius: 6px !important;
        }
        .consultant-contract-wrapper .form-control:focus {
            border-color: #2563eb !important;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
        }

        /* Prevent duplicate display: strictly hide control-value when control-input is active or hidden */
        .consultant-contract-wrapper .frappe-control .control-input:not([style*="none"]):not(.hide) ~ .control-value,
        .consultant-contract-wrapper .frappe-control .control-input-wrapper:not([style*="none"]):not(.hide) ~ .control-value,
        .consultant-contract-wrapper .control-value[style*="none"],
        .consultant-contract-wrapper .control-value.hide,
        .consultant-contract-wrapper .control-value.hidden {
            display: none !important;
        }

        /* When field is read-only and control-value is shown, keep visible clean border box */
        .consultant-contract-wrapper .control-value.like-disabled-input {
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
        .consultant-contract-wrapper [data-fieldtype="Small Text"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldtype="Long Text"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldtype="Text"] .control-value.like-disabled-input {
            min-height: 52px !important;
            white-space: pre-wrap !important;
        }
        .consultant-contract-wrapper [data-fieldname="team_lead_decision"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="hr_decision"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="ceo_decision"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="final_hr_decision"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="team_lead_remarks"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="hr_remarks"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="ceo_remarks"] .control-value.like-disabled-input,
        .consultant-contract-wrapper [data-fieldname="final_hr_remarks"] .control-value.like-disabled-input {
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
        .consultant-contract-wrapper.hide-comments-activity .form-footer,
        .consultant-contract-wrapper.hide-comments-activity .form-timeline,
        .consultant-contract-wrapper.hide-comments-activity .timeline,
        .consultant-contract-wrapper.hide-comments-activity .comment-box,
        .consultant-contract-wrapper.hide-comments-activity .timeline-items,
        .consultant-contract-wrapper.hide-comments-activity .timeline-actions {
            display: none !important;
        }

        /* Strictly Hide Section G and all its fields until Final HR Review is approved */
        .consultant-contract-wrapper.hide-section-g .form-section[data-fieldname="section_g"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="section_g"],
        .consultant-contract-wrapper.hide-section-g .form-section:has([data-fieldname="section_g"]),
        .consultant-contract-wrapper.hide-section-g [data-fieldname="consultant_signed_contract"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="consultant_signed_date"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="consultant_received_date"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="col_break_g"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="final_executed_contract"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="countersigned_date"],
        .consultant-contract-wrapper.hide-section-g [data-fieldname="sent_to_consultant_date"] {
            display: none !important;
        }
        .consultant-contract-wrapper.hide-section-g .form-section:has([data-fieldname="section_g"]) {
            display: none !important;
        }

        /* In Active state, hide standalone secondary Cancel button from page header */
        .consultant-contract-wrapper.state-active .page-actions > .btn-secondary,
        .consultant-contract-wrapper.state-active .page-actions > [data-label="Cancel"] {
            display: none !important;
        }

        /* Child Table Row Popup Styling */
        .consultant-contract-wrapper .grid-row-open .form-in-grid,
        .consultant-contract-wrapper .form-in-grid {
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

        .consultant-contract-wrapper .form-in-grid::-webkit-scrollbar {
            width: 9px !important;
            display: block !important;
        }

        .consultant-contract-wrapper .form-in-grid::-webkit-scrollbar-thumb {
            background-color: #00B800 !important;
            border-radius: 5px !important;
        }

        .consultant-contract-wrapper .form-in-grid::-webkit-scrollbar-track {
            background-color: #f1f5f9 !important;
            border-radius: 5px !important;
        }

        .consultant-contract-wrapper .form-in-grid .grid-form-heading {
            position: sticky !important;
            top: 0 !important;
            background: #ffffff !important;
            z-index: 10 !important;
            border-bottom: 1px solid #e2e8f0 !important;
        }
    </style>
    `).appendTo("head");
}

// ==============================================================================
// 5. Calculations & Utilities
// ==============================================================================
function calculate_contract_tenure(frm) {
    if (frm.doc.proposed_start_date && frm.doc.proposed_end_date) {
        if (frm.doc.proposed_start_date > frm.doc.proposed_end_date) {
            frappe.msgprint(__('Warning: Proposed End Date cannot be before Proposed Start Date!'));
            frm.set_value('contract_tenure', '');
            frm.set_value('total_contract_value', 0);
            return;
        }

        let start = moment(frm.doc.proposed_start_date);
        let end = moment(frm.doc.proposed_end_date);

        // Calculate exact Years, Months, and Days exactly as in Customer Contract
        let years = end.diff(start, 'years');
        start.add(years, 'years');
        
        let months = end.diff(start, 'months');
        start.add(months, 'months');
        
        let days = end.diff(start, 'days');

        // Build the text cleanly (e.g., hiding "0 Years" if it is only a 6-month contract)
        let parts = [];
        if (years > 0) parts.push(years + (years === 1 ? ' Year' : ' Years'));
        if (months > 0) parts.push(months + (months === 1 ? ' Month' : ' Months'));
        if (days > 0) parts.push(days + (days === 1 ? ' Day' : ' Days'));

        let final_text = parts.length > 0 ? parts.join(', ') : '0 Days';

        frm.set_value('contract_tenure', final_text);
        frm.set_value('start_date', frm.doc.proposed_start_date);
        frm.set_value('end_date', frm.doc.proposed_end_date);

        // Calculate total tenure in months for Total Contract Value
        let total_months = (years * 12) + months;
        if (days >= 28) {
            total_months += 1;
        } else if (days > 0) {
            total_months += (days / 30.0);
        }
        frm.doc.initial_tenure_value = Math.max(1, Math.round(total_months));

        calculate_total_contract_value(frm);
    }
}

function calculate_total_contract_value(frm) {
    let fee = flt(frm.doc.compensation_amount) || flt(frm.doc.proposed_fee) || 0;
    let comp_type = (frm.doc.compensation_type || "Monthly").toLowerCase();

    if (!frm.doc.proposed_start_date || !frm.doc.proposed_end_date) {
        let tenure = cint(frm.doc.initial_tenure_value) || 1;
        if (comp_type.includes("month")) {
            frm.set_value("total_contract_value", fee * tenure);
        } else {
            frm.set_value("total_contract_value", fee);
        }
        return;
    }

    let start = moment(frm.doc.proposed_start_date);
    let end = moment(frm.doc.proposed_end_date);
    let years = end.diff(start, 'years');
    start.add(years, 'years');
    let months = end.diff(start, 'months');
    start.add(months, 'months');
    let days = end.diff(start, 'days');

    let total_months = (years * 12) + months;
    if (days >= 28) {
        total_months += 1;
    } else if (days > 0) {
        total_months += (days / 30.0);
    }

    if (comp_type.includes("month")) {
        frm.set_value("total_contract_value", Math.round(fee * total_months));
    } else if (comp_type.includes("day")) {
        let total_days = moment(frm.doc.proposed_end_date).diff(moment(frm.doc.proposed_start_date), 'days') + 1;
        frm.set_value("total_contract_value", fee * total_days);
    } else {
        frm.set_value("total_contract_value", fee);
    }
}

function calculate_total_allocation(frm) {
    let total = 0;
    (frm.doc.project_allocations || []).forEach(row => {
        total += flt(row.allocation_percent);
    });
    frm.set_value("total_allocation_percent", total);
    if (total > 100) {
        frappe.show_alert({
            message: __("Warning: Total project allocation exceeds 100% (currently {0}%)", [total]),
            indicator: "orange"
        }, 5);
    }
}

function setup_leadership_queries(frm) {
    frm.set_query("team_lead", function() {
        return {
            query: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.get_leadership_employees",
            filters: { role: "Team Lead" }
        };
    });

    frm.set_query("project_manager", function() {
        return {
            query: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.get_leadership_employees",
            filters: { role: "Projects Manager" }
        };
    });
}

function setup_expenses_allowed_multiselect(frm) {
    try {
        let field = frm.get_field("expenses_allowed_multiselect");
        if (!field || !field.$wrapper) return;

        const expense_options = ["Travel", "Accommodation", "Meals", "Per Diem", "Communication", "Supplies", "Other"];

        let $input = field.$input;
        let $input_wrapper = field.$wrapper.find(".control-input-wrapper");
        if (!$input || !$input.length || !$input_wrapper.length) return;

        // Clean up any previously attached elements
        $input_wrapper.find(".custom-expenses-multiselect").remove();
        $input_wrapper.find(".expenses-dropdown-menu").remove();
        $input_wrapper.find(".expenses-dd-caret").remove();
        let doc_key = (frm.doc && frm.doc.name) ? frm.doc.name : "new";
        $(document).off("click.expenses_dd_" + doc_key);

        $input_wrapper.css({ position: "relative" });

        function get_selected_array() {
            let raw_val = frm.doc.expenses_allowed_multiselect || "";
            return (typeof raw_val === "string" && raw_val.trim())
                ? raw_val.split(",").map(s => s.trim()).filter(Boolean)
                : [];
        }

        function update_input_display() {
            let selected = get_selected_array();
            $input.val(selected.length > 0 ? selected.join(", ") : "");
        }

        update_input_display();

        let is_readonly = field.df.read_only || (frm.doc.__islocal === undefined && frm.doc.docstatus > 0);
        if (is_readonly) {
            $input.attr("readonly", "readonly").css({ cursor: "default" });
            return;
        }

        // Configure input as interactive dropdown trigger
        $input.attr("readonly", "readonly");
        $input.attr("placeholder", __("Select Expenses Allowed (Multiselect)..."));
        $input.css({
            cursor: "pointer",
            backgroundColor: "#ffffff",
            paddingRight: "30px",
            userSelect: "none"
        });

        // Dropdown caret icon inside input box
        let $caret = $(`
            <span class="expenses-dd-caret" style="
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
                color: #64748b;
                font-size: 11px;
                transition: transform 0.2s ease;
            ">&#9660;</span>
        `);
        $input_wrapper.append($caret);

        // Dropdown menu element
        let $menu = $(`
            <div class="expenses-dropdown-menu" style="
                position: absolute;
                top: calc(100% + 4px);
                left: 0;
                right: 0;
                z-index: 1050;
                background: #ffffff;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                padding: 6px 0;
                display: none;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 14px 8px 14px; border-bottom: 1px solid #f1f5f9; font-size: 12px; color: #64748b;">
                    <span style="font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Select Expenses</span>
                    <div>
                        <a href="javascript:void(0)" class="expenses-select-all" style="color: #2563eb; text-decoration: none; margin-right: 12px; font-weight: 500;">Select All</a>
                        <a href="javascript:void(0)" class="expenses-clear-all" style="color: #dc2626; text-decoration: none; font-weight: 500;">Clear</a>
                    </div>
                </div>
                <div class="expenses-items-list" style="max-height: 220px; overflow-y: auto; padding: 4px 0;"></div>
            </div>
        `);

        function render_dropdown_items() {
            let selected = get_selected_array();
            let $list = $menu.find(".expenses-items-list");
            $list.empty();

            expense_options.forEach(opt => {
                let is_sel = selected.includes(opt);
                let $item = $(`
                    <div class="expenses-dd-item" data-value="${opt}" style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 14px;
                        cursor: pointer;
                        font-size: 13px;
                        color: ${is_sel ? '#1e40af' : '#1e293b'};
                        background: ${is_sel ? '#eff6ff' : 'transparent'};
                        user-select: none;
                        transition: background 0.12s ease;
                    ">
                        <input type="checkbox" ${is_sel ? "checked" : ""} style="cursor: pointer; width: 16px; height: 16px; accent-color: #2563eb; pointer-events: none;">
                        <span style="flex: 1; font-weight: ${is_sel ? '600' : '400'};">${opt}</span>
                        ${is_sel ? '<span style="color: #2563eb; font-weight: 700; font-size: 14px;">&#10003;</span>' : ''}
                    </div>
                `);

                $item.on("mouseenter", function() {
                    if (!is_sel) $(this).css({ background: "#f8fafc" });
                }).on("mouseleave", function() {
                    if (!is_sel) $(this).css({ background: "transparent" });
                });

                $item.on("click", function(e) {
                    e.stopPropagation();
                    let current_selected = get_selected_array();
                    let idx = current_selected.indexOf(opt);
                    if (idx >= 0) {
                        current_selected.splice(idx, 1);
                    } else {
                        current_selected.push(opt);
                    }
                    let new_val = current_selected.join(", ");
                    frm.set_value("expenses_allowed_multiselect", new_val);
                    update_input_display();
                    render_dropdown_items();
                });

                $list.append($item);
            });
        }

        render_dropdown_items();

        // Select All link
        $menu.find(".expenses-select-all").on("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            let all_val = expense_options.join(", ");
            frm.set_value("expenses_allowed_multiselect", all_val);
            update_input_display();
            render_dropdown_items();
        });

        // Clear All link
        $menu.find(".expenses-clear-all").on("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            frm.set_value("expenses_allowed_multiselect", "");
            update_input_display();
            render_dropdown_items();
        });

        $input_wrapper.append($menu);

        // Toggle dropdown on input click
        $input.off("click.expenses_toggle").on("click.expenses_toggle", function(e) {
            e.stopPropagation();
            let is_visible = $menu.is(":visible");
            if (is_visible) {
                $menu.hide();
                $caret.css({ transform: "translateY(-50%) rotate(0deg)" });
            } else {
                render_dropdown_items();
                $menu.show();
                $caret.css({ transform: "translateY(-50%) rotate(180deg)" });
            }
        });

        // Close on clicking outside
        $(document).off("click.expenses_dd_" + doc_key).on("click.expenses_dd_" + doc_key, function(e) {
            if (!$(e.target).closest($input_wrapper).length) {
                $menu.hide();
                $caret.css({ transform: "translateY(-50%) rotate(0deg)" });
            }
        });

    } catch (e) {
        console.warn("setup_expenses_allowed_multiselect warning:", e);
    }
}

function setup_status_indicator(frm) {
    let s = frm.doc.workflow_state || frm.doc.status || "Draft";
    let color = "blue";
    if (s.includes("Approved") || s === "Active") color = "green";
    else if (s.includes("Revision") || s.includes("Pending") || s.includes("Issued")) color = "orange";
    else if (s.includes("Reject") || s === "Expired" || s === "Terminated") color = "red";
    else if (s === "Draft") color = "gray";

    frm.page.set_indicator(__(s), color);
}

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

        // Cancel previous timer if still pending
        if (frm._pdf_err_timer) {
            clearTimeout(frm._pdf_err_timer);
        }

        frm._pdf_err_timer = setTimeout(() => {
            // Clear any previously accumulated text in the dialog
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

function download_contract_preview_pdf(frm) {
    let template_format = frm.doc.contract_template || "Independent Consultant Agreement";
    let url = `/api/method/frappe.utils.print_format.download_pdf?doctype=Consultant+Contract&name=${encodeURIComponent(frm.doc.name)}&format=${encodeURIComponent(template_format)}&no_letterhead=0`;
    
    frappe.show_alert({
        message: __(`Downloading Agreement PDF (${frappe.utils.escape_html(template_format)})...`),
        indicator: "blue"
    }, 4);

    // Fetch the binary file and trigger direct browser download
    fetch(url, {
        headers: {
            "X-Frappe-CSRF-Token": frappe.csrf_token || ""
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        return response.blob();
    })
    .then(blob => {
        let clean_name = (frm.doc.name || "Contract").replace(/[\/\\?%*:|"<>]/g, "_");
        let filename = `${clean_name}_${template_format}.pdf`;
        let blobUrl = window.URL.createObjectURL(blob);
        let link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
        frappe.show_alert({
            message: __(`Downloaded ${filename} successfully.`),
            indicator: "green"
        }, 3);
    })
    .catch(err => {
        console.warn("Direct blob download failed, falling back to window.open:", err);
        window.open(url, "_blank");
    });
}

function setup_print_agreement_button(frm) {
    if (!frm || !frm.page) return;
    // Clear top toolbar buttons as requested; the action buttons are kept in the banner above Section A
    frm.page.remove_inner_button(__("Download Preview Form (PDF)"));
    frm.page.remove_inner_button(__("Send to HR for Final Review"));
    frm.page.remove_inner_button(__("Download Agreement (PDF)"));
}

function trigger_send_to_final_hr(frm) {
    let hr_name = frm.doc.final_hr_approver || frm.doc.hr_approver || "Assigned HR Manager";
    frappe.confirm(
        __(`Are you sure you want to submit this contract to <b>${frappe.utils.escape_html(hr_name)}</b> for <b>Final HR Review</b>?`),
        function() {
            frm.selected_workflow_action = "Submit for HR Review";
            if (!frm.doc.final_hr_approver) {
                frm.doc.final_hr_approver = frm.doc.hr_approver;
            }
            frappe.dom.freeze(__("Submitting for Final HR Review..."));
            frappe.xcall("frappe.model.workflow.apply_workflow", {
                doc: frm.doc,
                action: "Submit for HR Review"
            }).then(() => {
                frappe.dom.unfreeze();
                frappe.show_alert({
                    message: __("Submitted for Final HR Review and notification sent to HR."),
                    indicator: "green"
                }, 5);
                frm.reload_doc();
            }).catch(e => {
                frappe.dom.unfreeze();
                frappe.msgprint(__("Error submitting for HR Review: ") + (e.message || e));
            });
        }
    );
}

function update_consultant_full_address(frm) {
    let parts = [];
    if (frm.doc.address_line_1) parts.push(frm.doc.address_line_1.trim());
    if (frm.doc.address_line_2) parts.push(frm.doc.address_line_2.trim());
    if (frm.doc.city) parts.push(frm.doc.city.trim());
    if (frm.doc.state) parts.push(frm.doc.state.trim());
    let cp = [];
    if (frm.doc.country) cp.push(frm.doc.country.trim());
    if (frm.doc.pin_code) cp.push(frm.doc.pin_code.trim());
    if (cp.length) parts.push(cp.join(" – "));
    if (parts.length) {
        frm.set_value("consultant_address", parts.join(", "));
    }
}
