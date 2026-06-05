// ==========================================================
// 1. CONFIGURACIÓN DE TU BASE DE DATOS
// ==========================================================
// Estructura de credenciales requerida por Firebase para conectarse a la base de datos en tiempo real.
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  projectId: "TU_ID_PROYECTO",
  appId: "TU_APP_ID",
};

// ==========================================================
// 2. VARIABLES GLOBALES DE CONTROL
// ==========================================================
let db = null; // Almacenará la instancia activa de la base de datos Firestore
let myChart = null; // Guardará la referencia del gráfico lineal de notas para destruirlo/actualizarlo
let subjects = []; // Arreglo de cadenas de texto con los nombres de las asignaturas creadas
let allGrades = []; // Colección de objetos de calificaciones registradas
let currentTasksCache = []; // Copia local en caché de todas las tareas del usuario activo
let pendingDeleteTimeout = null;// Guardará el temporizador de cuenta atrás (4 seg) para la acción de borrado
let pendingDeleteId = null; // Guardará el ID temporal de la tarea que está en cola para ser eliminada

let pomodoroInterval = null; // Controlará el proceso setInterval repetitivo del cronómetro
let pomodoroTimeLeft = 25 * 60; // Contador en segundos del Pomodoro (por defecto inicia con 25 minutos)
let isPomodoroRunning = false; // Booleano para evitar duplicidad si el usuario hace clic múltiples veces en iniciar
let pomodoroMode = "study"; // Modo inicial interno de control: puede alternar a 'study' o 'break'

// Genera un ID de sesión único por navegador si no existe para diferenciar los registros de cada usuario
let userId = localStorage.getItem("app_user_id") || "user_" + Math.random().toString(36).substr(2, 9);
localStorage.setItem("app_user_id", userId);

// ==========================================================
// 3. ENLAZADO DIRECTO A INTERFAZ (VISTAS Y MODALES)
// ==========================================================
// Función que gestiona la navegación entre las 4 pantallas de la App
window.switchView = function (viewName, element) {
  // Oculta en bloque todas las pantallas existentes aplicando la clase utilitaria '.hidden'
  document.getElementById("view-home").classList.add("hidden");
  document.getElementById("view-pomodoro").classList.add("hidden");
  document.getElementById("view-ranks").classList.add("hidden");
  document.getElementById("view-chatbot").classList.add("hidden");
 
  // Quita el color azul ('active') de los botones del menú de pestañas
  document.getElementById("btn-home").classList.remove("active");
  document.getElementById("btn-pomodoro").classList.remove("active");
  document.getElementById("btn-ranks").classList.remove("active");
  document.getElementById("btn-chatbot").classList.remove("active");

  // Quita la ocultación y activa la visualización del contenedor solicitado
  document.getElementById("view-" + viewName).classList.remove("hidden");
  // Colorea de azul el botón del menú pulsado por el usuario
  element.classList.add("active");
 
  // Si vuelve a la ventana de inicio, refresca y redibuja la gráfica tras un desfase mínimo de milisegundos
  if(viewName === 'home') { setTimeout(updateChart, 40); }
};

// Hace visible la ventana flotante para capturar notas removiendo la propiedad oculta
window.openModal = () => document.getElementById("modal-nota").classList.remove("hidden");
// Oculta de inmediato la ventana flotante inyectando nuevamente la propiedad oculta
window.closeModal = () => document.getElementById("modal-nota").classList.add("hidden");

// Escucha los cambios del desplegable en la selección de materias al añadir notas
window.handleSubjectChange = async function (val) {
  // Comprueba si el usuario escogió la opción especial de registrar una asignatura personalizada
  if (val === "NEW_SUBJECT") {
    const name = prompt("Nombre de la nueva materia:");
    // Verifica que el prompt no esté vacío ni posea solo espacios en blanco
    if (name && name.trim() !== "") {
      if (db) {
        // Guarda en tiempo real la materia en el servidor Firebase vinculada al ID del usuario
        await db.collection("materias").add({ uid: userId, name: name.trim() });
      } else {
        // Si trabaja sin base de datos, inserta el registro en el array interno local si no está duplicado
        if (!subjects.includes(name.trim())) {
          subjects.push(name.trim());
          renderSubjectsLocal(); // Redibuja el desplegable
        }
      }
    }
    // Devuelve el selector a su posición base limpia por defecto
    document.getElementById("select-materia").value = "";
  }
};

