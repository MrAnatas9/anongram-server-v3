const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

// 🔗 Подключаем Supabase
const supabase = createClient(
  'https://ndyqahqoaaphvqmvnmgt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5keXFhaHFvYWFwaHZxbXZubWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NjExODksImV4cCI6MjA3ODUzNzE4OX0.YIz8W8pvzGEkZOjKGu5SPijz9Y0zimzIlCocWeZEIuU'
);

app.use(cors());
app.use(express.json());

// 🗄️ Функции для работы с Supabase
async function addMessage(message) {
  const { data, error } = await supabase
    .from('messages')
    .insert([message]);
  
  if (error) {
    console.error('❌ Ошибка сохранения сообщения:', error);
    return null;
  }
  console.log('💾 Сообщение сохранено в Supabase');
  return data[0];
}

async function getMessages(chatId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chatId', chatId)
    .order('timestamp', { ascending: true });
  
  if (error) {
    console.error('❌ Ошибка загрузки сообщений:', error);
    return [];
  }
  return data || [];
}

async function addUser(user) {
  const { data, error } = await supabase
    .from('users')
    .insert([user]);
  
  if (error) {
    console.error('❌ Ошибка сохранения пользователя:', error);
    return null;
  }
  console.log('👥 Пользователь сохранен в Supabase');
  return data[0];
}

async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error) return null;
  return data;
}

async function getProfessions() {
  const { data, error } = await supabase
    .from('professions')
    .select('*')
    .order('level', { ascending: true })
    .order('id', { ascending: true });
  
  if (error) {
    console.error('❌ Ошибка загрузки профессий:', error);
    return [];
  }
  return data || [];
}

// 🔧 УТИЛИТЫ
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 🔗 WEBSOCKET
let activeConnections = new Map();

wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  console.log('🔗 Новое WebSocket подключение:', connectionId);

  activeConnections.set(connectionId, ws);

  ws.on('message', async (message) => {
    try {
      const parsedData = JSON.parse(message);

      switch (parsedData.type) {
        case 'send_message':
          await handleNewMessage(parsedData);
          break;
      }
    } catch (error) {
      console.error('❌ Ошибка WebSocket:', error);
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket отключен:', connectionId);
    activeConnections.delete(connectionId);
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket подключен'
  }));
});

// 📢 ФУНКЦИИ РАССЫЛКИ
function broadcastToChat(chatId, message) {
  activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        chatId: chatId
      }));
    }
  });
}

// 💬 ФУНКЦИЯ СООБЩЕНИЙ
async function handleNewMessage(messageData) {
  const { chatId, text, userId, username } = messageData;

  const message = {
    id: generateId(),
    userId: userId,
    username: username,
    text: text,
    chatId: chatId || 'general',
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit'
    })
  };

  // Сохраняем в Supabase
  const savedMessage = await addMessage(message);
  
  if (savedMessage) {
    // Рассылаем через WebSocket
    broadcastToChat(chatId, {
      type: 'new_message',
      message: savedMessage
    });

    console.log('💬 Новое сообщение в', chatId, 'от', username);
  }
}

// 🚀 API ROUTES
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Anongram Server v4.0 (Supabase)',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    database: 'Supabase PostgreSQL'
  });
});

// 👤 РЕГИСТРАЦИЯ
app.post('/api/auth/register', async (req, res) => {
  const { username, code } = req.body;

  console.log('📝 Регистрация:', username);

  if (!username || !code) {
    return res.status(400).json({ error: 'Заполните никнейм и код доступа' });
  }

  // Проверяем занят ли никнейм
  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    return res.status(400).json({ error: 'Этот никнейм уже занят' });
  }

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

  const savedUser = await addUser(newUser);

  if (savedUser) {
    console.log('✅ Новый пользователь:', username);
    res.json({
      success: true,
      user: {
        id: savedUser.id,
        username: savedUser.username,
        level: savedUser.level,
        coins: savedUser.coins,
        experience: savedUser.experience
      }
    });
  } else {
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// 👥 ПОЛЬЗОВАТЕЛИ
app.get('/api/users', async (req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, level, coins, experience, isOnline, lastSeen')
    .order('level', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }

  res.json({
    success: true,
    users: users || [],
    total: users?.length || 0
  });
});

// 💬 СООБЩЕНИЯ
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const messages = await getMessages(chatId);

  res.json({
    success: true,
    messages: messages.slice(-100),
    total: messages.length
  });
});

app.post('/api/messages', async (req, res) => {
  const { chatId, text, userId, username } = req.body;

  if (!text || !username) {
    return res.status(400).json({ error: 'Текст и имя пользователя обязательны' });
  }

  await handleNewMessage({ chatId, text, userId, username });

  res.json({
    success: true,
    message: 'Сообщение отправлено'
  });
});

// 🎭 ПРОФЕССИИ
app.get('/api/professions', async (req, res) => {
  try {
    const professions = await getProfessions();
    res.json({
      success: true,
      professions: professions
    });
  } catch (error) {
    console.error('❌ Ошибка получения профессий:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка загрузки профессий' 
    });
  }
});

// 📋 ЗАДАНИЯ
app.get('/api/tasks', async (req, res) => {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('completed', false)
    .order('createdAt', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Ошибка загрузки заданий' });
  }

  res.json({
    success: true,
    tasks: tasks || []
  });
});

app.post('/api/tasks', async (req, res) => {
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

  const { data, error } = await supabase
    .from('tasks')
    .insert([task]);

  if (error) {
    return res.status(500).json({ error: 'Ошибка создания задания' });
  }

  res.json({
    success: true,
    task: data[0]
  });
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v4.0 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🔗 WebSocket: включен');
  console.log('🗄️ База: Supabase PostgreSQL');
  
  // Проверяем подключение к базе
  const professions = await getProfessions();
  console.log(`🎭 Профессий загружено: ${professions.length}`);
  
  console.log('🌐 Готов к работе!');
});
