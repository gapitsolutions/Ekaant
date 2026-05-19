from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from core.pagination import paginate_queryset
from core.permissions import IsReceptionOrAdmin
from core.responses import success_response

from .models import FollowUpStatus, FollowUpTicket
from .serializers import (
    FollowUpCallCompleteSerializer,
    FollowUpListQuerySerializer,
    followup_item_payload,
)
from .services import complete_followup_call, followup_queryset, sync_followup_tickets


class ReceptionFollowUpListView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        sync_followup_tickets()

        query_serializer = FollowUpListQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        query = (query_serializer.validated_data.get("q") or "").strip()
        stage = query_serializer.validated_data["stage"]
        page = query_serializer.validated_data["page"]
        page_size = query_serializer.validated_data["pageSize"]

        queryset = followup_queryset(query=query, stage=stage)
        paginated_queryset, pagination = paginate_queryset(queryset, page, page_size)
        items = [followup_item_payload(ticket) for ticket in paginated_queryset]

        counts_base = followup_queryset(query=query, stage="all")
        counts = {
            "pending": counts_base.filter(status=FollowUpStatus.PENDING).count(),
            "completed": counts_base.filter(status=FollowUpStatus.COMPLETED).count(),
            "successful": counts_base.filter(status=FollowUpStatus.SUCCESSFUL).count(),
            "all": counts_base.count(),
        }
        return success_response({"items": items, "pagination": pagination, "counts": counts})


class ReceptionFollowUpCallCompleteView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def post(self, request, ticket_id):
        sync_followup_tickets()
        ticket = get_object_or_404(
            FollowUpTicket.objects.select_related("patient"),
            pk=ticket_id,
        )
        if ticket.status == FollowUpStatus.SUCCESSFUL:
            return success_response(followup_item_payload(ticket))

        serializer = FollowUpCallCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_ticket = complete_followup_call(
            ticket=ticket,
            called_by=request.user,
            result=serializer.validated_data["call_result"],
            note=serializer.validated_data["call_note"],
            next_call_date=serializer.validated_data.get("next_call_date"),
        )
        return success_response(followup_item_payload(updated_ticket))
