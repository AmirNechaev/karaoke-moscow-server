const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const fs = require('fs'); // Добавляем модуль для работы с файлами

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

// --- ХРАНИЛИЩЕ ДАННЫХ ---
const HISTORY_FILE_PATH = './history.json';
let orders = [];
let notifications = [];
let songHistory = [];

// --- ФУНКЦИИ ДЛЯ РАБОТЫ С ИСТОРИЕЙ В ФАЙЛЕ ---
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
            songHistory = JSON.parse(data);
            console.log('Общая история песен успешно загружена из файла.');
        } else {
            console.log('Файл общей истории не найден, будет создан новый.');
        }
    } catch (err) {
        console.error('Ошибка при загрузке общей истории песен:', err);
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(songHistory, null, 2), 'utf8');
    } catch (err) {
        console.error('Ошибка при сохранении общей истории песен:', err);
    }
}

// Загружаем историю при старте сервера
loadHistory();

// --- API ЭНДПОИНТЫ ---

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

app.patch('/api/orders/:id/status', (req, res) => {
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) { return res.status(404).json({ message: 'Заказ не найден.' }); }

    // Если песня завершена, добавляем ее в общую историю
    if (req.body.status === 'completed') {
        const completedOrder = { ...orders[orderIndex], status: 'completed' };
        songHistory.unshift(completedOrder); // Добавляем в начало
        saveHistory(); // Сохраняем в файл
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
    
    // ИСПРАВЛЕНО: Используем нестрогое сравнение (!=), чтобы корректно
    // обрабатывать случаи, когда table_id может быть числом или строкой.
    orders = orders.filter(order => order.table_id != tableIdToClear);
    
    if (orders.length < initialOrderCount) { 
        io.emit('update_orders'); 
    }
    res.status(204).send();
});

app.delete('/api/orders/all', (req, res) => {
    console.log('Получен запрос на полную очистку системы.');
    orders = [];
    notifications = [];
    io.emit('update_orders');
    io.emit('update_notifications');
    res.status(204).send();
});

app.delete('/api/history/all', (req, res) => {
    console.log('Получен запрос на очистку общей истории.');
    songHistory = [];
    saveHistory();
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

app.get('/api/history', (req, res) => {
    res.json(songHistory);
});

io.on('connection', (socket) => {
  console.log('Клиент подключен:', socket.id);
  socket.on('disconnect', () => { console.log('Клиент отключен:', socket.id); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер КАРАОКЕ МОСКВА запущен и слушает порт ${PORT}`);
});

