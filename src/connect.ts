import mysql from 'mysql2/promise';

export default mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '123456',
  database: 'thsis-db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  port: 3306
});
