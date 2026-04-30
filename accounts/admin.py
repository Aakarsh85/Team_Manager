from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("email", "username", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    ordering = ("email",)
    search_fields = ("email", "username")
    fieldsets = UserAdmin.fieldsets + (("Team Task Manager", {"fields": ("role",)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Team Task Manager", {"fields": ("email", "role")}),)
