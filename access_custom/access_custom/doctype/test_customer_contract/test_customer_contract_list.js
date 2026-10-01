// Global Status Direct Route Handler
window.open_contract_status_doc = function(contract_name, raw_status, e, target_doctype, target_docname) {
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
        frappe.db.get_list("Contract Termination", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Contract Termination", r[0].name);
            } else {
                frappe.set_route("Form", "Test Customer Contract", contract_name);
            }
        });
    } else if (raw_status === "On Hold" || (raw_status && raw_status.includes("Hold"))) {
        frappe.db.get_list("Contract On Hold", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Contract On Hold", r[0].name);
            } else {
                frappe.set_route("Form", "Test Customer Contract", contract_name);
            }
        });
    } else if (raw_status === "Under Amendment Process" || raw_status === "Under Amendment" || (raw_status && raw_status.includes("Amendment"))) {
        frappe.db.get_list("Contract Amendment", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Contract Amendment", r[0].name);
            } else {
                frappe.set_route("Form", "Test Customer Contract", contract_name);
            }
        });
    } else if (raw_status === "Closed" || (raw_status && raw_status.includes("Closure"))) {
        frappe.db.get_list("Contract Closure", {
            filters: { contract: contract_name },
            fields: ["name"],
            order_by: "creation desc",
            limit: 1
        }).then(r => {
            if (r && r.length) {
                frappe.set_route("Form", "Contract Closure", r[0].name);
            } else {
                frappe.set_route("Form", "Test Customer Contract", contract_name);
            }
        });
    } else {
        frappe.set_route("Form", "Test Customer Contract", contract_name);
    }
    return false;
};

// Lifecycle Status Resolution Helper
function resolve_contract_display_status(doc, listview) {
    if (!doc) return { label: "Draft", color: "blue", doctype: "Test Customer Contract", docname: "", raw: "Draft" };

    // 1. Cached in-flight / lifecycle status from parallel queries
    if (listview && listview.lifecycle_cache && listview.lifecycle_cache[doc.name]) {
        return listview.lifecycle_cache[doc.name];
    }

    const wf = doc.workflow_state || "";
    const cs = doc.contract_status || "";
    const st = doc.status || "";

    // 2. Terminal / Completed Lifecycle States
    if (wf === "Terminated" || cs === "Terminated" || st === "Terminated") {
        return { label: "Terminated", color: "red", doctype: "Contract Termination", docname: "", raw: "Terminated" };
    }
    if (wf === "Closed" || cs === "Closed" || st === "Closed") {
        return { label: "Closed", color: "gray", doctype: "Contract Closure", docname: "", raw: "Closed" };
    }
    if (cs === "On Hold" || wf === "On Hold" || st === "On Hold") {
        return { label: "On Hold", color: "orange", doctype: "Contract On Hold", docname: "", raw: "On Hold" };
    }
    if (wf === "Active/Amendment Initiated" || st === "Under Amendment" || st === "Active/Amendment Initiated") {
        return { label: "Under Amendment Process", color: "yellow", doctype: "Contract Amendment", docname: "", raw: "Under Amendment Process" };
    }

    // 3. Pre-commencement stages
    if (wf === "Draft" || (!wf && (cs === "Draft" || st === "Draft"))) {
        return { label: "Draft", color: "blue", doctype: "Test Customer Contract", docname: "", raw: "Draft" };
    }
    if (wf.startsWith("Pending") || st.startsWith("Pending") || cs === "Pending Approval") {
        let label = wf || st || cs;
        return { label: label, color: "orange", doctype: "Test Customer Contract", docname: "", raw: label };
    }
    if (wf === "In Progress" || cs === "In Progress" || st === "In Progress") {
        return { label: "In Progress", color: "blue", doctype: "Test Customer Contract", docname: "", raw: "In Progress" };
    }

    // 4. Default Commenced
    if (wf === "Commenced" || cs === "Commenced" || st === "Commenced" || doc.docstatus === 1) {
        return { label: "Commenced", color: "green", doctype: "Test Customer Contract", docname: "", raw: "Commenced" };
    }

    return { label: wf || st || cs || "Draft", color: "blue", doctype: "Test Customer Contract", docname: "", raw: "Draft" };
}

