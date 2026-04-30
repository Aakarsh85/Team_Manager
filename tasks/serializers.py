from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import UserSerializer
from .models import Project, ProjectMember, Task


User = get_user_model()


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.all(), write_only=True)

    class Meta:
        model = ProjectMember
        fields = ("id", "user", "user_id", "role")
        read_only_fields = ("id", "user")


class ProjectSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    members = serializers.SerializerMethodField()
    task_count = serializers.SerializerMethodField()
    completed_task_count = serializers.SerializerMethodField()
    completion = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    overdue_task_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "description",
            "created_by",
            "created_at",
            "members",
            "task_count",
            "completed_task_count",
            "completion",
            "status",
            "overdue_task_count",
        )
        read_only_fields = (
            "id",
            "created_by",
            "created_at",
            "members",
            "task_count",
            "completed_task_count",
            "completion",
            "status",
            "overdue_task_count",
        )

    def get_members(self, obj):
        return ProjectMemberSerializer(obj.memberships.select_related("user"), many=True).data

    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_completed_task_count(self, obj):
        return obj.tasks.filter(status=Task.Status.DONE).count()

    def get_completion(self, obj):
        total = self.get_task_count(obj)
        if total == 0:
            return 0
        return round((self.get_completed_task_count(obj) / total) * 100)

    def get_status(self, obj):
        total = self.get_task_count(obj)
        if total == 0:
            return "PLANNING"
        if self.get_completed_task_count(obj) == total:
            return "COMPLETED"
        return "IN_PROGRESS"

    def get_overdue_task_count(self, obj):
        return obj.tasks.filter(due_date__lt=timezone.localdate()).exclude(status=Task.Status.DONE).count()


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_detail = UserSerializer(source="assigned_to", read_only=True)
    created_by = UserSerializer(read_only=True)
    project_detail = ProjectSerializer(source="project", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = Task
        fields = (
            "id",
            "title",
            "description",
            "status",
            "priority",
            "due_date",
            "assigned_to",
            "assigned_to_detail",
            "project",
            "project_detail",
            "project_name",
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "assigned_to_detail", "project_detail", "project_name")

    def validate_due_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("Due date cannot be in the past.")
        return value

    def validate(self, attrs):
        project = attrs.get("project") or getattr(self.instance, "project", None)
        assigned_to = attrs.get("assigned_to") or getattr(self.instance, "assigned_to", None)
        if project and assigned_to:
            is_member = ProjectMember.objects.filter(project=project, user=assigned_to).exists()
            if not is_member:
                raise serializers.ValidationError({"assigned_to": "Assigned user must be a project member."})
        return attrs


class DashboardSerializer(serializers.Serializer):
    total_tasks = serializers.IntegerField()
    completed_tasks = serializers.IntegerField()
    pending_tasks = serializers.IntegerField()
    overdue_tasks = serializers.IntegerField()
    assigned_tasks = TaskSerializer(many=True)
    active_projects = ProjectSerializer(many=True)
