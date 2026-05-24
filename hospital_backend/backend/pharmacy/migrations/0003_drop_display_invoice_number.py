"""Wave 2, Task 7: drop DispenseInvoice.display_invoice_number.

The client-generated display invoice number had no business meaning —
it duplicated information already present in the server-generated
``invoice_number``. Removing the column drops the only place it was
persisted; the field has already been removed from the model,
serializer, service, view, and admin in the same change.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0002_admin_verbose_names"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="dispenseinvoice",
            name="display_invoice_number",
        ),
    ]
