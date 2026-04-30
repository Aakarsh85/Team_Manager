from django.utils import timezone
from rest_framework import decorators, filters, generics, permissions, response, status, viewsets
from rest_framework.exceptions import PermissionDenied

from .models import Project, ProjectMember, Task
from .permissions import is_global_admin, is_project_admin, is_project_member
from .serializers import DashboardSerializer, ProjectMemberSerializer, ProjectSerializer, TaskSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            Project.objects.filter(memberships__user=self.request.user)
            .select_related("created_by")
            .prefetch_related("memberships__user")
            .distinct()
        )

    def perform_create(self, serializer):
        if not is_global_admin(self.request.user):
            raise PermissionDenied("Only admins can create projects.")
        project = serializer.save(created_by=self.request.user)
        ProjectMember.objects.get_or_create(
            user=self.request.user,
            project=project,
            defaults={"role": ProjectMember.Role.ADMIN},
        )

    @decorators.action(detail=True, methods=["post"], url_path="add-member")
    def add_member(self, request, pk=None):
        project = self.get_object()
        if not is_project_admin(request.user, project):
            raise PermissionDenied("Only project admins can add members.")

        serializer = ProjectMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership, _ = ProjectMember.objects.update_or_create(
            user=serializer.validated_data["user"],
            project=project,
            defaults={"role": serializer.validated_data.get("role", ProjectMember.Role.MEMBER)},
        )
        return response.Response(ProjectMemberSerializer(membership).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=["delete"], url_path="remove-member/(?P<user_id>[^/.]+)")
    def remove_member(self, request, pk=None, user_id=None):
        """Remove a member from the project. URL pattern: /api/projects/{id}/remove-member/{user_id}/"""
        project = self.get_object()
        if not is_project_admin(request.user, project):
            raise PermissionDenied("Only project admins can remove members.")
        
        # Prevent removing yourself
        if str(request.user.id) == user_id:
            raise PermissionDenied("Project admins cannot remove themselves.")
        
        deleted, _ = ProjectMember.objects.filter(project=project, user_id=user_id).delete()
        if not deleted:
            return response.Response({"detail": "Membership not found."}, status=status.HTTP_404_NOT_FOUND)
        return response.Response(status=status.HTTP_204_NO_CONTENT)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["title", "description", "project__name"]

    def get_queryset(self):
        queryset = (
            Task.objects.filter(project__memberships__user=self.request.user)
            .select_related("project", "assigned_to", "created_by")
            .distinct()
        )
        project_id = self.request.query_params.get("project")
        user_id = self.request.query_params.get("user")
        status_value = self.request.query_params.get("status")
        priority = self.request.query_params.get("priority")

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if user_id:
            queryset = queryset.filter(assigned_to_id=user_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if priority:
            queryset = queryset.filter(priority=priority)
        return queryset

    def perform_create(self, serializer):
        project = serializer.validated_data["project"]
        if not is_project_member(self.request.user, project):
            raise PermissionDenied("Only project members can create tasks in this project.")
        if not is_project_admin(self.request.user, project) and serializer.validated_data["assigned_to"] != self.request.user:
            raise PermissionDenied("Members can only create tasks assigned to themselves.")
        serializer.save(created_by=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        self._assert_task_update_allowed(task, request.data)
        return super().partial_update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        task = self.get_object()
        self._assert_task_update_allowed(task, request.data)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if not is_project_admin(request.user, task.project):
            raise PermissionDenied("Only project admins can delete tasks.")
        return super().destroy(request, *args, **kwargs)

    def _assert_task_update_allowed(self, task, payload):
        if not is_project_member(self.request.user, task.project):
            raise PermissionDenied("Only project members can update tasks.")
        if is_project_admin(self.request.user, task.project):
            return
        disallowed = set(payload.keys()) - {"status"}
        if disallowed:
            raise PermissionDenied("Members can only update task status.")
        if task.assigned_to_id != self.request.user.id:
            raise PermissionDenied("Only the assigned user can update this task.")


class DashboardView(generics.GenericAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_tasks = Task.objects.filter(project__memberships__user=request.user).distinct()
        assigned_tasks = user_tasks.filter(assigned_to=request.user).select_related("project", "assigned_to", "created_by")
        today = timezone.localdate()
        data = {
            "total_tasks": assigned_tasks.count(),
            "completed_tasks": assigned_tasks.filter(status=Task.Status.DONE).count(),
            "pending_tasks": assigned_tasks.exclude(status=Task.Status.DONE).count(),
            "overdue_tasks": assigned_tasks.filter(due_date__lt=today).exclude(status=Task.Status.DONE).count(),
            "assigned_tasks": assigned_tasks,
        }
        serializer = self.get_serializer(data)
        return response.Response(serializer.data)