let grades = [
    { sub: 'Mates', val: 7.5 },
    { sub: 'Historia', val: 6.0 }
];

// Cambiar de página
function showPage(pageId) {
    document.querySelectorAll('.screen-content').forEach(s => s.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function updateUI() {
    const list = document.getElementById('notes-list');
    const tasks = document.getElementById('tasks-list');
    list.innerHTML = '';
    tasks.innerHTML = '';

    // Mostrar últimas 4 notas
    grades.slice(-4).reverse().forEach(g => {
        const li = document.createElement('li');
        li.textContent = `• ${g.sub}: ${g.val}`;
        list.appendChild(li);
        
        // Simular tareas basadas en notas
        const tLi = document.createElement('li');
        tLi.innerHTML = `<span>• Repasar ${g.sub}</span> <input type="checkbox" onclick="this.parentElement.remove()">`;
        tLi.style.display = 'flex'; tLi.style.justifyContent = 'space-between';
        tasks.appendChild(tLi);
    });

    // Calcular Media
    const avg = grades.reduce((a, b) => a + b.val, 0) / grades.length;
    document.getElementById('average-value').textContent = avg.toFixed(1).replace('.', ',');
}

// Lógica Modal
const modal = document.getElementById('add-note-modal');
document.getElementById('plus-btn').onclick = () => modal.style.display = 'flex';
document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';

document.getElementById('save-btn').onclick = () => {
    const sub = document.getElementById('sub-in').value;
    const val = parseFloat(document.getElementById('grade-in').value);
    if (sub && !isNaN(val)) {
        grades.push({ sub, val });
        updateUI();
        modal.style.display = 'none';
        document.getElementById('sub-in').value = '';
        document.getElementById('grade-in').value = '';
    }
};

// Iniciar
updateUI();
