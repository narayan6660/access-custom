// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Contract", {
    validate(frm) {
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
        setup_status_indicator(frm);
        enforce_stage_approver_actions(frm);
        setup_auto_expand_textareas(frm);
        apply_contract_approver_field_locking(frm);
        setup_print_agreement_button(frm);

        setTimeout(() => {
            enforce_stage_approver_actions(frm);
            setup_auto_expand_textareas(frm);
            apply_contract_approver_field_locking(frm);
        }, 150);

        setTimeout(() => {
            enforce_stage_approver_actions(frm);
            setup_auto_expand_textareas(frm);
            apply_contract_approver_field_locking(frm);
        }, 400);
    },

    onload_post_render(frm) {
        enforce_stage_approver_actions(frm);
        setup_auto_expand_textareas(frm);
        apply_contract_approver_field_locking(frm);
    },

    before_workflow_action: async function(frm) {
        let action = frm.selected_workflow_action || "";
        let state = frm.doc.workflow_state || "Draft";
        let action_lower = action.toLowerCase();

        // 1. If Submitting from Draft
        if (action === "Submit for Approval" || action === "Resubmit for Approval") {
            let is_authorized = (frappe.session.user === frm.doc.owner) ||
                (frappe.user_roles && (frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Manager"))) ||
                (frappe.session.user === "Administrator");

            if (!is_authorized) {
                frappe.msgprint({
                    title: __("Not Authorized"),
                    indicator: "red",
                    message: __("Only the document creator or HR / System Manager is authorized to submit this contract.")
                });
                return Promise.reject("NOT_AUTHORIZED");
            }

            if (!frm.doc.team_lead_approver && frm.doc.team_lead) {
                frm.doc.team_lead_approver = frm.doc.team_lead;
            }

            return Promise.resolve();
        }

        // 2. Issue Contract to Consultant (Post-CEO Approval)
        if (action === "Issue Contract") {
            if (!frm.doc.sent_to_consultant_date) {
                frm.doc.sent_to_consultant_date = frappe.datetime.nowdate();
                frm.refresh_field("sent_to_consultant_date");
            }
            frappe.show_alert({
                message: __("Contract issued. Awaiting signed document from consultant."),
                indicator: "green"
            }, 5);
            return Promise.resolve();
        }

        // 3. Consultant Signed -> Submit for Countersigning
        if (action === "Submit Signed Contract") {
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

        // 4. Countersigning Complete -> Active
        if (action === "Execute Contract") {
            if (!frm.doc.final_executed_contract) {
                frappe.msgprint({
                    title: __("Attachment Required"),
                    indicator: "red",
                    message: __("Please upload the <b>Final Executed Contract (PDF)</b> in Section G before completing execution.")
                });
                return Promise.reject("MISSING_FINAL_CONTRACT");
            }
            if (!frm.doc.countersigned_date) {
                frm.doc.countersigned_date = frappe.datetime.nowdate();
                frm.refresh_field("countersigned_date");
            }
            return Promise.resolve();
        }

        // 5. Identify active approver tier based on current state
        let decision_field = "";
        let remarks_field = "";
        let tier_name = "";

        if (state === "Pending Team Lead Approval") {
            decision_field = "team_lead_decision";
            remarks_field = "team_lead_remarks";
            tier_name = "Level 1 Team Lead";
        } else if (state === "Pending HR Review") {
            decision_field = "hr_decision";
            remarks_field = "hr_remarks";
            tier_name = "Level 2 HR";
        } else if (state === "Pending CEO Approval") {
            decision_field = "ceo_decision";
            remarks_field = "ceo_remarks";
            tier_name = "Level 3 CEO";
        }

        if (!decision_field) {
            return Promise.resolve();
        }

        // 6. Handle Approvals: prompt for feedback / remarks and record
        if (action_lower.startsWith("approve")) {
            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let dialog = new frappe.ui.Dialog({
                    title: __(`Approve Consultant Contract — ${tier_name}`),
                    fields: [
                        {
                            label: __("Approval Remarks / Notes (Optional)"),
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            default: frm.doc[remarks_field] || ""
                        }
                    ],
                    primary_action_label: __("Confirm Approval"),
                    primary_action: async function(values) {
                        let text = values.comments ? values.comments.trim() : "Approved";
                        frappe.dom.freeze(__("Recording approval..."));

                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.record_consultant_approver_decision",
                                args: {
                                    name: frm.doc.name,
                                    decision_field: decision_field,
                                    decision_val: "Approve",
                                    remarks_field: remarks_field,
                                    remarks_val: text
                                }
                            });

                            frm.doc[decision_field] = "Approve";
                            frm.doc[remarks_field] = text;
                            frm.refresh_field(decision_field);
                            frm.refresh_field(remarks_field);
                            apply_contract_approver_field_locking(frm);

                            dialog.hide();
                            resolve();
                        } catch (err) {
                            frappe.dom.unfreeze();
                            frappe.msgprint(__("Error recording approval: ") + (err.message || err));
                            reject(err);
                        }
                    }
                });
                dialog.show();
            });
        }

        // 7. Handle Rejection or Return for Revision with Dialog
        if (action_lower.includes("reject") || action_lower.includes("return")) {
            let is_return = action_lower.includes("return");
            let title = is_return
                ? __(`Return Consultant Contract for Revision — ${tier_name}`)
                : __(`Reject Consultant Contract — ${tier_name}`);
            let label = is_return ? __("Revision Feedback / Required Changes") : __("Reason for Rejection");
            let btn_label = is_return ? __("Return for Revision") : __("Submit Rejection");
            let decision_val = is_return ? "Return for Revision" : "Reject";

            frappe.dom.freeze_count = 0;
            $("#freeze").removeClass("in").remove();
            frappe.dom.unfreeze();

            return new Promise((resolve, reject) => {
                let dialog = new frappe.ui.Dialog({
                    title: title,
                    fields: [
                        {
                            label: label,
                            fieldname: "comments",
                            fieldtype: "Small Text",
                            reqd: 1,
                            default: frm.doc[remarks_field] || "",
                            description: is_return
                                ? __("Provide detailed instructions for the revisions required before resubmission.")
                                : __("Provide a clear reason for rejecting this consultant contract proposal.")
                        }
                    ],
                    primary_action_label: btn_label,
                    primary_action: async function(values) {
                        let text = values.comments ? values.comments.trim() : "";
                        if (!text) {
                            frappe.msgprint(__("Remarks / Reason are mandatory."));
                            return;
                        }

                        frappe.dom.freeze(is_return ? __("Returning for revision...") : __("Submitting rejection..."));

                        try {
                            await frappe.call({
                                method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.record_consultant_approver_decision",
                                args: {
                                    name: frm.doc.name,
                                    decision_field: decision_field,
                                    decision_val: decision_val,
                                    remarks_field: remarks_field,
                                    remarks_val: text
                                }
                            });

                            frm.doc[decision_field] = decision_val;
                            frm.doc[remarks_field] = text;
                            frm.refresh_field(decision_field);
                            frm.refresh_field(remarks_field);
                            apply_contract_approver_field_locking(frm);

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
            });
        }
    },

    team_lead(frm) {
        if (frm.doc.team_lead && !frm.doc.team_lead_approver) {
            frm.set_value("team_lead_approver", frm.doc.team_lead);
        }
    },

    proposed_start_date(frm) {
        calculate_end_date(frm);
        if (frm.doc.proposed_start_date && !frm.doc.start_date) {
            frm.set_value('start_date', frm.doc.proposed_start_date);
        }
    },

    initial_tenure_value(frm) {
        calculate_end_date(frm);
        update_tenure_string(frm);
    },

    tenure_unit(frm) {
        calculate_end_date(frm);
        update_tenure_string(frm);
    },

    start_date(frm) {
        if (frm.doc.start_date && !frm.doc.proposed_start_date) {
            frm.set_value('proposed_start_date', frm.doc.start_date);
        }
        calculate_end_date(frm);
    },

    existing_consultant(frm) {
        if (frm.doc.existing_consultant === "No") {
            frm.set_value("consultant_id", "");
        }
    },

    consultant_id(frm) {
        if (frm.doc.consultant_id) {
            frappe.db.get_value("Consultant Master", frm.doc.consultant_id, [
                "consultant_name", "email", "mobile", "address", "area_of_expertise", "cv_attachment"
            ]).then(r => {
                if (r && r.message) {
                    let d = r.message;
                    if (d.consultant_name) frm.set_value("consultant_name", d.consultant_name);
                    if (d.email) frm.set_value("email_id", d.email);
                    if (d.mobile) frm.set_value("contact_number", d.mobile);
                    if (d.address) frm.set_value("consultant_address", d.address);
                    if (d.area_of_expertise) frm.set_value("area_of_expertise", d.area_of_expertise);
                    if (d.cv_attachment) frm.set_value("consultant_cv", d.cv_attachment);
                }
            });
        }
    },

    proposed_fee(frm) {
        if (frm.doc.proposed_fee && !frm.doc.compensation_amount) {
            frm.set_value("compensation_amount", frm.doc.proposed_fee);
        }
    },

    compensation_amount(frm) {
        if (frm.doc.compensation_amount && !frm.doc.proposed_fee) {
            frm.set_value("proposed_fee", frm.doc.compensation_amount);
        }
        calculate_total_contract_value(frm);
    }
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
// 1. Stage Approver Actions Enforcer
// ==============================================================================
function enforce_stage_approver_actions(frm) {
    if (!frm.doc || frm.is_new()) return;

    const state = frm.doc.workflow_state || "Draft";
    let is_authorized = false;
    let is_admin = (frappe.session.user === "Administrator");

    if (state === "Draft" || state === "Returned for Revision") {
        let is_owner = (frappe.session.user === frm.doc.owner);
        let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("System Manager"));
        is_authorized = is_owner || has_hr_role || is_admin;
    } else if (state === "Pending Team Lead Approval") {
        let is_lead = (frm.doc.team_lead_approver && frappe.session.user === frm.doc.team_lead_approver) ||
                      (frm.doc.team_lead && frappe.session.user === frm.doc.team_lead);
        is_authorized = is_lead || is_admin;
    } else if (state === "Pending HR Review") {
        let is_hr_approver = (frm.doc.hr_approver && frappe.session.user === frm.doc.hr_approver);
        let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR User") || frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("System Manager"));
        is_authorized = is_hr_approver || has_hr_role || is_admin;
    } else if (state === "Pending CEO Approval") {
        let is_ceo = (frm.doc.ceo_approver && frappe.session.user === frm.doc.ceo_approver);
        is_authorized = is_ceo || is_admin;
    } else if (state === "CEO Approved" || state === "Contract Issued" || state === "Signed by Consultant") {
        let has_hr_role = frappe.user_roles && (frappe.user_roles.includes("HR Manager") || frappe.user_roles.includes("System Manager"));
        is_authorized = has_hr_role || is_admin || (frappe.session.user === frm.doc.owner);
    } else if (state === "Active" || state === "Rejected") {
        is_authorized = false;
    }

    if (!is_authorized) {
        frm.page.clear_actions_menu();
        if (frm.page.actions_btn_group) {
            frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
        }
        if (frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().addClass("hide hidden-xl").hide();
        }
        if (frm.workflow) {
            frm.workflow.setup_btn = function() {
                frm.page.clear_actions_menu();
                if (frm.page.actions_btn_group) frm.page.actions_btn_group.addClass("hide hidden-xl").hide();
            };
        }
    } else {
        if (frm.page && frm.page.actions_btn_group) {
            frm.page.actions_btn_group.removeClass("hide hidden-xl").show();
        }
        if (frm.page && frm.page.actions && frm.page.actions.parent) {
            frm.page.actions.parent().removeClass("hide hidden-xl").show();
        }
    }
}

// ==============================================================================
// 2. Slide 3 Action Buttons (Preview Template, Generate Contract, Download PDF, Send to consultant)
// ==============================================================================
function setup_print_agreement_button(frm) {
    if (frm.is_new()) return;

    // 1. Preview Template
    frm.add_custom_button(__("Preview Template"), function() {
        let url = `/printview?doctype=Consultant Contract&name=${encodeURIComponent(frm.doc.name)}&format=Consultant Agreement`;
        window.open(url, "_blank");
    });

    // 2. Generate Contract
    frm.add_custom_button(__("Generate Contract"), function() {
        if (!frm.doc.request_id && frm.doc.requesting_organization) {
            frappe.call({
                method: "frappe.client.save",
                args: { doc: frm.doc },
                callback: function() {
                    frm.reload_doc();
                }
            });
        }
        frappe.show_alert({
            message: __("Contract Agreement generated successfully."),
            indicator: "green"
        }, 5);
    });

    // 3. Download PDF
    frm.add_custom_button(__("Download PDF"), function() {
        let url = `/api/method/frappe.utils.print_format.download_pdf?doctype=Consultant Contract&name=${encodeURIComponent(frm.doc.name)}&format=Consultant Agreement&no_letterhead=0`;
        window.open(url, "_blank");
    });

    // 4. Send to consultant
    frm.add_custom_button(__("Send to consultant"), function() {
        let recipient = frm.doc.email_id;
        if (!recipient) {
            frappe.msgprint({
                title: __("Missing Consultant Email"),
                indicator: "orange",
                message: __("Please specify the Consultant's <b>Email</b> in Section B before sending.")
            });
            return;
        }

        new frappe.views.CommunicationComposer({
            doc: frm.doc,
            frm: frm,
            subject: `Consultant Engagement Contract Agreement - ${frm.doc.consultant_name || frm.doc.name}`,
            recipients: recipient,
            attach_print: true,
            print_format: "Consultant Agreement"
        });
    });
}

// ==============================================================================
// 3. Auto-Expand All Textareas (Initial 3 Lines, Expands Dynamically on Typing)
// ==============================================================================
function setup_auto_expand_textareas(frm) {
    if (!frm || !frm.wrapper) return;

    const $textareas = $(frm.wrapper).find("textarea");
    $textareas.each(function() {
        const $ta = $(this);
        $ta.attr("rows", 3);
        $ta.css({
            "min-height": "72px",
            "line-height": "1.5",
            "resize": "vertical",
            "overflow-y": "hidden",
            "box-sizing": "border-box"
        });

        const resize = function() {
            this.style.height = "auto";
            this.style.height = Math.max(72, this.scrollHeight) + "px";
        };

        $ta.off("input.auto_expand change.auto_expand").on("input.auto_expand change.auto_expand", resize);
        resize.call(this);
    });
}

// ==============================================================================
// 4. Approver Field Badges (Only Pill Displayed, Raw Input Hidden)
// ==============================================================================
function apply_contract_approver_field_locking(frm) {
    const approver_matrix = [
        { approver: "team_lead_approver", decision: "team_lead_decision", remarks: "team_lead_remarks", label: "Team Lead" },
        { approver: "hr_approver", decision: "hr_decision", remarks: "hr_remarks", label: "HR" },
        { approver: "ceo_approver", decision: "ceo_decision", remarks: "ceo_remarks", label: "CEO" }
    ];

    approver_matrix.forEach(item => {
        frm.set_df_property(item.decision, "read_only", 1);

        let decision_val = frm.doc[item.decision] || "Pending";
        let field = frm.get_field(item.decision);

        if (field && field.$wrapper) {
            field.$wrapper.find(".control-input").hide();
            field.$wrapper.find(".control-value").hide();
            field.$wrapper.find(".like-disabled-input").hide();

            let $container = field.$wrapper.find(".custom-decision-badge-container");
            if (!$container.length) {
                $container = $('<div class="custom-decision-badge-container" style="margin-top: 2px;"></div>');
                let $target = field.$wrapper.find(".control-input-wrapper");
                if ($target.length) {
                    $container.appendTo($target);
                } else {
                    $container.appendTo(field.$wrapper);
                }
            }

            let badge_bg = "#f1f5f9";
            let text_color = "#475569";
            let border_style = "1px dashed #cbd5e1";
            let icon = "&#9203;";
            let display_text = "Pending Review";

            if (decision_val === "Approve" || decision_val === "Approved") {
                badge_bg = "#16a34a";
                text_color = "#ffffff";
                border_style = "none";
                icon = "&#10003;";
                display_text = "Approved";
            } else if (decision_val === "Reject" || decision_val === "Rejected") {
                badge_bg = "#dc2626";
                text_color = "#ffffff";
                border_style = "none";
                icon = "&#10007;";
                display_text = "Rejected";
            } else if (decision_val === "Return for Revision" || decision_val === "Returned") {
                badge_bg = "#d97706";
                text_color = "#ffffff";
                border_style = "none";
                icon = "&#8635;";
                display_text = "Returned for Revision";
            }

            $container.html(`
                <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: ${badge_bg}; color: ${text_color}; border: ${border_style}; border-radius: 6px; font-weight: 600; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); letter-spacing: 0.2px;">
                    <span>${icon}</span>
                    <span>${display_text}</span>
                </div>
            `).show();
        }
    });
}

function calculate_end_date(frm) {
    let start = frm.doc.proposed_start_date || frm.doc.start_date;
    let tenure = parseInt(frm.doc.initial_tenure_value || 0);
    let unit = (frm.doc.tenure_unit || "Months").toLowerCase();

    if (start && tenure > 0) {
        let calculated_end;
        if (unit.includes("month")) {
            calculated_end = frappe.datetime.add_months(start, tenure);
        } else if (unit.includes("year")) {
            calculated_end = frappe.datetime.add_months(start, tenure * 12);
        } else if (unit.includes("week")) {
            calculated_end = frappe.datetime.add_days(start, tenure * 7);
        } else {
            calculated_end = frappe.datetime.add_days(start, tenure);
        }
        frm.set_value("proposed_end_date", calculated_end);
        frm.set_value("end_date", calculated_end);
        calculate_total_contract_value(frm);
    }
}

function update_tenure_string(frm) {
    if (frm.doc.initial_tenure_value) {
        let str = `${frm.doc.initial_tenure_value} ${frm.doc.tenure_unit || "Months"}`;
        frm.set_value("contract_tenure", str);
    }
}

function calculate_total_contract_value(frm) {
    let comp = parseFloat(frm.doc.compensation_amount || frm.doc.proposed_fee || 0);
    let tenure = parseInt(frm.doc.initial_tenure_value || 0);
    let unit = (frm.doc.tenure_unit || "Months").toLowerCase();
    let comp_type = (frm.doc.compensation_type || "").toLowerCase();

    if (comp > 0) {
        if (comp_type.includes("month") && unit.includes("month") && tenure > 0) {
            frm.set_value("total_contract_value", comp * tenure);
        } else {
            frm.set_value("total_contract_value", comp);
        }
    }
}

function calculate_total_allocation(frm) {
    let total = 0.0;
    (frm.doc.project_allocations || []).forEach(row => {
        total += parseFloat(row.allocation_percent || 0);
    });
    frm.set_value("total_allocation_percent", total);

    if (total > 100) {
        frappe.show_alert({
            message: __(`Warning: Total allocation is ${total}%, exceeding 100%!`),
            indicator: "orange"
        }, 5);
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

// ==============================================================================
// 5. Strict PDF Only Attachment Validator
// ==============================================================================
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
