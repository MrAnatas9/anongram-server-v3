const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 🗄️ БАЗА ДАННЫХ
let data = {
  users: [],
  messages: {
    general: [],
    archive: [],
    favorite: []
  },
  tasks: [],
  notifications: [],
  professions: [
    { id: 1, name: '🎨 Художник', level: 1, description: 'Создание стикеров и оформления' },
    { id: 2, name: '📷 Фотограф', level: 1, description: 'Фотоотчеты и мемы' },
    { id: 3, name: '✍️ Писатель', level: 1, description: 'Посты и статьи' },
    { id: 4, name: '😂 Мемодел', level: 1, description: 'Развлекательный контент' },
    { id: 5, name: '📚 Библиотекарь', level: 1, description: 'Модерация файлов' },
    { id: 6, name: '🧪 Тестер', level: 1, description: 'Тестирование функций' },
  ],
  activeConnections: new Map()
};

// 🔧 УТИЛИТЫ
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 🔗 WEBSOCKET
wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  console.log('🔗 Новое WebSocket подключение:', connectionId);
  
  data.activeConnections.set(connectionId, ws);

  ws.on('message', (message) => {
    try {
      const parsedData = JSON.parse(message);
      
      switch (parsedData.type) {
        case 'send_message':
          handleNewMessage(parsedData);
          break;
      }
    } catch (error) {
      console.error('❌ Ошибка WebSocket:', error);
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket отключен:', connectionId);
    data.activeConnections.delete(connectionId);
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket подключен'
  }));
});

// 📢 ФУНКЦИИ РАССЫЛКИ
function broadcastToChat(chatId, message) {
  data.activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        chatId: chatId
      }));
    }
  });
}

// 💬 ИСПРАВЛЕННАЯ ФУНКЦИЯ СООБЩЕНИЙ
function handleNewMessage(messageData) {
  const { chatId, text, userId, username } = messageData;
  
  // Проверяем существует ли пользователь (упрощенная проверка)
  let user = data.users.find(u => u.id === userId);
  if (!user) {
    console.log('⚠️ Пользователь не найден, создаем временного:', userId);
    user = { id: userId, username: username };
  }

  const message = {
    id: generateId(),
    userId: userId,
    username: username,
    text: text,
    chatId: chatId || 'general',
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString('ru-RU', { 
      hour: '2-digit', minute: '2-digit' 
    })
  };

  // Сохраняем сообщение
  if (!data.messages[chatId]) {
    data.messages[chatId] = [];
  }
  data.messages[chatId].push(message);

  // Рассылаем через WebSocket
  broadcastToChat(chatId, {
    type: 'new_message',
    message: message
  });

  console.log('💬 Новое сообщение в', chatId, 'от', username);
}

// 🚀 API ROUTES
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Anongram Server v3.1',
    version: '3.1.0',
    timestamp: new Date().toISOString(),
    statistics: {
      users: data.users.length,
      online: data.activeConnections.size,
      messages: Object.values(data.messages).flat().length,
      tasks: data.tasks.length
    }
  });
});

// 👤 РЕГИСТРАЦИЯ
app.post('/api/auth/register', (req, res) => {
  const { username, code } = req.body;

  console.log('📝 Регистрация:', username);

  if (!username || !code) {
    return res.status(400).json({ error: 'Заполните никнейм и код доступа' });
  }

  // Проверяем занят ли никнейм
  const usernameExists = data.users.find(user =>
    user.username.toLowerCase() === username.toLowerCase()
  );
  if (usernameExists) {
    return res.status(400).json({ error: 'Этот никнейм уже занят' });
  }

  // Создаем пользователя
  const newUser = {
    id: generateId(),
    username: username,
    accessCode: code,
    level: 1,
    coins: 100,
    experience: 0,
    isOnline: true,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  data.users.push(newUser);

  console.log('✅ Новый пользователь:', username);

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      level: newUser.level,
      coins: newUser.coins,
      experience: newUser.experience
    }
  });
});

// 👥 ПОЛЬЗОВАТЕЛИ
app.get('/api/users', (req, res) => {
  const users = data.users.map(user => ({
    id: user.id,
    username: user.username,
    level: user.level,
    coins: user.coins,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen
  }));
  
  res.json({
    success: true,
    users: users,
    total: users.length
  });
});

// 💬 СООБЩЕНИЯ
app.get('/api/messages/:chatId', (req, res) => {
  const { chatId } = req.params;
  const messages = data.messages[chatId] || [];
  
  res.json({
    success: true,
    messages: messages.slice(-100),
    total: messages.length
  });
});

app.post('/api/messages', (req, res) => {
  const { chatId, text, userId, username } = req.body;

  if (!text || !username) {
    return res.status(400).json({ error: 'Текст и имя пользователя обязательны' });
  }

  handleNewMessage({ chatId, text, userId, username });

  res.json({
    success: true,
    message: 'Сообщение отправлено'
  });
});

// 🎭 ПРОФЕССИИ
app.get('/api/professions', (req, res) => {
  res.json({
    success: true,
    professions: data.professions
  });
});

// 📋 ЗАДАНИЯ
app.get('/api/tasks', (req, res) => {
  res.json({
    success: true,
    tasks: data.tasks.filter(task => !task.completed)
  });
});

app.post('/api/tasks', (req, res) => {
  const { title, description, reward, createdBy } = req.body;

  const task = {
    id: generateId(),
    title,
    description,
    reward: reward || 10,
    createdBy,
    createdAt: new Date().toISOString(),
    completed: false
  };

  data.tasks.push(task);

  res.json({
    success: true,
    task: task
  });
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Anongram Server v3.1 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🔗 WebSocket: включен');
  console.log('💬 Чаты: Общий, Архив, Избранное');
  console.log('🎭 Профессии: 6 профессий');
  console.log('📋 Задания: система наград');
  console.log('👥 Пользователи: 0 зарегистрировано');
  console.log('🌐 Готов к работе!');
});
