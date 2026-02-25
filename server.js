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

// 🔧 Кэш отправленных сообщений на сервере
const sentMessageIds = new Set();
const userConnections = new Map(); // userId -> connectionId

// 🔧 Проверка подключения к Supabase
async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('messages').select('id').limit(1);
    if (error) {
      console.error('❌ Ошибка подключения к Supabase:', error.message);
      return false;
    }
    console.log('✅ Успешное подключение к Supabase');
    return true;
  } catch (error) {
    console.error('❌ Критическая ошибка Supabase:', error);
    return false;
  }
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 🗄️ Функции для работы с Supabase
async function addMessage(message) {
  try {
    console.log('💾 Сохраняем сообщение в Supabase:', {
      id: message.id,
      userid: message.userId,
      username: message.username,
      text: message.text?.substring(0, 30),
      type: message.type
    });

    // Проверяем, не было ли уже такое сообщение
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('id', message.id)
      .single();

    if (existing) {
      console.log('🔄 Сообщение уже существует в БД, пропускаем');
      return existing;
    }

    const messageData = {
      id: message.id,
      userid: message.userId,
      username: message.username,
      text: message.text || '',
      chatid: message.chatId || 'general',
      timestamp: message.timestamp || new Date().toISOString(),
      time: message.time || new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      reply_to: message.replyTo,
      is_edited: message.isEdited || false,
      type: message.type || 'text',
      reactions: message.reactions || {},
      media: message.media || [],
      poll_data: message.pollData,
      sticker_id: message.stickerId,
      sticker_emoji: message.stickerEmoji,
      voice_url: message.voiceUrl,
      duration: message.duration,
      file_info: message.fileInfo,
      is_pinned: message.isPinned || false,
      views: message.views || 1
    };

    const { data, error } = await supabase
      .from('messages')
      .insert([messageData])
      .select();

    if (error) {
      console.error('❌ Ошибка сохранения сообщения в Supabase:', error);
      return null;
    }
    
    console.log('✅ Сообщение сохранено в Supabase:', data[0].id);
    
    // Добавляем ID в кэш
    sentMessageIds.add(data[0].id);
    
    return data ? data[0] : message;
  } catch (error) {
    console.error('❌ Неожиданная ошибка при сохранении:', error);
    return null;
  }
}

async function getMessages(chatId, limit = 500) {
  try {
    console.log('📥 Загрузка сообщений из Supabase для чата:', chatId);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chatid', chatId || 'general')
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('❌ Ошибка загрузки сообщений:', error);
      return [];
    }
    
    console.log(`✅ Загружено ${data?.length || 0} сообщений из Supabase`);
    
    // Добавляем ID в кэш
    if (data) {
      data.forEach(msg => sentMessageIds.add(msg.id));
    }
    
    return data || [];
  } catch (error) {
    console.error('❌ Ошибка при загрузке сообщений:', error);
    return [];
  }
}

async function deleteMessage(messageId) {
  try {
    console.log('🗑️ Удаление сообщения из Supabase:', messageId);

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('❌ Ошибка удаления сообщения:', error);
      return false;
    }

    // Удаляем из кэша
    sentMessageIds.delete(messageId);
    
    console.log('✅ Сообщение удалено из Supabase');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при удалении сообщения:', error);
    return false;
  }
}

async function updateMessage(messageId, newText, userId) {
  try {
    console.log('✏️ Обновление сообщения в Supabase:', messageId);

    const { error } = await supabase
      .from('messages')
      .update({
        text: newText,
        is_edited: true,
        edited_at: new Date().toISOString(),
        edited_by: userId
      })
      .eq('id', messageId);

    if (error) {
      console.error('❌ Ошибка обновления сообщения:', error);
      return false;
    }

    console.log('✅ Сообщение обновлено в Supabase');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при обновлении:', error);
    return false;
  }
}

