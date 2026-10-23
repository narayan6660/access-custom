// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

// Global Status Direct Route Handler for Consultant Contract
window.open_consultant_contract_status_doc = function(contract_name, raw_status, e, target_doctype, target_docname) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) {
            e.stopImmediatePropagation();
        }
    }

    if (!contract_name) return false;

    // 1. Direct route if exact document is known from lifecycle cache
    if (target_doctype && target_docname) {
        frappe.set_route("Form", target_doctype, target_docname);
        return false;
    }

    if (cur_list && cur_list.lifecycle_cache && cur_list.lifecycle_cache[contract_name]) {
        let info = cur_list.lifecycle_cache[contract_name];
        if (info.docname && info.doctype) {
            frappe.set_route("Form", info.doctype, info.docname);
            return false;
        }
    }

    // 2. Fallback query based on status label
    if (raw_status === "Terminated" || (raw_status && raw_status.includes("Termination"))) {
        frappe.db.get_list("Consultant Contract Termination", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Consultant Contract Termination", r[0].name);
            } else {
                frappe.set_route("Form", "Consultant Contract", contract_name);
            }
        });
    } else if (raw_status && raw_status.includes("Extension")) {
        frappe.db.get_list("Consultant Contract Extension", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Consultant Contract Extension", r[0].name);
            } else {
                frappe.set_route("Form", "Consultant Contract", contract_name);
            }
        });
    } else if (raw_status && raw_status.includes("Amendment")) {
        frappe.db.get_list("Consultant Contract Amendment", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Consultant Contract Amendment", r[0].name);
            } else {
                frappe.set_route("Form", "Consultant Contract", contract_name);
            }
        });
    } else {
        frappe.set_route("Form", "Consultant Contract", contract_name);
    }
    return false;
};

// Lifecycle Status Resolution Helper
function resolve_consultant_contract_display_status(doc, listview) {
    if (!doc) return { label: "Draft", color: "blue", doctype: "Consultant Contract", docname: "", raw: "Draft" };

    // 1. Cached in-flight lifecycle state (Amendment, Extension, Termination)
    if (listview && listview.lifecycle_cache && listview.lifecycle_cache[doc.name]) {
        return listview.lifecycle_cache[doc.name];
    }

    const wf = doc.workflow_state || "";
    const st = doc.status || "";

    // 2. Terminal & Completed States
    if (wf === "Terminated" || st === "Terminated") {
        return { label: "Terminated", color: "red", doctype: "Consultant Contract Termination", docname: "", raw: "Terminated" };
    }
    if (wf === "Expired" || st === "Expired") {
        return { label: "Expired", color: "red", doctype: "Consultant Contract", docname: "", raw: "Expired" };
    }
    if (wf === "Rejected" || st === "Rejected") {
        return { label: "Rejected", color: "red", doctype: "Consultant Contract", docname: "", raw: "Rejected" };
    }
    if (wf === "Active" || st === "Active") {
        return { label: "Active", color: "green", doctype: "Consultant Contract", docname: "", raw: "Active" };
    }
    if (wf === "Signed by Consultant" || st === "Signed by Consultant") {
        return { label: "Signed by Consultant", color: "yellow", doctype: "Consultant Contract", docname: "", raw: "Signed by Consultant" };
    }
    if (wf === "Contract Issued" || st === "Contract Issued") {
        return { label: "Contract Issued", color: "cyan", doctype: "Consultant Contract", docname: "", raw: "Contract Issued" };
    }
    if (wf === "Pending Final HR Review" || st === "Pending Final HR Review") {
        return { label: "Pending Final HR Review", color: "orange", doctype: "Consultant Contract", docname: "", raw: "Pending Final HR Review" };
    }
    if (wf === "CEO Approved" || st === "CEO Approved") {
        return { label: "CEO Approved", color: "blue", doctype: "Consultant Contract", docname: "", raw: "CEO Approved" };
    }
    if (wf === "Pending CEO Approval" || st === "Pending CEO Approval") {
        return { label: "Pending CEO Approval", color: "purple", doctype: "Consultant Contract", docname: "", raw: "Pending CEO Approval" };
    }
    if (wf === "Pending HR Review" || st === "Pending HR Review") {
        return { label: "Pending HR Review", color: "orange", doctype: "Consultant Contract", docname: "", raw: "Pending HR Review" };
    }
    if (wf === "Pending Team Lead Approval" || st === "Pending Team Lead Approval") {
        return { label: "Pending Team Lead Approval", color: "orange", doctype: "Consultant Contract", docname: "", raw: "Pending Team Lead Approval" };
    }
    if (wf === "Returned for Revision" || st === "Returned for Revision") {
        return { label: "Returned for Revision", color: "orange", doctype: "Consultant Contract", docname: "", raw: "Returned for Revision" };
    }
    if (wf === "Draft" || st === "Draft") {
        return { label: "Draft", color: "blue", doctype: "Consultant Contract", docname: "", raw: "Draft" };
    }

    let fallback_label = wf || st || "Draft";
    return { label: fallback_label, color: "gray", doctype: "Consultant Contract", docname: "", raw: fallback_label };
}

