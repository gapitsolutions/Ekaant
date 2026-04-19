from rest_framework.permissions import BasePermission


def _user_has_role(user, allowed_roles: set[str]) -> bool:
    return bool(
        user and user.is_authenticated and getattr(user, "role", None) in allowed_roles
    )


class IsReceptionOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return _user_has_role(request.user, {"admin", "reception", "receptionist"})


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return _user_has_role(request.user, {"admin"})
