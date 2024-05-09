import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import NodeRSA from 'node-rsa';
import Bcrypt from 'bcryptjs';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import fs from 'fs';
import path from 'path';

interface User {
  email: string;
  name: string;
  avatar: string;
  description: string;
  fans_count: number;
  attention_count: number;
  work_count: number;
  // Add other properties if necessary
}

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/users'
});

router.get('/get-publick-key', async ctx => {
  const publicKey = RSA.exportKey(); // 生成公钥
  ctx.body = formatResponse(200, 'success', { publicKey });
});

router.get('/list', async ctx => {
  try {
    const [result] = await Connect.query('SELECT email FROM users');
    const usersRes: User[] = Array.isArray(result) ? result.map(row => row as User) : [];
    const users = usersRes.map(user => user.email);
    ctx.body = formatResponse(200, 'success', { users });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.post('/has', async ctx => {
  try {
    const { email } = ctx.request.body as { email: string };
    const [result] = await Connect.query('SELECT user_name FROM users WHERE email = ?', [email]);
    const hasUser = Array.isArray(result) && result.length > 0;
    ctx.body = formatResponse(200, 'success', { hasUser });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.post('/login', async ctx => {
  try {
    const { email, password } = ctx.request.body as { email: string; password: string };

    // 查询数据库里的密码
    const [daPassword] = (await Connect.query('SELECT password FROM users WHERE email = ?', [
      email
    ])) as RowDataPacket[];
    // 解密前端密码
    const realPassword = RSA.decrypt(password, 'utf8');
    // 验证密码
    const passwordCorrect = Bcrypt.compareSync(realPassword, daPassword[0].password);

    if (passwordCorrect) {
      // 生成 JWT
      const token = JWT.sign({ email: email }, SECRET, { expiresIn: '168h' });
      // 生成当前时间戳
      const time = new Date().getTime();
      ctx.body = formatResponse(200, 'success', { token, time });
    } else {
      ctx.body = formatResponse(503, 'fail', 'Incorrect password');
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Cannot')) {
        ctx.body = formatResponse(505, 'fail', 'User does not exist');
      } else {
        ctx.body = formatResponse(500, 'fail', error.message);
      }
    }
  }
});

router.post('/register', async ctx => {
  try {
    const { email, password, name, vertificationWord } = ctx.request.body as {
      email: string;
      password: string;
      vertificationWord: string;
      name: string;
    };

    // 生成随机盐
    const salt = Bcrypt.genSaltSync(10);
    // 解密再进行加密
    const hashedPassword = Bcrypt.hashSync(RSA.decrypt(password, 'utf8'), salt);
    const hashedVertificationWord = RSA.decrypt(vertificationWord, 'utf8');

    // 存储密文
    const [result] = (await Connect.query(
      'INSERT INTO users (email, password, name, vertification_word) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, hashedVertificationWord]
    )) as ResultSetHeader[];

    if (result.affectedRows === 1) {
      ctx.body = formatResponse(200, 'success', 'Register successfully');
    } else {
      ctx.body = formatResponse(500, 'fail', 'Register failed');
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Duplicate entry')) {
        ctx.body = formatResponse(500, 'fail', 'User already exists');
      } else {
        ctx.body = formatResponse(500, 'fail', error.message);
      }
    }
  }
});

router.get('/self-info', async ctx => {
  try {
    // 从响应头获取 token
    const token = ctx.request.headers.authorization as string;
    // 解析 token Bearer token
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const decoded_res = decoded as { email: string };
    const email_address = decoded_res.email;
    const [result] = (await Connect.query('SELECT * FROM users WHERE email = ?', [email_address])) as RowDataPacket[];
    const user = result[0] as User;
    const { email, name, avatar, description } = user;
    const [fans_countResult] = (await Connect.query('SELECT COUNT(*) FROM attentions WHERE attention_user_email = ?', [
      email
    ])) as RowDataPacket[];
    const fans_count = fans_countResult[0]['COUNT(*)'];
    const [attention_countResult] = (await Connect.query('SELECT COUNT(*) FROM attentions WHERE user_email = ?', [
      email
    ])) as RowDataPacket[];
    const attention_count = attention_countResult[0]['COUNT(*)'];
    const [work_countResult] = (await Connect.query('SELECT COUNT(*) FROM articles WHERE user_email = ?', [
      email
    ])) as RowDataPacket[];
    const work_count = work_countResult[0]['COUNT(*)'];
    const avatarImage = avatar
      ? fs.readFileSync(path.join(__dirname, '../public/images/avatar', avatar), {}).toString('base64')
      : null;
    console.log(fans_countResult[0], attention_countResult[0], work_countResult[0]);

    ctx.body = formatResponse(200, 'success', {
      email,
      name,
      avatar: avatarImage,
      description,
      fans_count,
      attention_count,
      work_count
    });
  } catch (err) {
    if (err instanceof Error) {
      console.log(err);
    }
  }
});

router.post('/change-avatar', async ctx => {
  try {
    // 获取前端传来的图片
    if (!Array.isArray(ctx.request.files!.avatar)) {
      const token = ctx.request.headers.authorization as string;
      const decoded = JWT.verify(token.split(' ')[1], SECRET);
      const { email } = decoded as { email: string };
      const avatar = ctx.request.files!.avatar.newFilename;

      // 查询数据库原本的文件名
      const [result] = (await Connect.query('SELECT avatar FROM users WHERE email = ?', [email])) as RowDataPacket[];
      // 删除原本的文件
      if (result.length > 0) {
        const oldavatar = result[0].avatar;
        if (oldavatar) {
          // 删除原本的文件
          fs.unlinkSync(`src/public/images/avatar/${oldavatar}`);
        }
      }

      // 更新数据库
      const [res] = (await Connect.query('UPDATE users SET avatar = ? WHERE email = ?', [
        avatar,
        email
      ])) as ResultSetHeader[];
      if (res.affectedRows === 1) {
        ctx.body = formatResponse(200, 'success', 'Change avatar successfully');
      } else {
        ctx.body = formatResponse(500, 'fail', 'Change avatar failed');
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (!Array.isArray(ctx.request.files!.avatar)) {
        const avatar = ctx.request.files!.avatar.newFilename;
        fs.unlinkSync(`src/public/images/avatar/${avatar}`);
      }
      ctx.body = formatResponse(500, 'fail', error.message);
      console.log(error);
    }
  }
});

router.post('/change-info', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };

    const { name, description } = ctx.request.body as { name: string; description: string };

    const [result] = (await Connect.query('UPDATE users SET name = ?, description = ? WHERE email = ?', [
      name,
      description,
      email
    ])) as ResultSetHeader[];
    if (result.affectedRows === 1) {
      ctx.body = formatResponse(200, 'success', 'Update successfully');
    } else {
      ctx.body = formatResponse(500, 'fail', 'Update failed');
    }
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// 获取用户收藏的文集
router.get('/self-collection', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };

    const [result] = (await Connect.query(
      'SELECT copybook_id FROM userCollected WHERE user_email = ? AND isCollected = 1',
      [email]
    )) as RowDataPacket[];

    const copybookIds = Array.isArray(result) ? result.map(row => row.copybook_id) : [];
    // 获取文集的信息
    const copybooks = [];
    for (const copybookId of copybookIds) {
      const [res] = (await Connect.query('SELECT * FROM copybooks WHERE id = ?', [copybookId])) as RowDataPacket[];
      const firstPic = fs.readdirSync(path.join(__dirname, '../public', res[0].path.toString()))[0];
      const mainPic = fs
        .readFileSync(path.join(__dirname, '../public', res[0].path.toString(), firstPic), {})
        .toString('base64');
      copybooks.push({
        id: res[0].id,
        name: res[0].name,
        author: res[0].author,
        mainPic
      });
    }
    ctx.body = formatResponse(200, 'success', { copybooks });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// 获取用户浏览记录
router.get('/self-history', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };

    const [result] = (await Connect.query('SELECT copybook_id FROM userBrowsingHistory WHERE user_email = ?', [
      email
    ])) as RowDataPacket[];

    const copybookIds = Array.isArray(result) ? result.map(row => row.copybook_id) : [];
    // 获取文集的信息
    const copybooks = [];
    for (const copybookId of copybookIds) {
      const [res] = (await Connect.query('SELECT * FROM copybooks WHERE id = ?', [copybookId])) as RowDataPacket[];
      const firstPic = fs.readdirSync(path.join(__dirname, '../public', res[0].path.toString()))[0];
      const mainPic = fs
        .readFileSync(path.join(__dirname, '../public', res[0].path.toString(), firstPic), {})
        .toString('base64');
      copybooks.push({
        id: res[0].id,
        name: res[0].name,
        author: res[0].author,
        mainPic
      });
    }
    ctx.body = formatResponse(200, 'success', { copybooks });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

export default router;