// Background Batch Fetcher for in-flight lifecycle sub-documents
function sync_active_consultant_lifecycle_cache(listview) {
    if (!listview || !listview.data || !listview.data.length) return;

    let contract_names = listview.data.map(d => d.name).filter(Boolean);
    if (!contract_names.length) return;

    if (!listview.lifecycle_cache) {
        listview.lifecycle_cache = {};
    }

    Promise.all([
        // 1. In-flight Terminations
        frappe.db.get_list("Consultant Contract Termination", {
            filters: { contract: ["in", contract_names], docstatus: ["!=", 2] },
            fields: ["name", "contract", "workflow_state", "docstatus", "creation"],
            order_by: "creation desc",
            limit: 100
        }),
        // 2. In-flight Amendments (docstatus: 0)
        frappe.db.get_list("Consultant Contract Amendment", {
            filters: { contract: ["in", contract_names], docstatus: 0 },
            fields: ["name", "contract", "workflow_state", "creation"],
            order_by: "creation desc",
            limit: 100
        }),
        // 3. In-flight Extensions (docstatus: 0)
        frappe.db.get_list("Consultant Contract Extension", {
            filters: { contract: ["in", contract_names], docstatus: 0 },
            fields: ["name", "contract", "workflow_state", "creation"],
            order_by: "creation desc",
            limit: 100
        })
    ]).then(([terms, amends, exts]) => {
        let updated = false;

        // Process Terminations
        (terms || []).forEach(t => {
            if (t.contract && !listview.lifecycle_cache[t.contract]) {
                let is_term = (t.docstatus === 1 || t.workflow_state === "Terminated");
                listview.lifecycle_cache[t.contract] = {
                    label: is_term ? "Terminated" : "Under Termination Process",
                    color: "red",
                    doctype: "Consultant Contract Termination",
                    docname: t.name,
                    raw: is_term ? "Terminated" : "Under Termination Process"
                };
                updated = true;
            }
        });

        // Process Amendments
        (amends || []).forEach(a => {
            if (a.contract && !listview.lifecycle_cache[a.contract]) {
                listview.lifecycle_cache[a.contract] = {
                    label: "Under Amendment Process",
                    color: "yellow",
                    doctype: "Consultant Contract Amendment",
                    docname: a.name,
                    raw: "Under Amendment Process"
                };
                updated = true;
            }
        });

        // Process Extensions
        (exts || []).forEach(e => {
            if (e.contract && !listview.lifecycle_cache[e.contract]) {
                listview.lifecycle_cache[e.contract] = {
                    label: "Under Extension Process",
                    color: "orange",
                    doctype: "Consultant Contract Extension",
                    docname: e.name,
                    raw: "Under Extension Process"
                };
                updated = true;
            }
        });

        // Update DOM rows with live accurate pills and routing
        if (listview.$result) {
            contract_names.forEach(cname => {
                let info = listview.lifecycle_cache[cname];
                if (info) {
                    let $row = listview.$result.find(`.list-row-container:has([data-name="${frappe.utils.escape_html(cname)}"])`);
                    if (!$row.length) {
                        $row = listview.$result.find(`.list-row-container:has(a[href*="${encodeURIComponent(cname)}"])`);
                    }
                    if (!$row.length) {
                        $row = listview.$result.find(`.list-row-container:has(a:contains("${cname}"))`);
                    }
                    let $pill = $row.find(".col-status .custom-status-pill");
                    if ($pill.length) {
                        $pill.attr("class", `custom-status-pill badge-${info.color}`);
                        $pill.attr("title", `Click to open: ${info.label}`);
                        $pill.find("span:last").text(info.label);
                        $pill.off("click").on("click", function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                            if (info.docname) {
                                frappe.set_route("Form", info.doctype, info.docname);
                            } else {
                                frappe.set_route("Form", info.doctype, cname);
                            }
                        });
                    }
                }
            });
        }
    }).catch(err => {
        console.error("Error in sync_active_consultant_lifecycle_cache:", err);
    });
}

