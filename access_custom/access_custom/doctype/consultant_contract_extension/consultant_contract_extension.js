// Copyright (c) 2026, Charan and contributors
frappe.ui.form.on("Consultant Contract Extension", {
    refresh(frm) {
        setup_auto_calc(frm);
    },
    validate(frm) {
        if (!validate_pdf_attachment(frm, "extension_appendix")) {
            frappe.validated = false;
            return false;
        }
    },
    extension_appendix(frm) {
        validate_pdf_attachment(frm, "extension_appendix");
    },
    extension_months(frm) {
        setup_auto_calc(frm);
    },
    revised_fee(frm) {
        setup_auto_calc(frm);
    }
});

function setup_auto_calc(frm) {
    if (frm.doc.current_end_date && frm.doc.extension_months) {
        let new_end = frappe.datetime.add_months(frm.doc.current_end_date, parseInt(frm.doc.extension_months));
        frm.set_value("revised_end_date", new_end);
    }
    let fee = parseFloat(frm.doc.revised_fee || frm.doc.current_fee || 0);
    let months = parseInt(frm.doc.extension_months || 0);
    if (fee > 0 && months > 0) {
        frm.set_value("total_extension_value", fee * months);
    }
}

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
