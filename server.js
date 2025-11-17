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
    id: message.id,
    userid: message.userId,
    username: message.username,
    text: message.text,
    chatid: message.chatId,
    timestamp: message.timestamp,
    time: message.time
  };

  console.log('💾 Сохраняем сообщение:', {
    id: message.id,
    userid: message.userId,
    username: message.username,
    text: message.text
  });

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

async function deleteMessage(messageId) {
  console.log('🗑️ Удаление сообщения из базы:', messageId);
  
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    console.error('❌ Ошибка удаления сообщения:', error);
    return false;
  }
  
  return true;
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

async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .single();

  if (error) return null;
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
      console.log('📨 WebSocket сообщение:', parsedData);
      
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
  console.log(`📢 Рассылка в чат ${chatId}, соединений: ${activeConnections.size}`);
  
  let sentCount = 0;
  activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        chatId: chatId
      }));
      sentCount++;
    }
  });
  
  console.log(`✅ Отправлено ${sentCount} клиентам`);
}

function broadcastToAll(message) {
  console.log(`📢 Рассылка всем: ${activeConnections.size} соединений`);
  
  activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// 💬 ФУНКЦИЯ СООБЩЕНИЙ
async function handleNewMessage(messageData) {
  console.log('🔍 Обработка WebSocket сообщения:', messageData);
  
  // ИСПРАВЛЕНИЕ: обрабатываем оба варианта полей (camelCase и lowercase)
  const { 
    chatId, chatid, 
    text, 
    userId, userid, 
    username, 
    messageId, id 
  } = messageData;

  // Используем правильные поля (приоритет lowercase)
  const finalChatId = chatid || chatId || 'general';
  const finalUserId = userid || userId;
  const finalMessageId = id || messageId;
  
  console.log(`🔍 Извлеченные поля: chatId=${finalChatId}, userId=${finalUserId}, text=${text}`);

  if (!text || !finalUserId) {
    console.error('❌ Недостаточно данных для сообщения');
    return;
  }

  // Получаем реальное имя пользователя из базы
  let realUsername = username;
  if (finalUserId) {
    const user = await getUserById(finalUserId);
    if (user && user.username) {
      realUsername = user.username;
      console.log('👤 Найдено реальное имя пользователя:', realUsername);
    }
  }

  const message = {
    id: finalMessageId || generateId(),
    userId: finalUserId,
    username: realUsername,
    text: text,
    chatId: finalChatId,
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit'
    })
  };

  console.log('💬 Создано сообщение:', {
    id: message.id,
    userId: message.userId,
    username: message.username,
    text: message.text
  });

  const savedMessage = await addMessage(message);
  
  if (savedMessage) {
    console.log('✅ Сообщение сохранено в базу');
    broadcastToChat(finalChatId, {
      type: 'new_message',
      message: savedMessage
    });
  } else {
    console.error('❌ Не удалось сохранить сообщение в базу');
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
    message: '🚀 Anongram Server v6.4 (Added Delete Functionality)',
    version: '6.4.0',
    timestamp: new Date().toISOString()
  });
});

// 🔐 ПРОВЕРКА КОДА
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
    const existingUser = await getUserByAccessCode(code);

    if (existingUser) {
      console.log('✅ Найден существующий пользователь:', existingUser.username);

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

  const existingUsername = await getUserByUsername(username);
  if (existingUsername) {
    return res.status(400).json({
      success: false,
      error: 'Этот никнейм уже занят'
    });
  }

  const existingCode = await getUserByAccessCode(code);
  if (existingCode) {
    return res.status(400).json({
      success: false,
      error: 'Этот код доступа уже используется'
    });
  }

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

// 👤 ПРЯМОЙ ВХОД
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

// 🗑️ API ДЛЯ УДАЛЕНИЯ СООБЩЕНИЙ
app.delete('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  
  try {
    console.log('🗑️ Удаление сообщения:', messageId);
    
    const success = await deleteMessage(messageId);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Ошибка удаления сообщения'
      });
    }

    // Рассылаем всем клиентам что сообщение удалено
    broadcastToAll({
      type: 'message_deleted',
      messageId: messageId
    });

    res.json({
      success: true,
      message: 'Сообщение удалено'
    });
  } catch (error) {
    console.error('❌ Ошибка удаления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v6.4 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('🗑️ Добавлено удаление сообщений');
  console.log('🌐 Готов к работе!');
});
