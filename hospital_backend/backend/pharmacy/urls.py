from django.urls import path

from . import views

urlpatterns = [
    # Suppliers
    path(
        "pharmacy/suppliers/",
        views.SupplierListCreateView.as_view(),
        name="pharmacy-supplier-list-create",
    ),
    path(
        "pharmacy/suppliers/<uuid:supplier_id>/",
        views.SupplierDetailView.as_view(),
        name="pharmacy-supplier-detail",
    ),

    # Medicine CRUD
    path(
        "pharmacy/inventory/medicines/",
        views.MedicineListCreateView.as_view(),
        name="pharmacy-medicine-list-create",
    ),
    path(
        "pharmacy/inventory/medicines/<uuid:pk>/",
        views.MedicineDetailView.as_view(),
        name="pharmacy-medicine-detail",
    ),
    path(
        "pharmacy/inventory/medicines/<uuid:pk>/dispense-history/",
        views.ProductDispenseHistoryView.as_view(),
        name="pharmacy-medicine-dispense-history",
    ),

    # Inventory stats + purchase + audit
    path(
        "pharmacy/inventory/stats/",
        views.InventoryStatsView.as_view(),
        name="pharmacy-inventory-stats",
    ),
    path(
        "pharmacy/inventory/invoices/",
        views.PurchaseInvoiceCreateView.as_view(),
        name="pharmacy-purchase-invoice-create",
    ),
    path(
        "pharmacy/inventory/audit-removal/",
        views.AuditStockRemovalView.as_view(),
        name="pharmacy-audit-removal",
    ),

    # Queue + Dispense
    path(
        "pharmacy/queue/",
        views.PharmacyQueueView.as_view(),
        name="pharmacy-queue",
    ),
    path(
        "pharmacy/dispense/",
        views.DispenseCreateView.as_view(),
        name="pharmacy-dispense-create",
    ),
    path(
        "pharmacy/dispense/<uuid:session_id>/cancel/",
        views.DispenseCancelView.as_view(),
        name="pharmacy-dispense-cancel",
    ),
    path(
        "pharmacy/dispense-history/",
        views.DispenseHistoryListView.as_view(),
        name="pharmacy-dispense-history",
    ),

    # Reports
    path(
        "pharmacy/reports/revenue/",
        views.RevenueReportView.as_view(),
        name="pharmacy-report-revenue",
    ),
    path(
        "pharmacy/reports/consumption/",
        views.ConsumptionReportView.as_view(),
        name="pharmacy-report-consumption",
    ),
    path(
        "pharmacy/reports/low-stock/",
        views.LowStockReportView.as_view(),
        name="pharmacy-report-low-stock",
    ),
    path(
        "pharmacy/reports/expiry/",
        views.ExpiryReportView.as_view(),
        name="pharmacy-report-expiry",
    ),
]
