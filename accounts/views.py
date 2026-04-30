from rest_framework import generics, permissions

from .models import User
from .serializers import SignupSerializer, UserSerializer


class SignupView(generics.CreateAPIView):
    serializer_class = SignupSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role != User.Role.ADMIN:
            return User.objects.filter(id=user.id)
        return User.objects.order_by("username", "email")