// Captura y valida los campos del modal para persistir la calificación
window.saveGrade = async function () {
  const sub = document.getElementById("select-materia").value;
  const val = parseFloat(document.getElementById("input-nota").value);

  // Valida que exista materia escogida y que el valor de la nota sea un formato numérico válido
  if (sub && !isNaN(val)) {
    if (db) {
      // Envía el registro de nota a la colección online con una marca de tiempo exacta del sistema
      await db.collection("notas").add({ uid: userId, subject: sub, value: val, date: Date.now() });
    } else {
      // Guarda en el almacenamiento volátil temporal del array global
      allGrades.push({ subject: sub, value: val, date: Date.now() });
      updateLocalUI(); // Actualiza promedio y listas del HTML en local
    }
    window.closeModal(); // Cierra el modal de manera limpia
    document.getElementById("input-nota").value = ""; // Limpia el campo numérico
  } else {
    alert("Completa los campos correctamente");
  }
};

// ==========================================================
// 4. CONTROL DE TAREAS CON DESHACER (UNDO)
// ==========================================================
// Añade tareas al listado mediante un prompt nativo
window.addNewTask = function () {
  const t = prompt("Nueva tarea:");
  if (t && t.trim() !== "") {
    if (db) {
      // Inserción en la base de datos de Firebase
      db.collection("tareas").add({ uid: userId, title: t.trim() });
    } else {
      // Añade el registro con un ID provisional autogenerado por tiempo
      currentTasksCache.push({ id: "local_" + Date.now(), title: t.trim() });
      renderTasksUI(); // Redibuja la interfaz de tareas pendientes
    }
  }
};

// Se ejecuta al pulsar una tarea para completarla, abre ventana de espera "Deshacer" de 4 segundos
window.triggerTaskCompletion = function(id) {
  // Si ya existía otra tarea esperando ser borrada de manera definitiva, la procesa inmediatamente
  if (pendingDeleteTimeout) { executeFinalDelete(); }
  pendingDeleteId = id; // Reserva el ID actual como candidato firme de borrado
  renderTasksUI(); // Redibuja eliminándola visualmente al instante

  const toast = document.getElementById("toast-undo");
  toast.classList.remove("hidden"); // Muestra el cartel inferior de aviso
  // Crea una pausa asíncrona de 4000ms antes de forzar la eliminación permanente
  pendingDeleteTimeout = setTimeout(() => { executeFinalDelete(); }, 4000);
};

// Borra definitivamente el elemento seleccionado del almacenamiento final
function executeFinalDelete() {
  if (!pendingDeleteId) return;
  if (db) {
    // Elimina el documento apuntando directamente a su ID único en Firebase
    db.collection("tareas").doc(pendingDeleteId).delete();
  } else {
    // Filtra el arreglo local excluyendo el elemento removido
    currentTasksCache = currentTasksCache.filter(t => t.id !== pendingDeleteId);
  }
  document.getElementById("toast-undo").classList.add("hidden"); // Esconde el cartel inferior
  pendingDeleteId = null; // Libera punteros de borrado
  pendingDeleteTimeout = null; // Resetea temporizador de destrucción
  renderTasksUI(); // Sincroniza la vista
}

// Cancela la orden de destrucción de la tarea activa y la devuelve a su estado regular
window.undoDeleteTask = function() {
  if (pendingDeleteTimeout) {
    clearTimeout(pendingDeleteTimeout); // Rompe la cuenta regresiva antes de que llegue a cero
    pendingDeleteTimeout = null; // Destruye la orden del proceso
    pendingDeleteId = null; // Salva la tarea removiendo su ID de la papelera
    document.getElementById("toast-undo").classList.add("hidden"); // Oculta el Toast
    renderTasksUI(); // Vuelve a pintar la tarea en el HTML
  }
};

// ==========================================================
// 5. SISTEMA POMODORO TIMER
// ==========================================================
// Traduce los segundos numéricos globales a formato de texto para pintar el reloj
function updatePomoUI() {
  const mins = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, "0"); // Extrae los minutos enteros
  const secs = (pomodoroTimeLeft % 60).toString().padStart(2, "0"); // Obtiene el residuo de los segundos
  document.getElementById("pomo-display").innerText = `${mins}:${secs}`; // Inyecta el texto formateado
}

