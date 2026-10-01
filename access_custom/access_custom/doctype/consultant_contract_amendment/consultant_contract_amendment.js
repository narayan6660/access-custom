// Copyright (c) 2026, Charan and contributors
frappe.ui.form.on("Consultant Contract Amendment", {
    validate(frm) {
        if (!validate_pdf_attachment(frm, "signed_amendment_document")) {
            frappe.validated = false;
            return false;
        }
    },
    signed_amendment_document(frm) {
        validate_pdf_attachment(frm, "signed_amendment_document");
    },
    revised_contract_value(frm) {
        let curr = parseFloat(frm.doc.current_contract_value || 0);
        let rev = parseFloat(frm.doc.revised_contract_value || 0);
        if (rev > 0) {
            frm.set_value("impact_on_value", rev - curr);
        }
    }
});

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
