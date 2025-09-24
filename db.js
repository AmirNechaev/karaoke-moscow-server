const { Pool } = require('pg');
require('dotenv').config();

// Определяем, запущено ли приложение в продакшн-среде (на Render)
const isProduction = process.env.NODE_ENV === 'production';

// Создаем объект конфигурации подключения
const connectionConfig = {
  connectionString: process.env.DATABASE_URL,
  // Для продакшн-среды включаем SSL.
  // rejectUnauthorized: false необходимо, так как Render может использовать
  // самоподписанные сертификаты, которые без этой опции будут отклонены.
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(connectionConfig);

// Добавим проверку соединения при старте сервера для удобства отладки
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Ошибка подключения к базе данных:', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Освобождаем клиент обратно в пул
    if (err) {
      return console.error('Ошибка при выполнении тестового запроса к БД:', err.stack);
    }
    console.log('Успешное подключение к базе данных. Текущее время на сервере БД:', result.rows[0].now);
  });
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // Экспортируем сам 'pool' на случай, если он понадобится для транзакций
};
