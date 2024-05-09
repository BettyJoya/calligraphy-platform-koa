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
  prefix: '/api/comments'
});

router.post('/list', async ctx => {
  try {
    const { article_id } = JSON.parse(ctx.request.body) as { article_id: string };
    console.log(article_id, ctx.request.body);

    const listQuery = 'SELECT * FROM comments WHERE article_id=?';
    const [listResult] = await Connect.query(listQuery, [article_id]);

    const comments = Array.isArray(listResult)
      ? await Promise.all(
          listResult.map(async comment => {
            const { id, user_email, content, create_time } = comment as {
              id: string;
              article_id: string;
              user_email: string;
              content: string;
              create_time: string;
            };

            const [user] = (await Connect.query('SELECT * FROM users WHERE email=?', [user_email])) as RowDataPacket[];
            const { name, avatar } = user[0] as { name: string; avatar: string };
            const user_avatar = fs
              .readFileSync(path.join(__dirname, '../public/images/avatar', avatar), {})
              .toString('base64');
            return {
              id,
              user_email,
              user_name: name,
              user_avatar,
              content,
              create_time
            };
          })
        )
      : [];
    comments.sort((a, b) => {
      return new Date(b.create_time).getTime() - new Date(a.create_time).getTime();
    });
    ctx.body = formatResponse(200, 'success', { comments });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.post('/add', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { article_id, content } = JSON.parse(ctx.request.body) as { article_id: string; content: string };
    const id = generateUUID();
    const create_time = moment().format('YYYY-MM-DD HH:mm:ss');
    const addQuery = 'INSERT INTO comments (id, article_id, user_email, content, create_time) VALUES (?, ?, ?, ?, ?)';
    await Connect.query(addQuery, [id, article_id, email, content, create_time]);
    ctx.body = formatResponse(200, 'success', '评论成功');
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

export default router;
