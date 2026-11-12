// Copyright (c) 2026, Charan and contributors
// For license information, please see license.txt

frappe.listview_settings["Employment Contract"] = {
    add_fields: ["status", "workflow_state", "employee_name", "requesting_organization", "engagement_type", "compensation_amount", "annual_ctc"],

    get_indicator: function(doc) {
        let state = doc.workflow_state || doc.status || "Draft";
        if (state === "Active") {
            return [__("Active"), "green", "status,=,Active"];
        } else if (state === "Draft") {
            return [__("Draft"), "grey", "status,=,Draft"];
        } else if (state.includes("Reject")) {
            return [__(state), "red", "status,=,Rejected"];
        } else if (state.includes("Returned for Revision")) {
            return [__(state), "orange", "status,=,Returned for Revision"];
        } else if (state === "Awaiting Employee Signature" || state === "Signed by Employee") {
            return [__(state), "purple", "status,=," + state];
        } else if (state.includes("Pending") || state.includes("Approval") || state.includes("Review")) {
            return [__(state), "blue", "status,=," + state];
        } else if (state === "Expired" || state === "Terminated") {
            return [__(state), "darkgrey", "status,=," + state];
        }
        return [__(state), "blue", "status,=," + state];
    }
};
