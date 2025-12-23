const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;

// 🔗 Подключаем Supabase
const supabase = createClient(
  'https://ndyqahqoaaphvqmvnmgt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5keXFhaHFvYWFwaHZxbXZubWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NjExODksImV4cCI6MjA3ODUzNzE4OX0.YIz8W8pvzGEkZOjKGu5SPijz9Y0zimzIlCocWeZEIuU'
);

// 📁 Настройка загрузки файлов
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Создаем папку для загрузок если её нет
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

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

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// 🗄️ Функции для работы с Supabase
async function addMessage(message) {
  try {
    console.log('💾 Сохраняем сообщение в Supabase:', {
      id: message.id,
      userid: message.userId,
      username: message.username,
      text: message.text,
      type: message.type
    });

    const messageData = {
      id: message.id,
      userid: message.userId,
      username: message.username,
      text: message.text,
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
      pinned_at: message.isPinned ? new Date().toISOString() : null,
      pinned_by: message.isPinned ? message.userId : null,
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
    return data ? data[0] : message;
  } catch (error) {
    console.error('❌ Неожиданная ошибка при сохранении:', error);
    return null;
  }
}

async function getMessages(chatId, limit = 100) {
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
    return data || [];
  } catch (error) {
    console.error('❌ Ошибка при загрузке сообщений:', error);
    return [];
  }
}

async function getPinnedMessages(chatId) {
  try {
    console.log('📍 Загрузка закрепленных сообщений для чата:', chatId);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chatid', chatId || 'general')
      .eq('is_pinned', true)
      .order('pinned_at', { ascending: false });

    if (error) {
      console.error('❌ Ошибка загрузки закрепленных сообщений:', error);
      return [];
    }
    
    console.log(`✅ Загружено ${data?.length || 0} закрепленных сообщений`);
    return data || [];
  } catch (error) {
    console.error('❌ Ошибка при загрузке закрепленных:', error);
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

    console.log('✅ Сообщение удалено из Supabase');
    return true;
  } catch (error) {
    console.error('❌ Ошибка при удалении сообщения:', error);
    return false;
  }
}

async function updateMessage(messageId, newText, userId) {
  try {
    console.log('✏️ Обновление сообщения в Supabase:', messageId, newText);

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

// 🔗 WEBSOCKET
let activeConnections = new Map();

wss.on('connection', (ws, req) => {
  const connectionId = generateId();
  activeConnections.set(connectionId, ws);

  console.log('🔗 Новое WebSocket подключение:', connectionId);

  ws.on('message', async (message) => {
    try {
      const parsedData = JSON.parse(message);
      console.log('📨 WebSocket сообщение:', parsedData.type);

      switch (parsedData.type) {
        case 'send_message':
        case 'new_message':
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
        case 'delete_message':
          await handleDeleteMessage(parsedData);
          break;
        case 'pin_message':
          await handlePinMessage(parsedData);
          break;
        case 'unpin_message':
          await handleUnpinMessage(parsedData);
          break;
        case 'broadcast':
          console.log('📡 Broadcast сообщение:', parsedData);
          broadcastToAll(parsedData.data || parsedData);
          break;
        case 'identify':
          console.log('👤 Идентификация клиента:', parsedData);
          ws.send(JSON.stringify({
            type: 'identified',
            message: 'Клиент идентифицирован'
          }));
          break;
        case 'typing':
          await handleTyping(parsedData);
          break;
        default:
          console.log("📡 Неизвестный тип сообщения:", parsedData.type);
          break;
      }
    } catch (error) {
      console.error('❌ Ошибка обработки WebSocket сообщения:', error);
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
      try {
        ws.send(JSON.stringify({
          ...message,
          chatId: chatId
        }));
        sentCount++;
      } catch (error) {
        console.error('❌ Ошибка отправки сообщения клиенту:', error);
      }
    }
  });

  console.log(`✅ Отправлено ${sentCount} клиентам`);
}

function broadcastToAll(message) {
  console.log(`📢 Рассылка всем: ${activeConnections.size} соединений`);

  let sentCount = 0;
  activeConnections.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        sentCount++;
      } catch (error) {
        console.error('❌ Ошибка отправки сообщения клиенту:', error);
      }
    }
  });

  console.log(`✅ Отправлено ${sentCount} клиентам`);
}

// 💬 ОБРАБОТКА СООБЩЕНИЙ
async function handleNewMessage(messageData) {
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
      reactions: {},
      isPinned: false,
      views: 1
    };

    console.log('💬 Создано сообщение:', {
      id: message.id,
      userId: message.userId,
      username: message.username,
      text: message.text,
      type: message.type,
      hasMedia: media.length > 0
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
  } catch (error) {
    console.error('❌ Ошибка обработки нового сообщения:', error);
  }
}

async function handleAddReaction(data) {
  try {
    const { messageId, userId, reaction, chatId } = data;
    console.log('🎭 Обработка добавления реакции:', { messageId, userId, reaction });

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
    }
  } catch (error) {
    console.error('❌ Ошибка обработки добавления реакции:', error);
  }
}

