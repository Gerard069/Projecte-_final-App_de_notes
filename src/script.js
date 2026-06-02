// ==========================================================
// 1. CONFIGURACIÓN DE TU BASE DE DATOS
// ==========================================================
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  projectId: "TU_ID_PROYECTO",
  appId: "TU_APP_ID",
};

// ==========================================================
// 2. VARIABLES GLOBALES DE CONTROL
// ==========================================================
let db = null;
let myChart = null;
let subjects = [];
let allGrades = [];
let currentTasksCache = [];
let pendingDeleteTimeout = null;
let pendingDeleteId = null;

let pomodoroInterval = null;
let pomodoroTimeLeft = 25 * 60;
let isPomodoroRunning = false;
let pomodoroMode = "study"; 

let userId = localStorage.getItem("app_user_id") || "user_" + Math.random().toString(36).substr(2, 9);
localStorage.setItem("app_user_id", userId);

// ==========================================================
// 3. ENLAZADO DIRECTO A INTERFAZ (VISTAS Y MODALES)
// ==========================================================
window.switchView = function (viewName, element) {
  document.getElementById("view-home").classList.add("hidden");
  document.getElementById("view-pomodoro").classList.add("hidden");
  document.getElementById("view-ranks").classList.add("hidden");
  document.getElementById("view-chatbot").classList.add("hidden");
  
  document.getElementById("btn-home").classList.remove("active");
  document.getElementById("btn-pomodoro").classList.remove("active");
  document.getElementById("btn-ranks").classList.remove("active");
  document.getElementById("btn-chatbot").classList.remove("active");

  document.getElementById("view-" + viewName).classList.remove("hidden");
  element.classList.add("active");
  
  if(viewName === 'home') { setTimeout(updateChart, 40); }
};

window.openModal = () => document.getElementById("modal-nota").classList.remove("hidden");
window.closeModal = () => document.getElementById("modal-nota").classList.add("hidden");

window.handleSubjectChange = async function (val) {
  if (val === "NEW_SUBJECT") {
    const name = prompt("Nombre de la nueva materia:");
    if (name && name.trim() !== "") {
      if (db) {
        await db.collection("materias").add({ uid: userId, name: name.trim() });
      } else {
        if (!subjects.includes(name.trim())) {
          subjects.push(name.trim());
          renderSubjectsLocal();
        }
      }
    }
    document.getElementById("select-materia").value = "";
  }
};

window.saveGrade = async function () {
  const sub = document.getElementById("select-materia").value;
  const val = parseFloat(document.getElementById("input-nota").value);

  if (sub && !isNaN(val)) {
    if (db) {
      await db.collection("notas").add({ uid: userId, subject: sub, value: val, date: Date.now() });
    } else {
      allGrades.push({ subject: sub, value: val, date: Date.now() });
      updateLocalUI();
    }
    window.closeModal();
    document.getElementById("input-nota").value = "";
  } else {
    alert("Completa los campos correctamente");
  }
};

// ==========================================================
// 4. CONTROL DE TAREAS CON DESHACER (UNDO)
// ==========================================================
window.addNewTask = function () {
  const t = prompt("Nueva tarea:");
  if (t && t.trim() !== "") {
    if (db) {
      db.collection("tareas").add({ uid: userId, title: t.trim() });
    } else {
      currentTasksCache.push({ id: "local_" + Date.now(), title: t.trim() });
      renderTasksUI();
    }
  }
};

window.triggerTaskCompletion = function(id) {
  if (pendingDeleteTimeout) { executeFinalDelete(); }
  pendingDeleteId = id;
  renderTasksUI(); 

  const toast = document.getElementById("toast-undo");
  toast.classList.remove("hidden");
  pendingDeleteTimeout = setTimeout(() => { executeFinalDelete(); }, 4000); 
};

function executeFinalDelete() {
  if (!pendingDeleteId) return;
  if (db) {
    db.collection("tareas").doc(pendingDeleteId).delete();
  } else {
    currentTasksCache = currentTasksCache.filter(t => t.id !== pendingDeleteId);
  }
  document.getElementById("toast-undo").classList.add("hidden");
  pendingDeleteId = null;
  pendingDeleteTimeout = null;
  renderTasksUI();
}

window.undoDeleteTask = function() {
  if (pendingDeleteTimeout) {
    clearTimeout(pendingDeleteTimeout);
    pendingDeleteTimeout = null;
    pendingDeleteId = null;
    document.getElementById("toast-undo").classList.add("hidden");
    renderTasksUI(); 
  }
};

// ==========================================================
// 5. SISTEMA POMODORO TIMER
// ==========================================================
function updatePomoUI() {
  const mins = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, "0");
  const secs = (pomodoroTimeLeft % 60).toString().padStart(2, "0");
  document.getElementById("pomo-display").innerText = `${mins}:${secs}`;
}

