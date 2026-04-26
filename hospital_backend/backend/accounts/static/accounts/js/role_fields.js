(function () {
    'use strict';

    function toggleHospitalFields() {
        var roleField = document.getElementById('id_role');
        if (!roleField) return;

        // Django admin wraps each field in a div with class "field-<name>"
        var hospitalRow = document.querySelector('.field-hospital');
        var managedRow = document.querySelector('.field-managed_hospitals');

        if (roleField.value === 'group_admin') {
            // GroupAdmin uses managed_hospitals (M2M), not hospital (FK)
            if (hospitalRow) hospitalRow.style.display = 'none';
            if (managedRow) managedRow.style.display = '';
        } else {
            // All other roles use hospital (FK), not managed_hospitals
            if (hospitalRow) hospitalRow.style.display = '';
            if (managedRow) managedRow.style.display = 'none';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        toggleHospitalFields();
        var roleField = document.getElementById('id_role');
        if (roleField) {
            roleField.addEventListener('change', toggleHospitalFields);
        }
    });
})();
