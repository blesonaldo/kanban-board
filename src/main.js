import './style.css'
import Sortable from 'sortablejs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

let tasks = []
let sortables = []
let editingId = null
const filters = { q: '', priority: '' }

const $ = (sel) => document.querySelector(sel)
const boardEl = $('#board')
const toastEl = $('#toast')
const dialog = $('#taskDialog')
const form = $('#taskForm')

function toast(msg) {
  toastEl.textContent = msg
  toastEl.hidden = false
  setTimeout(() => (toastEl.hidden = true), 3500)
}

async function ensureGuest() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}

async function loadTasks() {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) throw error
  tasks = data
}

// ---- Due dates ----
function dueState(t) {
  if (!t.due_date || t.status === 'done') return ''
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local time
  if (t.due_date < today) return 'overdue'
  const soon = new Date()
  soon.setDate(soon.getDate() + 2)
  if (t.due_date <= soon.toLocaleDateString('en-CA')) return 'soon'
  return ''
}

// ---- Cards ----
function cardEl(t) {
  const card = document.createElement('div')
  card.className = 'card'
  card.dataset.id = t.id
  card.onclick = () => openEdit(t.id)

  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = t.title
  card.append(title)

  if (t.description) {
    const d = document.createElement('div')
    d.className = 'desc'
    d.textContent = t.description
    card.append(d)
  }

  const meta = document.createElement('div')
  meta.className = 'meta'
  const badge = document.createElement('span')
  badge.className = 'badge ' + t.priority
  badge.textContent = t.priority
  meta.append(badge)

  if (t.due_date) {
    const state = dueState(t)
    const today = new Date().toLocaleDateString('en-CA')
    const prefix =
      state === 'overdue' ? 'Overdue · '
      : state === 'soon' && t.due_date === today ? 'Due today · '
      : state === 'soon' ? 'Due soon · '
      : 'Due '
    const pretty = new Date(t.due_date + 'T00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    const due = document.createElement('span')
    due.className = 'due ' + state
    due.textContent = prefix + pretty
    meta.append(due)
  }

  card.append(meta)
  return card
}
// ---- Filters and stats ----
function matches(t) {
  if (filters.priority && t.priority !== filters.priority) return false
  if (filters.q) {
    const q = filters.q.toLowerCase()
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }
  return true
}

function renderStats() {
  $('#seedBtn').hidden = tasks.length > 0
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const overdue = tasks.filter((t) => dueState(t) === 'overdue').length
  const stat = (n, label, cls = '') =>
    `<div class="stat ${cls}"><b>${n}</b>${label}</div>`
  $('#stats').innerHTML =
    stat(total, 'total') +
    stat(done, 'completed') +
    stat(overdue, 'overdue', overdue ? 'warn' : '')
}

// ---- Board ----
function render() {
  sortables.forEach((s) => s.destroy())
  sortables = []
  boardEl.innerHTML = ''

  for (const col of COLUMNS) {
    const items = tasks
      .filter((t) => t.status === col.id && matches(t))
      .sort((a, b) => a.position - b.position)

    const section = document.createElement('section')
    section.className = 'column'
    const h = document.createElement('h2')
    h.textContent = col.title + ' '
    const count = document.createElement('span')
    count.className = 'count'
    count.textContent = items.length
    h.append(count)

    const list = document.createElement('div')
    list.className = 'list'
    list.dataset.status = col.id
    items.forEach((t) => list.append(cardEl(t)))

    section.append(h, list)
    boardEl.append(section)

    sortables.push(
      Sortable.create(list, {
        group: 'tasks',
        animation: 150,
        ghostClass: 'ghost',
        onEnd: onDrop,
      })
    )
  }
  renderStats()
}

async function onDrop(evt) {
  const id = evt.item.dataset.id
  const newStatus = evt.to.dataset.status
  const siblings = [...evt.to.children].filter((node) => node.dataset.id)
  const i = siblings.findIndex((node) => node.dataset.id === id)
  const pos = (node) => tasks.find((t) => t.id === node.dataset.id).position
  const prev = siblings[i - 1]
  const next = siblings[i + 1]

  let position
  if (prev && next) position = (pos(prev) + pos(next)) / 2
  else if (prev) position = pos(prev) + 1000
  else if (next) position = pos(next) - 1000
  else position = 1000

  const task = tasks.find((t) => t.id === id)
  const before = { status: task.status, position: task.position }
  task.status = newStatus
  task.position = position
  render() // update instantly

  const { error } = await supabase
    .from('tasks')
    .update({ status: newStatus, position })
    .eq('id', id)

  if (error) {
    Object.assign(task, before) // roll back
    render()
    toast('Could not save that move. It was reverted.')
  }
}

// ---- Task dialog (create + edit) ----
function openCreate() {
  editingId = null
  form.reset()
  $('#dialogTitle').textContent = 'New task'
  $('#saveBtn').textContent = 'Create'
  $('#deleteBtn').hidden = true
  dialog.showModal()
  $('#fTitle').focus()
}

function openEdit(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  editingId = id
  $('#fTitle').value = t.title
  $('#fDesc').value = t.description || ''
  $('#fPriority').value = t.priority
  $('#fDue').value = t.due_date || ''
  $('#dialogTitle').textContent = 'Edit task'
  $('#saveBtn').textContent = 'Save'
  $('#deleteBtn').hidden = false
  dialog.showModal()
}

$('#newTaskBtn').onclick = openCreate
$('#cancelBtn').onclick = () => dialog.close()

$('#deleteBtn').onclick = async () => {
  if (!editingId || !confirm('Delete this task?')) return
  const { error } = await supabase.from('tasks').delete().eq('id', editingId)
  if (error) return toast('Could not delete: ' + error.message)
  tasks = tasks.filter((t) => t.id !== editingId)
  render()
  dialog.close()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const saveBtn = $('#saveBtn')
  const label = saveBtn.textContent
  const title = $('#fTitle').value.trim()
  if (!title) return

  const fields = {
    title,
    description: $('#fDesc').value.trim() || null,
    priority: $('#fPriority').value,
    due_date: $('#fDue').value || null,
  }

  saveBtn.disabled = true
  saveBtn.textContent = 'Saving...'
  let result
  if (editingId) {
    result = await supabase.from('tasks').update(fields).eq('id', editingId).select().single()
  } else {
    const todo = tasks.filter((t) => t.status === 'todo').map((t) => t.position)
    const position = (todo.length ? Math.max(...todo) : 0) + 1000
    result = await supabase
      .from('tasks')
      .insert({ ...fields, status: 'todo', position })
      .select()
      .single()
  }
  saveBtn.disabled = false
  saveBtn.textContent = label

  if (result.error) return toast('Could not save: ' + result.error.message)
  if (editingId) {
    tasks = tasks.map((t) => (t.id === editingId ? result.data : t))
  } else {
    tasks.push(result.data)
  }
  render()
  dialog.close()
})

