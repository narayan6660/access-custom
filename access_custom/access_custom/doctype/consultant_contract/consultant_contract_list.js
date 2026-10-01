// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.listview_settings["Consultant Contract"] = {
    add_fields: [
        "request_id", "consultant_name", "organization",
        "project_name", "contract_type", "start_date",
        "end_date", "total_contract_value", "currency",
        "status", "workflow_state"
    ],

    get_indicator(doc) {
        let state = doc.workflow_state || doc.status || "Draft";
        if (state === "Draft") {
            return [__("Draft"), "gray", "workflow_state,=,Draft"];
        } else if (state === "Pending Team Lead Approval") {
            return [__("Pending Team Lead"), "orange", "workflow_state,=,Pending Team Lead Approval"];
        } else if (state === "Pending HR Review") {
            return [__("Pending HR Review"), "orange", "workflow_state,=,Pending HR Review"];
        } else if (state === "Pending CEO Approval") {
            return [__("Pending CEO Approval"), "purple", "workflow_state,=,Pending CEO Approval"];
        } else if (state === "CEO Approved") {
            return [__("CEO Approved"), "blue", "workflow_state,=,CEO Approved"];
        } else if (state === "Contract Issued") {
            return [__("Contract Issued"), "cyan", "workflow_state,=,Contract Issued"];
        } else if (state === "Signed by Consultant") {
            return [__("Signed by Consultant"), "yellow", "workflow_state,=,Signed by Consultant"];
        } else if (state === "Active") {
            return [__("Active"), "green", "status,=,Active"];
        } else if (state === "Returned for Revision") {
            return [__("Returned for Revision"), "orange", "workflow_state,=,Returned for Revision"];
        } else if (state === "Rejected") {
            return [__("Rejected"), "red", "workflow_state,=,Rejected"];
        } else if (state === "Expired") {
            return [__("Expired"), "red", "status,=,Expired"];
        } else if (state === "Terminated") {
            return [__("Terminated"), "darkgrey", "status,=,Terminated"];
        }
        return [__(state), "gray", "status,=," + state];
    },

    onload(listview) {
        render_consultant_pipeline_cockpit(listview);
        setup_list_actions(listview);
    },

    refresh(listview) {
        render_consultant_pipeline_cockpit(listview);
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
