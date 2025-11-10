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

// 🗄️ ПОЛНАЯ БАЗА ДАННЫХ ДЛЯ ANONGRAM
let data = {
  users: [],
  messages: {
    general: [], // Общий чат
    archive: [], // Архив
    favorite: [] // Избранное
  },
  tasks: [],
  notifications: [],
  professions: [
    // Уровень 1
    { id: 1, name: '🎨 Художник', level: 1, description: 'Создание стикеров и оформления' },
    { id: 2, name: '📷 Фотограф', level: 1, description: 'Фотоотчеты и мемы' },
    { id: 3, name: '✍️ Писатель', level: 1, description: 'Посты и статьи' },
    { id: 4, name: '😂 Мемодел', level: 1, description: 'Развлекательный контент' },
    { id: 5, name: '📚 Библиотекарь', level: 1, description: 'Модерация файлов' },
    { id: 6, name: '🧪 Тестер', level: 1, description: 'Тестирование функций' },
    
    // Уровень 2
    { id: 7, name: '🎵 Музыкант', level: 2, description: 'Аудиоконтент' },
    { id: 8, name: '📋 Организатор', level: 2, description: 'Ивенты и мероприятия' },
    { id: 9, name: '📜 Историк', level: 2, description: 'Архив сообщества' },
    { id: 10, name: '📰 Сотрудник СМИ', level: 2, description: 'Новости и репортажи' },
    { id: 11, name: '📊 Аналитик', level: 2, description: 'Статистика и аналитика' },
    
    // Уровень 3
    { id: 12, name: '💻 Программист', level: 3, description: 'Боты и скрипты' },
    { id: 13, name: '🎭 Мастер РП', level: 3, description: 'Ролевые игры' },
    { id: 14, name: '👥 Вербовщик', level: 3, description: 'Привлечение участников' },
    { id: 15, name: '⚖️ Адвокат', level: 3, description: 'Решение споров' },
    
    // Уровень 4
    { id: 16, name: '🐉 Мастер ДнД', level: 4, description: 'Сложные ролевые игры' },
    { id: 17, name: '🧑‍⚖️ Судья', level: 4, description: 'Арбитраж конфликтов' },
    
    // Уровень 5
    { id: 18, name: '🎪 Ивент-менеджер', level: 5, description: 'Крупные мероприятия' },
    { id: 19, name: '🔍 Рекрутер', level: 5, description: 'Поиск талантов' },
    { id: 20, name: '📢 Медиа-менеджер', level: 5, description: 'Управление медиа' }
  ],
  verificationCodes: {},
  sessions: {},
  activeConnections: new Map()
};

// 🔧 УТИЛИТЫ
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 🔗 WEBSOCKET - РЕАЛЬНОЕ ВРЕМЯ
wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  console.log('🔗 Новое WebSocket подключение:', connectionId);
  
  data.activeConnections.set(connectionId, ws);

  ws.on('message', (message) => {
    try {
      const parsedData = JSON.parse(message);
      console.log('📨 WebSocket сообщение:', parsedData);
      
      // Обрабатываем разные типы сообщений
      switch (parsedData.type) {
        case 'send_message':
          handleNewMessage(parsedData);
          break;
        case 'typing_start':
          broadcastTyping(parsedData.chatId, parsedData.username, true);
          break;
        case 'typing_stop':
          broadcastTyping(parsedData.chatId, parsedData.username, false);
          break;
        case 'user_online':
          broadcastUserStatus(parsedData.userId, true);
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

  // Приветственное сообщение
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket подключен к Anongram',
    connectionId: connectionId
  }));
});

