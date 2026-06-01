// 1. CONFIGURACIÓN (Pon tus datos aquí)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  projectId: "TU_ID_PROYECTO",
  appId: "TU_APP_ID",
};

// 2. INICIALIZACIÓN
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let userId =
  localStorage.getItem("app_user_id") ||
  "user_" + Math.random().toString(36).substr(2, 9);
localStorage.setItem("app_user_id", userId);

let myChart = null;
let subjects = [];
let allGrades = [];

// 3. NAVEGACIÓN (FORZADO A WINDOW)
window.switchView = function (viewName, element) {
  document.getElementById("view-home").classList.add("hidden");
  document.getElementById("view-ranks").classList.add("hidden");
  document.getElementById("btn-home").classList.remove("active");
  document.getElementById("btn-ranks").classList.remove("active");

  document.getElementById("view-" + viewName).classList.remove("hidden");
  element.classList.add("active");
};

// 4. GESTIÓN DE MATERIAS Y NOTAS
window.handleSubjectChange = async function (val) {
  if (val === "NEW_SUBJECT") {
    const name = prompt("Nombre de la nueva materia:");
    if (name && name.trim() !== "") {
      await db.collection("materias").add({ uid: userId, name: name.trim() });
    }
    document.getElementById("select-materia").value = "";
  }
};

window.openModal = () =>
  document.getElementById("modal-nota").classList.remove("hidden");
window.closeModal = () =>
  document.getElementById("modal-nota").classList.add("hidden");

window.saveGrade = async function () {
  const sub = document.getElementById("select-materia").value;
  const val = parseFloat(document.getElementById("input-nota").value);

  if (sub && !isNaN(val)) {
    await db.collection("notas").add({
      uid: userId,
      subject: sub,
      value: val,
      date: Date.now(),
    });
    window.closeModal();
    document.getElementById("input-nota").value = "";
  } else {
    alert("Completa los campos correctamente");
  }
};

// 5. RANGOS Y LÓGICA
function getRankInfo(avg) {
  if (avg >= 9)
    return { name: "LEYENDA", color: "#FFD700", icon: "👑", bg: "#FFF9E6" };
  if (avg >= 7)
    return { name: "MAESTRO", color: "#A855F7", icon: "🔮", bg: "#F5F3FF" };
  if (avg >= 5)
    return { name: "GUERRERO", color: "#3B82F6", icon: "⚔️", bg: "#EFF6FF" };
  return { name: "APRENDIZ", color: "#6B7280", icon: "🛡️", bg: "#F3F4F6" };
}

function updateRanks() {
  const container = document.getElementById("ranks-container");
  if (!container) return;
  container.innerHTML = "";

  subjects.forEach((sub) => {
    const subGrades = allGrades.filter((g) => g.subject === sub);
    const avg = subGrades.length
      ? subGrades.reduce((a, b) => a + b.value, 0) / subGrades.length
      : 0;
    const rank = getRankInfo(avg);

    container.innerHTML += `
      <div class="rank-card">
        <div class="rank-icon" style="background: ${rank.bg}; color: ${rank.color}">${rank.icon}</div>
        <div style="flex: 1">
          <h4 style="margin: 0; font-size: 16px;">${sub}</h4>
          <span style="color: ${rank.color}; font-size: 11px; font-weight: bold;">${rank.name}</span>
        </div>
        <div style="text-align: right">
          <strong style="font-size: 18px;">${avg.toFixed(1)}</strong>
        </div>
      </div>
    `;
  });
}

// 6. ESCUCHA DE DATOS (REAL-TIME)
function initApp() {
  // Estado de conexión
  document.getElementById("sync-text").innerText = "Sincronizado";
  document.getElementById("sync-dot").style.background = "#34C759";

  // Materias
  db.collection("materias")
    .where("uid", "==", userId)
    .orderBy("name")
    .onSnapshot((snap) => {
      subjects = snap.docs.map((doc) => doc.data().name);
      const sel = document.getElementById("select-materia");
      sel.innerHTML = `<option value="">Seleccionar...</option><option value="NEW_SUBJECT">+ Añadir nueva...</option>`;
      subjects.forEach((s) => {
        sel.innerHTML += `<option value="${s}">${s}</option>`;
      });
      updateRanks();
    });

  // Notas
  db.collection("notas")
    .where("uid", "==", userId)
    .orderBy("date", "asc")
    .onSnapshot((snap) => {
      allGrades = snap.docs.map((doc) => doc.data());

      // Update Media
      if (allGrades.length > 0) {
        const totalAvg =
          allGrades.reduce((a, b) => a + b.value, 0) / allGrades.length;
        document.getElementById("media-display").innerText =
          totalAvg.toFixed(1);
      }

      // Update Lista
      const list = document.getElementById("recent-grades-list");
      list.innerHTML = allGrades
        .slice(-4)
        .reverse()
        .map(
          (g) => `
        <div class="grade-row"><span>${g.subject}</span><strong>${g.value}</strong></div>
      `,
        )
        .join("");

      updateRanks();
      updateChart();
    });

  // Tareas
  db.collection("tareas")
    .where("uid", "==", userId)
    .onSnapshot((snap) => {
      const list = document.getElementById("tasks-list");
      list.innerHTML = snap.docs
        .map((doc) => {
          const t = doc.data();
          return `<li class="task-item" onclick="deleteTask('${doc.id}')"><div class="checkbox"></div><span>${t.title}</span></li>`;
        })
        .join("");
    });
}

window.addNewTask = function () {
  const t = prompt("Nueva tarea:");
  if (t) db.collection("tareas").add({ uid: userId, title: t });
};

window.deleteTask = (id) => db.collection("tareas").doc(id).delete();

function updateChart() {
  const ctx = document.getElementById("gradeChart").getContext("2d");
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allGrades.map((_, i) => i + 1),
      datasets: [
        {
          data: allGrades.map((g) => g.value),
          borderColor: "#007AFF",
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 0,
          fill: true,
          backgroundColor: "rgba(0, 122, 255, 0.1)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { min: 0, max: 10 } },
    },
  });
}

// Arrancar
initApp();
