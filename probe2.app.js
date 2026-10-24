const state = XM.seed('habitTracker', () => ({
  habits: [],
  today: new Date().toISOString().split('T')[0]
}));

const totalStreakEl = document.getElementById('total-streak');
const habitsCountEl = document.getElementById('habits-count');
const emptyMsg = document.getElementById('empty-msg');
const addForm = document.getElementById('add-habit-form');
const habitsList = document.getElementById('habits-list');

function render() {
  const totalStreak = state.habits.reduce((sum, h) => sum + (h.streak || 0), 0);
  totalStreakEl.textContent = totalStreak;
  habitsCountEl.textContent = state.habits.length;

  if (state.habits.length === 0) {
    emptyMsg.textContent = 'Add a habit to get started';
    habitsList.innerHTML = '';
    return;
  }

  emptyMsg.textContent = '';
  habitsList.innerHTML = state.habits.map((h, hi) => {
    const lastCheck = h.checks.length ? new Date(h.checks[h.checks.length - 1]) : null;
    const today = new Date();
    const isTodayChecked = lastCheck && lastCheck.toISOString().split('T')[0] === today.toISOString().split('T')[0];
    const streak = computeStreak(h.checks);

    return `
      <article class="xm-item${isTodayChecked ? ' done' : ''}" data-habid="${hi}">
        <input type="checkbox" class="xm-chip${isTodayChecked ? ' active' : ''}" 
          ${isTodayChecked ? 'checked' : ''} 
          onchange="window.handleCheck(${hi})">
        <div class="xm-item-label">${XM.esc(h.name)}</div>
        <span class="xm-stat" style="margin-left:auto; color:var(--xm-muted); font-size:12px;">
          streak: ${streak}
        </span>
        <button class="xm-btn-ghost xm-icon" title="delete" onclick="window.handleDelete(${hi})">×</button>
      </article>
    `;
  }).join('');

  // update chip filters
  renderFilters();
}

function computeStreak(checks) {
  if (!checks.length) return 0;
  let streak = 0;
  let day = new Date();
  day.setHours(0,0,0,0);
  for (let i = checks.length - 1; i >= 0; i--) {
    const c = new Date(checks[i]);
    c.setHours(0,0,0,0);
    const diff = Math.floor((day - c) / 86400000);
    if (diff === streak) { streak++; day.setDate(day.getDate() - 1); }
    else break;
  }
  return streak;
}

function renderFilters() {
  const categories = [...new Set(state.habits.map(h => h.name.split(' ')[0] || 'general'))];
  const filterHtml = categories.map(c => `
    <label class="xm-chip${state.activeFilter === c ? ' active' : ''}" 
      onclick="window.setFilter('${c}')">
      ${XM.esc(c)}
    </label>
  `).join(' ');
  document.querySelector('.xm-chip.filters')?.parentNode?.innerHTML = filterHtml || '';
}

window.handleCheck = function(i) {
  const h = state.habits[i];
  const today = new Date().toISOString().split('T')[0];
  const alreadyChecked = h.checks.includes(today);
  
  if (alreadyChecked) {
    h.checks = h.checks.filter(d => d !== today);
  } else {
    h.checks.push(today);
  }
  XM.save('habitTracker', state);
  render();
  XM.toast(alreadyChecked ? 'Unchecked' : 'Checked today');
};

window.handleDelete = function(i) {
  if (XM.confirm(`Remove "${state.habits[i].name}"?`)) {
    state.habits.splice(i, 1);
    XM.save('habitTracker', state);
    render();
    XM.toast('Habit removed');
  }
};

window.setFilter = function(cat) {
  state.activeFilter = cat;
  render();
};

addForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('habit-name').value.trim();
  if (!name) return;
  state.habits.push({ name, checks: [] });
  XM.save('habitTracker', state);
  document.getElementById('habit-name').value = '';
  render();
  XM.toast('Habit added');
});

render();