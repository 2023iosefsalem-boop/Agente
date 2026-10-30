// Referencias a elementos del DOM (respetando los nombres del boceto)
const zonaDeChat = document.getElementById('zonaDeChat');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// Variables de estado
let isWaitingResponse = false;
const TIMEOUT_MS = 15000; // Tiempo límite de espera: 15 segundos
const COOLDOWN_MS = 2000; // Temporizador entre envíos

// Ajuste automático de altura para el textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = `${userInput.scrollHeight}px`;
});

// Manejo de envío con la tecla Enter (sin Shift)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Manejador del evento submit
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageText = userInput.value.trim();

  if (!messageText || isWaitingResponse) return;

  // Agregar mensaje del usuario a la zona de chat
  appendMessage(messageText, 'user');
  userInput.value = '';
  userInput.style.height = 'auto';

  // Bloquear interfaz para evitar múltiples envíos
  setLoadingState(true);

  // Mostrar mensaje temporal de 'cargando'
  const loadingElement = createLoadingIndicator();
  zonaDeChat.appendChild(loadingElement);
  scrollToBottom();

  // Configuración de AbortController para tiempo límite
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Petición asíncrona al Webhook
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: messageText }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error en el servidor: ${response.status}`);
    }

    const data = await response.json();
    
    // Quitar indicador de carga e insertar respuesta
    loadingElement.remove();
    const botReply = data.response || data.message || "Solicitud procesada correctamente.";
    appendMessage(botReply, 'bot');

  } catch (error) {
    clearTimeout(timeoutId);
    loadingElement.remove();

    if (error.name === 'AbortError') {
      appendMessage('⚠️ La solicitud tardó demasiado tiempo en responder. Intentá de nuevo.', 'bot', true);
    } else {
      appendMessage('⚠️ No se pudo conectar con el servidor de prueba. Verificá tu conexión o la URL configurada.', 'bot', true);
    }
  } finally {
    // Mantiene deshabilitado brevemente para el cooldown de seguridad
    setTimeout(() => {
      setLoadingState(false);
    }, COOLDOWN_MS);
  }
});

// Función para insertar mensajes en la Zona de Chat
function appendMessage(text, sender, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', `${sender}-message`);
  if (isError) messageDiv.classList.add('error-message');

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = text;

  messageDiv.appendChild(contentDiv);
  zonaDeChat.appendChild(messageDiv);
  scrollToBottom();
}

// Indicador visual de cargando
function createLoadingIndicator() {
  const loadingDiv = document.createElement('div');
  loadingDiv.classList.add('message', 'bot-message');
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content', 'typing-indicator');
  contentDiv.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  
  loadingDiv.appendChild(contentDiv);
  return loadingDiv;
}

// Control visual de bloqueo/desbloqueo del botón e input
function setLoadingState(loading) {
  isWaitingResponse = loading;
  sendBtn.disabled = loading;
  userInput.disabled = loading;
  if (!loading) {
    userInput.focus();
  }
}

// Auto-scroll al final de la zona de chat
function scrollToBottom() {
  zonaDeChat.scrollTop = zonaDeChat.scrollHeight;
}
