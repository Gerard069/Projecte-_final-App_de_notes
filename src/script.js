// === CONFIGURACIÓN FIREBASE ===
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  projectId: "TU_ID_PROYECTO",
  appId: "TU_APP_ID"
};

// Inicializar Firebase si no existe
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// === IDENTIFICACIÓN DE USUARIO ===
let userId = localStorage.getItem('app_user_id');
if (!userId) {
  userId = 'user_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('app_user_id', userId);
}

let myChart;
let subjects = [];

// === INICIO DE LA APP ===
window.onload = () => {
  // Escuchar Materias guardadas
  db.collection("materias").where("uid", "==", userId).orderBy("name")
    .onSnapshot(snap => {
      subjects = snap.docs.map(doc => doc.data().name);
      updateDropdown();
    });

  // Escuchar Notas guardadas
  db.collection("notas").where("uid", "==", userId).orderBy("date", "asc")
    .onSnapshot(snap => {
      const data = snap.docs.map(doc => doc.data());
      renderDashboard(data);
    });

  // Escuchar Tareas
  db.collection("tareas").where("uid", "==", userId)
    .onSnapshot(snap => {
      renderTasks(snap.docs.map(doc => ({id: doc.id, ...doc.data()})));
    });
};

// === LÓGICA DEL DESPLEGABLE DINÁMICO ===
function updateDropdown() {
  const sel = document.getElementById('select-materia');
  sel.innerHTML = `
    <option value="">Seleccionar...</option>
    <option value="NEW_SUBJECT" style="font-weight: bold; color: #007AFF;">+ Añadir nueva materia...</option>
  `;
  
  subjects.forEach(s => {
    const op = document.createElement('option');
    op.value = s;
    op.innerText = s;
    sel.appendChild(op);
  });
}

async function handleSubjectChange(value) {
  if (value === "NEW_SUBJECT") {
    const name = prompt("Escribe el nombre de la nueva materia:");
    if (name && name.trim() !== "") {
      const formattedName = name.trim();
      // Guardar solo si no existe ya
      if (!subjects.includes(formattedName)) {
        await db.collection("materias").add({ uid: userId, name: formattedName });
        // Se autoselecciona tras un pequeño delay para dejar que cargue
        setTimeout(() => {
            document.getElementById('select-materia').value = formattedName;
        }, 500);
      } else {
        document.getElementById('select-materia').value = formattedName;
      }
    } else {
      document.getElementById('select-materia').value = "";
    }
  }
}

// === FUNCIONES MODAL Y GUARDADO ===
function openModal() { document.getElementById('modal-nota').classList.remove('hidden'); }
function closeModal() { 
  document.getElementById('modal-nota').classList.add('hidden');
  document.getElementById('select-materia').value = "";
  document.getElementById('input-nota').value = "";
}

function saveGrade() {
  const sub = document.getElementById('select-materia').value;
  const val = parseFloat(document.getElementById('input-nota').value);
  
  if (sub && sub !== "NEW_SUBJECT" && !isNaN(val)) {
    db.collection("notas").add({ 
      uid: userId, 
      subject: sub, 
      value: val, 
      date: Date.now() 
    });
    closeModal();
  } else {
    alert("Selecciona una materia válida y escribe una nota.");
  }
}

// === RENDERIZADO DE DATOS Y GRÁFICO ===
function renderDashboard(data) {
  if(data.length > 0) {
    const avg = data.reduce((a, b) => a + b.value, 0) / data.length;
    document.getElementById('media-display').innerText = avg.toFixed(1).replace('.', ',');
  }
  
  const list = document.getElementById('recent-grades-list');
  list.innerHTML = data.slice(-4).reverse().map(g => `
    <div class="grade-row">
      <span>${g.subject}</span>
      <strong>${g.value.toString().replace('.', ',')}</strong>
    </div>
  `).join('');

  updateChart(data);
}

function updateChart(data) {
  const ctx = document.getElementById('gradeChart').getContext('2d');
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i + 1),
      datasets: [{
        data: data.map(g => g.value),
        borderColor: '#007AFF',
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: '#007AFF'
      }]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { min: 0, max: 10, ticks: { stepSize: 2 } }, 
        x: { display: false } 
      }
    }
  });
}

// === TAREAS ===
function addNewTask() {
  const t = prompt("Tarea pendiente:");
  if (t) db.collection("tareas").add({ uid: userId, title: t });
}

function deleteTask(id) {
  db.collection("tareas").doc(id).delete();
}

function renderTasks(data) {
  const list = document.getElementById('tasks-list');
  list.innerHTML = data.map(t => `
    <li class="task-item" onclick="deleteTask('${t.id}')">
      <div class="checkbox"></div>
      <span>${t.title}</span>
    </li>
  `).join('');
}
