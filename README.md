# kanban-board
# Kanban Task Board

A Kanban-style task board with automatic guest accounts. Create tasks, drag them between columns, and manage work visually. Each guest sees only their own tasks.

## Features

- Four columns: To Do, In Progress, In Review, Done
- Drag and drop between and within columns; status and order persist
- Create, edit, and delete tasks (title, description, priority, due date)
- Automatic guest accounts via Supabase anonymous sign-in
- Row Level Security so each guest can only read and write their own data
- Due-date indicators (due today, due soon, overdue)
- Search by title or description, and a priority filter
- Board summary: total, completed, and overdue counts
- Loading, empty, and error states; responsive layout
- "Add sample tasks" button on an empty board

## Tech stack

- Vanilla JavaScript with [Vite](https://vitejs.dev/)
- [SortableJS](https://sortablejs.github.io/Sortable/) for drag and drop
- [Supabase](https://supabase.com/) (Postgres, anonymous Auth, RLS)
- Hosted on Cloudflare

## Run locally

1. Create a free Supabase project. Under **Authentication**, enable **Anonymous sign-ins**.
2. In the SQL editor, run the schema below.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and fill in your project URL and
