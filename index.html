require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // В целях безопасности здесь лучше указать домен вашего клиента
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// Простое хранилище уведомлений в памяти. Для продакшена можно заменить на Redis или таблицу в БД.
let notifications = [];

// Функция для отправки обновлений всем клиентам
const broadcastUpdate = () => {
  io.emit('update_orders');
  console.log('Разослано событие: update_orders');
};

// Функция для создания и отправки уведомления
const createNotification = (type, payload) => {
    const notification = {
        id: Date.now(),
        type, // 'cancelled' или 'edited'
        payload,
        timestamp: new Date().toISOString()
    };
    notifications.unshift(notification); // Добавляем в начало массива
    if (notifications.length > 50) { // Ограничиваем количество хранимых уведомлений
        notifications.pop();
    }
    io.emit('new_notification', notification);
    console.log(`Создано уведомление: ${type}`);
};


// API Маршруты

// 1. Проверка состояния
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT NOW()');
        res.status(200).json({ dbConnected: true });
    } catch (error) {
        console.error("Ошибка проверки состояния БД:", error);
        res.status(503).json({ dbConnected: false });
    }
});

// 2. Получить все заказы
app.get('/api/orders', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM orders ORDER BY order_index ASC, created_at ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка сервера');
  }
});

// 3. Создать новый заказ
app.post('/api/orders', async (req, res) => {
    const { song_title, artist_name, table_id, isVip, note } = req.body;
    if (!song_title || !table_id) {
        return res.status(400).send('Название песни и номер стола обязательны');
    }
    try {
        const type = isVip ? 'vip' : 'regular';
        // VIP заказы получают высокий order_index, чтобы быть вверху
        const order_index = isVip ? 999999 : 1000; 

        const { rows } = await db.query(
            'INSERT INTO orders (song_title, artist_name, table_id, type, status, note, order_index) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [song_title, artist_name, table_id, type, 'new', note, order_index]
        );
        broadcastUpdate();
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 4. Обновить статус заказа
app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'in_progress' или 'completed'
    try {
        const { rows } = await db.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        broadcastUpdate();
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 5. Редактировать заказ (гостем или диджеем)
app.patch('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const { song_title, artist_name, note } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE orders SET song_title = $1, artist_name = $2, note = $3 WHERE id = $4 RETURNING *',
            [song_title, artist_name, note, id]
        );
        // Если заказ был изменен, создаем уведомление
        createNotification('edited', rows[0]);
        broadcastUpdate();
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 6. Добавить/изменить заметку диджея
app.patch('/api/orders/:id/dj-note', async (req, res) => {
    const { id } = req.params;
    const { dj_note } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE orders SET dj_note = $1 WHERE id = $2 RETURNING *',
            [dj_note, id]
        );
        broadcastUpdate();
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});


// 7. Удалить заказ
app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const byGuest = req.query.byGuest === 'true';
    try {
        // Сначала получаем данные заказа для уведомления
        const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (orderResult.rows.length === 0) {
            return res.status(404).send('Заказ не найден');
        }
        
        if (byGuest) {
             createNotification('cancelled', orderResult.rows[0]);
        }
        
        await db.query('DELETE FROM orders WHERE id = $1', [id]);
        broadcastUpdate();
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 8. Обновить порядок очереди
app.post('/api/orders/reorder', async (req, res) => {
    const { orderedIds } = req.body;
    try {
        const promises = orderedIds.map((id, index) => {
            // Устанавливаем order_index в соответствии с новым порядком
            return db.query('UPDATE orders SET order_index = $1 WHERE id = $2', [index, id]);
        });
        await Promise.all(promises);
        broadcastUpdate();
        res.status(200).send('Порядок обновлен');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 9. Очистить все заказы для стола
app.delete('/api/orders/table/:tableId', async (req, res) => {
    const { tableId } = req.params;
    try {
        await db.query('DELETE FROM orders WHERE table_id = $1', [tableId]);
        broadcastUpdate();
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 10. Очистить все (начать новый вечер)
app.delete('/api/orders/all', async (req, res) => {
    try {
        // Перемещаем исполненные заказы в общую историю перед удалением
        await db.query(`
            INSERT INTO general_history (song_title, artist_name, table_id, created_at)
            SELECT song_title, artist_name, table_id, created_at FROM orders WHERE status = 'completed'
        `);
        // Удаляем все заказы
        await db.query('DELETE FROM orders');
        notifications = []; // Очищаем уведомления
        broadcastUpdate();
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 11. Получить общую историю
app.get('/api/history', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM general_history ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка сервера');
  }
});

// 12. Уведомления
app.get('/api/notifications', (req, res) => {
    res.json(notifications);
});
app.delete('/api/notifications', (req, res) => {
    notifications = [];
    io.emit('new_notification'); // Сообщаем клиентам, что уведомления очищены
    res.status(204).send();
});


// Socket.IO
io.on('connection', (socket) => {
  console.log('Клиент подключился:', socket.id);
  socket.on('disconnect', () => {
    console.log('Клиент отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
