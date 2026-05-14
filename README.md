# Team Task Manager

A full-stack task manager for teams, built with Django, Django REST Framework, JWT authentication, PostgreSQL, and a simple HTML/CSS/JavaScript frontend.

## 🔗 Live Demo

🌐 **Live:** https://web-production-fae66.up.railway.app/login/

📂 **Repository:** https://github.com/Aakarsh85/Team_Manager


## Features

- Custom user model with `ADMIN` and `MEMBER` roles
- JWT signup/login using SimpleJWT
- Project creation and project membership management
- Task creation, assignment, filtering, search, status updates, and deletion
- Permission checks for project membership, project admins, and assigned task owners
- Dashboard API with total, completed, pending, and overdue assigned-task counts
- Railway-ready deployment files

## Tech Stack

- Backend: Django + Django REST Framework
- Auth: SimpleJWT
- Database: PostgreSQL in production through `DATABASE_URL`
- Frontend: Django template + plain HTML, CSS, and JavaScript Fetch API
- Deployment: Railway

## Local Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

For local PostgreSQL, set a `DATABASE_URL` before running migrations:

```bash
set DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB_NAME
```

Without `DATABASE_URL`, the app uses SQLite for quick local development.

## Environment Variables

- `SECRET_KEY`: Django secret key
- `DEBUG`: set to `False` in production
- `DATABASE_URL`: Railway PostgreSQL connection URL
- `ALLOWED_HOSTS`: comma-separated hosts, for example `.up.railway.app,your-domain.com`
- `CSRF_TRUSTED_ORIGINS`: comma-separated HTTPS origins when using custom domains
- `JWT_ACCESS_MINUTES`: optional access token lifetime, default `60`
- `JWT_REFRESH_DAYS`: optional refresh token lifetime, default `7`

## API Endpoints

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

Projects:

- `POST /api/projects/` admin only
- `GET /api/projects/` current user's projects
- `GET /api/projects/{id}/`
- `POST /api/projects/{id}/add-member/` project admin only
- `DELETE /api/projects/{id}/remove-member/` project admin only, accepts `user_id`

Tasks:

- `POST /api/tasks/`
- `GET /api/tasks/?project=&user=&status=&priority=&search=`
- `GET /api/tasks/{id}/`
- `PATCH /api/tasks/{id}/` assigned members can update only `status`; admins can update task fields
- `DELETE /api/tasks/{id}/` project admin only

Dashboard:

- `GET /api/dashboard/`

Returns:

```json
{
  "total_tasks": 4,
  "completed_tasks": 1,
  "pending_tasks": 3,
  "overdue_tasks": 1,
  "assigned_tasks": []
}
```

## Railway Deployment

1. Push this repository to GitHub.
2. Create a Railway project from the GitHub repository.
3. Add a Railway PostgreSQL database.
4. Configure variables:
   - `SECRET_KEY`
   - `DEBUG=False`
   - `DATABASE_URL`
   - `ALLOWED_HOSTS=.up.railway.app,.railway.app`
   - `CSRF_TRUSTED_ORIGINS=https://your-app.up.railway.app`
5. Deploy. Railway will run migrations, collect static files, and start Gunicorn through `railway.json`/`Procfile`.

## Submission

- Live deployed URL: add after Railway deploy
- GitHub repository: add after pushing to GitHub
- Demo: the root `/` serves the simple frontend