async function handleRemoveReaction(data) {
  try {
    const { messageId, userId, reaction, chatId } = data;
    console.log('🎭 Обработка удаления реакции:', { messageId, userId, reaction });

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
    }
  } catch (error) {
    console.error('❌ Ошибка обработки удаления реакции:', error);
  }
}

async function handleEditMessage(data) {
  try {
    const { messageId, newText, userId, chatId } = data;
    console.log('✏️ Обработка редактирования сообщения:', { messageId, newText, userId });

    const success = await updateMessage(messageId, newText, userId);

    if (success) {
      broadcastToChat(chatId || 'general', {
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
    console.log('🗑️ Обработка удаления сообщения:', { messageId, chatId, userId });

    const success = await deleteMessage(messageId);

    if (success) {
      broadcastToChat(chatId || 'general', {
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
    console.log('📍 Обработка закрепления сообщения:', { messageId, chatId, userId });

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
      return;
    }

    broadcastToChat(chatId || 'general', {
      type: 'message_pinned',
      messageId: messageId,
      chatId: chatId,
      pinnedBy: userId
    });
  } catch (error) {
    console.error('❌ Ошибка обработки закрепления:', error);
  }
}

async function handleUnpinMessage(data) {
  try {
    const { messageId, chatId } = data;
    console.log('📍 Обработка открепления сообщения:', { messageId, chatId });

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
      return;
    }

    broadcastToChat(chatId || 'general', {
      type: 'message_unpinned',
      messageId: messageId,
      chatId: chatId
    });
  } catch (error) {
    console.error('❌ Ошибка обработки открепления:', error);
  }
}

async function handleTyping(data) {
  try {
    const { chatId, userId, username, isTyping } = data;
    console.log('⌨️ Обработка печатания:', { userId, username, isTyping });

    broadcastToChat(chatId || 'general', {
      type: 'typing',
      userId: userId,
      username: username,
      isTyping: isTyping,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка обработки печатания:', error);
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
    message: '🚀 Anongram Server v9.0 (Full Supabase Integration)',
    version: '9.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'supabase_storage',
      'realtime_messages', 
      'reactions', 
      'editing',
      'deleting',
      'pinning',
      'file_upload',
      'voice_messages',
      'polls',
      'stickers'
    ]
  });
});

// Проверка здоровья
app.get('/api/health', async (req, res) => {
  try {
    const supabaseConnected = await checkSupabaseConnection();
    res.json({
      success: true,
      status: 'running',
      supabase: supabaseConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка проверки здоровья'
    });
  }
});

// 📤 ЗАГРУЗКА ФАЙЛОВ
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 Загрузка файла:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      type: req.body.type
    });

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не загружен'
      });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    let fileType = req.body.type || 'file';
    if (req.file.mimetype.startsWith('image/')) fileType = 'photo';
    if (req.file.mimetype.startsWith('video/')) fileType = 'video';
    if (req.file.mimetype.startsWith('audio/')) fileType = 'voice';

    const fileInfo = {
      name: req.file.originalname || `file_${Date.now()}`,
      size: req.file.size,
      type: req.file.mimetype,
      url: fileUrl,
      path: req.file.path
    };

    console.log('✅ Файл загружен:', fileInfo);

    res.json({
      success: true,
      file: fileInfo,
      type: fileType,
      url: fileUrl
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка загрузки файла' 
    });
  }
});

// 💬 СООБЩЕНИЯ
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const { limit = 100 } = req.query;
  
  try {
    const messages = await getMessages(chatId, parseInt(limit));
    
    res.json({
      success: true,
      messages: messages,
      total: messages.length,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки сообщений:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки сообщений'
    });
  }
});

app.get('/api/messages/:chatId/pinned', async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const pinnedMessages = await getPinnedMessages(chatId);
    
    res.json({
      success: true,
      messages: pinnedMessages,
      total: pinnedMessages.length
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки закрепленных сообщений:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки закрепленных сообщений'
    });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    await handleNewMessage(req.body);
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
        message: 'Сообщение удалено'
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
      error: 'Ошибка сервера'
    });
  }
});

