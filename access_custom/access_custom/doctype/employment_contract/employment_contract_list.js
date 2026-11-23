// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

// Helper to add clean circular (x) clear button, instant dropdown on click, and proper width to Link filters
function setup_company_filter_clear(listview, fieldname, placeholder_label) {
    if (!listview || !listview.page || !listview.page.fields_dict) return;
    let field = listview.page.fields_dict[fieldname];
    if (!field || !field.$input) return;

    let $wrapper = field.$wrapper || field.$input.parent();
    if ($wrapper) {
        $wrapper.css({
            "position": "relative",
            "min-width": "260px"
        });
    }
    field.$input.css({
        "min-width": "260px",
        "padding-right": "32px",
        "text-overflow": "ellipsis",
        "cursor": "pointer"
    });

    function open_dropdown_instantly() {
        let doctype = (field.get_options && field.get_options()) || "Company";
        if (field.$input.cache && field.$input.cache[doctype] && field.$input.cache[doctype][""]) {
            if (field.awesomplete) {
                field.awesomplete.list = field.$input.cache[doctype][""];
            }
        }
        field.$input.trigger("input");
        setTimeout(function() {
            if (field.awesomplete) {
                field.awesomplete.evaluate();
            }
        }, 30);
    }

    field.$input.off("click.instant_open focus.instant_open")
        .on("click.instant_open focus.instant_open", function() {
            open_dropdown_instantly();
        });

    function do_clear_filter() {
        field.set_value("");
        field.$input.val("").trigger("change");
        if (window.history && window.history.replaceState) {
            let url = new URL(window.location.href);
            url.searchParams.delete(fieldname);
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""));
        }
        if (frappe.route_options && frappe.route_options[fieldname]) {
            delete frappe.route_options[fieldname];
        }
        if (listview.filter_area) {
            listview.filter_area.remove(fieldname);
        }
        listview.refresh();
        if (field.awesomplete) {
            field.awesomplete.close();
        }
        field.$input.blur();
    }

    if ($wrapper) {
        $wrapper.find(".link-field-clear-btn").remove();
        let $clear_btn = $(`
            <div class="link-field-clear-btn" title="Clear filter" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; line-height: 18px; text-align: center; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 14px; font-weight: bold; cursor: pointer; display: none; align-items: center; justify-content: center; z-index: 10; transition: all 0.15s ease;">&times;</div>
        `);

        $clear_btn.on("mousedown click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            do_clear_filter();
            $clear_btn.hide();
        });

        $clear_btn.hover(
            function() { $(this).css({ "background": "#ef4444", "color": "#ffffff" }); },
            function() { $(this).css({ "background": "#e2e8f0", "color": "#475569" }); }
        );

        $wrapper.append($clear_btn);

        function toggle_clear_btn() {
            let val = field.get_value() || field.$input.val();
            if (val) {
                $clear_btn.css("display", "flex");
                field.$input.css("padding-right", "32px");
            } else {
                $clear_btn.hide();
                field.$input.css("padding-right", "");
            }
        }

        field.$input.off("input.clear_btn change.clear_btn blur.clear_btn")
            .on("input.clear_btn change.clear_btn blur.clear_btn", toggle_clear_btn);
        toggle_clear_btn();
    }
}