// 📢 ФУНКЦИИ РАССЫЛКИ
function broadcastToAll(message) {
  data.activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

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

function broadcastTyping(chatId, username, isTyping) {
  broadcastToChat(chatId, {
    type: 'user_typing',
    username: username,
    isTyping: isTyping,
    timestamp: Date.now()
  });
}

function broadcastUserStatus(userId, isOnline) {
  broadcastToAll({
    type: 'user_status',
    userId: userId,
    isOnline: isOnline,
    timestamp: Date.now()
  });
}

// 🚀 API ROUTES

// 📊 ГЛАВНАЯ СТРАНИЦА
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Anongram Server v3.0 - Полная версия',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    statistics: {
      users: data.users.length,
      online: data.activeConnections.size,
      messages: Object.values(data.messages).flat().length,
      tasks: data.tasks.length
    },
    endpoints: {
      'GET /': 'Информация о сервере',
      'POST /api/auth/register': 'Регистрация пользователя',
      'POST /api/auth/login': 'Вход в систему',
      'GET /api/users': 'Список пользователей',
      'GET /api/professions': 'Все профессии',
      'POST /api/professions/select': 'Выбор профессии',
      'GET /api/messages/:chatId': 'Получить сообщения чата',
      'POST /api/messages': 'Отправить сообщение',
      'GET /api/tasks': 'Получить задания',
      'POST /api/tasks': 'Создать задание',
      'POST /api/tasks/complete': 'Выполнить задание',
      'GET /api/notifications/:userId': 'Получить уведомления',
      'POST /api/notifications': 'Отправить уведомление'
    }
  });
});

