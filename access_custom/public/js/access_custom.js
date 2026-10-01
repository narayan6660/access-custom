// ============================================================
// ACCESS CUSTOM: Auto-Close Open Child Table Row on Outside Click
// ============================================================
(function() {
    function closeOpenGrid(e) {
        if (typeof cur_frm === "undefined" || !cur_frm) return;

        var openRows = $(".grid-row-open");
        if (!openRows.length) return;

        var target = $(e.target);
        // Do not close if clicking inside the open form or dropdowns
        if (target.closest(".form-in-grid, .grid-row-open, .awesomplete, .datepicker, .flatpickr-calendar, .modal, .modal-backdrop, .ui-autocomplete, .dropdown-menu, .link-field").length > 0) {
            return;
        }

        // Close the open row
        if (cur_frm.cur_grid && typeof cur_frm.cur_grid.toggle_view === "function") {
            cur_frm.cur_grid.toggle_view(false);
        } else {
            openRows.find(".grid-collapse-row").first().trigger("click");
        }
    }

    $(document).on("mousedown", closeOpenGrid);
    $(document).on("focusin", closeOpenGrid);
})();
