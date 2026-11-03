// ============================================================
// ACCESS CUSTOM: Global Child Table Row Dedicated Scrollbar
// ============================================================
(function () {
	// 1. Inject global styling for all child tables across all modules using pure DOM
	function injectGlobalGridStyle() {
		var existing = document.getElementById("global-child-table-scrollbar-style");
		if (existing) {
			existing.remove();
		}
		var style = document.createElement("style");
		style.id = "global-child-table-scrollbar-style";
		style.textContent = `
            /* Hide closed grid rows so they do not show borders or phantom scrollbars */
            .grid-row:not(.grid-row-open) .form-in-grid {
                display: none !important;
                height: 0 !important;
                overflow: hidden !important;
                border: none !important;
                box-shadow: none !important;
            }

            /* Dedicated Access Green card styling and permanent scrollbar on open child table row editor */
            .grid-row-open .form-in-grid,
            .form-in-grid:not([style*="display: none"]) {
                background: #ffffff !important;
                border: 1.5px solid #00B800 !important;
                border-radius: 8px !important;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
                max-height: 420px !important;
                overflow-y: scroll !important;
                overflow-x: hidden !important;
                scrollbar-width: thin !important;
                scrollbar-color: #00B800 #f1f5f9 !important;
            }

            .form-in-grid::-webkit-scrollbar {
                width: 9px !important;
                display: block !important;
            }

            .form-in-grid::-webkit-scrollbar-thumb {
                background-color: #00B800 !important;
                border-radius: 5px !important;
            }

            .form-in-grid::-webkit-scrollbar-thumb:hover {
                background-color: #007A00 !important;
            }

            .form-in-grid::-webkit-scrollbar-track {
                background-color: #f1f5f9 !important;
                border-radius: 5px !important;
            }

            .form-in-grid .grid-form-heading {
                position: sticky !important;
                top: 0 !important;
                background: #ffffff !important;
                z-index: 10 !important;
                border-bottom: 1px solid #e2e8f0 !important;
            }

            #freeze,
            #freeze.grid-form,
            #freeze.dark.grid-form {
                display: none !important;
                pointer-events: none !important;
                opacity: 0 !important;
            }
        `;
		(document.head || document.documentElement).appendChild(style);
	}

	// 2. Intercept frappe.dom.freeze to disable backdrop for grid forms
	function patchGridFreeze() {
		if (typeof frappe === "undefined" || !frappe.dom) return;

		if (!frappe.dom._original_freeze) {
			frappe.dom._original_freeze = frappe.dom.freeze;
			frappe.dom.freeze = function (msg, css_class) {
				if (
					css_class &&
					(css_class.indexOf("grid-form") !== -1 ||
						css_class.indexOf("dark grid-form") !== -1)
				) {
					// Do not show backdrop overlay for child table editing
					// This permanently prevents window scroll clicks from closing the popup
					return;
				}
				return frappe.dom._original_freeze.apply(this, arguments);
			};
		}

		if (!frappe.dom._original_unfreeze) {
			frappe.dom._original_unfreeze = frappe.dom.unfreeze;
			frappe.dom.unfreeze = function () {
				if (!frappe.dom.freeze_count || frappe.dom.freeze_count <= 0) {
					return;
				}
				return frappe.dom._original_unfreeze.apply(this, arguments);
			};
		}

		// Neutralize any click/mousedown on #freeze when grid row is open
		$(document).off("click.prevent_grid_close mousedown.prevent_grid_close", "#freeze");
		$(document).on(
			"click.prevent_grid_close mousedown.prevent_grid_close",
			"#freeze",
			function (e) {
				if (typeof cur_frm !== "undefined" && cur_frm && cur_frm.cur_grid) {
					e.stopImmediatePropagation();
					e.preventDefault();
					return false;
				}
			}
		);
	}

	injectGlobalGridStyle();
	patchGridFreeze();

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			injectGlobalGridStyle();
			patchGridFreeze();
		});
	}

	function applyGridScrollbar() {
		injectGlobalGridStyle();
		patchGridFreeze();
		$(".grid-row-open .form-in-grid").each(function () {
			var $card = $(this);
			if ($card.css("overflow-y") !== "scroll" || $card.css("max-height") !== "420px") {
				$card.css({
					border: "1.5px solid #00B800",
					"max-height": "420px",
					"overflow-y": "scroll",
					"overflow-x": "hidden",
				});
			}
		});
	}

	$(document).on(
		"click",
		".grid-row, .grid-add-row, .grid-append-row, .grid-duplicate-row, .grid-insert-row, .btn-open-row",
		function () {
			setTimeout(applyGridScrollbar, 50);
			setTimeout(applyGridScrollbar, 200);
		}
	);

	$(document).on("page-change", function () {
		injectGlobalGridStyle();
		patchGridFreeze();
		setTimeout(applyGridScrollbar, 100);
	});

	setInterval(applyGridScrollbar, 300);
})();