// Custom CSS for Consultant Contract List View (Matching Customer Contract UI)
const custom_consultant_list_css = `
/* Layout alignment for Consultant Contract List View */
[data-page-route*="Consultant Contract"] .list-row,
[data-page-route*="Consultant Contract"] .list-row-head,
[data-page-route*="consultant_contract"] .list-row,
[data-page-route*="consultant_contract"] .list-row-head,
[data-page-route*="consultant-contract"] .list-row,
[data-page-route*="consultant-contract"] .list-row-head,
.consultant-contract-custom-list-view .list-row,
.consultant-contract-custom-list-view .list-row-head {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    width: 100% !important;
    max-width: 100% !important;
}

[data-page-route*="Consultant Contract"] .list-row .level-left,
[data-page-route*="Consultant Contract"] .list-row-head .list-header-subject,
[data-page-route*="consultant_contract"] .list-row .level-left,
[data-page-route*="consultant_contract"] .list-row-head .list-header-subject,
[data-page-route*="consultant-contract"] .list-row .level-left,
[data-page-route*="consultant-contract"] .list-row-head .list-header-subject,
.consultant-contract-custom-list-view .list-row .level-left,
.consultant-contract-custom-list-view .list-row-head .list-header-subject {
    display: flex !important;
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    align-items: center !important;
    width: calc(100% - 90px) !important;
    max-width: calc(100% - 90px) !important;
    min-width: 0 !important;
    margin-right: 10px !important;
    overflow: hidden !important;
}

[data-page-route*="Consultant Contract"] .list-row .level-right,
[data-page-route*="Consultant Contract"] .list-row-head .level-right,
[data-page-route*="consultant_contract"] .list-row .level-right,
[data-page-route*="consultant_contract"] .list-row-head .level-right,
[data-page-route*="consultant-contract"] .list-row .level-right,
[data-page-route*="consultant-contract"] .list-row-head .level-right,
.consultant-contract-custom-list-view .list-row .level-right,
.consultant-contract-custom-list-view .list-row-head .level-right {
    flex: 0 0 80px !important;
    flex-shrink: 0 !important;
    min-width: 75px !important;
    max-width: 85px !important;
    justify-content: flex-end !important;
}

/* 1. Contract ID (160px) */
.col-contract-id,
.list-row-col.col-contract-id,
.list-subject.col-contract-id {
    flex: 0 0 160px !important;
    width: 160px !important;
    min-width: 160px !important;
    max-width: 160px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 8px !important;
}

/* 2. Consultant Name (150px) */
.col-consultant-name,
.list-row-col.col-consultant-name {
    flex: 0 0 150px !important;
    width: 150px !important;
    min-width: 150px !important;
    max-width: 150px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 10px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

/* 3. Organization (160px) */
.col-organization,
.list-row-col.col-organization {
    flex: 0 0 160px !important;
    width: 160px !important;
    min-width: 160px !important;
    max-width: 160px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 10px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

/* 4. Project Name (Fluid expands to fill middle) */
.col-project-name,
.list-row-col.col-project-name {
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    min-width: 160px !important;
    width: auto !important;
    max-width: none !important;
    padding-right: 15px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

/* 5. Type of Contract (120px) */
.col-contract-type,
.list-row-col.col-contract-type {
    flex: 0 0 120px !important;
    width: 120px !important;
    min-width: 120px !important;
    max-width: 120px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: center !important;
    padding: 0 6px !important;
    white-space: nowrap !important;
}

/* 6. Status (170px) - Last Column */
.col-status,
.list-row-col.col-status {
    flex: 0 0 170px !important;
    width: 170px !important;
    min-width: 170px !important;
    max-width: 170px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: center !important;
    overflow: visible !important;
    text-overflow: clip !important;
}

/* Status Pill Styling */
.custom-status-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 4px 12px !important;
    border-radius: 12px !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    line-height: 1.35 !important;
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

/* Star bookmark styling */
.like-action svg, .list-row-like svg, .list-liked-by-me svg, [data-action="like"] svg, .liked svg {
    display: none !important;
}
.like-action, .list-row-like, .list-liked-by-me, [data-action="like"] {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    text-decoration: none !important;
    color: #9ca3af !important;
    fill: none !important;
}
.like-action::before, .list-row-like .like-action::before, .list-liked-by-me::before, [data-action="like"]::before {
    content: "☆" !important;
    font-size: 16px !important;
    color: #9ca3af !important;
    display: inline-block !important;
    transition: all 0.15s ease !important;
    line-height: 1 !important;
    font-family: Arial, sans-serif !important;
}
.like-action:hover::before, .list-liked-by-me:hover::before, [data-action="like"]:hover::before {
    color: #f59e0b !important;
    transform: scale(1.2) !important;
}
.like-action.liked::before, .list-row-like .like-action.liked::before, .list-liked-by-me.active::before, [data-action="like"].liked::before, .liked::before {
    content: "★" !important;
    color: #f59e0b !important;
    font-size: 16px !important;
    text-shadow: 0 0 4px rgba(245, 158, 11, 0.45) !important;
}
.like-action.liked, .liked {
    color: #f59e0b !important;
}
`;

