from rest_framework import permissions

from accounts.models import User
from .models import ProjectMember


def is_global_admin(user):
    return bool(user and user.is_authenticated and user.role == User.Role.ADMIN)


def get_project_role(user, project):
    if not user or not user.is_authenticated:
        return None
    membership = ProjectMember.objects.filter(user=user, project=project).first()
    return membership.role if membership else None


def is_project_member(user, project):
    return get_project_role(user, project) is not None


def is_project_admin(user, project):
    return is_global_admin(user) or get_project_role(user, project) == ProjectMember.Role.ADMIN


class IsProjectMemberObject(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return is_project_member(request.user, obj)


class IsTaskParticipant(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not is_project_member(request.user, obj.project):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.method == "DELETE":
            return is_project_admin(request.user, obj.project)
        if is_project_admin(request.user, obj.project):
            return True
        return obj.assigned_to_id == request.user.id
