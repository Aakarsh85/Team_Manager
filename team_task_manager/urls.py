from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import MeView, SignupView, UserListView
from tasks.views import DashboardView, ProjectViewSet, TaskViewSet


router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("tasks", TaskViewSet, basename="task")

urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("login/", TemplateView.as_view(template_name="login.html"), name="login_page"),
    path("dashboard/", TemplateView.as_view(template_name="app.html", extra_context={"page": "dashboard"}), name="dashboard_page"),
    path("projects/", TemplateView.as_view(template_name="app.html", extra_context={"page": "projects"}), name="projects_page"),
    path("tasks/", TemplateView.as_view(template_name="app.html", extra_context={"page": "tasks"}), name="tasks_page"),
    path("admin/", admin.site.urls),
    path("api/auth/signup", SignupView.as_view(), name="signup"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/login", TokenObtainPairView.as_view(), name="login"),
    path("api/auth/refresh", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/users/", UserListView.as_view(), name="users"),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/", include(router.urls)),
]
