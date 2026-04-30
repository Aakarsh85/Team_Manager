from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Project, ProjectMember, Task


User = get_user_model()


class PermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com", password="StrongPass123", role=User.Role.ADMIN)
        self.member = User.objects.create_user(username="member", email="member@example.com", password="StrongPass123", role=User.Role.MEMBER)
        self.other = User.objects.create_user(username="other", email="other@example.com", password="StrongPass123", role=User.Role.MEMBER)
        self.project = Project.objects.create(name="Launch", description="", created_by=self.admin)
        ProjectMember.objects.create(project=self.project, user=self.admin, role=ProjectMember.Role.ADMIN)
        ProjectMember.objects.create(project=self.project, user=self.member, role=ProjectMember.Role.MEMBER)
        self.task = Task.objects.create(
            title="Draft plan",
            description="",
            project=self.project,
            assigned_to=self.member,
            created_by=self.admin,
            due_date=timezone.localdate() + timedelta(days=1),
        )

    def test_member_can_update_only_assigned_task_status(self):
        self.client.force_authenticate(self.member)
        response = self.client.patch(f"/api/tasks/{self.task.id}/", {"status": Task.Status.DONE}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_member_cannot_update_another_users_task(self):
        self.client.force_authenticate(self.other)
        response = self.client.patch(f"/api/tasks/{self.task.id}/", {"status": Task.Status.DONE}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_admin_can_add_project_member(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/projects/{self.project.id}/add-member/",
            {"user_id": self.other.id, "role": ProjectMember.Role.MEMBER},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ProjectMember.objects.filter(project=self.project, user=self.other).exists())