// ✏️ РЕДАКТИРОВАНИЕ СООБЩЕНИЙ
app.put('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { newText, userId, chatId } = req.body;

  try {
    console.log('✏️ API запрос на редактирование сообщения:', messageId);

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

// 🎭 РЕАКЦИИ
app.post('/api/messages/:messageId/reactions', async (req, res) => {
  const { messageId } = req.params;
  const { userId, reaction, chatId } = req.body;

  try {
    console.log('🎭 API запрос на добавление реакции:', { messageId, userId, reaction });

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
        reactions: message?.reactions || {}
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
    console.log('🎭 API запрос на удаление реакции:', { messageId, userId, reaction });

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
        reactions: message?.reactions || {}
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

// 📍 ЗАКРЕПЛЕНИЕ СООБЩЕНИЙ
app.post('/api/messages/:messageId/pin', async (req, res) => {
  const { messageId } = req.params;
  const { chatId, userId } = req.body;

  try {
    console.log('📍 API запрос на закрепление сообщения:', { messageId, userId });

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
      return res.status(500).json({
        success: false,
        error: 'Ошибка закрепления сообщения'
      });
    }

    broadcastToChat(chatId || 'general', {
      type: 'message_pinned',
      messageId: messageId,
      chatId: chatId,
      pinnedBy: userId
    });

    res.json({
      success: true,
      message: 'Сообщение закреплено'
    });
  } catch (error) {
    console.error('❌ Ошибка закрепления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

app.post('/api/messages/:messageId/unpin', async (req, res) => {
  const { messageId } = req.params;
  const { chatId } = req.body;

  try {
    console.log('📍 API запрос на открепление сообщения:', messageId);

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
      return res.status(500).json({
        success: false,
        error: 'Ошибка открепления сообщения'
      });
    }

    broadcastToChat(chatId || 'general', {
      type: 'message_unpinned',
      messageId: messageId,
      chatId: chatId
    });

    res.json({
      success: true,
      message: 'Сообщение откреплено'
    });
  } catch (error) {
    console.error('❌ Ошибка открепления:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 👤 ПОЛЬЗОВАТЕЛИ
app.post('/api/auth/check-code', async (req, res) => {
  const { code } = req.body;

  try {
    console.log('🔍 Проверка кода доступа:', code);

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('accesscode', code)
      .single();

    if (error) {
      console.log('📝 Код свободен для регистрации');
      return res.json({
        success: true,
        userExists: false,
        message: 'Код свободен'
      });
    }

    console.log('✅ Найден пользователь:', data.username);
    
    await supabase
      .from('users')
      .update({ 
        isonline: true,
        lastseen: new Date().toISOString()
      })
      .eq('id', data.id);

    res.json({
      success: true,
      userExists: true,
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
        color: data.color
      }
    });
  } catch (error) {
    console.error('❌ Ошибка проверки кода:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, code } = req.body;

  try {
    console.log('📝 Регистрация пользователя:', username, code);

    const { data: existingUsername } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        error: 'Этот никнейм уже занят'
      });
    }

    const { data: existingCode } = await supabase
      .from('users')
      .select('id')
      .eq('accesscode', code)
      .single();

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
      username: username,
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
      bio: isAdmin ? 'Главный администратор платформы' : 'Новый участник платформы',
      color: isAdmin ? '#FF4444' : '#666666'
    };

    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select();

    if (error) {
      console.error('❌ Ошибка создания пользователя:', error);
      return res.status(500).json({
        success: false,
        error: 'Ошибка создания пользователя'
      });
    }

    console.log('✅ Пользователь создан:', username);
    res.json({
      success: true,
      user: {
        id: data[0].id,
        username: data[0].username,
        level: data[0].level,
        coins: data[0].coins,
        experience: data[0].experience,
        isAdmin: data[0].isadmin,
        avatar: data[0].avatar,
        profession: data[0].profession,
        bio: data[0].bio,
        color: data[0].color
      }
    });
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body;

  try {
    console.log('🔐 Вход по коду:', code);

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('accesscode', code)
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Пользователь с таким кодом не найден'
      });
    }

    await supabase
      .from('users')
      .update({ 
        isonline: true,
        lastseen: new Date().toISOString()
      })
      .eq('id', data.id);

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
        color: data.color
      }
    });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 👥 Список пользователей
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, level, coins, experience, isonline, lastseen, isadmin, avatar')
      .order('isonline', { ascending: false })
      .order('level', { ascending: false });

    if (error) {
      console.error('❌ Ошибка загрузки пользователей:', error);
      return res.status(500).json({
        success: false,
        error: 'Ошибка загрузки пользователей'
      });
    }

    res.json({
      success: true,
      users: data || [],
      total: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки пользователей:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 👤 Профиль пользователя
app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.json({
      success: true,
      user: data
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки профиля:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// 🚨 ЗАПУСК СЕРВЕРА
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Anongram Server v9.0 запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`📁 Загрузки: http://localhost:${PORT}/uploads/`);
  
  const supabaseConnected = await checkSupabaseConnection();
  if (supabaseConnected) {
    console.log('✅ Supabase подключен и готов к работе');
  } else {
    console.log('⚠️  Supabase не подключен, некоторые функции могут не работать');
  }
  
  console.log('✅ Функции:');
  console.log('   💬 Сохранение сообщений в Supabase');
  console.log('   📤 Загрузка файлов и медиа');
  console.log('   👤 Аутентификация пользователей');
  console.log('   🎭 Система реакций');
  console.log('   ✏️  Редактирование сообщений');
  console.log('   🗑️  Удаление сообщений');
  console.log('   📍 Закрепление сообщений');
  console.log('   ⌨️  Индикация печатания');
  console.log('   📡 WebSocket рассылка');
  console.log('🌐 Готов к работе!');
});

// Обработка ошибок сервера
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', reason);
});