// ---- Search and filter ----
$('#search').addEventListener('input', (e) => {
  filters.q = e.target.value.trim()
  render()
})
$('#filterPriority').addEventListener('change', (e) => {
  filters.priority = e.target.value
  render()
})
// ---- Sample tasks ----
$('#seedBtn').onclick = async () => {
  const day = (n) => {
    const x = new Date()
    x.setDate(x.getDate() + n)
    return x.toLocaleDateString('en-CA')
  }
  const rows = [
    { title: 'Design the landing page', description: 'Wireframes and color palette', priority: 'high', due_date: day(1), status: 'todo', position: 1000 },
    { title: 'Write API documentation', description: 'Cover auth and task endpoints', priority: 'normal', due_date: day(5), status: 'todo', position: 2000 },
    { title: 'Fix login bug', description: 'Guest session not persisting on mobile', priority: 'high', due_date: day(-1), status: 'in_progress', position: 1000 },
    { title: 'Review pull request', description: null, priority: 'low', due_date: null, status: 'in_review', position: 1000 },
    { title: 'Set up CI pipeline', description: 'Run build on every push', priority: 'normal', due_date: null, status: 'done', position: 1000 },
  ]
  const { data, error } = await supabase.from('tasks').insert(rows).select()
  if (error) return toast('Could not add samples: ' + error.message)
  tasks.push(...data)
  render()
}
// ---- Start ----
async function init() {
  boardEl.innerHTML = '<div class="state">Loading your board...</div>'
  try {
    await ensureGuest()
    await loadTasks()
    render()
  } catch (err) {
    boardEl.innerHTML = ''
    const box = document.createElement('div')
    box.className = 'state'
    box.textContent = 'Something went wrong: ' + err.message + ' '
    const retry = document.createElement('button')
    retry.className = 'btn'
    retry.textContent = 'Try again'
    retry.onclick = init
    box.append(retry)
    boardEl.append(box)
  }
}
init()