// 🎭 Функции для реакций
async function addReaction(messageId, userId, reaction) {
  try {
    console.log('🎭 Добавление реакции в Supabase:', { messageId, userId, reaction });

    const { data: message, error: getError } = await supabase
      .from('messages')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (getError) {
      console.error('❌ Ошибка получения сообщения:', getError);
      return false;
    }

    const reactions = message.reactions || {};
    
    // Удаляем старую реакцию пользователя
    for (const key in reactions) {
      if (reactions[key] && Array.isArray(reactions[key])) {
        reactions[key] = reactions[key].filter(id => id !== userId);
        if (reactions[key].length === 0) {
          delete reactions[key];
        }
      }
    }

    // Добавляем новую реакцию
    if (!reactions[reaction]) {
      reactions[reaction] = [];
    }
    reactions[reaction].push(userId);

    const { error: updateError } = await supabase
      .from('messages')
      .update({ reactions })
      .eq('id', messageId);

    if (updateError) {
      console.error('❌ Ошибка обновления реакций:', updateError);
      return false;
    }

    console.log('✅ Реакция добавлена в Supabase');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при добавлении реакции:', error);
    return false;
  }
}

async function removeReaction(messageId, userId, reaction) {
  try {
    console.log('🎭 Удаление реакции из Supabase:', { messageId, userId, reaction });

    const { data: message, error: getError } = await supabase
      .from('messages')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (getError) {
      console.error('❌ Ошибка получения сообщения:', getError);
      return false;
    }

    const reactions = message.reactions || {};
    
    if (reactions[reaction] && Array.isArray(reactions[reaction])) {
      reactions[reaction] = reactions[reaction].filter(id => id !== userId);
      if (reactions[reaction].length === 0) {
        delete reactions[reaction];
      }
    }

    const { error: updateError } = await supabase
      .from('messages')
      .update({ reactions })
      .eq('id', messageId);

    if (updateError) {
      console.error('❌ Ошибка обновления реакций:', updateError);
      return false;
    }

    console.log('✅ Реакция удалена из Supabase');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при удалении реакции:', error);
    return false;
  }
}

async function pinMessage(messageId, userId, chatId) {
  try {
    console.log('📍 Закрепление сообщения:', { messageId, userId, chatId });

    const { error } = await supabase
      .from('messages')
      .update({
        is_pinned: true,
        pinned_at: new Date().toISOString(),
        pinned_by: userId
      })
      .eq('id', messageId);

    if (error) {
      console.error('❌ Ошибка закрепления:', error);
      return false;
    }

    console.log('✅ Сообщение закреплено');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при закреплении:', error);
    return false;
  }
}

async function unpinMessage(messageId) {
  try {
    console.log('📍 Открепление сообщения:', messageId);

    const { error } = await supabase
      .from('messages')
      .update({
        is_pinned: false,
        pinned_at: null,
        pinned_by: null
      })
      .eq('id', messageId);

    if (error) {
      console.error('❌ Ошибка открепления:', error);
      return false;
    }

    console.log('✅ Сообщение откреплено');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при откреплении:', error);
    return false;
  }
}

// 👤 Функции для пользователей
async function getUserByAccessCode(code) {
  try {
    console.log('🔍 Поиск пользователя по коду:', code);

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('accesscode', code)
      .single();

    if (error) {
      console.log('📝 Пользователь не найден');
      return null;
    }

    console.log('✅ Пользователь найден:', data.username);
    return data;
  } catch (error) {
    console.error('❌ Ошибка поиска пользователя:', error);
    return null;
  }
}

async function getUserByUsername(username) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    console.error('❌ Ошибка поиска по имени:', error);
    return null;
  }
}

async function createUser(userData) {
  try {
    console.log('👤 Создание пользователя:', userData.username);

    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select();

    if (error) {
      console.error('❌ Ошибка создания пользователя:', error);
      return null;
    }

    console.log('✅ Пользователь создан:', userData.username);
    return data ? data[0] : userData;
  } catch (error) {
    console.error('❌ Ошибка при создании пользователя:', error);
    return null;
  }
}

async function updateUserLastSeen(userId) {
  try {
    await supabase
      .from('users')
      .update({
        isonline: true,
        lastseen: new Date().toISOString()
      })
      .eq('id', userId);
  } catch (error) {
    console.error('❌ Ошибка обновления пользователя:', error);
  }
}

// 🔗 WEBSOCKET
let activeConnections = new Map(); // connectionId -> { ws, userId, chatId }
let connectionStats = {
  total: 0,
  active: 0
};

wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  activeConnections.set(connectionId, { 
    ws, 
    ip, 
    connectedAt: Date.now(),
    userId: null,
    chatId: null
  });
  
  connectionStats.total++;
  connectionStats.active = activeConnections.size;

  console.log('🔗 Новое WebSocket подключение:', {
    id: connectionId,
    ip,
    total: connectionStats.active
  });

  // Отправляем подтверждение подключения
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId: connectionId,
    timestamp: Date.now()
  }));

  ws.on('message', async (message) => {
    try {
      const parsedData = JSON.parse(message);
      console.log('📨 WebSocket сообщение от', connectionId + ':', parsedData.type);

      // Сохраняем userId и chatId если есть
      if (parsedData.userId) {
        const conn = activeConnections.get(connectionId);
        if (conn) {
          conn.userId = parsedData.userId;
          conn.chatId = parsedData.chatId;
          activeConnections.set(connectionId, conn);
          
          // Сохраняем связь userId -> connectionId
          userConnections.set(parsedData.userId, connectionId);
        }
      }

      switch (parsedData.type) {
        case 'send_message':
        case 'new_message':
          await handleNewMessage(parsedData, connectionId);
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
        case 'delete_message':
          await handleDeleteMessage(parsedData);
          break;
        case 'pin_message':
          await handlePinMessage(parsedData);
          break;
        case 'unpin_message':
          await handleUnpinMessage(parsedData);
          break;
        case 'typing':
          handleTyping(parsedData);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        default:
          console.log("📡 Неизвестный тип сообщения:", parsedData.type);
      }
    } catch (error) {
      console.error('❌ Ошибка обработки WebSocket сообщения:', error);
    }
  });

  ws.on('close', (code, reason) => {
    const conn = activeConnections.get(connectionId);
    if (conn && conn.userId) {
      userConnections.delete(conn.userId);
    }
    
    activeConnections.delete(connectionId);
    connectionStats.active = activeConnections.size;
    
    console.log('🔌 WebSocket соединение закрыто:', {
      id: connectionId,
      code,
      reason: reason.toString(),
      active: connectionStats.active
    });
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket ошибка:', { id: connectionId, error: error.message });
  });
});

// 📢 ФУНКЦИИ РАССЫЛКИ (без дубликатов)
function broadcastToChat(chatId, message, excludeConnectionId = null) {
  const chatConnections = Array.from(activeConnections.entries());
  let sentCount = 0;

  chatConnections.forEach(([id, connection]) => {
    // Пропускаем отправителя если нужно
    if (excludeConnectionId && id === excludeConnectionId) {
      return;
    }
    
    if (connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify({
          ...message,
          chatId: chatId,
          serverTime: Date.now()
        }));
        sentCount++;
      } catch (error) {
        console.error('❌ Ошибка отправки клиенту:', id, error.message);
      }
    }
  });

  if (sentCount > 0) {
    console.log(`📢 Рассылка в чат ${chatId}: ${sentCount} клиентов (исключая отправителя)`);
  }
}

// 💬 ОБРАБОТКА СООБЩЕНИЙ
async function handleNewMessage(messageData, senderConnectionId) {
  try {
    const {
      chatId, chatid,
      text,
      userId, userid,
      username,
      messageId, id,
      replyTo, reply_to,
      type = 'text',
      media = [],
      pollData,
      stickerId,
      stickerEmoji,
      voiceUrl,
      duration,
      fileInfo
    } = messageData;

    const finalChatId = chatid || chatId || 'general';
    const finalUserId = userid || userId;
    const finalMessageId = id || messageId || generateId();
    const finalReplyTo = reply_to || replyTo;

    // Проверяем, не было ли уже такое сообщение
    if (sentMessageIds.has(finalMessageId)) {
      console.log('🔄 Дубликат сообщения, пропускаем:', finalMessageId);
      return;
    }

    if (!text && type === 'text' && (!media || media.length === 0)) {
      console.error('❌ Недостаточно данных для сообщения');
      return;
    }

    const message = {
      id: finalMessageId,
      userId: finalUserId,
      username: username || 'User',
      text: text || '',
      chatId: finalChatId,
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      replyTo: finalReplyTo,
      isEdited: false,
      type: type,
      media: media,
      pollData: pollData,
      stickerId: stickerId,
      stickerEmoji: stickerEmoji,
      voiceUrl: voiceUrl,
      duration: duration,
      fileInfo: fileInfo,
      reactions: {}
    };

    // Сохраняем в Supabase
    const savedMessage = await addMessage(message);

    if (savedMessage) {
      console.log('✅ Сообщение сохранено в базу:', savedMessage.id);

      // Рассылаем всем КРОМЕ отправителя
      broadcastToChat(finalChatId, {
        type: 'new_message',
        message: savedMessage,
        serverTimestamp: Date.now()
      }, senderConnectionId);
      
      // Отправляем подтверждение отправителю
      const senderConn = Array.from(activeConnections.entries())
        .find(([id, conn]) => id === senderConnectionId);
      
      if (senderConn) {
        senderConn[1].ws.send(JSON.stringify({
          type: 'message_sent',
          messageId: savedMessage.id,
          serverTimestamp: Date.now()
        }));
      }
    }
  } catch (error) {
    console.error('❌ Ошибка обработки нового сообщения:', error);
  }
}