// Inicializa el bucle repetitivo de reducción de tiempo del reloj
window.startPomodoro = function() {
  if (isPomodoroRunning) return; // Detiene el código si el temporizador ya está ejecutándose
  isPomodoroRunning = true;
  // Ejecuta de forma cíclica la lógica interior cada 1000 milisegundos (1 segundo)
  pomodoroInterval = setInterval(() => {
    pomodoroTimeLeft--; // Descuenta un segundo de la cuenta
    updatePomoUI(); // Refresca el texto en pantalla
    
    // Ejecuta el intercambio de modo cuando el contador llega a cero absoluto
    if (pomodoroTimeLeft <= 0) {
      clearInterval(pomodoroInterval); // Congela el bucle del intervalo actual
      isPomodoroRunning = false;
      
      // Control de alternancia lógica: Estudio -> Descanso / Descanso -> Estudio
      if (pomodoroMode === "study") {
        alert("¡Bloque de estudio completado! Hora de un descanso.");
        pomodoroMode = "break";
        document.getElementById("pomo-status").innerText = "Modo: Descanso";
        // Asigna los nuevos segundos según el número ingresado en la configuración de descansos
        pomodoroTimeLeft = parseInt(document.getElementById("input-break-time").value || 5) * 60;
      } else {
        alert("¡Descanso terminado! Volvemos al trabajo.");
        pomodoroMode = "study";
        document.getElementById("pomo-status").innerText = "Modo: Estudio";
        // Asigna los nuevos segundos según el número ingresado en la configuración de estudio
        pomodoroTimeLeft = parseInt(document.getElementById("input-study-time").value || 25) * 60;
      }
      updatePomoUI(); // Muestra el valor cargado del nuevo ciclo listo para iniciar
    }
  }, 1000);
};

// Congela el avance del reloj manteniendo el conteo en su segundo actual
window.pausePomodoro = function() {
  clearInterval(pomodoroInterval); // Rompe el lazo repetitivo
  isPomodoroRunning = false; // Permite reanudar cuando el usuario pulse Iniciar
};

// Reinicia la estructura del reloj a su estado base original de 25 minutos (o personalizado por input)
window.resetPomodoro = function() {
  clearInterval(pomodoroInterval);
  isPomodoroRunning = false;
  pomodoroMode = "study";
  document.getElementById("pomo-status").innerText = "Modo: Estudio";
  // Lee el valor del campo numérico de minutos de estudio e inicializa el conteo en segundos
  pomodoroTimeLeft = parseInt(document.getElementById("input-study-time").value || 25) * 60;
  updatePomoUI(); // Limpia visualmente el reloj
};

// ==========================================================
// 6. INTELIGENCIA CHATBOT MENTOR
// ==========================================================
// Captura el texto del input del chat y simula la respuesta automatizada del bot
window.sendChatMessage = function() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if(!text) return; // Cancela el envío si no hay contenido válido escrito

  appendMessage(text, "user"); // Pinta el bocadillo del usuario en el extremo derecho
  input.value = ""; // Borra de inmediato el campo de entrada
  // Envía la respuesta condicionada tras una pausa natural simulada de 400 milisegundos
  setTimeout(() => { appendMessage(getBotResponse(text), "bot"); }, 400);
};

// Estructura dinámicamente un nodo div con estilos de burbuja según el remitente (User/Bot)
function appendMessage(text, sender) {
  const box = document.getElementById("chat-box");
  const msg = document.createElement("div");
  // Condicional de diseño en base a estilos inline nativos para separar colores y márgenes de alineación
  msg.style = sender === "user"
    ? "background: #007AFF; color: white; padding: 10px 14px; border-radius: 16px; font-size: 14px; max-width: 85%; align-self: flex-end; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
    : "background: white; color: #1C1C1E; padding: 10px 14px; border-radius: 16px; font-size: 14px; max-width: 85%; align-self: flex-start; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
  msg.innerHTML = text; // Inserta el texto permitiendo etiquetas HTML interiores (como negritas o subrayados)
  box.appendChild(msg); // Añade la nueva burbuja al final del contenedor de chat
  box.scrollTop = box.scrollHeight; // Fuerza el desplazamiento automático del scroll hacia abajo
}

