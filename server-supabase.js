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
  'YOUR_ANON_KEY' // замени на свой anon key из Settings → API
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

// 🔧 УТИЛИТЫ
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 🔗 WEBSOCKET
wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  console.log('🔗 Новое WebSocket подключение:', connectionId);

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
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket подключен'
  }));
});

// 📢 ФУНКЦИИ РАССЫЛКИ
function broadcastToChat(chatId, message) {
  wss.clients.forEach((ws) => {
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
app.get('/api/professions', (req, res) => {
  const professions = [
    // ... твои 21 профессия ...
    { id: 1, name: '🎨 Художник', level: 1, description: 'Создание стикеров и оформления' },
    { id: 2, name: '📷 Фотограф', level: 1, description: 'Фотоотчеты и мемы' },
    // ... остальные профессии ...
  ];

  res.json({
    success: true,
    professions: professions
  });
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Anongram Server v4.0 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🔗 WebSocket: включен');
  console.log('🗄️ База: Supabase PostgreSQL');
  console.log('🌐 Готов к работе!');
});