// Status Resolution Helper
function resolve_employment_contract_display_status(doc) {
    if (!doc) return { label: "Draft", color: "gray", raw: "Draft" };

    const wf = doc.workflow_state || "";
    const st = doc.status || "";

    if (wf === "Terminated" || st === "Terminated") {
        return { label: "Terminated", color: "red", raw: "Terminated" };
    }
    if (wf === "Expired" || st === "Expired") {
        return { label: "Expired", color: "red", raw: "Expired" };
    }
    if (wf === "Rejected" || st === "Rejected") {
        return { label: "Rejected", color: "red", raw: "Rejected" };
    }
    if (wf === "Active" || st === "Active") {
        return { label: "Active", color: "green", raw: "Active" };
    }
    if (wf === "Signed by Employee" || st === "Signed by Employee") {
        return { label: "Signed by Employee", color: "yellow", raw: "Signed by Employee" };
    }
    if (wf === "Awaiting Employee Signature" || st === "Awaiting Employee Signature") {
        return { label: "Awaiting Signature", color: "purple", raw: "Awaiting Employee Signature" };
    }
    if (wf === "Approved for Issuance" || st === "Approved for Issuance") {
        return { label: "Approved for Issuance", color: "cyan", raw: "Approved for Issuance" };
    }
    if (wf === "Contract Issued" || st === "Contract Issued") {
        return { label: "Contract Issued", color: "cyan", raw: "Contract Issued" };
    }
    if (wf === "Pending Final HR Review" || st === "Pending Final HR Review") {
        return { label: "Pending Final HR Review", color: "orange", raw: "Pending Final HR Review" };
    }
    if (wf === "CEO Approved" || st === "CEO Approved") {
        return { label: "CEO Approved", color: "blue", raw: "CEO Approved" };
    }
    if (wf === "Pending CEO Approval" || st === "Pending CEO Approval") {
        return { label: "Pending CEO Approval", color: "purple", raw: "Pending CEO Approval" };
    }
    if (wf === "Pending HR Review" || st === "Pending HR Review") {
        return { label: "Pending HR Review", color: "orange", raw: "Pending HR Review" };
    }
    if (wf === "Pending Team Lead Approval" || st === "Pending Team Lead Approval") {
        return { label: "Pending Team Lead Approval", color: "orange", raw: "Pending Team Lead Approval" };
    }
    if (wf === "Returned for Revision" || st === "Returned for Revision" || wf.includes("Returned") || st.includes("Returned")) {
        return { label: "Returned for Revision", color: "orange", raw: "Returned for Revision" };
    }
    if (wf === "Draft" || st === "Draft") {
        return { label: "Draft", color: "gray", raw: "Draft" };
    }

    let fallback = wf || st || "Draft";
    return { label: fallback, color: "blue", raw: fallback };
}