// Analizador de palabras clave rudimentario para seleccionar la respuesta adecuada
function getBotResponse(input) {
  const clean = input.toLowerCase(); // Normaliza a minúsculas para facilitar las coincidencias
  if (clean.includes("hola") || clean.includes("buenos") || clean.includes("buenas")) return "¡Hola! Estoy listo para estructurar tus sesiones de estudio. Pregúntame sobre <strong>mates</strong>, técnicas para <strong>historia</strong>, o pídeme consejos sobre cómo potenciar tu <strong>memoria</strong>.";
  if (clean.includes("mate")) return "<strong>Guía de Matemáticas:</strong><br>1. <u>Método Feynman</u>: Explica la fórmula en voz alta como si enseñaras a un niño. Verás tus dudas al instante.<br>2. <u>Práctica Intercalada</u>: No hagas 20 ejercicios iguales; salta de temas continuamente para entrenar la adaptación.";
  if (clean.includes("historia") || clean.includes("texto") || clean.includes("letras")) return "<strong>Estrategia para Letras:</strong><br>1. <u>Active Recall</u>: Lee una página, cierra el libro e intenta escribir el mapa mental de memoria.<br>2. <u>Asociación</u>: Convierte las listas de eventos en una historia conectada por causas.";
  if (clean.includes("memoria") || clean.includes("memorizar")) return "<strong>Técnicas de Retención:</strong><br>1. <u>Repetición Espaciada</u>: Estudia hoy, repasa en 2 días, luego en 1 semana para frenar la curva del olvido.<br>2. <u>Palacio Mental</u>: Asocia conceptos clave a lugares físicos que conozcas perfectamente.";
  // Respuesta genérica de cierre si no detecta coincidencias explícitas de estudio
  return "Excelente punto. Organízalo hoy mismo en tu lista de tareas y pon en marcha el **Pomodoro** para mantener un foco óptimo.";
}

// ==========================================================
// 7. MOTOR INTERNO: PROCESAMIENTO Y ACTUALIZACIÓN DINÁMICA
// ==========================================================
// Redibuja e integra los elementos de la lista de tareas pendientes en el DOM
function renderTasksUI() {
  const list = document.getElementById("tasks-list");
  if(!list) return;
  // Valida si no existen tareas guardadas en caché o si la única existente está en proceso de borrado
  if (currentTasksCache.filter(t => t.id !== pendingDeleteId).length === 0) {
    list.innerHTML = `<p style="color:#8E8E93; font-size:13px; text-align:center; margin:10px 0;">No tienes tareas pendientes.</p>`;
    return;
  }
  // Mapea la colección de objetos estructurando el formato HTML correspondiente por fila activa
  list.innerHTML = currentTasksCache
    .filter(t => t.id !== pendingDeleteId) // Excluye de forma preventiva del pintado a la tarea oculta en cola "deshacer"
    .map(t => `<li class="task-item" onclick="triggerTaskCompletion('${t.id}')"><div class="checkbox"></div><span>${t.title}</span></li>`)
    .join(""); // Une los strings generados removiendo las comas por defecto del map
}

// Sincroniza y pobla con las opciones de materias el elemento HTML <select> del modal
function renderSubjectsLocal() {
  const sel = document.getElementById("select-materia");
  if(sel) {
    // Inicializa el selector reseteando su contenido a las opciones obligatorias base
    sel.innerHTML = `<option value="">Seleccionar...</option><option value="NEW_SUBJECT">+ Añadir nueva...</option>`;
    // Añade de forma incremental los nombres de las asignaturas activas en el array
    subjects.forEach((s) => { sel.innerHTML += `<option value="${s}">${s}</option>`; });
  }
  updateRanks(); // Llama a refrescar la pestaña de rangos
}