// Ensure child table row close button stays visible even in completed/read-only documents,
// and enforce that completed/read-only documents ONLY show the ✕ button (no edit buttons).
function enforceReadOnlyGridToolbar() {
	if (typeof cur_frm === "undefined" || !cur_frm) return;

	var is_doc_readonly =
		(cur_frm.doc && cur_frm.doc.docstatus !== 0) ||
		(cur_frm.is_read_only && cur_frm.is_read_only());

	$(".grid-row-open").each(function () {
		var $row = $(this);
		var is_grid_readonly = is_doc_readonly;

		if (cur_frm.cur_grid && cur_frm.cur_grid.grid && !cur_frm.cur_grid.grid.is_editable()) {
			is_grid_readonly = true;
		}

		if (is_grid_readonly) {
			$row.addClass("grid-readonly-row");
			$row.find(
				".grid-move-row, .grid-duplicate-row, .grid-insert-row, .grid-insert-row-below, .grid-delete-row, .grid-append-row"
			).hide();
			$row.find(".row-actions, .grid-collapse-row").show();
		}
	});
}

function patchGridRowForm() {
	if (
		typeof frappe !== "undefined" &&
		frappe.ui &&
		frappe.ui.form &&
		frappe.ui.form.GridRowForm
	) {
		if (!frappe.ui.form.GridRowForm.prototype._patched_collapse) {
			frappe.ui.form.GridRowForm.prototype._patched_collapse = true;
			frappe.ui.form.GridRowForm.prototype.toggle_add_delete_button_display = function (
				$parent
			) {
				let is_editable = this.row.grid.is_editable();
				$parent
				.find(
					".grid-move-row, .grid-duplicate-row, .grid-insert-row, .grid-insert-row-below, .grid-delete-row, .grid-append-row"
				)
				.toggle(is_editable);
				$parent.find(".row-actions, .grid-collapse-row").show();
			};
		}
	}
	enforceReadOnlyGridToolbar();
}

patchGridRowForm();
$(document).on("app_ready page-change", patchGridRowForm);
$(document).on(
	"click",
	".grid-row, .grid-add-row, .grid-append-row, .grid-duplicate-row, .grid-insert-row, .btn-open-row",
	function () {
		setTimeout(enforceReadOnlyGridToolbar, 50);
		setTimeout(enforceReadOnlyGridToolbar, 200);
	}
);
setInterval(patchGridRowForm, 300);


