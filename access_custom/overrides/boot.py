import frappe

def extend_bootinfo(bootinfo):
    """
    Strips the default/deprecated standard 'Contract' DocType from user boot permissions.
    This ensures it does not appear in Desk Global Search / Awesomebar for any user.
    Custom DocTypes ('Test Customer Contract', 'Consultant Contract', etc.) remain intact.
    """
    if not bootinfo:
        return

    user_info = bootinfo.get("user")
    if user_info:
        for perm_key in ("can_read", "can_search", "can_create", "can_write", "can_cancel", "can_delete"):
            if perm_key in user_info and isinstance(user_info[perm_key], list):
                user_info[perm_key] = [dt for dt in user_info[perm_key] if dt != "Contract"]

        if "all_reports" in user_info and isinstance(user_info["all_reports"], dict):
            user_info["all_reports"] = {
                k: v for k, v in user_info["all_reports"].items()
                if v.get("ref_doctype") != "Contract"
            }
