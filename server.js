const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// --- НАСТРОЙКА CORS ДЛЯ РАБОТЫ В ИНТЕРНЕТЕ ---
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// --- ХРАНИЛИЩЕ ДАННЫХ В ПАМЯТИ ---
let orders = [];
let notifications = [];

// --- API ЭНДПОИНТЫ ---

// Получить все заказы
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// Создать новый заказ
app.post('/api/orders', (req, res) => {
    const { song_title, artist_name, table_id, isVip, note } = req.body;
    if (!song_title || !table_id) {
        return res.status(400).json({ message: 'Необходимо указать название песни и номер стола.' });
    }
    const newOrder = {
        id: Date.now(),
        song_title,
        artist_name: artist_name || 'Не указан',
        table_id,
        status: 'new',
        type: isVip ? 'vip' : 'regular',
        note: note || '',
        created_at: new Date().toISOString()
    };
    
    const activeOrders = orders.filter(o => o.status !== 'completed');
    const completedOrders = orders.filter(o => o.status === 'completed');

    if (newOrder.type === 'vip') {
        const lastInProgressIndex = activeOrders.findLastIndex(o => o.status === 'in_progress');
        activeOrders.splice(lastInProgressIndex + 1, 0, newOrder);
    } else {
        activeOrders.push(newOrder);
    }
    
    orders = [...activeOrders, ...completedOrders];

    io.emit('update_orders');
    res.status(201).json(newOrder);
});

// Изменить заказ (гостем)
app.patch('/api/orders/:id', (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        return res.status(404).json({ message: 'Заказ не найден.' });
    }
    const { song_title, artist_name, note } = req.body;
    orders[orderIndex] = { ...orders[orderIndex], song_title, artist_name, note };
    
    const notification = { id: Date.now(), type: 'edited', payload: orders[orderIndex], timestamp: new Date().toISOString() };
    notifications.unshift(notification);
    
    io.emit('update_orders');
    io.emit('new_notification', notification);
    res.json(orders[orderIndex]);
});

// Изменить статус заказа (диджеем)
app.patch('/api/orders/:id/status', (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        return res.status(404).json({ message: 'Заказ не найден.' });
    }
    orders[orderIndex].status = req.body.status;
    io.emit('update_orders');
    res.json(orders[orderIndex]);
});

// Удалить заказ
app.delete('/api/orders/:id', (req, res) => {
    const orderId = parseInt(req.params.id);
    const byGuest = req.query.byGuest === 'true';
    const orderToDelete = orders.find(o => o.id === orderId);
    
    if (orderToDelete && byGuest) {
        const notification = { id: Date.now(), type: 'cancelled', payload: orderToDelete, timestamp: new Date().toISOString() };
        notifications.unshift(notification);
        io.emit('new_notification', notification);
    }
    
    orders = orders.filter(o => o.id !== orderId);
    
    io.emit('update_orders');
    res.status(204).send();
});

// НОВЫЙ ЭНДПОИНТ: Очистить все заказы для стола
app.delete('/api/orders/table/:tableId', (req, res) => {
    const tableIdToClear = req.params.tableId;
    
    const initialOrderCount = orders.length;
    orders = orders.filter(order => String(order.table_id) !== tableIdToClear);
    
    if (orders.length < initialOrderCount) {
      io.emit('update_orders'); 
    }
    
    res.status(204).send();
});


// Пересортировать заказы
app.post('/api/orders/reorder', (req, res) => {
    const { orderedIds } = req.body;
    const activeOrders = orders.filter(o => o.status !== 'completed');
    const reordered = orderedIds.map(id => activeOrders.find(o => o.id === parseInt(id))).filter(Boolean);
    const completed = orders.filter(o => o.status === 'completed');
    
    if (reordered.length === activeOrders.length) {
        orders = [...reordered, ...completed];
        io.emit('update_orders');
        res.json({ message: 'Очередь обновлена.' });
    } else {
        res.status(400).json({ message: 'Ошибка при пересортировке.' });
    }
});

// Уведомления
app.get('/api/notifications', (req, res) => {
    res.json(notifications);
});

app.delete('/api/notifications', (req, res) => {
    notifications = [];
    io.emit('update_notifications', notifications);
    res.status(204).send();
});


// --- НАСТРОЙКА СЕРВЕРА И SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Клиент подключен:', socket.id);
  socket.on('disconnect', () => {
    console.log('Клиент отключен:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Сервер КАРАОКЕ МОСКВА запущен и слушает порт ${PORT}`);
});

