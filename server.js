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
  const messageData = {
    id: message.id, // Используем ID от клиента
    userid: message.userId,
    username: message.username,
    text: message.text,
    chatid: message.chatId,
    timestamp: message.timestamp,
    time: message.time
  };

  const { data, error } = await supabase
    .from('messages')
    .insert([messageData]);

  if (error) {
    console.error('❌ Ошибка сохранения сообщения:', error);
    return null;
  }
  return data ? data[0] : message;
}

async function getMessages(chatId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chatid', chatId)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('❌ Ошибка загрузки сообщений:', error);
    return [];
  }
  return data || [];
}

async function addUser(user) {
  const userData = {
    id: user.id,
    username: user.username,
    accesscode: user.accessCode,
    level: user.level,
    coins: user.coins,
    experience: user.experience,
    isonline: user.isOnline,
    lastseen: user.lastSeen,
    createdat: user.createdAt,
    isadmin: user.isAdmin
  };

  const { data, error } = await supabase
    .from('users')
    .insert([userData]);

  if (error) {
    console.error('❌ Ошибка сохранения пользователя:', error);
    return null;
  }
  return data ? data[0] : user;
}

async function getUserByAccessCode(accessCode) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('accesscode', accessCode)
    .single();

  if (error) {
    console.log('🔍 Пользователь с кодом', accessCode, 'не найден');
    return null;
  }
  return data;
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

async function updateUserLastSeen(userId) {
  await supabase
    .from('users')
    .update({ 
      isonline: true,
      lastseen: new Date().toISOString()
    })
    .eq('id', userId);
}

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, level, coins, experience, isonline, lastseen, isadmin')
    .order('level', { ascending: false });

  if (error) {
    console.error('❌ Ошибка загрузки пользователей:', error);
    return [];
  }
  return data || [];
}

// 🔗 WEBSOCKET
let activeConnections = new Map();

wss.on('connection', (ws, req) => {
  const connectionId = generateId();
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
  const { chatId, text, userId, username, messageId } = messageData;

  const message = {
    id: messageId || generateId(), // Используем ID от клиента или генерируем новый
    userId: userId,
    username: username,
    text: text,
    chatId: chatId || 'general',
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit'
    })
  };

  const savedMessage = await addMessage(message);
  if (savedMessage) {
    broadcastToChat(chatId, {
      type: 'new_message',
      message: savedMessage
    });
  }
}

// 🔧 УТИЛИТЫ
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 🚀 API ROUTES
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Anongram Server v6.1 (Fixed Message IDs)',
    version: '6.1.0',
    timestamp: new Date().toISOString()
  });
});

// 🔐 ПРОВЕРКА КОДА (упрощенная логика)
app.post('/api/auth/check-code', async (req, res) => {
  const { code } = req.body;

  console.log('🔍 Проверка кода:', code);

  if (!code) {
    return res.status(400).json({ 
      success: false,
      error: 'Введите код доступа' 
    });
  }

  try {
    // Ищем пользователя по коду
    const existingUser = await getUserByAccessCode(code);
    
    if (existingUser) {
      console.log('✅ Найден существующий пользователь:', existingUser.username);
      
      // Обновляем время последнего входа
      await updateUserLastSeen(existingUser.id);

      res.json({
        success: true,
        user: {
          id: existingUser.id,
          username: existingUser.username,
          level: existingUser.level,
          coins: existingUser.coins,
          experience: existingUser.experience,
          isAdmin: existingUser.isadmin
        },
        userExists: true
      });
    } else {
      console.log('📝 Код свободен, можно регистрироваться');
      res.json({
        success: true,
        userExists: false,
        message: 'Код свободен. Зарегистрируйтесь.'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка проверки кода:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка сервера' 
    });
  }
});

// 👤 РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
app.post('/api/auth/register', async (req, res) => {
  const { username, code } = req.body;

  console.log('📝 Регистрация:', username, 'код:', code);

  if (!username || !code) {
    return res.status(400).json({ 
      success: false,
      error: 'Заполните никнейм и код доступа' 
    });
  }

  // Проверяем занят ли никнейм
  const existingUsername = await getUserByUsername(username);
  if (existingUsername) {
    return res.status(400).json({ 
      success: false,
      error: 'Этот никнейм уже занят' 
    });
  }

  // Проверяем занят ли код
  const existingCode = await getUserByAccessCode(code);
  if (existingCode) {
    return res.status(400).json({ 
      success: false,
      error: 'Этот код доступа уже используется' 
    });
  }

  // Создаем нового пользователя
  const isAdmin = code === '654321';
  const newUser = {
    id: generateId(),
    username: username,
    accessCode: code,
    level: isAdmin ? 10 : 1,
    coins: isAdmin ? 999999 : 100,
    experience: 0,
    isOnline: true,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isAdmin: isAdmin
  };

  const savedUser = await addUser(newUser);

  if (savedUser) {
    console.log('✅ Новый пользователь:', username, 'админ:', isAdmin);
    res.json({
      success: true,
      user: {
        id: savedUser.id,
        username: savedUser.username,
        level: savedUser.level,
        coins: savedUser.coins,
        experience: savedUser.experience,
        isAdmin: savedUser.isadmin
      }
    });
  } else {
    res.status(500).json({ 
      success: false,
      error: 'Ошибка создания пользователя' 
    });
  }
});

// 👤 ПРЯМОЙ ВХОД (для существующих пользователей)
app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body;

  console.log('🔐 Прямой вход по коду:', code);

  if (!code) {
    return res.status(400).json({ 
      success: false,
      error: 'Введите код доступа' 
    });
  }

  try {
    const existingUser = await getUserByAccessCode(code);
    
    if (existingUser) {
      console.log('✅ Прямой вход:', existingUser.username);
      await updateUserLastSeen(existingUser.id);

      res.json({
        success: true,
        user: {
          id: existingUser.id,
          username: existingUser.username,
          level: existingUser.level,
          coins: existingUser.coins,
          experience: existingUser.experience,
          isAdmin: existingUser.isadmin
        }
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Пользователь с таким кодом не найден' 
      });
    }
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка сервера' 
    });
  }
});

// 👥 ПОЛЬЗОВАТЕЛИ
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json({
      success: true,
      users: users,
      total: users.length
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки пользователей:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка загрузки пользователей' 
    });
  }
});

// 💬 СООБЩЕНИЯ
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  try {
    const messages = await getMessages(chatId);
    res.json({
      success: true,
      messages: messages.slice(-100),
      total: messages.length
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки сообщений:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка загрузки сообщений' 
    });
  }
});

app.post('/api/messages', async (req, res) => {
  const { chatId, text, userId, username } = req.body;

  if (!text || !username) {
    return res.status(400).json({ 
      success: false,
      error: 'Текст и имя пользователя обязательны' 
    });
  }

  try {
    await handleNewMessage({ chatId, text, userId, username });
    res.json({
      success: true,
      message: 'Сообщение отправлено'
    });
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка отправки сообщения' 
    });
  }
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v6.1 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🔐 Исправлены ID сообщений');
  console.log('🌐 Готов к работе!');
});
