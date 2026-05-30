from django.urls import path

from .views import (
    ReceptionFollowUpCallCompleteView,
    ReceptionFollowUpCallingReportView,
    ReceptionFollowUpListView,
)

urlpatterns = [
    path("receptionist/follow-ups/", ReceptionFollowUpListView.as_view(), name="reception-followups"),
    path(
        "receptionist/follow-ups/<int:ticket_id>/complete-call/",
        ReceptionFollowUpCallCompleteView.as_view(),
        name="reception-followups-complete-call",
    ),
    path(
        "receptionist/follow-ups/report/",
        ReceptionFollowUpCallingReportView.as_view(),
        name="reception-followups-report",
    ),
]