// Custom CSS for Employment Contract List View (Matching Consultant Contract UI)
const custom_employment_list_css = `
body:has([data-page-route*="employment"]) .container,
body:has([data-page-route*="Employment"]) .container,
.employment-contract-custom-list-view .container,
.employment-contract-custom-list-view.page-container .container,
[data-page-route*="Employment Contract"] .container,
[data-page-route*="employment_contract"] .container,
[data-page-route*="employment-contract"] .container {
    width: 96% !important;
    max-width: 96% !important;
}

.employment-contract-custom-list-view .page-head {
    width: 100% !important;
    max-width: 100% !important;
}

.employment-contract-custom-list-view .list-row,
.employment-contract-custom-list-view .list-row-col {
    font-size: 12px !important;
}

.employment-contract-custom-list-view .list-row-head,
.employment-contract-custom-list-view .list-row-head span {
    font-size: 11px !important;
}

[data-page-route*="Employment Contract"] .list-row .level-left,
[data-page-route*="Employment Contract"] .list-row-head .list-header-subject,
[data-page-route*="employment_contract"] .list-row .level-left,
[data-page-route*="employment_contract"] .list-row-head .list-header-subject,
[data-page-route*="employment-contract"] .list-row .level-left,
[data-page-route*="employment-contract"] .list-row-head .list-header-subject,
.employment-contract-custom-list-view .list-row .level-left,
.employment-contract-custom-list-view .list-row-head .list-header-subject {
    display: flex !important;
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    align-items: center !important;
    width: calc(100% - 115px) !important;
    max-width: calc(100% - 115px) !important;
    min-width: 0 !important;
    margin-right: 8px !important;
    overflow: hidden !important;
}

[data-page-route*="Employment Contract"] .list-row .level-right,
[data-page-route*="Employment Contract"] .list-row-head .level-right,
[data-page-route*="employment_contract"] .list-row .level-right,
[data-page-route*="employment_contract"] .list-row-head .level-right,
[data-page-route*="employment-contract"] .list-row .level-right,
[data-page-route*="employment-contract"] .list-row-head .level-right,
.employment-contract-custom-list-view .list-row .level-right,
.employment-contract-custom-list-view .list-row-head .level-right {
    flex: 0 0 105px !important;
    flex-shrink: 0 !important;
    min-width: 100px !important;
    max-width: 115px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 6px !important;
    font-size: 11.5px !important;
}

[data-page-route*="Employment Contract"] .checkbox-actions,
[data-page-route*="employment_contract"] .checkbox-actions,
[data-page-route*="employment-contract"] .checkbox-actions,
.employment-contract-custom-list-view .checkbox-actions {
    display: none !important;
}

/* 1. Contract ID */
.col-contract-id,
.list-row-col.col-contract-id,
.list-subject.col-contract-id {
    flex: 0 0 155px !important;
    width: 155px !important;
    min-width: 150px !important;
    max-width: 165px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 6px !important;
    margin-right: 14px !important;
    font-size: 12px !important;
}

.col-contract-id a {
    font-size: 12px !important;
    font-weight: 600 !important;
}

/* 2. Employee Name */
.col-employee-name,
.list-row-col.col-employee-name {
    flex: 0 0 140px !important;
    width: 140px !important;
    min-width: 130px !important;
    max-width: 150px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 0px !important;
    margin-right: 14px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 12px !important;
}

.col-employee-name a,
.col-employee-name span {
    font-size: 12px !important;
    color: #334155 !important;
}

/* 3. Organization */
.col-organization,
.list-row-col.col-organization {
    flex: 1 1 200px !important;
    min-width: 180px !important;
    max-width: 340px !important;
    flex-shrink: 1 !important;
    flex-grow: 1 !important;
    padding-right: 0px !important;
    margin-right: 14px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 12px !important;
}

.col-organization span {
    font-size: 12px !important;
    color: #475569 !important;
}

/* 4. Project Name */
.col-project-name,
.list-row-col.col-project-name {
    flex: 1 1 120px !important;
    min-width: 100px !important;
    max-width: 220px !important;
    flex-shrink: 1 !important;
    flex-grow: 1 !important;
    text-align: left !important;
    padding-right: 0px !important;
    margin-right: 14px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 12px !important;
}

.col-project-name span,
.col-project-name a {
    max-width: 100% !important;
    display: inline !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: 12px !important;
}

/* 5. Type of Contract / Engagement Type */
.col-contract-type,
.list-row-col.col-contract-type {
    flex: 0 0 110px !important;
    width: 110px !important;
    min-width: 100px !important;
    max-width: 120px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: left !important;
    padding: 0 !important;
    margin-right: 14px !important;
    white-space: nowrap !important;
    font-size: 12px !important;
}

.col-contract-type span {
    font-size: 12px !important;
    color: #475569 !important;
}

/* 6. Status */
.col-status,
.list-row-col.col-status {
    flex: 0 0 185px !important;
    width: 185px !important;
    min-width: 185px !important;
    max-width: 185px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: left !important;
    padding-left: 0px !important;
    margin-right: 10px !important;
    display: flex !important;
    justify-content: flex-start !important;
    align-items: center !important;
    overflow: visible !important;
    text-overflow: clip !important;
}

/* Status Pill Styling */
.custom-status-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 2.5px 8px !important;
    border-radius: 12px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    line-height: 1.3 !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
    transition: all 0.15s ease !important;
    white-space: nowrap !important;
    overflow: visible !important;
    text-overflow: clip !important;
}

.custom-status-pill span {
    white-space: nowrap !important;
    overflow: visible !important;
    text-overflow: clip !important;
    font-size: 11px !important;
}

.custom-status-pill:hover {
    filter: brightness(0.92) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 2px 5px rgba(0,0,0,0.12) !important;
}

.custom-status-pill .indicator-dot {
    width: 6px !important;
    height: 6px !important;
    border-radius: 50% !important;
    display: inline-block !important;
    flex-shrink: 0 !important;
}

/* Pill Palette */
.badge-green { background-color: #dcfce7 !important; color: #15803d !important; border: 1px solid #bbf7d0 !important; }
.badge-green .indicator-dot { background-color: #22c55e !important; }

.badge-yellow { background-color: #fef9c3 !important; color: #854d0e !important; border: 1px solid #fde047 !important; }
.badge-yellow .indicator-dot { background-color: #eab308 !important; }

.badge-orange { background-color: #ffedd5 !important; color: #9a3412 !important; border: 1px solid #fdba74 !important; }
.badge-orange .indicator-dot { background-color: #f97316 !important; }

.badge-red { background-color: #fee2e2 !important; color: #991b1b !important; border: 1px solid #fca5a5 !important; }
.badge-red .indicator-dot { background-color: #ef4444 !important; }

.badge-gray { background-color: #f3f4f6 !important; color: #374151 !important; border: 1px solid #d1d5db !important; }
.badge-gray .indicator-dot { background-color: #6b7280 !important; }

.badge-blue { background-color: #e0f2fe !important; color: #0369a1 !important; border: 1px solid #7dd3fc !important; }
.badge-blue .indicator-dot { background-color: #0ea5e9 !important; }

.badge-cyan { background-color: #ecfeff !important; color: #0e7490 !important; border: 1px solid #a5f3fc !important; }
.badge-cyan .indicator-dot { background-color: #06b6d4 !important; }

.badge-purple { background-color: #f3e8ff !important; color: #6b21a8 !important; border: 1px solid #d8b4fe !important; }
.badge-purple .indicator-dot { background-color: #a855f7 !important; }
`;

