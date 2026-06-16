from django.urls import path

from . import views

urlpatterns = [
    path(
        "staff/designations/",
        views.DesignationListCreateView.as_view(),
        name="staff-designation-list-create",
    ),
    path(
        "staff/attendance/",
        views.AttendanceRosterView.as_view(),
        name="staff-attendance-roster",
    ),
    path("staff/summary/", views.StaffSummaryView.as_view(), name="staff-summary"),
    path("staff/", views.StaffListCreateView.as_view(), name="staff-list-create"),
    path(
        "staff/<uuid:staff_id>/attendance/",
        views.StaffAttendanceView.as_view(),
        name="staff-attendance-detail",
    ),
    path(
        "staff/<uuid:staff_id>/payroll/",
        views.StaffPayrollView.as_view(),
        name="staff-payroll",
    ),
    path(
        "staff/<uuid:staff_id>/payslips/",
        views.StaffPayslipView.as_view(),
        name="staff-payslips",
    ),
    path(
        "staff/<uuid:staff_id>/",
        views.StaffDetailView.as_view(),
        name="staff-detail",
    ),
]
