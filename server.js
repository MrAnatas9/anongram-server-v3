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
    time: message.time,
    reply_to: message.replyTo,
    is_edited: message.isEdited || false
  };

  console.log('💾 Сохраняем сообщение:', {
    id: message.id,
    userid: message.userId,
    username: message.username,
    text: message.text,
    reply_to: message.replyTo
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

async function updateMessage(messageId, newText) {
  console.log('✏️ Обновление сообщения:', messageId, newText);

  const { error } = await supabase
    .from('messages')
    .update({
      text: newText,
      is_edited: true,
      edited_at: new Date().toISOString()
    })
    .eq('id', messageId);

  if (error) {
    console.error('❌ Ошибка обновления сообщения:', error);
    return false;
  }

  return true;
}

// 🎭 ФУНКЦИИ ДЛЯ РЕАКЦИЙ
async function getMessageReactions(messageId) {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('message_id', messageId);

  if (error) {
    console.error('❌ Ошибка загрузки реакций:', error);
    return {};
  }

  const reactions = {};
  data.forEach(reaction => {
    if (!reactions[reaction.reaction]) {
      reactions[reaction.reaction] = [];
    }
    reactions[reaction.reaction].push(reaction.user_id);
  });

  return reactions;
}

async function addReaction(messageId, userId, reaction) {
  console.log('🎭 Добавление реакции:', { messageId, userId, reaction });

  // Сначала удаляем существующую реакцию этого пользователя на это сообщение
  const { error: deleteError } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('reaction', reaction);

  if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116 - не найдено для удаления
    console.error('❌ Ошибка удаления старой реакции:', deleteError);
  }

  // Добавляем новую реакцию
  const { error } = await supabase
    .from('message_reactions')
    .insert([{
      message_id: messageId,
      user_id: userId,
      reaction: reaction,
      created_at: new Date().toISOString()
    }]);

  if (error) {
    console.error('❌ Ошибка добавления реакции:', error);
    return false;
  }

  return true;
}

async function removeReaction(messageId, userId, reaction) {
  console.log('🎭 Удаление реакции:', { messageId, userId, reaction });

  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('reaction', reaction);

  if (error) {
    console.error('❌ Ошибка удаления реакции:', error);
    return false;
  }

  return true;
}

// 👤 ФУНКЦИИ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ
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
    .select('*')
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
      console.log('📨 WebSocket сообщение:', parsedData.type);

      switch (parsedData.type) {
        case 'send_message':
          await handleNewMessage(parsedData);
          break;
        case 'add_reaction':
          await handleAddReaction(parsedData);
          break;
        case 'remove_reaction':
          await handleRemoveReaction(parsedData);
          break;
        case 'edit_message':
          await handleEditMessage(parsedData);
          break;
      }
    } catch (error) {
      console.error('❌ Ошибка WebSocket:', error);
    }
  });

  ws.on('close', () => {
    activeConnections.delete(connectionId);
    console.log('🔌 WebSocket соединение закрыто, осталось:', activeConnections.size);
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket подключен',
    connectionId: connectionId
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

  let sentCount = 0;
  activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      sentCount++;
    }
  });

  console.log(`✅ Отправлено ${sentCount} клиентам`);
}

// 💬 ОБРАБОТКА СООБЩЕНИЙ
async function handleNewMessage(messageData) {
  console.log('🔍 Обработка WebSocket сообщения:', messageData);

  const {
    chatId, chatid,
    text,
    userId, userid,
    username,
    messageId, id,
    replyTo, reply_to
  } = messageData;

  // Используем правильные поля (приоритет lowercase)
  const finalChatId = chatid || chatId || 'general';
  const finalUserId = userid || userId;
  const finalMessageId = id || messageId;
  const finalReplyTo = reply_to || replyTo;

  console.log(`🔍 Извлеченные поля: chatId=${finalChatId}, userId=${finalUserId}, replyTo=${finalReplyTo}, text=${text}`);

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
    }),
    replyTo: finalReplyTo,
    isEdited: false
  };

  console.log('💬 Создано сообщение:', {
    id: message.id,
    userId: message.userId,
    username: message.username,
    text: message.text,
    replyTo: message.replyTo
  });

  const savedMessage = await addMessage(message);

  if (savedMessage) {
    console.log('✅ Сообщение сохранено в базу');
    
    // Загружаем реакции для этого сообщения
    const reactions = await getMessageReactions(savedMessage.id);
    savedMessage.reactions = reactions;

    broadcastToChat(finalChatId, {
      type: 'new_message',
      message: savedMessage
    });
  } else {
    console.error('❌ Не удалось сохранить сообщение в базу');
  }
}

// 🎭 ОБРАБОТКА РЕАКЦИЙ
async function handleAddReaction(data) {
  const { messageId, userId, reaction, chatId } = data;
  
  console.log('🎭 Обработка добавления реакции:', { messageId, userId, reaction });

  const success = await addReaction(messageId, userId, reaction);
  
  if (success) {
    // Получаем обновленные реакции для сообщения
    const reactions = await getMessageReactions(messageId);
    
    broadcastToChat(chatId, {
      type: 'reaction_added',
      messageId: messageId,
      reactions: reactions,
      userId: userId,
      reaction: reaction
    });
  }
}

