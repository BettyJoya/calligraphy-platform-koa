import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
// import { ResultSetHeader, RowDataPacket } from 'mysql2';
// import { RowDataPacket } from 'mysql2';
import generateUUID from '../../utils/uuidMiddleWare';
import NodeRSA from 'node-rsa';
// import Bcrypt from 'bcryptjs';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import { RowDataPacket } from 'mysql2';
// import fs from 'fs';
// import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/attentions'
});

router.post('/add', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { user_email } = JSON.parse(ctx.request.body) as { user_email: string };

    // 检查是否已经关注
    const checkQuery = 'SELECT id FROM attentions WHERE user_email=? AND attention_user_email=?';
    const [checkResult] = (await Connect.query(checkQuery, [email, user_email])) as RowDataPacket[];

    // 如果已经关注，则删除关注
    if (checkResult.length > 0) {
      const deleteQuery = 'DELETE FROM attentions WHERE user_email=? AND attention_user_email=?';
      await Connect.query(deleteQuery, [email, user_email]);
      ctx.body = formatResponse(200, 'success', '取消关注成功');
      return;
    }

    // 添加关注
    const addQuery = 'INSERT INTO attentions (id, user_email, attention_user_email) VALUES (?, ?, ?)';
    const id = generateUUID();
    await Connect.query(addQuery, [id, email, user_email]);
    ctx.body = formatResponse(200, 'success', '关注成功');
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

export default router;
