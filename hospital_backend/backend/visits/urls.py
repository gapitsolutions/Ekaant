from django.urls import path

from .views import (
    CheckinPatientView,
    ReceptionCheckinHistoryDetailView,  # CHANGED: replaces ReceptionCheckinHistoryDeleteView (now also handles PATCH)
    ReceptionCheckinHistoryListView,
    ReceptionCheckinHistoryPhotoView,
    ReceptionCustomRangeReportView,
    ReceptionDailyReportView,
    ReceptionMonthlyReportView,
    DashboardStatsView,
    QueueStatusView,
)

urlpatterns = [
    path("sessions/checkin/", CheckinPatientView.as_view(), name="session-checkin"),
    path("receptionist/dashboard/", DashboardStatsView.as_view(), name="receptionist-dashboard"),
    path("receptionist/queue/", QueueStatusView.as_view(), name="receptionist-queue"),
    path(
        "receptionist/checkin-history/",
        ReceptionCheckinHistoryListView.as_view(),
        name="receptionist-checkin-history",
    ),
    path(
        "receptionist/checkin-history/<uuid:session_id>/verification-photo/",
        ReceptionCheckinHistoryPhotoView.as_view(),
        name="receptionist-checkin-history-photo",
    ),
    path(
        "receptionist/checkin-history/<uuid:session_id>/",
        ReceptionCheckinHistoryDetailView.as_view(),  # CHANGED: now PATCH + DELETE
        name="receptionist-checkin-history-detail",
    ),
    path(
        "receptionist/reports/daily/",
        ReceptionDailyReportView.as_view(),
        name="receptionist-reports-daily",
    ),
    path(
        "receptionist/reports/monthly/",
        ReceptionMonthlyReportView.as_view(),
        name="receptionist-reports-monthly",
    ),
    path(
        "receptionist/reports/custom-range/",
        ReceptionCustomRangeReportView.as_view(),
        name="receptionist-reports-custom-range",
    ),
]
