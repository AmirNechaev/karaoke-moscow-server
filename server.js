const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ MONGODB ---
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('Успешное подключение к MongoDB Atlas'))
  .catch(err => console.error('Ошибка подключения к MongoDB:', err));

// --- МОДЕЛЬ ДАННЫХ ДЛЯ ИСТОРИИ ---
const historySchema = new mongoose.Schema({
    id: Number,
    song_title: String,
    artist_name: String,
    table_id: String,
    status: String,
    type: String,
    note: String,
    dj_note: String,
    created_at: Date
});

const History = mongoose.model('History', historySchema);

// --- ХРАНИЛИЩЕ ДАННЫХ В ПАМЯТИ (для текущей сессии) ---
let orders = [];
let notifications = [];

// --- API ЭНДПОИНТЫ ---

// НОВЫЙ ЭНДПОИНТ для проверки статуса
app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    // 0 = disconnected; 1 = connected; 2 = connecting; 3 = disconnecting
    const isDbConnected = dbState === 1;
    res.json({
        status: 'ok',
        dbConnected: isDbConnected,
        dbState: dbState
    });
});


app.get('/api/orders', (req, res) => {
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
    const { song_title, artist_name, table_id, isVip, note } = req.body;
    if (!song_title || !table_id) {
        return res.status(400).json({ message: 'Необходимо указать название песни и номер стола.' });
    }
    const newOrder = {
        id: Date.now(), song_title, artist_name: artist_name || 'Не указан', table_id,
        status: 'new', type: isVip ? 'vip' : 'regular', note: note || '',
        dj_note: '', created_at: new Date().toISOString()
    };
    const activeOrders = orders.filter(o => o.status !== 'completed');
    const completedOrders = orders.filter(o => o.status === 'completed');
    if (newOrder.type === 'vip') {
        const lastInProgressIndex = activeOrders.findLastIndex(o => o.status === 'in_progress');
        activeOrders.splice(lastInProgressIndex + 1, 0, newOrder);
    } else { activeOrders.push(newOrder); }
    orders = [...activeOrders, ...completedOrders];
    io.emit('update_orders');
    res.status(201).json(newOrder);
});

app.patch('/api/orders/:id', (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) { return res.status(404).json({ message: 'Заказ не найден.' }); }
    
    const { song_title, artist_name, note } = req.body;
    orders[orderIndex] = { ...orders[orderIndex], song_title, artist_name, note };
    
    const notification = { id: Date.now(), type: 'edited', payload: orders[orderIndex], timestamp: new Date().toISOString() };
    notifications.unshift(notification);
    
    io.emit('update_orders');
    io.emit('new_notification', notification);
    res.json(orders[orderIndex]);
});

app.patch('/api/orders/:id/dj-note', (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) { return res.status(404).json({ message: 'Заказ не найден.' }); }
    orders[orderIndex].dj_note = req.body.dj_note || '';
    io.emit('update_orders');
    res.json(orders[orderIndex]);
});

app.patch('/api/orders/:id/status', async (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) { return res.status(404).json({ message: 'Заказ не найден.' }); }

    if (req.body.status === 'completed' && orders[orderIndex].status !== 'completed') {
        const completedOrder = { ...orders[orderIndex], status: 'completed' };
        try {
            const historyEntry = new History(completedOrder);
            await historyEntry.save();
            console.log('Заказ сохранен в общую историю');
        } catch (err) {
            console.error('Ошибка сохранения в общую историю:', err);
        }
    }
    
    orders[orderIndex].status = req.body.status;
    io.emit('update_orders');
    res.json(orders[orderIndex]);
});

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

app.delete('/api/orders/table/:tableId', (req, res) => {
    const tableIdToClear = req.params.tableId;
    const initialOrderCount = orders.length;
    orders = orders.filter(order => order.table_id != tableIdToClear);
    if (orders.length < initialOrderCount) { io.emit('update_orders'); }
    res.status(204).send();
});

app.delete('/api/orders/all', (req, res) => {
    orders = [];
    notifications = [];
    io.emit('update_orders');
    io.emit('update_notifications');
    res.status(204).send();
});

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

app.get('/api/notifications', (req, res) => { res.json(notifications); });
app.delete('/api/notifications', (req, res) => { notifications = []; io.emit('update_notifications'); res.status(204).send(); });

app.get('/api/history', async (req, res) => {
    try {
        const history = await History.find().sort({ created_at: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Не удалось загрузить общую историю' });
    }
});

io.on('connection', (socket) => {
  console.log('Клиент подключен:', socket.id);
  socket.on('disconnect', () => { console.log('Клиент отключен:', socket.id); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер КАРАОКЕ МОСКВА запущен и слушает порт ${PORT}`);
});