// Recalcula promedios numéricos y repinta la sub-lista de notas recientes de la vista Inicio
function updateLocalUI() {
  if (allGrades.length > 0) {
    // Acumula la sumatoria de valores de notas y calcula su cociente matemático entre el total
    const totalAvg = allGrades.reduce((a, b) => a + b.value, 0) / allGrades.length;
    const formattedAvg = totalAvg.toFixed(1); // Acorta a un solo dígito decimal
    document.getElementById("media-display").innerText = formattedAvg;
  } else {
    document.getElementById("media-display").innerText = "0.0"; // Estado base si no hay notas registradas
  }

  const list = document.getElementById("recent-grades-list");
  if(list) {
    if (allGrades.length === 0) {
      list.innerHTML = `<p style="color:#8E8E93; font-size:13px; text-align:center; margin:10px 0;">Aún no hay calificaciones.</p>`;
    } else {
      // Obtiene únicamente los últimos 4 elementos del array, los invierte cronológicamente y los inserta en el DOM
      list.innerHTML = allGrades.slice(-4).reverse()
        .map(g => `<div class="grade-row"><span>${g.subject}</span><strong>${g.value}</strong></div>`).join("");
    }
  }
  updateRanks(); // Sincroniza rangos de medallas
  updateChart(); // Redibuja los puntos correspondientes de la gráfica lineal
}

// Devuelve textos, iconos y paletas cromáticas específicas basándose en el corte del promedio evaluado
function getRankInfo(avg) {
  if (avg >= 9) return { name: "LEYENDA", color: "#FFD700", icon: "👑", bg: "#FFF9E6" };
  if (avg >= 7) return { name: "MAESTRO", color: "#A855F7", icon: "🔮", bg: "#F5F3FF" };
  if (avg >= 5) return { name: "GUERRERO", color: "#3B82F6", icon: "⚔️", bg: "#EFF6FF" };
  return { name: "APRENDIZ", color: "#6B7280", icon: "🛡️", bg: "#F3F4F6" };
}