function is_consultant_lifecycle_status(val) {
    if (!val) return false;
    const lifecycle_statuses = [
        "Under Extension Process",
        "Under Amendment Process",
        "Under Termination Process",
        "Terminated"
    ];
    return lifecycle_statuses.includes(val);
}

async function get_consultant_contracts_for_lifecycle_status(val) {
    try {
        if (val === "Under Extension Process") {
            let r = await frappe.db.get_list("Consultant Contract Extension", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Under Amendment Process") {
            let r = await frappe.db.get_list("Consultant Contract Amendment", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Under Termination Process") {
            let r = await frappe.db.get_list("Consultant Contract Termination", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Terminated") {
            let [terms, contracts] = await Promise.all([
                frappe.db.get_list("Consultant Contract Termination", {
                    filters: { docstatus: 1 },
                    fields: ["contract"],
                    limit: 500
                }),
                frappe.db.get_list("Consultant Contract", {
                    filters: { workflow_state: "Terminated" },
                    fields: ["name"],
                    limit: 500
                })
            ]);
            let names = (terms || []).map(x => x.contract).concat((contracts || []).map(x => x.name));
            return [...new Set(names.filter(Boolean))];
        }
    } catch (e) {
        console.error("Error resolving consultant contracts for lifecycle status:", e);
    }
    return null;
}

function setup_consultant_lifecycle_filter_interceptor(listview) {
    if (!listview || listview._has_lifecycle_interceptor) return;
    listview._has_lifecycle_interceptor = true;

    const orig_refresh = listview.refresh.bind(listview);
    const orig_get_filters = listview.get_filters_for_args.bind(listview);

    listview.get_filters_for_args = function() {
        let filters = orig_get_filters();
        if (this._lifecycle_filter_names !== null && this._lifecycle_filter_names !== undefined) {
            filters = filters.filter(f => f[1] !== "status" && f[1] !== "workflow_state");
            if (this._lifecycle_filter_names.length > 0) {
                filters.push(["Consultant Contract", "name", "in", this._lifecycle_filter_names]);
            } else {
                filters.push(["Consultant Contract", "name", "=", "__NO_MATCHING_CONTRACT__"]);
            }
        }
        return filters;
    };

    listview.refresh = async function(refresh_header = false) {
        let filters = this.filter_area ? this.filter_area.get() : [];
        let status_filter = filters.find(f => (f[1] === "status" || f[1] === "workflow_state") && f[3]);

        if (status_filter && is_consultant_lifecycle_status(status_filter[3])) {
            this._lifecycle_filter_names = await get_consultant_contracts_for_lifecycle_status(status_filter[3]);
            this.last_args = null;
        } else {
            this._lifecycle_filter_names = null;
        }

        return orig_refresh(refresh_header);
    };
}

frappe.listview_settings["Consultant Contract"] = {
    hide_name_column: true,
    add_fields: [
        "name",
        "request_id",
        "consultant_name",
        "organization",
        "project_name",
        "contract_type",
        "start_date",
        "end_date",
        "total_contract_value",
        "currency",
        "status",
        "workflow_state"
    ],

    get_indicator(doc) {
        let info = resolve_consultant_contract_display_status(doc, cur_list);
        return [__(info.label), info.color, "status,=," + doc.status];
    },

    onload(listview) {
        setup_consultant_lifecycle_filter_interceptor(listview);
        render_consultant_pipeline_cockpit(listview);
        setup_list_actions(listview);

        frappe.dom.set_style(custom_consultant_list_css);

        if (listview.$page) {
            listview.$page.addClass("consultant-contract-custom-list-view");
        }
        if (listview.$result) {
            listview.$result.addClass("consultant-contract-custom-list-view");
        }

        // Custom column ordering: Contract ID, Consultant Name, Organization, Project Name, Type of Contract, Status (Last)
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

            // 2. Consultant Name
            this.columns.push({
                type: "Field",
                custom_class: "col-consultant-name",
                df: frappe.meta.get_docfield("Consultant Contract", "consultant_name") || {
                    label: __("Consultant Name"),
                    fieldname: "consultant_name"
                }
            });

            // 3. Organization
            this.columns.push({
                type: "Field",
                custom_class: "col-organization",
                df: frappe.meta.get_docfield("Consultant Contract", "organization") || {
                    label: __("Organization"),
                    fieldname: "organization"
                }
            });

            // 4. Project Name
            this.columns.push({
                type: "Field",
                custom_class: "col-project-name",
                df: frappe.meta.get_docfield("Consultant Contract", "project_name") || {
                    label: __("Project Name"),
                    fieldname: "project_name"
                }
            });

            // 5. Type of Contract
            this.columns.push({
                type: "Field",
                custom_class: "col-contract-type",
                df: frappe.meta.get_docfield("Consultant Contract", "contract_type") || {
                    label: __("Type of Contract"),
                    fieldname: "contract_type"
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
                    <div class="level-left list-header-subject" style="display: flex !important; flex: 1 1 auto !important; align-items: center !important; width: calc(100% - 90px) !important; max-width: calc(100% - 90px) !important; min-width: 0 !important; margin-right: 10px !important; overflow: hidden !important;">
                        <!-- 1. Contract ID -->
                        <div class="list-row-col list-subject level col-contract-id" style="flex: 0 0 160px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; padding-right: 8px !important; display: flex !important; align-items: center !important;">
                            <input class="level-item list-check-all" type="checkbox" title="${__("Select All")}" style="margin-right: 8px !important;">
                            <span class="level-item" data-sort-by="name" title="${__("Click to sort by Contract ID")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Contract ID")}
                            </span>
                        </div>
                        <!-- 2. Consultant Name -->
                        <div class="list-row-col hidden-xs col-consultant-name" style="flex: 0 0 150px !important; width: 150px !important; min-width: 150px !important; max-width: 150px !important; padding-right: 10px !important;">
                            <span data-sort-by="consultant_name" title="${__("Click to sort by Consultant Name")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Consultant Name")}
                            </span>
                        </div>
                        <!-- 3. Organization -->
                        <div class="list-row-col hidden-xs col-organization" style="flex: 0 0 160px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; padding-right: 10px !important;">
                            <span data-sort-by="organization" title="${__("Click to sort by Organization")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Organization")}
                            </span>
                        </div>
                        <!-- 4. Project Name -->
                        <div class="list-row-col hidden-xs col-project-name" style="flex: 1 1 auto !important; flex-grow: 1 !important; min-width: 160px !important; width: auto !important; max-width: none !important; padding-right: 15px !important;">
                            <span data-sort-by="project_name" title="${__("Click to sort by Project Name")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Project Name")}
                            </span>
                        </div>
                        <!-- 5. Type of Contract -->
                        <div class="list-row-col hidden-xs col-contract-type text-center" style="flex: 0 0 120px !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; text-align: center !important; padding: 0 6px !important;">
                            <span data-sort-by="contract_type" title="${__("Click to sort by Type of Contract")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Type of Contract")}
                            </span>
                        </div>
                        <!-- 6. Status (Last) -->
                        <div class="list-row-col hidden-xs col-status text-center" style="flex: 0 0 170px !important; width: 170px !important; min-width: 170px !important; max-width: 170px !important; text-align: center !important;">
                            <span style="font-weight: 600;">
                                ${__("Status")}
                            </span>
                        </div>
                    </div>
                    <div class="level-right" style="flex: 0 0 80px !important; min-width: 75px !important; max-width: 85px !important; justify-content: flex-end !important;">
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
                        <div class="level-left" style="display: flex !important; flex: 1 1 auto !important; align-items: center !important; width: calc(100% - 90px) !important; max-width: calc(100% - 90px) !important; min-width: 0 !important; margin-right: 10px !important; overflow: hidden !important;">
                            ${left}
                        </div>
                        <div class="level-right text-muted" style="flex: 0 0 80px !important; min-width: 75px !important; max-width: 85px !important; justify-content: flex-end !important;">
                            ${right}
                        </div>
                    </div>
                    <div class="list-row-border"></div>
                </div>
            `;
        };

        listview.get_column_html = function(col, doc) {
            const custom_cls = col.custom_class || "";

            // 6. Status - accurately resolved with in-flight lifecycle state
            if (col.type === "Status" || col.df?.options == "Workflow State" || col.custom_class === "col-status") {
                let info = resolve_consultant_contract_display_status(doc, this);
                let target_dt = info.doctype || "Consultant Contract";
                let target_dn = info.docname || "";

                return `
                    <div class="list-row-col hidden-xs col-status text-center" style="flex: 0 0 170px !important; width: 170px !important; min-width: 170px !important; max-width: 170px !important; text-align: center !important;">
                        <span class="custom-status-pill badge-${info.color}" 
                              onclick="window.open_consultant_contract_status_doc('${doc.name}', '${info.raw}', event, '${target_dt}', '${target_dn}');"
                              title="${__('Click to open: ' + info.label)}">
                            <span class="indicator-dot"></span>
                            <span>${__(info.label)}</span>
                        </span>
                    </div>
                `;
            }

            if (col.type === "Tag") {
                const tags_display_class = !this.tags_shown ? "hide" : "";
                let tags_html = doc._user_tags
                    ? this.get_tags_html(doc._user_tags, 2, true)
                    : '<div class="tags-empty">-</div>';
                return `
                    <div class="list-row-col tag-col ${tags_display_class} hidden-xs ellipsis">
                        ${tags_html}
                    </div>
                `;
            }

            // 1. Contract ID (Subject Column with Checkbox)
            if (col.type === "Subject" || col.custom_class === "col-contract-id") {
                return `
                    <div class="list-row-col list-subject level col-contract-id" style="flex: 0 0 160px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; padding-right: 8px !important; display: flex !important; align-items: center !important;">
                        <input class="level-item list-row-checkbox" type="checkbox" data-name="${frappe.utils.escape_html(doc.name)}" onclick="event.stopPropagation();" style="margin-right: 8px !important; flex-shrink: 0 !important;">
                        <span class="level-item ellipsis" style="font-weight: 600; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;" title="${frappe.utils.escape_html(doc.name)}">
                            <a class="grey font-weight-bold" href="/app/consultant-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(doc.name)}">
                                ${frappe.utils.escape_html(doc.name)}
                            </a>
                        </span>
                    </div>
                `;
            }

            const df = col.df || {};
            const fieldname = df.fieldname;
            const value = doc[fieldname] || "";

            // 2. Consultant Name
            if (fieldname === "consultant_name" || col.custom_class === "col-consultant-name") {
                return `
                    <div class="list-row-col hidden-xs col-consultant-name" style="flex: 0 0 150px !important; width: 150px !important; min-width: 150px !important; max-width: 150px !important; padding-right: 10px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;">
                        <a class="grey" href="/app/consultant-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(value)}">
                            ${frappe.utils.escape_html(value)}
                        </a>
                    </div>
                `;
            }

            // 3. Organization
            if (fieldname === "organization" || col.custom_class === "col-organization") {
                return `
                    <div class="list-row-col hidden-xs col-organization" style="flex: 0 0 160px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; padding-right: 10px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;">
                        <span title="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</span>
                    </div>
                `;
            }

            // 4. Project Name
            if (fieldname === "project_name" || col.custom_class === "col-project-name") {
                return `
                    <div class="list-row-col hidden-xs col-project-name" style="flex: 1 1 auto !important; flex-grow: 1 !important; min-width: 160px !important; width: auto !important; max-width: none !important; padding-right: 15px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;">
                        <span title="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</span>
                    </div>
                `;
            }

            // 5. Type of Contract
            if (fieldname === "contract_type" || col.custom_class === "col-contract-type") {
                return `
                    <div class="list-row-col hidden-xs col-contract-type text-center" style="flex: 0 0 120px !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; text-align: center !important; padding: 0 6px !important; white-space: nowrap !important;">
                        <span>${frappe.utils.escape_html(value || "Full-Time")}</span>
                    </div>
                `;
            }

            let value_display = value;
            if (this.settings.formatters && this.settings.formatters[fieldname]) {
                value_display = this.settings.formatters[fieldname](value, df, doc);
            }
            const numeric_class = frappe.model.is_numeric_field(df) ? "text-right" : "";

            return `
                <div class="list-row-col hidden-xs ${numeric_class} ${custom_cls}">
                    ${value_display}
                </div>
            `;
        };

        listview.setup_columns();
        if (listview.render_header) {
            listview.render_header(true);
        }
        listview.render();
        sync_active_consultant_lifecycle_cache(listview);
    },

    refresh(listview) {
        setup_consultant_lifecycle_filter_interceptor(listview);
        frappe.dom.set_style(custom_consultant_list_css);
        if (listview.$page) {
            listview.$page.addClass("consultant-contract-custom-list-view");
        }
        if (listview.$result) {
            listview.$result.addClass("consultant-contract-custom-list-view");
        }
        if (listview.render_header) {
            listview.render_header(true);
        }
        render_consultant_pipeline_cockpit(listview);
        sync_active_consultant_lifecycle_cache(listview);
    }
};

function setup_list_actions(listview) {
    listview.page.add_inner_button(__("Consultant Masters"), function() {
        frappe.set_route("List", "Consultant Master");
    }, __("Quick Links"));

    listview.page.add_inner_button(__("Contract Extensions"), function() {
        frappe.set_route("List", "Consultant Contract Extension");
    }, __("Quick Links"));

    listview.page.add_inner_button(__("Contract Amendments"), function() {
        frappe.set_route("List", "Consultant Contract Amendment");
    }, __("Quick Links"));

    listview.page.add_inner_button(__("Contract Terminations"), function() {
        frappe.set_route("List", "Consultant Contract Termination");
    }, __("Quick Links"));
}

function render_consultant_pipeline_cockpit(listview) {
    if (!listview.page) return;

    let $wrapper = listview.page.wrapper.find(".consultant-pipeline-cockpit");
    if (!$wrapper.length) {
        $wrapper = $('<div class="consultant-pipeline-cockpit" style="margin: 10px 0 18px 0;"></div>');
        let $target = listview.page.wrapper.find(".layout-main-section-wrapper");
        if ($target.length) {
            $wrapper.prependTo($target);
        } else {
            $wrapper.prependTo(listview.page.main);
        }
    }

    frappe.call({
        method: "access_custom.access_custom.doctype.consultant_contract.consultant_contract.get_consultant_pipeline_stats",
        callback: function(r) {
            if (!r || !r.message) return;
            let d = r.message;

            let cards = [
                { title: "CEO Approval", count: d.ceo_approval || 0, color: "#9333ea", bg: "#faf5ff", border: "#d8b4fe", filter: ["workflow_state", "=", "Pending CEO Approval"] },
                { title: "HR Review", count: d.hr_review || 0, color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", filter: ["workflow_state", "=", "Pending HR Review"] },
                { title: "To Be Issued", count: d.to_be_issued || 0, color: "#0284c7", bg: "#f0f9ff", border: "#bae6fd", filter: ["workflow_state", "=", "CEO Approved"] },
                { title: "Awaiting Signature", count: d.awaiting_signature || 0, color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4", filter: ["workflow_state", "=", "Contract Issued"] },
                { title: "Expiring in 30 Days", count: d.expiring_30 || 0, color: "#dc2626", bg: "#fef2f2", border: "#fecaca", filter_special: "exp30" },
                { title: "Expiring in 90 Days", count: d.expiring_90 || 0, color: "#d97706", bg: "#fffbeb", border: "#fde68a", filter_special: "exp90" }
            ];

            let cards_html = cards.map(c => `
                <div class="pipeline-kpi-card" data-title="${c.title}" style="flex: 1 1 150px; min-width: 140px; background: ${c.bg}; border: 1px solid ${c.border}; border-top: 3px solid ${c.color}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px;">${c.title}</div>
                    <div style="font-size: 22px; font-weight: 800; color: ${c.color}; margin-top: 4px;">${c.count}</div>
                </div>
            `).join("");

            $wrapper.html(`
                <div style="display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap;">
                    ${cards_html}
                </div>
            `);

            // Attach click event to filter listview
            $wrapper.find(".pipeline-kpi-card").each(function(idx) {
                let card = cards[idx];
                $(this).hover(
                    function() { $(this).css("transform", "translateY(-2px)"); },
                    function() { $(this).css("transform", "translateY(0)"); }
                );
                $(this).on("click", function() {
                    listview.filter_area.clear();
                    if (card.filter) {
                        listview.filter_area.add([
                            ["Consultant Contract", card.filter[0], card.filter[1], card.filter[2], false]
                        ]);
                    } else if (card.filter_special === "exp30") {
                        let today = frappe.datetime.nowdate();
                        let in30 = frappe.datetime.add_days(today, 30);
                        listview.filter_area.add([
                            ["Consultant Contract", "status", "=", "Active", false],
                            ["Consultant Contract", "end_date", "between", [today, in30], false]
                        ]);
                    } else if (card.filter_special === "exp90") {
                        let today = frappe.datetime.nowdate();
                        let in90 = frappe.datetime.add_days(today, 90);
                        listview.filter_area.add([
                            ["Consultant Contract", "status", "=", "Active", false],
                            ["Consultant Contract", "end_date", "between", [today, in90], false]
                        ]);
                    }
                });
            });
        }
    });
}
