// ============================================================
// ACCESS CUSTOM: Global Child Table Row Dedicated Scrollbar
// ============================================================
(function() {
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
            frappe.dom.freeze = function(msg, css_class) {
                if (css_class && (css_class.indexOf("grid-form") !== -1 || css_class.indexOf("dark grid-form") !== -1)) {
                    // Do not show backdrop overlay for child table editing
                    // This permanently prevents window scroll clicks from closing the popup
                    return;
                }
                return frappe.dom._original_freeze.apply(this, arguments);
            };
        }

        if (!frappe.dom._original_unfreeze) {
            frappe.dom._original_unfreeze = frappe.dom.unfreeze;
            frappe.dom.unfreeze = function() {
                if (!frappe.dom.freeze_count || frappe.dom.freeze_count <= 0) {
                    return;
                }
                return frappe.dom._original_unfreeze.apply(this, arguments);
            };
        }

        // Neutralize any click/mousedown on #freeze when grid row is open
        $(document).off("click.prevent_grid_close mousedown.prevent_grid_close", "#freeze");
        $(document).on("click.prevent_grid_close mousedown.prevent_grid_close", "#freeze", function(e) {
            if (typeof cur_frm !== "undefined" && cur_frm && cur_frm.cur_grid) {
                e.stopImmediatePropagation();
                e.preventDefault();
                return false;
            }
        });
    }

    injectGlobalGridStyle();
    patchGridFreeze();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
            injectGlobalGridStyle();
            patchGridFreeze();
        });
    }

    function applyGridScrollbar() {
        injectGlobalGridStyle();
        patchGridFreeze();
        $(".grid-row-open .form-in-grid").each(function() {
            var $card = $(this);
            if ($card.css("overflow-y") !== "scroll" || $card.css("max-height") !== "420px") {
                $card.css({
                    "border": "1.5px solid #00B800",
                    "max-height": "420px",
                    "overflow-y": "scroll",
                    "overflow-x": "hidden"
                });
            }
        });
    }

    $(document).on("click", ".grid-row, .grid-add-row, .grid-append-row, .grid-duplicate-row, .grid-insert-row, .btn-open-row", function() {
        setTimeout(applyGridScrollbar, 50);
        setTimeout(applyGridScrollbar, 200);
    });

    $(document).on("page-change", function() {
        injectGlobalGridStyle();
        patchGridFreeze();
        setTimeout(applyGridScrollbar, 100);
    });

    setInterval(applyGridScrollbar, 300);
})();
