// Referencias a elementos del DOM
const zonaDeChat = document.getElementById('zonaDeChat');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// Variables de estado y configuración
let isWaitingResponse = false;
const TIMEOUT_MS = 30000; // Tiempo límite de espera: 30 segundos
const COOLDOWN_MS = 1500;  // Pausa mínima entre envíos: 1.5 segundos

// Generación o recuperación de sessionId único
let sessionId;
try {
  sessionId = localStorage.getItem('chat_session_id');
  if (!sessionId) {
    sessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('chat_session_id', sessionId);
  }
} catch (e) {
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

// Ajuste automático de altura para el textarea y validación de 500 caracteres
userInput.addEventListener('input', () => {
  if (userInput.value.length > 500) {
    userInput.value = userInput.value.substring(0, 500);
  }
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
  const mensaje = userInput.value.trim();

  if (!mensaje || isWaitingResponse) return;

  if (mensaje.length > 500) {
    appendMessage('⚠️ El mensaje supera el límite de 500 caracteres.', 'bot', true);
    return;
  }

  // Validación de URL de webhook sin configurar
  if (typeof WEBHOOK_URL === 'undefined' || !WEBHOOK_URL || WEBHOOK_URL.includes('ACA VA') || WEBHOOK_URL.includes('ejemplo-webhook-prueba')) {
    appendMessage('Falta pegar la URL de tu webhook en config.js', 'bot', true);
    return;
  }

  // Agregar mensaje del usuario a la zona de chat
  appendMessage(mensaje, 'user');
  userInput.value = '';
  userInput.style.height = 'auto';

  // Bloquear interfaz y mostrar indicador de carga
  setLoadingState(true);
  const loadingElement = createLoadingIndicator();
  zonaDeChat.appendChild(loadingElement);
  scrollToBottom();

  // Configuración de AbortController (30 segundos límite)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fecha = new Date().toISOString();
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId, mensaje, fecha }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      loadingElement.remove();
      appendMessage(`Make respondió con error (código ${response.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`, 'bot', true);
      return;
    }

    const rawText = await response.text();
    const text = rawText.trim();
    loadingElement.remove();

    if (!text) {
      appendMessage('(respuesta vacía)', 'bot');
      return;
    }

    // Limpiar envoltorios Markdown (como ```json y ```)
    let cleanedText = text;
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (jsonErr) {
      if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
        const extracted = extractFieldFromJSONText(cleanedText);
        if (extracted !== null) {
          appendMessage(extracted, 'bot');
          return;
        }
        try {
          const fixedText = cleanedText.replace(/:\s*"([^"]*?)\n([^"]*?)"/g, (match, p1, p2) => {
            return `: "${p1}\\n${p2}"`;
          });
          parsedData = JSON.parse(fixedText);
        } catch (e2) {
          const extractedRetry = extractFieldFromJSONText(cleanedText);
          if (extractedRetry !== null) {
            appendMessage(extractedRetry, 'bot');
            return;
          }
        }
      }
    }

    if (parsedData !== null && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
      const botReply = parsedData.response || parsedData.respuesta || parsedData.message || parsedData.mensaje;
      if (botReply !== undefined && botReply !== null && String(botReply).trim() !== '') {
        appendMessage(String(botReply), 'bot');
      } else {
        appendMessage('Make respondió, pero sin el campo response', 'bot', true);
      }
    } else if (parsedData !== null) {
      appendMessage(String(parsedData), 'bot');
    } else {
      appendMessage(cleanedText, 'bot');
    }

  } catch (error) {
    clearTimeout(timeoutId);
    loadingElement.remove();

    if (error.name === 'AbortError') {
      appendMessage('⚠️ La solicitud tardó demasiado tiempo en responder (tiempo agotado).', 'bot', true);
    } else if (!navigator.onLine || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      appendMessage('⚠️ Error de red: no se pudo conectar con el servidor.', 'bot', true);
    } else {
      appendMessage(`⚠️ Error del servidor: ${error.message}`, 'bot', true);
    }
  } finally {
    setTimeout(() => {
      setLoadingState(false);
    }, COOLDOWN_MS);
  }
});

// Extractor auxiliar por regex para JSON con saltos de línea internos
function extractFieldFromJSONText(text) {
  for (const key of ['response', 'respuesta', 'message', 'mensaje']) {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*"([^]*?)(?<!\\\\)"`, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }
  return null;
}

// Función para insertar mensajes en la Zona de Chat usando textContent
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

// Control visual de bloqueo/desbloqueo
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
