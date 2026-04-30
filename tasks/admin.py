from django.contrib import admin

from .models import Project, ProjectMember, Task


class ProjectMemberInline(admin.TabularInline):
    model = ProjectMember
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "created_at")
    search_fields = ("name", "description")
    inlines = [ProjectMemberInline]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "assigned_to", "status", "priority", "due_date")
    list_filter = ("status", "priority", "project")
    search_fields = ("title", "description", "assigned_to__email")


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ("project", "user", "role")
    list_filter = ("role",)
    search_fields = ("project__name", "user__email")