window.startPomodoro = function() {
  if (isPomodoroRunning) return;
  isPomodoroRunning = true;
  pomodoroInterval = setInterval(() => {
    pomodoroTimeLeft--;
    updatePomoUI();
    if (pomodoroTimeLeft <= 0) {
      clearInterval(pomodoroInterval);
      isPomodoroRunning = false;
      if (pomodoroMode === "study") {
        alert("¡Bloque de estudio completado! Hora de un descanso.");
        pomodoroMode = "break";
        document.getElementById("pomo-status").innerText = "Modo: Descanso";
        pomodoroTimeLeft = parseInt(document.getElementById("input-break-time").value || 5) * 60;
      } else {
        alert("¡Descanso terminado! Volvemos al trabajo.");
        pomodoroMode = "study";
        document.getElementById("pomo-status").innerText = "Modo: Estudio";
        pomodoroTimeLeft = parseInt(document.getElementById("input-study-time").value || 25) * 60;
      }
      updatePomoUI();
    }
  }, 1000);
};

window.pausePomodoro = function() {
  clearInterval(pomodoroInterval);
  isPomodoroRunning = false;
};

window.resetPomodoro = function() {
  clearInterval(pomodoroInterval);
  isPomodoroRunning = false;
  pomodoroMode = "study";
  document.getElementById("pomo-status").innerText = "Modo: Estudio";
  pomodoroTimeLeft = parseInt(document.getElementById("input-study-time").value || 25) * 60;
  updatePomoUI();
};

// ==========================================================
// 6. INTELIGENCIA CHATBOT MENTOR
// ==========================================================
window.sendChatMessage = function() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if(!text) return;

  appendMessage(text, "user");
  input.value = "";
  setTimeout(() => { appendMessage(getBotResponse(text), "bot"); }, 400);
};

function appendMessage(text, sender) {
  const box = document.getElementById("chat-box");
  const msg = document.createElement("div");
  msg.style = sender === "user" 
    ? "background: #007AFF; color: white; padding: 10px 14px; border-radius: 16px; font-size: 14px; max-width: 85%; align-self: flex-end; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
    : "background: white; color: #1C1C1E; padding: 10px 14px; border-radius: 16px; font-size: 14px; max-width: 85%; align-self: flex-start; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
  msg.innerHTML = text;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function getBotResponse(input) {
  const clean = input.toLowerCase();
  if (clean.includes("hola") || clean.includes("buenos") || clean.includes("buenas")) return "¡Hola! Estoy listo para estructurar tus sesiones de estudio. Pregúntame sobre <strong>mates</strong>, técnicas para <strong>historia</strong>, o pídeme consejos sobre cómo potenciar tu <strong>memoria</strong>.";
  if (clean.includes("mate")) return "<strong>Guía de Matemáticas:</strong><br>1. <u>Método Feynman</u>: Explica la fórmula en voz alta como si enseñaras a un niño. Verás tus dudas al instante.<br>2. <u>Práctica Intercalada</u>: No hagas 20 ejercicios iguales; salta de temas continuamente para entrenar la adaptación.";
  if (clean.includes("historia") || clean.includes("texto") || clean.includes("letras")) return "<strong>Estrategia para Letras:</strong><br>1. <u>Active Recall</u>: Lee una página, cierra el libro e intenta escribir el mapa mental de memoria.<br>2. <u>Asociación</u>: Convierte las listas de eventos en una historia conectada por causas.";
  if (clean.includes("memoria") || clean.includes("memorizar")) return "<strong>Técnicas de Retención:</strong><br>1. <u>Repetición Espaciada</u>: Estudia hoy, repasa en 2 días, luego en 1 semana para frenar la curva del olvido.<br>2. <u>Palacio Mental</u>: Asocia conceptos clave a lugares físicos que conozcas perfectamente.";
  return "Excelente punto. Organízalo hoy mismo en tu lista de tareas y pon en marcha el **Pomodoro** para mantener un foco óptimo.";
}

// ==========================================================
// 7. MOTOR INTERNO: PROCESAMIENTO Y ACTUALIZACIÓN DINÁMICA
// ==========================================================
function renderTasksUI() {
  const list = document.getElementById("tasks-list");
  if(!list) return;
  if (currentTasksCache.filter(t => t.id !== pendingDeleteId).length === 0) {
    list.innerHTML = `<p style="color:#8E8E93; font-size:13px; text-align:center; margin:10px 0;">No tienes tareas pendientes.</p>`;
    return;
  }
  list.innerHTML = currentTasksCache
    .filter(t => t.id !== pendingDeleteId) 
    .map(t => `<li class="task-item" onclick="triggerTaskCompletion('${t.id}')"><div class="checkbox"></div><span>${t.title}</span></li>`)
    .join("");
}

function renderSubjectsLocal() {
  const sel = document.getElementById("select-materia");
  if(sel) {
    sel.innerHTML = `<option value="">Seleccionar...</option><option value="NEW_SUBJECT">+ Añadir nueva...</option>`;
    subjects.forEach((s) => { sel.innerHTML += `<option value="${s}">${s}</option>`; });
  }
  updateRanks();
}

function updateLocalUI() {
  if (allGrades.length > 0) {
    const totalAvg = allGrades.reduce((a, b) => a + b.value, 0) / allGrades.length;
    const formattedAvg = totalAvg.toFixed(1);
    document.getElementById("media-display").innerText = formattedAvg;
  } else {
    document.getElementById("media-display").innerText = "0.0";
  }

  const list = document.getElementById("recent-grades-list");
  if(list) {
    if (allGrades.length === 0) {
      list.innerHTML = `<p style="color:#8E8E93; font-size:13px; text-align:center; margin:10px 0;">Aún no hay calificaciones.</p>`;
    } else {
      list.innerHTML = allGrades.slice(-4).reverse()
        .map(g => `<div class="grade-row"><span>${g.subject}</span><strong>${g.value}</strong></div>`).join("");
    }
  }
  updateRanks();
  updateChart();
}

function getRankInfo(avg) {
  if (avg >= 9) return { name: "LEYENDA", color: "#FFD700", icon: "👑", bg: "#FFF9E6" };
  if (avg >= 7) return { name: "MAESTRO", color: "#A855F7", icon: "🔮", bg: "#F5F3FF" };
  if (avg >= 5) return { name: "GUERRERO", color: "#3B82F6", icon: "⚔️", bg: "#EFF6FF" };
  return { name: "APRENDIZ", color: "#6B7280", icon: "🛡️", bg: "#F3F4F6" };
}

function updateRanks() {
  const container = document.getElementById("ranks-container");
  if (!container) return;
  container.innerHTML = "";

  // Si no hay materias ingresadas ni notas asignadas, muestra el estado inicial limpio
  if (subjects.length === 0 && allGrades.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#8E8E93; padding: 40px 10px; font-size:14px; margin-top: 40px;">Añade tus asignaturas y notas desde el panel de Inicio para descubrir tus rangos.</p>`;
    return;
  }

  // Asegura la sincronización de materias detectadas en las notas
  let activeSubjects = [...new Set([...subjects, ...allGrades.map(g => g.subject)])];

  activeSubjects.forEach((sub) => {
    const subGrades = allGrades.filter((g) => g.subject === sub);
    const avg = subGrades.length ? subGrades.reduce((a, b) => a + b.value, 0) / subGrades.length : 0;
    const rank = getRankInfo(avg);

    container.innerHTML += `
      <div class="rank-card">
        <div class="rank-icon" style="background: ${rank.bg}; color: ${rank.color}">${rank.icon}</div>
        <div style="flex: 1">
          <h4 style="margin: 0; font-size: 16px;">${sub}</h4>
          <span style="color: ${rank.color}; font-size: 11px; font-weight: bold;">${rank.name}</span>
        </div>
        <div style="text-align: right">
          <strong style="font-size: 18px;">${subGrades.length ? avg.toFixed(1) : "---"}</strong>
        </div>
      </div>
    `;
  });
}

function updateChart() {
  const canvas = document.getElementById("gradeChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  if (myChart) myChart.destroy();
  
  myChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allGrades.length ? allGrades.map((_, i) => i + 1) : [1],
      datasets: [{
        data: allGrades.length ? allGrades.map((g) => g.value) : [0],
        borderColor: "#007AFF",
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 0,
        fill: true,
        backgroundColor: "rgba(0, 122, 255, 0.08)",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { min: 0, max: 10 } },
    },
  });
}