// Background Batch Fetcher for in-flight lifecycle sub-documents
function sync_active_lifecycle_cache(listview) {
    if (!listview || !listview.data || !listview.data.length) return;

    let contract_names = listview.data.map(d => d.name).filter(Boolean);
    if (!contract_names.length) return;

    if (!listview.lifecycle_cache) {
        listview.lifecycle_cache = {};
    }

    Promise.all([
        // 1. In-flight Amendments (docstatus: 0)
        frappe.db.get_list("Contract Amendment", {
            filters: { contract: ["in", contract_names], docstatus: 0 },
            fields: ["name", "contract", "workflow_state", "creation"],
            order_by: "creation desc",
            limit: 100
        }),
        // 2. Active or Pending Holds
        frappe.db.get_list("Contract On Hold", {
            filters: { contract: ["in", contract_names], status: ["in", ["Pending Approval", "On Hold"]], docstatus: ["!=", 2] },
            fields: ["name", "contract", "workflow_state", "status", "creation"],
            order_by: "creation desc",
            limit: 100
        }),
        // 3. Terminations (Pending or Executed)
        frappe.db.get_list("Contract Termination", {
            filters: { contract: ["in", contract_names], docstatus: ["!=", 2] },
            fields: ["name", "contract", "workflow_state", "docstatus", "creation"],
            order_by: "creation desc",
            limit: 100
        }),
        // 4. Closures (Pending or Closed)
        frappe.db.get_list("Contract Closure", {
            filters: { contract: ["in", contract_names], docstatus: ["!=", 2] },
            fields: ["name", "contract", "workflow_state", "docstatus", "creation"],
            order_by: "creation desc",
            limit: 100
        })
    ]).then(([amends, holds, terms, closures]) => {
        // A. Process Closures (Highest precedence)
        (closures || []).forEach(cl => {
            if (cl.contract && !listview.lifecycle_cache[cl.contract]) {
                let is_closed = (cl.docstatus === 1 || cl.workflow_state === "Closed");
                listview.lifecycle_cache[cl.contract] = {
                    label: is_closed ? "Closed" : "Under Closure Process",
                    color: is_closed ? "gray" : "purple",
                    doctype: "Contract Closure",
                    docname: cl.name,
                    raw: is_closed ? "Closed" : "Under Closure Process"
                };
            }
        });

        // B. Process Terminations
        (terms || []).forEach(t => {
            if (t.contract && !listview.lifecycle_cache[t.contract]) {
                let is_term = (t.docstatus === 1 || t.workflow_state === "Termination Executed" || t.workflow_state === "Terminated");
                listview.lifecycle_cache[t.contract] = {
                    label: is_term ? "Terminated" : "Under Termination Process",
                    color: "red",
                    doctype: "Contract Termination",
                    docname: t.name,
                    raw: is_term ? "Terminated" : "Under Termination Process"
                };
            }
        });

        // C. Process Holds
        (holds || []).forEach(h => {
            if (h.contract && !listview.lifecycle_cache[h.contract]) {
                let is_hold = (h.status === "On Hold" || h.workflow_state === "On Hold");
                listview.lifecycle_cache[h.contract] = {
                    label: is_hold ? "On Hold" : "Under On Hold Process",
                    color: "orange",
                    doctype: "Contract On Hold",
                    docname: h.name,
                    raw: is_hold ? "On Hold" : "Under On Hold Process"
                };
            }
        });

        // D. Process Amendments
        (amends || []).forEach(a => {
            if (a.contract && !listview.lifecycle_cache[a.contract]) {
                listview.lifecycle_cache[a.contract] = {
                    label: "Under Amendment Process",
                    color: "yellow",
                    doctype: "Contract Amendment",
                    docname: a.name,
                    raw: "Under Amendment Process"
                };
            }
        });

        // E. Update DOM rows with live accurate pills and routing
        if (listview.$result) {
            contract_names.forEach(cname => {
                let info = listview.lifecycle_cache[cname];
                if (info) {
                    let $row = listview.$result.find(`.list-row-container:has(a[href*="${encodeURIComponent(cname)}"])`);
                    let $pill = $row.find(".col-status .custom-status-pill");
                    if ($pill.length) {
                        $pill.attr("class", `custom-status-pill badge-${info.color}`);
                        $pill.attr("title", `Click to open: ${info.label}`);
                        $pill.find("span:last").text(info.label);
                        $pill.off("click").on("click", function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (info.docname) {
                                frappe.set_route("Form", info.doctype, info.docname);
                            } else {
                                frappe.set_route("Form", "Test Customer Contract", cname);
                            }
                            return false;
                        });
                    }
                }
            });
        }
    }).catch(err => {
        console.error("Error syncing contract lifecycle cache:", err);
    });
}

