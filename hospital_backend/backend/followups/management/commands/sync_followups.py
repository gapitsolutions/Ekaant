from django.core.management.base import BaseCommand

from followups.services import sync_followup_tickets


class Command(BaseCommand):
    help = "Sync follow-up tickets: create pending and requeue unsuccessful callbacks"

    def handle(self, *args, **options):
        result = sync_followup_tickets()
        self.stdout.write(
            self.style.SUCCESS(
                "Synced follow-ups "
                f"(created={result['created']}, "
                f"requeued={result['requeued']}, "
                f"marked_successful={result['marked_successful']})"
            )
        )