async function handleRemoveReaction(data) {
  const { messageId, userId, reaction, chatId } = data;
  
  console.log('🎭 Обработка удаления реакции:', { messageId, userId, reaction });

  const success = await removeReaction(messageId, userId, reaction);
  
  if (success) {
    // Получаем обновленные реакции для сообщения
    const reactions = await getMessageReactions(messageId);
    
    broadcastToChat(chatId, {
      type: 'reaction_removed',
      messageId: messageId,
      reactions: reactions,
      userId: userId,
      reaction: reaction
    });
  }
}

// ✏️ ОБРАБОТКА РЕДАКТИРОВАНИЯ СООБЩЕНИЙ
async function handleEditMessage(data) {
  const { messageId, newText, userId, chatId } = data;
  
  console.log('✏️ Обработка редактирования сообщения:', { messageId, newText, userId });

  const success = await updateMessage(messageId, newText);
  
  if (success) {
    broadcastToChat(chatId, {
      type: 'message_edited',
      messageId: messageId,
      newText: newText,
      editedAt: new Date().toISOString(),
      editedBy: userId
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
    message: '🚀 Anongram Server v7.0 (Full Message System)',
    version: '7.0.0',
    timestamp: new Date().toISOString(),
    features: ['delete_messages', 'reactions', 'reply_system', 'edit_messages']
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
    
    // Загружаем реакции для каждого сообщения
    const messagesWithReactions = await Promise.all(
      messages.map(async (message) => {
        const reactions = await getMessageReactions(message.id);
        return {
          ...message,
          reactions: reactions
        };
      })
    );
    
    res.json({
      success: true,
      messages: messagesWithReactions.slice(-100),
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
  const { chatId, text, userId, username, replyTo } = req.body;

  if (!text || !username) {
    return res.status(400).json({
      success: false,
      error: 'Текст и имя пользователя обязательны'
    });
  }

  try {
    await handleNewMessage({ chatId, text, userId, username, replyTo });
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
    console.log('🗑️ Запрос на удаление сообщения:', messageId);

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: 'ID сообщения обязателен'
      });
    }

    // Проверяем существование сообщения
    const { data: existingMessage, error: checkError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (checkError || !existingMessage) {
      console.log('❌ Сообщение не найдено:', messageId);
      return res.status(404).json({
        success: false,
        error: 'Сообщение не найдено'
      });
    }

    // Удаляем сообщение из базы данных
    const success = await deleteMessage(messageId);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Ошибка удаления сообщения'
      });
    }

    console.log('✅ Сообщение удалено из базы:', messageId);

    // Рассылаем всем клиентам что сообщение удалено
    broadcastToAll({
      type: 'message_deleted',
      messageId: messageId,
      chatId: existingMessage.chatid
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

// 🎭 API ДЛЯ РЕАКЦИЙ
app.post('/api/messages/:messageId/reactions', async (req, res) => {
  const { messageId } = req.params;
  const { userId, reaction, chatId } = req.body;

  try {
    console.log('🎭 Добавление реакции через API:', { messageId, userId, reaction });

    const success = await addReaction(messageId, userId, reaction);

    if (success) {
      const reactions = await getMessageReactions(messageId);
      
      broadcastToChat(chatId, {
        type: 'reaction_added',
        messageId: messageId,
        reactions: reactions,
        userId: userId,
        reaction: reaction
      });

      res.json({
        success: true,
        reactions: reactions
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка добавления реакции'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка добавления реакции:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

app.delete('/api/messages/:messageId/reactions', async (req, res) => {
  const { messageId } = req.params;
  const { userId, reaction, chatId } = req.body;

  try {
    console.log('🎭 Удаление реакции через API:', { messageId, userId, reaction });

    const success = await removeReaction(messageId, userId, reaction);

    if (success) {
      const reactions = await getMessageReactions(messageId);
      
      broadcastToChat(chatId, {
        type: 'reaction_removed',
        messageId: messageId,
        reactions: reactions,
        userId: userId,
        reaction: reaction
      });

      res.json({
        success: true,
        reactions: reactions
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка удаления реакции'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка удаления реакции:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// ✏️ API ДЛЯ РЕДАКТИРОВАНИЯ СООБЩЕНИЙ
app.put('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { newText, userId, chatId } = req.body;

  try {
    console.log('✏️ Редактирование сообщения через API:', { messageId, newText });

    const success = await updateMessage(messageId, newText);

    if (success) {
      broadcastToChat(chatId, {
        type: 'message_edited',
        messageId: messageId,
        newText: newText,
        editedAt: new Date().toISOString(),
        editedBy: userId
      });

      res.json({
        success: true,
        message: 'Сообщение обновлено'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка обновления сообщения'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка редактирования:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v7.0 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('✅ Добавлены функции:');
  console.log('   🗑️  Удаление сообщений');
  console.log('   🎭  Система реакций');
  console.log('   ↩️   Ответы на сообщения');
  console.log('   ✏️  Редактирование сообщений');
  console.log('🌐 Готов к работе!');
});