frappe.listview_settings["Employment Contract"] = {
    add_fields: ["status", "workflow_state", "employee_name", "requesting_organization", "organization", "project", "project_name", "engagement_type", "compensation_amount", "annual_ctc"],

    onload: function(listview) {
        try {
            $(document.body).addClass("full-width");
            if (listview.page && listview.page.wrapper) {
                listview.page.wrapper.closest(".page-container").find(".container").css({ "width": "96%", "max-width": "96%" });
            }
        } catch(e) {}

        setup_company_filter_clear(listview, "requesting_organization", "Organizations");
        frappe.dom.set_style(custom_employment_list_css);

        if (listview.$page) {
            listview.$page.addClass("employment-contract-custom-list-view");
        }
        if (listview.$result) {
            listview.$result.addClass("employment-contract-custom-list-view");
        }

        // Custom column ordering: Contract ID, Employee Name, Organization, Project Name, Type of Contract, Status (Last)
        listview.setup_columns = function() {
            this.columns = [];

            // 1. Contract ID
            this.columns.push({
                type: "Subject",
                custom_class: "col-contract-id",
                df: {
                    label: __("Contract ID"),
                    fieldname: "name",
                    fieldtype: "Link"
                }
            });

            // 2. Employee Name
            this.columns.push({
                type: "Field",
                custom_class: "col-employee-name",
                df: frappe.meta.get_docfield("Employment Contract", "employee_name") || {
                    label: __("Employee Name"),
                    fieldname: "employee_name"
                }
            });

            // 3. Organization
            this.columns.push({
                type: "Field",
                custom_class: "col-organization",
                df: frappe.meta.get_docfield("Employment Contract", "requesting_organization") || {
                    label: __("Organization"),
                    fieldname: "requesting_organization"
                }
            });

            // 4. Project Name
            this.columns.push({
                type: "Field",
                custom_class: "col-project-name",
                df: frappe.meta.get_docfield("Employment Contract", "project") || {
                    label: __("Project Name"),
                    fieldname: "project"
                }
            });

            // 5. Type of Contract
            this.columns.push({
                type: "Field",
                custom_class: "col-contract-type",
                df: frappe.meta.get_docfield("Employment Contract", "engagement_type") || {
                    label: __("Contract Type"),
                    fieldname: "engagement_type"
                }
            });

            // 6. Status (Last Column)
            this.columns.push({
                type: "Status",
                custom_class: "col-status"
            });
        };

        listview.get_header_html = function() {
            return `
                <header class="level list-row-head text-muted">
                    <div class="level-left list-header-subject" style="display: flex !important; flex: 1 1 auto !important; align-items: center !important; width: calc(100% - 115px) !important; max-width: calc(100% - 115px) !important; min-width: 0 !important; margin-right: 8px !important; overflow: hidden !important;">
                        <!-- 1. Contract ID -->
                        <div class="list-row-col list-subject level col-contract-id" style="flex: 0 0 155px !important; width: 155px !important; min-width: 150px !important; max-width: 165px !important; padding-right: 6px !important; margin-right: 14px !important; display: flex !important; align-items: center !important;">
                            <input class="level-item list-check-all" type="checkbox" title="${__("Select All")}" style="margin-right: 8px !important;">
                            <span class="level-item" data-sort-by="name" title="${__("Click to sort by Contract ID")}" style="font-weight: 600; cursor: pointer; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Contract ID")}
                            </span>
                        </div>
                        <!-- 2. Employee Name -->
                        <div class="list-row-col hidden-xs col-employee-name" style="flex: 0 0 140px !important; width: 140px !important; min-width: 130px !important; max-width: 150px !important; padding-right: 0px !important; margin-right: 14px !important;">
                            <span data-sort-by="employee_name" title="${__("Click to sort by Employee Name")}" style="font-weight: 600; cursor: pointer; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Employee Name")}
                            </span>
                        </div>
                        <!-- 3. Organization -->
                        <div class="list-row-col hidden-xs col-organization" style="flex: 1 1 200px !important; min-width: 180px !important; max-width: 340px !important; padding-right: 0px !important; margin-right: 14px !important;">
                            <span data-sort-by="requesting_organization" title="${__("Click to sort by Organization")}" style="font-weight: 600; cursor: pointer; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Organization")}
                            </span>
                        </div>
                        <!-- 4. Project Name -->
                        <div class="list-row-col hidden-xs col-project-name" style="flex: 1 1 120px !important; min-width: 100px !important; max-width: 220px !important; text-align: left !important; padding-right: 0px !important; margin-right: 14px !important;">
                            <span data-sort-by="project" title="${__("Click to sort by Project")}" style="font-weight: 600; cursor: pointer; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Project")}
                            </span>
                        </div>
                        <!-- 5. Type of Contract -->
                        <div class="list-row-col hidden-xs col-contract-type text-left" style="flex: 0 0 110px !important; width: 110px !important; min-width: 100px !important; max-width: 120px !important; text-align: left !important; padding: 0 !important; margin-right: 14px !important;">
                            <span data-sort-by="engagement_type" title="${__("Click to sort by Engagement Type")}" style="font-weight: 600; cursor: pointer; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Contract Type")}
                            </span>
                        </div>
                        <!-- 6. Status (Last) -->
                        <div class="list-row-col hidden-xs col-status text-left" style="flex: 0 0 185px !important; width: 185px !important; min-width: 185px !important; max-width: 185px !important; text-align: left !important; padding-left: 0px !important; margin-right: 10px !important;">
                            <span style="font-weight: 600; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.3px !important; color: #64748b !important;">
                                ${__("Status")}
                            </span>
                        </div>
                    </div>
                    <div class="level-right" style="flex: 0 0 105px !important; min-width: 100px !important; max-width: 115px !important; display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 6px !important;">
                        <span class="list-count"></span>
                        <span class="level-item list-liked-by-me">
                            <span class="likes-count"></span>
                        </span>
                    </div>
                </header>
            `;
        };

        listview.get_list_row_html_skeleton = function(left = "", right = "") {
            return `
                <div class="list-row-container" tabindex="1">
                    <div class="level list-row">
                        <div class="level-left" style="display: flex !important; flex: 1 1 auto !important; align-items: center !important; width: calc(100% - 115px) !important; max-width: calc(100% - 115px) !important; min-width: 0 !important; margin-right: 8px !important; overflow: hidden !important;">
                            ${left}
                        </div>
                        <div class="level-right text-muted" style="flex: 0 0 105px !important; min-width: 100px !important; max-width: 115px !important; display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 6px !important; font-size: 11.5px !important;">
                            ${right}
                        </div>
                    </div>
                    <div class="list-row-border"></div>
                </div>
            `;
        };

        listview.get_column_html = function(col, doc) {
            const custom_cls = col.custom_class || "";

            // 6. Status - accurate pill
            if (col.type === "Status" || custom_cls === "col-status") {
                let info = resolve_employment_contract_display_status(doc);
                return `
                    <div class="list-row-col hidden-xs col-status text-left" style="flex: 0 0 185px !important; width: 185px !important; min-width: 185px !important; max-width: 185px !important; text-align: left !important; padding-left: 0px !important; margin-right: 10px !important; display: flex !important; justify-content: flex-start !important; align-items: center !important; overflow: visible !important; text-overflow: clip !important;">
                        <span class="custom-status-pill badge-${info.color}"
                              onclick="frappe.set_route('Form', 'Employment Contract', '${doc.name}');"
                              title="${__('Status: ' + info.label)}">
                            <span class="indicator-dot"></span>
                            <span>${__(info.label)}</span>
                        </span>
                    </div>
                `;
            }

            // 1. Contract ID (Subject Column with Checkbox)
            if (col.type === "Subject" || col.custom_class === "col-contract-id") {
                return `
                    <div class="list-row-col list-subject level col-contract-id" style="flex: 0 0 155px !important; width: 155px !important; min-width: 150px !important; max-width: 165px !important; padding-right: 6px !important; margin-right: 14px !important; display: flex !important; align-items: center !important;">
                        <input class="level-item list-row-checkbox" type="checkbox" data-name="${frappe.utils.escape_html(doc.name)}" onclick="event.stopPropagation();" style="margin-right: 8px !important; flex-shrink: 0 !important;">
                        <span class="level-item ellipsis" style="font-weight: 600; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important;" title="${frappe.utils.escape_html(doc.name)}">
                            <a class="grey font-weight-bold" href="/app/employment-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(doc.name)}" style="font-size: 12px !important; color: #1e293b !important;">
                                ${frappe.utils.escape_html(doc.name)}
                            </a>
                        </span>
                    </div>
                `;
            }

            const df = col.df || {};
            const fieldname = df.fieldname;
            const value = doc[fieldname] || "";

            // 2. Employee Name
            if (fieldname === "employee_name" || col.custom_class === "col-employee-name") {
                return `
                    <div class="list-row-col hidden-xs col-employee-name" style="flex: 0 0 140px !important; width: 140px !important; min-width: 130px !important; max-width: 150px !important; padding-right: 0px !important; margin-right: 14px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important;">
                        <a class="grey font-weight-500" href="/app/employment-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(value)}" style="font-size: 12px !important; color: #334155 !important;">
                            ${frappe.utils.escape_html(value || "-")}
                        </a>
                    </div>
                `;
            }

            // 3. Organization
            if (fieldname === "requesting_organization" || fieldname === "organization" || col.custom_class === "col-organization") {
                let org_val = doc.requesting_organization || doc.organization || "-";
                return `
                    <div class="list-row-col hidden-xs col-organization" style="flex: 1 1 200px !important; min-width: 180px !important; max-width: 340px !important; padding-right: 0px !important; margin-right: 14px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important;">
                        <span title="${frappe.utils.escape_html(org_val)}" style="font-size: 12px !important; color: #475569 !important;">${frappe.utils.escape_html(org_val)}</span>
                    </div>
                `;
            }

            // 4. Project Name
            if (fieldname === "project" || fieldname === "project_name" || col.custom_class === "col-project-name") {
                let proj_val = doc.project || doc.project_name || "-";
                return `
                    <div class="list-row-col hidden-xs col-project-name" style="flex: 1 1 120px !important; min-width: 100px !important; max-width: 220px !important; text-align: left !important; padding-right: 0px !important; margin-right: 14px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important;">
                        <span title="${frappe.utils.escape_html(proj_val)}" style="font-size: 12px !important; color: #475569 !important;">${frappe.utils.escape_html(proj_val)}</span>
                    </div>
                `;
            }

            // 5. Contract Type
            if (fieldname === "engagement_type" || col.custom_class === "col-contract-type") {
                return `
                    <div class="list-row-col hidden-xs col-contract-type text-left" style="flex: 0 0 110px !important; width: 110px !important; min-width: 100px !important; max-width: 120px !important; text-align: left !important; padding: 0 !important; margin-right: 14px !important; white-space: nowrap !important; font-size: 12px !important;">
                        <span style="font-size: 12px !important; color: #475569 !important;">${frappe.utils.escape_html(value || "-")}</span>
                    </div>
                `;
            }

            return `
                <div class="list-row-col hidden-xs ellipsis" style="flex: 1 1 100px !important;">
                    <span style="font-size: 12px !important;">${frappe.utils.escape_html(value || "-")}</span>
                </div>
            `;
        };

        listview.setup_columns();
        if (listview.render_header) {
            listview.render_header(true);
        }
        listview.render();
    },

    refresh: function(listview) {
        frappe.dom.set_style(custom_employment_list_css);
        if (listview.$page) {
            listview.$page.addClass("employment-contract-custom-list-view");
        }
        if (listview.$result) {
            listview.$result.addClass("employment-contract-custom-list-view");
        }
        if (listview.setup_columns) {
            listview.setup_columns();
        }
        if (listview.render_header) {
            listview.render_header(true);
        }
    },

    get_indicator: function(doc) {
        let info = resolve_employment_contract_display_status(doc);
        return [__(info.label), info.color, "status,=," + info.raw];
    }
};