// Procesa y genera dinámicamente las tarjetas avanzadas de logros/rangos por cada materia de la app
function updateRanks() {
  const container = document.getElementById("ranks-container");
  if (!container) return;
  container.innerHTML = ""; // Vacía el contenedor por completo antes de calcular

  // Si no hay materias ingresadas ni notas asignadas, muestra el estado inicial limpio
  if (subjects.length === 0 && allGrades.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#8E8E93; padding: 40px 10px; font-size:14px; margin-top: 40px;">Añade tus asignaturas y notas desde el panel de Inicio para descubrir tus rangos.</p>`;
    return;
  }

  // Asegura la sincronización creando una lista unificada sin nombres repetidos (usando Set)
  let activeSubjects = [...new Set([...subjects, ...allGrades.map(g => g.subject)])];

  // Ejecuta un bucle por cada asignatura única mapeada
  activeSubjects.forEach((sub) => {
    // Filtra exclusivamente las notas asociadas a la materia iterada actualmente
    const subGrades = allGrades.filter((g) => g.subject === sub);
    // Saca el promedio aritmético parcial de esa asignatura en concreto
    const avg = subGrades.length ? subGrades.reduce((a, b) => a + b.value, 0) / subGrades.length : 0;
    // Pide el paquete de metadatos estéticos (colores, emojis) para el valor del promedio
    const rank = getRankInfo(avg);

    // Concatena de forma acumulativa la tarjeta renderizada en la sección correspondiente del contenedor
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

// Configura y renderiza el componente visual de la gráfica usando la biblioteca Chart.js externa
function updateChart() {
  const canvas = document.getElementById("gradeChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  // Si ya existía una instancia de gráfica previa dibujada en memoria, la destruye para evitar parpadeos o fallos gráficos
  if (myChart) myChart.destroy();
 
  // Crea el nuevo objeto Chart mapeando las calificaciones
  myChart = new Chart(ctx, {
    type: "line", // Estilo gráfico de líneas continuas
    data: {
      // Eje Horizontal X: Asigna índices incrementales de orden [1, 2, 3...] basados en la cantidad de notas
      labels: allGrades.length ? allGrades.map((_, i) => i + 1) : [1],
      datasets: [{
        // Eje Vertical Y: Extrae únicamente el valor flotante de las calificaciones
        data: allGrades.length ? allGrades.map((g) => g.value) : [0],
        borderColor: "#007AFF", // Color azul para el trazo de la línea principal
        tension: 0.4, // Curvatura de suavizado de ondas (Bezier)
        borderWidth: 3, // Grosor del trazo de línea
        pointRadius: 0, // Esconde los círculos de puntos individuales de los nodos para un diseño minimalista
        fill: true, // Habilita el coloreado de relleno degradado bajo la curva
        backgroundColor: "rgba(0, 122, 255, 0.08)", // Tonalidad azul muy suave y transparente
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Permite amoldarse libremente al tamaño estricto asignado en CSS por el Widget padre
      plugins: { legend: { display: false } }, // Desactiva las cajas informativas de etiquetas superiores
      scales: { x: { display: false }, y: { min: 0, max: 10 } }, // Fija los límites de evaluación de notas de 0 a 10 de forma obligatoria
    },
  });
}

// ==========================================================
// 8. SINCRONIZADOR Y CONFIGURADOR DE INICIO (LIMPIO)
// ==========================================================
// Activa las escuchas en tiempo real de Firebase para reaccionar ante cambios realizados en la base de datos externa
function startFirebaseSync() {
  // Transforma el estado visual de la barra superior a modo sincronizado exitoso en color verde
  document.getElementById("sync-text").innerText = "Sincronizado";
  document.getElementById("sync-dot").style.background = "#34C759";

  // Escucha activa de Asignaturas vinculadas al usuario
  db.collection("materias").where("uid", "==", userId).orderBy("name").onSnapshot((snap) => {
    subjects = snap.docs.map((doc) => doc.data().name); // Reescribe el array global con los datos frescos del servidor
    renderSubjectsLocal(); // Ejecuta redibujado de dependencias
  });

  // Escucha activa de Calificaciones ordenadas por fecha cronológica ascendente
  db.collection("notas").where("uid", "==", userId).orderBy("date", "asc").onSnapshot((snap) => {
    allGrades = snap.docs.map((doc) => doc.data()); // Vuelca las notas del servidor a memoria local
    updateLocalUI(); // Actualiza los indicadores generales
  });

  // Escucha activa de Tareas Pendientes
  db.collection("tareas").where("uid", "==", userId).onSnapshot((snap) => {
    currentTasksCache = snap.docs.map((doc) => ({ id: doc.id, title: doc.data().title })); // Mapea ID de firestore y contenido
    renderTasksUI(); // Redibuja el listado de tareas en el HTML
  });
}

// Cargador de seguridad analítico encargado de verificar el entorno antes de inicializar la app
function checkAndRun() {
  // Evalúa si el usuario modificó las variables genéricas de Firebase por datos de un proyecto propio real
  const isFirebaseConfigured = firebaseConfig.apiKey !== "TU_API_KEY" && firebaseConfig.projectId !== "TU_ID_PROYECTO";
 
  // Garantiza que las librerías CDN externas (Firebase y Chart.js) se hayan descargado del todo en el navegador
  if (typeof firebase !== 'undefined' && typeof Chart !== 'undefined') {
    if (isFirebaseConfigured) {
      try {
        // Inicializa la conexión oficial de Firebase si no había una app instanciada previamente
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore(); // Obtiene la API de manipulación de bases de datos
        startFirebaseSync(); // Arranca los canales de sincronización en la nube
        return; // Frena el resto de la función inicializadora para no saltar a local
      } catch (e) {
        console.error("Error en base de datos externa. Saltando a entorno local:", e);
      }
    }
   
    // MODO INICIAL ALTERNATIVO: Entorno local puro (si no configuraste base de datos externa)
    document.getElementById("sync-text").innerText = "Local (Listo)";
    document.getElementById("sync-dot").style.background = "#5856D6"; // Color morado indicador de modo local offline
   
    // Inicializa la aplicación con estructuras limpias vacías listas para almacenar datos en memoria interna
    subjects = [];
    allGrades = [];
    currentTasksCache = [];
   
    // Ejecuta las rutinas iniciales de pintado para mostrar la aplicación totalmente operativa desde cero
    renderSubjectsLocal();
    updateLocalUI();
    renderTasksUI();
  } else {
    // Si las librerías CDN no han terminado de responder, se llama a sí misma en bucle de espera cada 50ms
    setTimeout(checkAndRun, 50);
  }
}

// Arranca el cargador seguro en el instante en que el script es procesado
checkAndRun();