// ==========================================================
// 8. SINCRONIZADOR Y CONFIGURADOR DE INICIO (LIMPIO)
// ==========================================================
function startFirebaseSync() {
  document.getElementById("sync-text").innerText = "Sincronizado";
  document.getElementById("sync-dot").style.background = "#34C759";

  db.collection("materias").where("uid", "==", userId).orderBy("name").onSnapshot((snap) => {
    subjects = snap.docs.map((doc) => doc.data().name);
    renderSubjectsLocal();
  });

  db.collection("notas").where("uid", "==", userId).orderBy("date", "asc").onSnapshot((snap) => {
    allGrades = snap.docs.map((doc) => doc.data());
    updateLocalUI();
  });

  db.collection("tareas").where("uid", "==", userId).onSnapshot((snap) => {
    currentTasksCache = snap.docs.map((doc) => ({ id: doc.id, title: doc.data().title }));
    renderTasksUI();
  });
}

function checkAndRun() {
  const isFirebaseConfigured = firebaseConfig.apiKey !== "TU_API_KEY" && firebaseConfig.projectId !== "TU_ID_PROYECTO";
  
  if (typeof firebase !== 'undefined' && typeof Chart !== 'undefined') {
    if (isFirebaseConfigured) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        startFirebaseSync();
        return;
      } catch (e) {
        console.error("Error en base de datos externa. Saltando a entorno local:", e);
      }
    }
    
    // MODO INICIAL: TOTALMENTE LIMPIO Y VACÍO (Solo para ti)
    document.getElementById("sync-text").innerText = "Local (Listo)";
    document.getElementById("sync-dot").style.background = "#5856D6"; 
    
    subjects = [];
    allGrades = [];
    currentTasksCache = [];
    
    renderSubjectsLocal();
    updateLocalUI();
    renderTasksUI();
  } else {
    setTimeout(checkAndRun, 50);
  }
}

// Ejecutar el cargador seguro al abrir
checkAndRun();
