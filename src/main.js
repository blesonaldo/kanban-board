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

const boardEl = document.querySelector('#board')
const toastEl = document.querySelector('#toast')
const dialog = document.querySelector('#taskDialog')
const form = document.querySelector('#taskForm')

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

function cardEl(t) {
  const el = document.createElement('div')
  el.className = 'card'
  el.dataset.id = t.id

  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = t.title
  el.append(title)

  if (t.description) {
    const d = document.createElement('div')
    d.className = 'desc'
    d.textContent = t.description
    el.append(d)
  }

  const meta = document.createElement('div')
  meta.className = 'meta'
  const badge = document.createElement('span')
  badge.className = 'badge ' + t.priority
  badge.textContent = t.priority
  meta.append(badge)
  if (t.due_date) {
    const due = document.createElement('span')
    due.textContent = 'Due ' + t.due_date
    meta.append(due)
  }
  el.append(meta)
  return el
}

function render() {
  sortables.forEach((s) => s.destroy())
  sortables = []
  boardEl.innerHTML = ''

  for (const col of COLUMNS) {
    const items = tasks
      .filter((t) => t.status === col.id)
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
}

async function onDrop(evt) {
  const id = evt.item.dataset.id
  const newStatus = evt.to.dataset.status
  const siblings = [...evt.to.children].filter((el) => el.dataset.id)
  const i = siblings.findIndex((el) => el.dataset.id === id)
  const pos = (el) => tasks.find((t) => t.id === el.dataset.id).position
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

// ---- New task dialog ----
document.querySelector('#newTaskBtn').onclick = () => {
  form.reset()
  dialog.showModal()
  document.querySelector('#fTitle').focus()
}
document.querySelector('#cancelBtn').onclick = () => dialog.close()

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const saveBtn = document.querySelector('#saveBtn')
  const title = document.querySelector('#fTitle').value.trim()
  if (!title) return

  const todoPositions = tasks.filter((t) => t.status === 'todo').map((t) => t.position)
  const position = (todoPositions.length ? Math.max(...todoPositions) : 0) + 1000

  saveBtn.disabled = true
  saveBtn.textContent = 'Creating...'
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: document.querySelector('#fDesc').value.trim() || null,
      priority: document.querySelector('#fPriority').value,
      due_date: document.querySelector('#fDue').value || null,
      status: 'todo',
      position,
    })
    .select()
    .single()
  saveBtn.disabled = false
  saveBtn.textContent = 'Create'

  if (error) return toast('Could not create task: ' + error.message)
  tasks.push(data)
  render()
  dialog.close()
})

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