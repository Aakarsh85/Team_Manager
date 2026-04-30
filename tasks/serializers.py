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

    class Meta:
        model = Project
        fields = ("id", "name", "description", "created_by", "created_at", "members")
        read_only_fields = ("id", "created_by", "created_at", "members")

    def get_members(self, obj):
        return ProjectMemberSerializer(obj.memberships.select_related("user"), many=True).data


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_detail = UserSerializer(source="assigned_to", read_only=True)
    created_by = UserSerializer(read_only=True)

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
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "assigned_to_detail")

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