// ============================================================
// ACCESS CUSTOM: Hide Deprecated Standard ERPNext Contract
// ============================================================
(function () {
	function isStandardContract(item) {
		if (!item) return false;
		if (item.match === "Contract") return true;
		if (item.value === "Contract List" || item.value === "New Contract" || item.value === "Contract") return true;
		if (item.label === "Contract List" || item.label === "New Contract" || item.label === "Contract") return true;
		if (Array.isArray(item.route)) {
			if ((item.route[0] === "List" || item.route[0] === "Form") && item.route[1] === "Contract") {
				return true;
			}
		}
		if (typeof item.route === "string") {
			if (item.route === "List/Contract" || item.route === "Form/Contract" || item.route.startsWith("List/Contract/") || item.route.startsWith("Form/Contract/")) {
				return true;
			}
		}
		return false;
	}

	function purgeStandardContract() {
		// 1. Purge from bootinfo permissions
		if (window.frappe && frappe.boot && frappe.boot.user) {
			["can_read", "can_search", "can_create", "can_write", "can_cancel", "can_delete"].forEach(function (k) {
				if (Array.isArray(frappe.boot.user[k])) {
					frappe.boot.user[k] = frappe.boot.user[k].filter(function (dt) {
						return dt !== "Contract";
					});
				}
			});

			if (frappe.boot.user.all_reports) {
				Object.keys(frappe.boot.user.all_reports).forEach(function (rep) {
					if (frappe.boot.user.all_reports[rep] && frappe.boot.user.all_reports[rep].ref_doctype === "Contract") {
						delete frappe.boot.user.all_reports[rep];
					}
				});
			}
		}

		// 2. Patch frappe.search.utils
		if (window.frappe && frappe.search && frappe.search.utils) {
			if (!frappe.search.utils._std_contract_patched) {
				frappe.search.utils._std_contract_patched = true;

				var orig_get_doctypes = frappe.search.utils.get_doctypes;
				frappe.search.utils.get_doctypes = function () {
					var results = orig_get_doctypes.apply(this, arguments);
					return results.filter(function (r) {
						return !isStandardContract(r);
					});
				};

				var orig_get_creatables = frappe.search.utils.get_creatables;
				frappe.search.utils.get_creatables = function () {
					var results = orig_get_creatables.apply(this, arguments);
					return results.filter(function (r) {
						return !isStandardContract(r);
					});
				};
			}

			// Clean recent searches
			if (Array.isArray(frappe.search.utils.recent)) {
				frappe.search.utils.recent = frappe.search.utils.recent.filter(function (item) {
					var r = Array.isArray(item) ? item[0] : item;
					if (typeof r === "string") {
						return r !== "List/Contract" && r !== "Form/Contract" && !r.startsWith("List/Contract/") && !r.startsWith("Form/Contract/");
					}
					return true;
				});
			}
		}

		// 3. Patch AwesomeBar deduplicate
		if (window.frappe && frappe.search && frappe.search.AwesomeBar && !frappe.search.AwesomeBar._std_contract_patched) {
			frappe.search.AwesomeBar._std_contract_patched = true;

			var orig_deduplicate = frappe.search.AwesomeBar.prototype.deduplicate;
			frappe.search.AwesomeBar.prototype.deduplicate = function (options) {
				var results = orig_deduplicate.apply(this, arguments);
				return results.filter(function (item) {
					return !isStandardContract(item);
				});
			};
		}

		// 4. Intercept direct route /app/contract navigation
		if (window.frappe && frappe.router && !frappe.router._std_contract_redirect_patched) {
			frappe.router._std_contract_redirect_patched = true;
			frappe.router.on("change", function () {
				var route = frappe.get_route ? frappe.get_route() : [];
				if (route && (route[0] === "List" || route[0] === "Form") && route[1] === "Contract") {
					frappe.show_alert({
						message: __("The default Contract is deprecated. Redirecting to Contract Management..."),
						indicator: "orange"
					}, 4);
					frappe.set_route("Workspaces", "Contract Mgmt");
				}
			});
		}
	}

	purgeStandardContract();
	$(document).on("app_ready page-change", purgeStandardContract);
	setTimeout(purgeStandardContract, 100);
	setTimeout(purgeStandardContract, 500);
	setTimeout(purgeStandardContract, 1500);
	setInterval(purgeStandardContract, 3000);
})();