async function handleAddReaction(data) {
  try {
    const { messageId, userId, reaction, chatId } = data;
    
    const success = await addReaction(messageId, userId, reaction);

    if (success) {
      const { data: message } = await supabase
        .from('messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      broadcastToChat(chatId, {
        type: 'reaction_added',
        messageId: messageId,
        reactions: message?.reactions || {},
        userId: userId,
        reaction: reaction
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки добавления реакции:', error);
  }
}

async function handleRemoveReaction(data) {
  try {
    const { messageId, userId, reaction, chatId } = data;

    const success = await removeReaction(messageId, userId, reaction);

    if (success) {
      const { data: message } = await supabase
        .from('messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      broadcastToChat(chatId, {
        type: 'reaction_removed',
        messageId: messageId,
        reactions: message?.reactions || {},
        userId: userId,
        reaction: reaction
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки удаления реакции:', error);
  }
}

async function handleEditMessage(data) {
  try {
    const { messageId, newText, userId, chatId } = data;

    const success = await updateMessage(messageId, newText, userId);

    if (success) {
      broadcastToChat(chatId, {
        type: 'message_edited',
        messageId: messageId,
        newText: newText,
        editedAt: new Date().toISOString(),
        editedBy: userId
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки редактирования:', error);
  }
}

async function handleDeleteMessage(data) {
  try {
    const { messageId, chatId, userId } = data;

    const success = await deleteMessage(messageId);

    if (success) {
      broadcastToChat(chatId, {
        type: 'message_deleted',
        messageId: messageId,
        chatId: chatId,
        deletedBy: userId
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки удаления:', error);
  }
}

async function handlePinMessage(data) {
  try {
    const { messageId, chatId, userId } = data;

    const success = await pinMessage(messageId, userId, chatId);

    if (success) {
      broadcastToChat(chatId, {
        type: 'message_pinned',
        messageId: messageId,
        chatId: chatId,
        pinnedBy: userId
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки закрепления:', error);
  }
}

async function handleUnpinMessage(data) {
  try {
    const { messageId, chatId, userId } = data;

    const success = await unpinMessage(messageId);

    if (success) {
      broadcastToChat(chatId, {
        type: 'message_unpinned',
        messageId: messageId,
        chatId: chatId,
        unpinnedBy: userId
      });
    }
  } catch (error) {
    console.error('❌ Ошибка обработки открепления:', error);
  }
}

function handleTyping(data) {
  try {
    const { chatId, userId, username, isTyping } = data;
    
    broadcastToChat(chatId, {
      type: 'typing',
      userId: userId,
      username: username,
      isTyping: isTyping,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Ошибка обработки typing:', error);
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
    message: '🚀 Anongram Server v8.1 (Fixed Duplicates)',
    version: '8.1.0',
    timestamp: new Date().toISOString(),
    features: [
      'supabase',
      'realtime_messages',
      'no_duplicates',
      'reactions', 
      'editing',
      'pinning',
      'media'
    ],
    stats: {
      connections: connectionStats.active,
      totalConnections: connectionStats.total,
      cachedMessages: sentMessageIds.size
    }
  });
});

// Проверка здоровья
app.get('/api/health', async (req, res) => {
  try {
    const supabaseConnected = await checkSupabaseConnection();
    
    res.json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      supabase: supabaseConnected ? 'connected' : 'disconnected',
      websockets: {
        active: connectionStats.active,
        total: connectionStats.total
      },
      cache: {
        messages: sentMessageIds.size,
        connections: userConnections.size
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

// 💬 СООБЩЕНИЯ
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const { limit = 500 } = req.query;
  
  try {
    console.log(`📥 API запрос сообщений для чата ${chatId}`);
    
    const messages = await getMessages(chatId, parseInt(limit));
    
    res.json({
      success: true,
      messages: messages,
      total: messages.length,
      chatId: chatId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки сообщений:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки сообщений',
      message: error.message
    });
  }
});

app.get('/api/messages/:chatId/pinned', async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chatid', chatId || 'general')
      .eq('is_pinned', true)
      .order('pinned_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      pinnedMessages: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    console.log('📤 API запрос отправки сообщения');
    
    // Проверяем дубликат
    if (req.body.id && sentMessageIds.has(req.body.id)) {
      return res.json({
        success: true,
        messageId: req.body.id,
        duplicate: true
      });
    }
    
    await handleNewMessage(req.body, null);
    
    res.json({
      success: true,
      messageId: req.body.id || generateId(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка отправки сообщения',
      message: error.message
    });
  }
});

// 🗑️ УДАЛЕНИЕ СООБЩЕНИЙ
app.delete('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { chatId, userId } = req.body;

  try {
    console.log('🗑️ API запрос на удаление сообщения:', messageId);

    const success = await deleteMessage(messageId);

    if (success) {
      broadcastToChat(chatId || 'general', {
        type: 'message_deleted',
        messageId: messageId,
        chatId: chatId,
        deletedBy: userId
      });

      res.json({
        success: true,
        message: 'Сообщение удалено',
        messageId: messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка удаления сообщения'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка удаления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// ✏️ РЕДАКТИРОВАНИЕ СООБЩЕНИЙ
app.put('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { newText, userId, chatId } = req.body;

  try {
    const success = await updateMessage(messageId, newText, userId);

    if (success) {
      broadcastToChat(chatId || 'general', {
        type: 'message_edited',
        messageId: messageId,
        newText: newText,
        editedAt: new Date().toISOString(),
        editedBy: userId
      });

      res.json({
        success: true,
        message: 'Сообщение обновлено',
        messageId: messageId
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
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// 🎭 РЕАКЦИИ
app.post('/api/messages/:messageId/reactions', async (req, res) => {
  const { messageId } = req.params;
  const { userId, reaction, chatId } = req.body;

  try {
    const success = await addReaction(messageId, userId, reaction);

    if (success) {
      const { data: message } = await supabase
        .from('messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      broadcastToChat(chatId || 'general', {
        type: 'reaction_added',
        messageId: messageId,
        reactions: message?.reactions || {},
        userId: userId,
        reaction: reaction
      });

      res.json({
        success: true,
        reactions: message?.reactions || {},
        messageId: messageId
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
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

app.delete('/api/messages/:messageId/reactions', async (req, res) => {
  const { messageId } = req.params;
  const { userId, reaction, chatId } = req.body;

  try {
    const success = await removeReaction(messageId, userId, reaction);

    if (success) {
      const { data: message } = await supabase
        .from('messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      broadcastToChat(chatId || 'general', {
        type: 'reaction_removed',
        messageId: messageId,
        reactions: message?.reactions || {},
        userId: userId,
        reaction: reaction
      });

      res.json({
        success: true,
        reactions: message?.reactions || {},
        messageId: messageId
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
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// 📍 ЗАКРЕПЛЕНИЕ СООБЩЕНИЙ
app.post('/api/messages/:messageId/pin', async (req, res) => {
  const { messageId } = req.params;
  const { chatId, userId } = req.body;

  try {
    const success = await pinMessage(messageId, userId, chatId);

    if (success) {
      broadcastToChat(chatId || 'general', {
        type: 'message_pinned',
        messageId: messageId,
        chatId: chatId,
        pinnedBy: userId
      });

      res.json({
        success: true,
        message: 'Сообщение закреплено',
        messageId: messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка закрепления сообщения'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка закрепления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

app.post('/api/messages/:messageId/unpin', async (req, res) => {
  const { messageId } = req.params;
  const { chatId, userId } = req.body;

  try {
    const success = await unpinMessage(messageId);

    if (success) {
      broadcastToChat(chatId || 'general', {
        type: 'message_unpinned',
        messageId: messageId,
        chatId: chatId,
        unpinnedBy: userId
      });

      res.json({
        success: true,
        message: 'Сообщение откреплено',
        messageId: messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка открепления сообщения'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка открепления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// 👤 АУТЕНТИФИКАЦИЯ
app.post('/api/auth/check-code', async (req, res) => {
  const { code } = req.body;

  try {
    const user = await getUserByAccessCode(code);

    if (user) {
      await updateUserLastSeen(user.id);

      res.json({
        success: true,
        userExists: true,
        user: {
          id: user.id,
          username: user.username,
          level: user.level || 1,
          coins: user.coins || 100,
          experience: user.experience || 0,
          isAdmin: user.isadmin || false,
          avatar: user.avatar || '👤',
          profession: user.profession,
          bio: user.bio,
          color: user.color || '#666666'
        }
      });
    } else {
      res.json({
        success: true,
        userExists: false,
        message: 'Код свободен'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка проверки кода:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, code } = req.body;

  try {
    if (!username || !code) {
      return res.status(400).json({
        success: false,
        error: 'Имя пользователя и код обязательны'
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
    const userId = generateId();

    const userData = {
      id: userId,
      username: username.trim(),
      accesscode: code,
      level: isAdmin ? 10 : 1,
      coins: isAdmin ? 999999 : 100,
      experience: 0,
      isonline: true,
      lastseen: new Date().toISOString(),
      createdat: new Date().toISOString(),
      isadmin: isAdmin,
      avatar: isAdmin ? '👑' : '👤',
      profession: isAdmin ? '👑 Системный Админ' : 'Участник',
      bio: isAdmin ? 'Главный администратор платформы' : 'Новый участник',
      color: isAdmin ? '#FF4444' : '#666666'
    };

    const savedUser = await createUser(userData);

    if (savedUser) {
      res.json({
        success: true,
        user: {
          id: savedUser.id,
          username: savedUser.username,
          level: savedUser.level,
          coins: savedUser.coins,
          experience: savedUser.experience,
          isAdmin: savedUser.isadmin,
          avatar: savedUser.avatar,
          profession: savedUser.profession,
          bio: savedUser.bio,
          color: savedUser.color
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка создания пользователя'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Код обязателен'
      });
    }

    const user = await getUserByAccessCode(code);

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Пользователь с таким кодом не найден'
      });
    }

    await updateUserLastSeen(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        level: user.level || 1,
        coins: user.coins || 100,
        experience: user.experience || 0,
        isAdmin: user.isadmin || false,
        avatar: user.avatar || '👤',
        profession: user.profession,
        bio: user.bio,
        color: user.color || '#666666'
      }
    });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// 👥 ПОЛЬЗОВАТЕЛИ
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, level, coins, experience, isonline, lastseen, isadmin, avatar, profession, color')
      .order('level', { ascending: false })
      .limit(100);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      users: data || [],
      total: data?.length || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    res.json({
      success: true,
      user: {
        id: data.id,
        username: data.username,
        level: data.level,
        coins: data.coins,
        experience: data.experience,
        isAdmin: data.isadmin,
        avatar: data.avatar,
        profession: data.profession,
        bio: data.bio,
        color: data.color,
        isOnline: data.isonline,
        lastSeen: data.lastseen,
        createdAt: data.createdat
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Очистка кэша (для админов)
app.post('/api/admin/clear-cache', (req, res) => {
  sentMessageIds.clear();
  userConnections.clear();
  
  res.json({
    success: true,
    message: 'Кэш очищен',
    stats: {
      messages: sentMessageIds.size,
      connections: userConnections.size
    }
  });
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v8.1 (Fixed Duplicates) запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  
  const supabaseConnected = await checkSupabaseConnection();
  if (supabaseConnected) {
    console.log('✅ Supabase подключен');
  }
  
  console.log('✅ Функции:');
  console.log('   💬 Без дубликатов сообщений');
  console.log('   🔄 WebSocket без рассылки отправителю');
  console.log('   🗃️  Кэш ID сообщений');
  console.log('   👥 Отслеживание пользователей');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанное исключение:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Необработанный промис:', reason);
});

process.on('SIGTERM', () => {
  console.log('🔄 Получен SIGTERM, завершение работы...');
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1000, 'Server shutdown');
    }
  });
  
  wss.close(() => {
    console.log('✅ WebSocket сервер закрыт');
    server.close(() => {
      console.log('✅ HTTP сервер закрыт');
      process.exit(0);
    });
  });
});
