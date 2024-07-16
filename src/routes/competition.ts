import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
import generateUUID from '../../utils/uuidMiddleWare';
import NodeRSA from 'node-rsa';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import moment from 'moment';
import { RowDataPacket } from 'mysql2';
import fs from 'fs';
import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/competitions'
});

router.post('/add', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { title, content, letterId, similarity } = JSON.parse(ctx.request.body) as {
      title: string;
      content: string;
      letterId: string;
      similarity: string;
    };
    const id = generateUUID();
    const start_time = moment().format('YYYY-MM-DD HH:mm:ss');
    const end_time = moment().add(7, 'days').format('YYYY-MM-DD HH:mm:ss');
    const query = `INSERT INTO competition (id, title, content, start_time, end_time, letter_id, user_email, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await Connect.query(query, [id, title, content, start_time, end_time, letterId, email, '1']);

    const rankQuery = 'INSERT INTO `rank` (id, competition_id, user_email, similarity, ranking) VALUES (?, ?, ?, ?, ?)';
    await Connect.query(rankQuery, [generateUUID(), id, email, similarity, 1, 0]);

    ctx.body = formatResponse(200, 'success', '发起竞赛成功');
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.get('/list', async ctx => {
  try {
    const query = `SELECT * FROM competition`;
    const [result] = await Connect.query(query);
    const competitions = Array.isArray(result)
      ? await Promise.all(
          result.map(async competition => {
            const { id, title, content, start_time, end_time, letter_id, user_email, status } = competition as {
              id: string;
              title: string;
              content: string;
              start_time: string;
              end_time: string;
              letter_id: string;
              user_email: string;
              status: string;
            };
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id=?', [letter_id])) as RowDataPacket[];
            if (letter) {
              const [copybook] = (await Connect.query('SELECT * FROM copybooks WHERE id=?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              const [user] = (await Connect.query('SELECT * FROM users WHERE email=?', [
                user_email
              ])) as RowDataPacket[];
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                id,
                title,
                content,
                start_time,
                end_time,
                letter_id,
                user_email,
                status,
                letter: {
                  id: letter[0].id,
                  title: letter[0].title,
                  content: letter[0].content,
                  letter_pic
                },
                user: {
                  email: user_email,
                  name: user_name,
                  avatar: user_avatar
                }
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { competitions });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

export default router;
