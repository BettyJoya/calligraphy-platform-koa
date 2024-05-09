import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
// import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { RowDataPacket } from 'mysql2';
import generateUUID from '../../utils/uuidMiddleWare';
import NodeRSA from 'node-rsa';
// import Bcrypt from 'bcryptjs';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import fs from 'fs';
import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/collects'
});

// interface Collect {
//   id: string;
//   letter_ids: string;
//   user_email: string;
// }
router.get('/list', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };

    // 获取收集列表
    const collectsQuery = 'SELECT id, title, letter_ids FROM collects WHERE user_email=?';
    const [collectsResult] = (await Connect.query(collectsQuery, [email])) as RowDataPacket[];

    // 处理每个收集
    const collects = await Promise.all(
      collectsResult.map(async (row: { id: string; title: string; letter_ids: string }) => {
        const letter_ids = JSON.parse(row.letter_ids);
        const letters: { id: string; title: string; pic: string }[] = [];

        // 获取每个letter的信息
        await Promise.all(
          letter_ids.map(async (letter: string) => {
            const letterQuery = 'SELECT title, copybook_id FROM letters WHERE id=?';
            const [letterResult] = (await Connect.query(letterQuery, [letter])) as RowDataPacket[];

            if (letterResult.length > 0) {
              const copybookQuery = 'SELECT path FROM copybooks WHERE id=?';
              const [copybookResult] = (await Connect.query(copybookQuery, [
                letterResult[0].copybook_id
              ])) as RowDataPacket[];

              if (copybookResult.length > 0) {
                const picPath = path.resolve(
                  __dirname,
                  `../public/${copybookResult[0].path}`,
                  `${letterResult[0].title}.png`
                );
                const picBase64 = fs.readFileSync(picPath).toString('base64');
                letters.push({ id: letter, title: letterResult[0].title, pic: picBase64 });
              }
            }
          })
        );
        return { id: row.id, title: row.title, letters };
      })
    );

    return (ctx.body = formatResponse(200, 'success', { collects }));
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.get('/detail/:id', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { id } = ctx.params;

    const collectQuery = 'SELECT title, letter_ids FROM collects WHERE id=? AND user_email=?';
    const [collectResult] = (await Connect.query(collectQuery, [id, email])) as RowDataPacket[];

    if (collectResult.length === 0) {
      return (ctx.body = formatResponse(500, 'fail', 'collect not found'));
    }

    const letter_ids = JSON.parse(collectResult[0].letter_ids);
    const letters: { id: string; title: string; pic: string }[] = [];

    await Promise.all(
      letter_ids.map(async (letter: string) => {
        const letterQuery = 'SELECT title, copybook_id FROM letters WHERE id=?';
        const [letterResult] = (await Connect.query(letterQuery, [letter])) as RowDataPacket[];

        if (letterResult.length > 0) {
          const copybookQuery = 'SELECT path FROM copybooks WHERE id=?';
          const [copybookResult] = (await Connect.query(copybookQuery, [
            letterResult[0].copybook_id
          ])) as RowDataPacket[];

          if (copybookResult.length > 0) {
            const picPath = path.resolve(
              __dirname,
              `../public/${copybookResult[0].path}`,
              `${letterResult[0].title}.png`
            );
            const picBase64 = fs.readFileSync(picPath).toString('base64');
            letters.push({ id: letter, title: letterResult[0].title, pic: picBase64 });
          }
        }
      })
    );

    return (ctx.body = formatResponse(200, 'success', { id, title: collectResult[0].title, letters }));
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.post('/add', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    let { title, letterids } = JSON.parse(ctx.request.body);
    title = decodeURIComponent(title);
    letterids = JSON.stringify(letterids);
    console.log(title, letterids);

    // 生成uuid
    const id = generateUUID();
    const [result] = (await Connect.query('INSERT INTO collects (id, title, letter_ids, user_email) VALUES (?,?,?,?)', [
      id,
      title,
      letterids,
      email
    ])) as RowDataPacket[];
    if (result.affectedRows === 1) {
      return (ctx.body = formatResponse(200, 'success', { collect_id: id }));
    } else {
      return (ctx.body = formatResponse(500, 'fail', 'fail'));
    }
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

export default router;
