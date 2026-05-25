from rest_framework.views import exception_handler
import traceback

def custom_exception_handler(exc, context):
    print("\n=== DRF EXCEPTION ===")
    print("View:", context.get("view"))
    print("Exception:", exc)

    traceback.print_exc()

    response = exception_handler(exc, context)

    if response is not None:
        print("Response data:", response.data)

    return response