const custom_list_css = `
/* Layout alignment for Test Customer Contract List View */
[data-page-route*="Test Customer Contract"] .list-row,
[data-page-route*="Test Customer Contract"] .list-row-head,
[data-page-route*="test-customer-contract"] .list-row,
[data-page-route*="test-customer-contract"] .list-row-head,
.contract-custom-list-view .list-row,
.contract-custom-list-view .list-row-head {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    width: 100% !important;
    max-width: 100% !important;
}

[data-page-route*="Test Customer Contract"] .list-row .level-left,
[data-page-route*="Test Customer Contract"] .list-row-head .list-header-subject,
[data-page-route*="test-customer-contract"] .list-row .level-left,
[data-page-route*="test-customer-contract"] .list-row-head .list-header-subject,
.contract-custom-list-view .list-row .level-left,
.contract-custom-list-view .list-row-head .list-header-subject {
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

[data-page-route*="Test Customer Contract"] .list-row .level-right,
[data-page-route*="Test Customer Contract"] .list-row-head .level-right,
[data-page-route*="test-customer-contract"] .list-row .level-right,
[data-page-route*="test-customer-contract"] .list-row-head .level-right,
.contract-custom-list-view .list-row .level-right,
.contract-custom-list-view .list-row-head .level-right {
    flex: 0 0 80px !important;
    flex-shrink: 0 !important;
    min-width: 75px !important;
    max-width: 85px !important;
    justify-content: flex-end !important;
}

[data-page-route*="Test Customer Contract"] .checkbox-actions,
[data-page-route*="test-customer-contract"] .checkbox-actions,
.contract-custom-list-view .checkbox-actions {
    display: none !important;
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

/* 2. Customer Id (120px) */
.col-party-name,
.list-row-col.col-party-name {
    flex: 0 0 120px !important;
    width: 120px !important;
    min-width: 120px !important;
    max-width: 120px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    padding-right: 8px !important;
}

/* 3. Project Title (Expands to all middle space) */
.col-project-title,
.list-row-col.col-project-title {
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    min-width: 180px !important;
    width: auto !important;
    max-width: none !important;
    padding-right: 15px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

.col-project-title *,
.col-project-title span,
.col-project-title a {
    max-width: 100% !important;
    display: inline !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

.list-row-head .col-project-title,
.list-row-head .col-project-title span {
    max-width: 100% !important;
    display: inline-block !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
}

/* 4. Currency (55px) */
.col-currency,
.list-row-col.col-currency {
    flex: 0 0 55px !important;
    width: 55px !important;
    min-width: 55px !important;
    max-width: 55px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: center !important;
    padding: 0 4px !important;
}

/* 5. Budget (135px) */
.col-budget,
.list-row-col.col-budget {
    flex: 0 0 135px !important;
    width: 135px !important;
    min-width: 135px !important;
    max-width: 135px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: right !important;
    padding-right: 12px !important;
    white-space: nowrap !important;
}

/* 6. Status (150px) */
.col-status,
.list-row-col.col-status {
    flex: 0 0 150px !important;
    width: 150px !important;
    min-width: 150px !important;
    max-width: 150px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    text-align: center !important;
    overflow: visible !important;
    text-overflow: clip !important;
}

.custom-status-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 3px 10px !important;
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



const clean_status_options = [
    "",
    "Draft",
    "Pending Team Lead Approval",
    "Pending Level 2.1 Legal Approval",
    "Pending Level 2.2 Finance Approval",
    "Pending Level 2.3 HR Approval",
    "Pending CEO Approval",
    "In Progress",
    "Commenced",
    "Under Amendment Process",
    "Under On Hold Process",
    "On Hold",
    "Under Termination Process",
    "Terminated",
    "Under Closure Process",
    "Closed"
];

function sanitize_status_filter(listview) {
    let status_df = frappe.meta.get_docfield("Test Customer Contract", "status");
    if (status_df) {
        status_df.options = clean_status_options.join("\n");
    }

    if (listview && listview.page && listview.page.fields_dict && listview.page.fields_dict.status) {
        let ctrl = listview.page.fields_dict.status;
        ctrl.df.options = clean_status_options.join("\n");
        if (ctrl.set_options) {
            ctrl.set_options(clean_status_options);
        }
    }

    // Direct DOM sanitization to strip legacy options immediately
    const apply_dom_filter_cleanup = () => {
        let $selects = $('select[data-fieldname="status"], .standard-filter-section select');
        $selects.each(function() {
            let $sel = $(this);
            let cur_val = $sel.val();
            let options = $sel.find('option');
            let has_dirty = false;
            options.each(function() {
                let v = $(this).val();
                if (v && !clean_status_options.includes(v)) {
                    has_dirty = true;
                }
            });
            if (has_dirty) {
                $sel.empty();
                clean_status_options.forEach(opt => {
                    let $opt = $('<option></option>').attr('value', opt).text(opt ? __(opt) : '');
                    if (opt === cur_val) $opt.attr('selected', 'selected');
                    $sel.append($opt);
                });
            }
        });
    };

    apply_dom_filter_cleanup();
    setTimeout(apply_dom_filter_cleanup, 200);
    setTimeout(apply_dom_filter_cleanup, 600);
}



// --- Lifecycle Filter Interceptor (Enables filtering by in-flight & post-commenced statuses) ---
function is_custom_lifecycle_status(val) {
    if (!val) return false;
    const lifecycle_statuses = [
        "Under Amendment Process",
        "Under Amendment",
        "Under On Hold Process",
        "On Hold",
        "Under Termination Process",
        "Terminated",
        "Under Closure Process",
        "Closed",
        "Commenced"
    ];
    return lifecycle_statuses.includes(val);
}

async function get_contracts_for_lifecycle_status(val) {
    try {
        if (val === "Under On Hold Process") {
            let r = await frappe.db.get_list("Contract On Hold", {
                filters: { status: "Pending Approval", docstatus: ["!=", 2] },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "On Hold") {
            let [holds, contracts] = await Promise.all([
                frappe.db.get_list("Contract On Hold", {
                    filters: { status: "On Hold", docstatus: ["!=", 2] },
                    fields: ["contract"],
                    limit: 500
                }),
                frappe.db.get_list("Test Customer Contract", {
                    filters: { contract_status: "On Hold" },
                    fields: ["name"],
                    limit: 500
                })
            ]);
            let names = (holds || []).map(x => x.contract).concat((contracts || []).map(x => x.name));
            return [...new Set(names.filter(Boolean))];
        }

        if (val === "Under Amendment Process" || val === "Under Amendment") {
            let r = await frappe.db.get_list("Contract Amendment", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Under Termination Process") {
            let r = await frappe.db.get_list("Contract Termination", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Terminated") {
            let [terms, contracts] = await Promise.all([
                frappe.db.get_list("Contract Termination", {
                    filters: { docstatus: 1 },
                    fields: ["contract"],
                    limit: 500
                }),
                frappe.db.get_list("Test Customer Contract", {
                    filters: { workflow_state: "Terminated" },
                    fields: ["name"],
                    limit: 500
                })
            ]);
            let names = (terms || []).map(x => x.contract).concat((contracts || []).map(x => x.name));
            return [...new Set(names.filter(Boolean))];
        }

        if (val === "Under Closure Process") {
            let r = await frappe.db.get_list("Contract Closure", {
                filters: { docstatus: 0 },
                fields: ["contract"],
                limit: 500
            });
            return [...new Set((r || []).map(x => x.contract).filter(Boolean))];
        }

        if (val === "Closed") {
            let [closures, contracts] = await Promise.all([
                frappe.db.get_list("Contract Closure", {
                    filters: { docstatus: 1 },
                    fields: ["contract"],
                    limit: 500
                }),
                frappe.db.get_list("Test Customer Contract", {
                    filters: { workflow_state: "Closed" },
                    fields: ["name"],
                    limit: 500
                })
            ]);
            let names = (closures || []).map(x => x.contract).concat((contracts || []).map(x => x.name));
            return [...new Set(names.filter(Boolean))];
        }

        if (val === "Commenced") {
            let [amends, holds, terms, closures, comm_contracts] = await Promise.all([
                frappe.db.get_list("Contract Amendment", { filters: { docstatus: 0 }, fields: ["contract"], limit: 500 }),
                frappe.db.get_list("Contract On Hold", { filters: { status: ["in", ["Pending Approval", "On Hold"]], docstatus: ["!=", 2] }, fields: ["contract"], limit: 500 }),
                frappe.db.get_list("Contract Termination", { filters: { docstatus: ["!=", 2] }, fields: ["contract"], limit: 500 }),
                frappe.db.get_list("Contract Closure", { filters: { docstatus: ["!=", 2] }, fields: ["contract"], limit: 500 }),
                frappe.db.get_list("Test Customer Contract", { filters: { workflow_state: "Commenced" }, fields: ["name"], limit: 500 })
            ]);
            let active_special = new Set([
                ...(amends || []).map(x => x.contract),
                ...(holds || []).map(x => x.contract),
                ...(terms || []).map(x => x.contract),
                ...(closures || []).map(x => x.contract)
            ]);
            return (comm_contracts || []).map(x => x.name).filter(n => !active_special.has(n));
        }
    } catch (e) {
        console.error("Error resolving contracts for lifecycle status:", e);
    }
    return null;
}

function setup_lifecycle_filter_interceptor(listview) {
    if (!listview || listview._has_lifecycle_interceptor) return;
    listview._has_lifecycle_interceptor = true;

    const orig_refresh = listview.refresh.bind(listview);
    const orig_get_filters = listview.get_filters_for_args.bind(listview);

    listview.get_filters_for_args = function() {
        let filters = orig_get_filters();
        if (this._lifecycle_filter_names !== null && this._lifecycle_filter_names !== undefined) {
            filters = filters.filter(f => f[1] !== "status" && f[1] !== "workflow_state");
            if (this._lifecycle_filter_names.length > 0) {
                filters.push(["Test Customer Contract", "name", "in", this._lifecycle_filter_names]);
            } else {
                filters.push(["Test Customer Contract", "name", "=", "__NO_MATCHING_CONTRACT__"]);
            }
        }
        return filters;
    };

    listview.refresh = async function(refresh_header = false) {
        let filters = this.filter_area ? this.filter_area.get() : [];
        let status_filter = filters.find(f => (f[1] === "status" || f[1] === "workflow_state") && f[3]);

        if (status_filter && is_custom_lifecycle_status(status_filter[3])) {
            this._lifecycle_filter_names = await get_contracts_for_lifecycle_status(status_filter[3]);
            this.last_args = null; // Prevent throttling
        } else {
            this._lifecycle_filter_names = null;
        }

        return orig_refresh(refresh_header);
    };
}


frappe.listview_settings['Test Customer Contract'] = {
    hide_name_column: true,
    add_fields: [
        "name",
        "party_name",
        "project_title",
        "project_currency",
        "project_budget",
        "status",
        "workflow_state",
        "contract_status"
    ],
    onload: function(listview) {
        setup_lifecycle_filter_interceptor(listview);
        frappe.dom.set_style(custom_list_css);

        if (listview.$page) {
            listview.$page.addClass('contract-custom-list-view');
        }
        if (listview.$result) {
            listview.$result.addClass('contract-custom-list-view');
        }

        // Robust status filter sanitization to keep only original & active statuses
        sanitize_status_filter(listview);

        listview.setup_columns = function() {
            this.columns = [];

            // 1. Contract ID (Subject - with primary link & checkbox)
            this.columns.push({
                type: "Subject",
                custom_class: "col-contract-id",
                df: {
                    label: __("Contract ID"),
                    fieldname: "name",
                    fieldtype: "Link"
                }
            });

            // 2. Customer Id
            this.columns.push({
                type: "Field",
                custom_class: "col-party-name",
                df: frappe.meta.get_docfield("Test Customer Contract", "party_name") || {
                    label: __("Customer Id"),
                    fieldname: "party_name"
                }
            });

            // 3. Project Title
            this.columns.push({
                type: "Field",
                custom_class: "col-project-title",
                df: {
                    label: __("Project Title"),
                    fieldname: "project_title",
                    fieldtype: "Data"
                }
            });

            // 4. Currency
            this.columns.push({
                type: "Field",
                custom_class: "col-currency",
                df: {
                    label: __("Currency"),
                    fieldname: "project_currency",
                    fieldtype: "Link"
                }
            });

            // 5. Budget
            this.columns.push({
                type: "Field",
                custom_class: "col-budget",
                df: {
                    label: __("Budget"),
                    fieldname: "project_budget",
                    fieldtype: "Currency"
                }
            });

            // 6. Status
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
                        <!-- 2. Customer Id -->
                        <div class="list-row-col hidden-xs col-party-name" style="flex: 0 0 120px !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; padding-right: 8px !important;">
                            <span data-sort-by="party_name" title="${__("Click to sort by Customer Id")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Customer Id")}
                            </span>
                        </div>
                        <!-- 3. Project Title -->
                        <div class="list-row-col hidden-xs col-project-title" style="flex: 1 1 auto !important; flex-grow: 1 !important; min-width: 180px !important; width: auto !important; max-width: none !important; padding-right: 15px !important;">
                            <span data-sort-by="project_title" title="${__("Click to sort by Project Title")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Project Title")}
                            </span>
                        </div>
                        <!-- 4. Currency -->
                        <div class="list-row-col hidden-xs col-currency text-center" style="flex: 0 0 55px !important; width: 55px !important; min-width: 55px !important; max-width: 55px !important; text-align: center !important; padding: 0 4px !important;">
                            <span data-sort-by="project_currency" title="${__("Click to sort by Currency")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Currency")}
                            </span>
                        </div>
                        <!-- 5. Budget -->
                        <div class="list-row-col hidden-xs col-budget text-right" style="flex: 0 0 135px !important; width: 135px !important; min-width: 135px !important; max-width: 135px !important; text-align: right !important; padding-right: 12px !important;">
                            <span data-sort-by="project_budget" title="${__("Click to sort by Budget")}" style="font-weight: 600; cursor: pointer;">
                                ${__("Budget")}
                            </span>
                        </div>
                        <!-- 6. Status -->
                        <div class="list-row-col hidden-xs col-status text-center" style="flex: 0 0 150px !important; width: 150px !important; min-width: 150px !important; max-width: 150px !important; text-align: center !important;">
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
                let info = resolve_contract_display_status(doc, this);
                let target_dt = info.doctype || "Test Customer Contract";
                let target_dn = info.docname || "";

                return `
                    <div class="list-row-col hidden-xs col-status text-center" style="flex: 0 0 150px !important; width: 150px !important; min-width: 150px !important; max-width: 150px !important; text-align: center !important;">
                        <span class="custom-status-pill badge-${info.color}" 
                              onclick="window.open_contract_status_doc('${doc.name}', '${info.raw}', event, '${target_dt}', '${target_dn}');"
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
                            <a class="grey font-weight-bold" href="/app/test-customer-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(doc.name)}">
                                ${frappe.utils.escape_html(doc.name)}
                            </a>
                        </span>
                    </div>
                `;
            }

            const df = col.df || {};
            const fieldname = df.fieldname;
            const value = doc[fieldname] || "";

            // 2. Customer Id
            if (fieldname === "party_name" || col.custom_class === "col-party-name") {
                return `
                    <div class="list-row-col hidden-xs col-party-name" style="flex: 0 0 120px !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; padding-right: 8px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;">
                        <a class="grey" href="/app/test-customer-contract/${encodeURIComponent(doc.name)}" title="${frappe.utils.escape_html(value)}">
                            ${frappe.utils.escape_html(value)}
                        </a>
                    </div>
                `;
            }

            // 3. Project Title
            if (fieldname === "project_title" || col.custom_class === "col-project-title") {
                return `
                    <div class="list-row-col hidden-xs col-project-title" style="flex: 1 1 auto !important; flex-grow: 1 !important; min-width: 180px !important; width: auto !important; max-width: none !important; padding-right: 15px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;">
                        <span title="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</span>
                    </div>
                `;
            }

            // 4. Currency
            if (fieldname === "project_currency" || col.custom_class === "col-currency") {
                return `
                    <div class="list-row-col hidden-xs col-currency text-center" style="flex: 0 0 55px !important; width: 55px !important; min-width: 55px !important; max-width: 55px !important; text-align: center !important; padding: 0 4px !important; white-space: nowrap !important;">
                        <span>${frappe.utils.escape_html(value || "INR")}</span>
                    </div>
                `;
            }

            // 5. Budget
            if (df.fieldtype === "Currency" || fieldname === "project_budget" || col.custom_class === "col-budget") {
                let formatted_budget = format_currency(value, doc.project_currency || "INR");
                return `
                    <div class="list-row-col hidden-xs text-right col-budget" style="flex: 0 0 135px !important; width: 135px !important; min-width: 135px !important; max-width: 135px !important; text-align: right !important; padding-right: 12px !important; white-space: nowrap !important;">
                        <span>${formatted_budget}</span>
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
        sync_active_lifecycle_cache(listview);
    },
    refresh: function(listview) {
        setup_lifecycle_filter_interceptor(listview);
        frappe.dom.set_style(custom_list_css);
        if (listview.$page) {
            listview.$page.addClass('contract-custom-list-view');
        }
        if (listview.$result) {
            listview.$result.addClass('contract-custom-list-view');
        }
        if (listview.render_header) {
            listview.render_header(true);
        }
        sync_active_lifecycle_cache(listview);
        sanitize_status_filter(listview);
    },
    get_indicator: function(doc) {
        let info = resolve_contract_display_status(doc, cur_list);
        return [__(info.label), info.color, "status,=," + doc.status];
    }
};
