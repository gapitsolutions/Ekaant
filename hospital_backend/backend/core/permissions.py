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


class IsReceptionAdminOrPharmacist(BasePermission):
    def has_permission(self, request, view):
        return _user_has_role(
            request.user,
            {"admin", "reception", "receptionist", "pharmacist"},
        )


class IsPharmacistOrAdmin(BasePermission):  # NEW
    """Restricts mutating pharmacy actions (medicine CRUD, dispense, audit removal,
    purchase invoice, cancel) to pharmacist + admin only."""

    def has_permission(self, request, view):
        return _user_has_role(request.user, {"admin", "pharmacist"})