// 👤 АУТЕНТИФИКАЦИЯ
app.post('/api/auth/register', (req, res) => {
  const { username, code } = req.body;

  console.log('📝 Регистрация:', username);

  if (!username || !code) {
    return res.status(400).json({ error: 'Заполните никнейм и код доступа' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Никнейм должен быть не менее 3 символов' });
  }

  if (code.length < 6) {
    return res.status(400).json({ error: 'Код доступа должен быть не менее 6 символов' });
  }

  // Проверяем занят ли никнейм
  const usernameExists = data.users.find(user =>
    user.username.toLowerCase() === username.toLowerCase()
  );
  if (usernameExists) {
    return res.status(400).json({ error: 'Этот никнейм уже занят' });
  }

  // Проверяем занят ли код доступа
  const codeExists = data.users.find(user => user.accessCode === code);
  if (codeExists) {
    return res.status(400).json({ error: 'Этот код доступа уже используется' });
  }

  // Создаем пользователя
  const newUser = {
    id: generateId(),
    username: username,
    accessCode: code,
    level: 1,
    experience: 0,
    coins: 100,
    professions: [],
    selectedProfessions: [],
    avatar: null,
    bio: '',
    isOnline: false,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    devices: []
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

app.post('/api/auth/login', (req, res) => {
  const { username, code } = req.body;

  console.log('🔐 Попытка входа:', username);

  if (!username || !code) {
    return res.status(400).json({ error: 'Заполните никнейм и код доступа' });
  }

  // Ищем пользователя
  const user = data.users.find(u =>
    u.username.toLowerCase() === username.toLowerCase() &&
    u.accessCode === code
  );

  if (!user) {
    return res.status(400).json({ error: 'Неверный никнейм или код доступа' });
  }

  // Обновляем статус
  user.isOnline = true;
  user.lastSeen = new Date().toISOString();

  // Создаем сессию
  const sessionId = generateId();
  data.sessions[sessionId] = {
    userId: user.id,
    username: user.username,
    createdAt: new Date().toISOString()
  };

  // Уведомляем о входе
  broadcastUserStatus(user.id, true);

  console.log('✅ Успешный вход:', user.username);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      level: user.level,
      coins: user.coins,
      experience: user.experience,
      professions: user.selectedProfessions
    },
    sessionId: sessionId
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
    lastSeen: user.lastSeen,
    professions: user.selectedProfessions
  }));
  
  res.json({
    success: true,
    users: users,
    total: users.length,
    online: users.filter(u => u.isOnline).length
  });
});

// 🎭 ПРОФЕССИИ
app.get('/api/professions', (req, res) => {
  res.json({
    success: true,
    professions: data.professions
  });
});

app.post('/api/professions/select', (req, res) => {
  const { userId, professionId } = req.body;

  const user = data.users.find(u => u.id === userId);
  const profession = data.professions.find(p => p.id === professionId);

  if (!user || !profession) {
    return res.status(400).json({ error: 'Пользователь или профессия не найдены' });
  }

  if (profession.level > user.level) {
    return res.status(400).json({ error: 'Недостаточный уровень для этой профессии' });
  }

  if (user.selectedProfessions.length >= 3) {
    return res.status(400).json({ error: 'Можно выбрать не более 3 профессий' });
  }

  if (user.selectedProfessions.find(p => p.id === professionId)) {
    return res.status(400).json({ error: 'Эта профессия уже выбрана' });
  }

  user.selectedProfessions.push(profession);

  res.json({
    success: true,
    message: `Профессия "${profession.name}" выбрана`,
    professions: user.selectedProfessions
  });
});

// 💬 СООБЩЕНИЯ - ИСПРАВЛЕННАЯ ВЕРСИЯ
function handleNewMessage(messageData) {
  const { chatId, text, userId, username } = messageData;
  
  const user = data.users.find(u => u.id === userId);
  if (!user) {
    console.log('❌ Пользователь не найден:', userId);
    return;
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

app.get('/api/messages/:chatId', (req, res) => {
  const { chatId } = req.params;
  const messages = data.messages[chatId] || [];
  
  res.json({
    success: true,
    messages: messages.slice(-100), // Последние 100 сообщений
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

// 📋 ЗАДАНИЯ
app.get('/api/tasks', (req, res) => {
  res.json({
    success: true,
    tasks: data.tasks.filter(task => !task.completed)
  });
});

app.post('/api/tasks', (req, res) => {
  const { title, description, reward, requiredLevel, createdBy } = req.body;

  const task = {
    id: generateId(),
    title,
    description,
    reward: reward || 10,
    requiredLevel: requiredLevel || 1,
    createdBy,
    createdAt: new Date().toISOString(),
    completed: false,
    completedBy: null
  };

  data.tasks.push(task);

  // Уведомление о новом задании
  broadcastToAll({
    type: 'new_task',
    task: task
  });

  res.json({
    success: true,
    task: task
  });
});

app.post('/api/tasks/complete', (req, res) => {
  const { taskId, userId } = req.body;

  const task = data.tasks.find(t => t.id === taskId);
  const user = data.users.find(u => u.id === userId);

  if (!task || !user) {
    return res.status(400).json({ error: 'Задание или пользователь не найдены' });
  }

  if (task.completed) {
    return res.status(400).json({ error: 'Задание уже выполнено' });
  }

  task.completed = true;
  task.completedBy = userId;
  task.completedAt = new Date().toISOString();

  // Награда пользователю
  user.coins += task.reward;
  user.experience += task.reward * 10;

  // Проверка повышения уровня
  const neededExp = user.level * 100;
  if (user.experience >= neededExp) {
    user.level += 1;
    user.experience = 0;
    
    // Уведомление о новом уровне
    broadcastToAll({
      type: 'level_up',
      userId: userId,
      username: user.username,
      newLevel: user.level
    });
  }

  res.json({
    success: true,
    message: 'Задание выполнено!',
    reward: task.reward,
    newLevel: user.level,
    coins: user.coins
  });
});

// 🔔 УВЕДОМЛЕНИЯ
app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const userNotifications = data.notifications
    .filter(notif => notif.userId === userId)
    .slice(-50);
  
  res.json({
    success: true,
    notifications: userNotifications
  });
});

app.post('/api/notifications', (req, res) => {
  const { userId, title, message, type } = req.body;

  const notification = {
    id: generateId(),
    userId,
    title,
    message,
    type: type || 'system',
    timestamp: Date.now(),
    read: false
  };

  data.notifications.push(notification);

  // Отправляем уведомление через WebSocket если пользователь онлайн
  broadcastToAll({
    type: 'notification',
    notification: notification
  });

  res.json({
    success: true,
    notification: notification
  });
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Anongram Server v3.0 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🔗 WebSocket: включен');
  console.log('💬 Чаты: Общий, Архив, Избранное');
  console.log('🎭 Профессии: 20 профессий с уровнями');
  console.log('📋 Задания: система наград и опыта');
  console.log('👥 Пользователи: 0 зарегистрировано');
  console.log('🌐 Готов к работе!');
});
