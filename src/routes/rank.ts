import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
import generateUUID from '../../utils/uuidMiddleWare';
import NodeRSA from 'node-rsa';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import { RowDataPacket } from 'mysql2';
import fs from 'fs';
import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/rank'
});

router.post('/add', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { competition_id, similarity } = JSON.parse(ctx.request.body) as {
      competition_id: string;
      similarity: string;
    };

    // 检查用户是否已经参赛，如果是，则更新相似度
    const existingRankQuery = 'SELECT * FROM `rank` WHERE competition_id=? AND user_email=?';
    const [existingResult] = await Connect.query(existingRankQuery, [competition_id, email]);
    if (Array.isArray(existingResult) && existingResult.length > 0) {
      // 如果用户已经参赛，更新相似度并退出
      const updateSimilarityQuery = 'UPDATE `rank` SET similarity=? WHERE competition_id=? AND user_email=?';
      await Connect.query(updateSimilarityQuery, [similarity, competition_id, email]);
    } else {
      // 用户未参赛，插入新的竞赛参与者数据
      const rankQuery =
        'INSERT INTO `rank` (id, competition_id, user_email, similarity, ranking) VALUES (?, ?, ?, ?, ?)';
      await Connect.query(rankQuery, [generateUUID(), competition_id, email, similarity, 0]);
    }

    // 更新排名
    const updateRankingQuery = `
      UPDATE \`rank\` AS r
      JOIN (
        SELECT id, @rownum := @rownum + 1 AS ranking
        FROM \`rank\`
        CROSS JOIN (SELECT @rownum := 0) AS dummy
        WHERE competition_id = ?
        ORDER BY similarity DESC
      ) AS temp ON r.id = temp.id
      SET r.ranking = temp.ranking;
    `;
    await Connect.query(updateRankingQuery, [competition_id, competition_id, email]);

    ctx.body = formatResponse(200, 'success', '参赛成功');
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.post('/list', async ctx => {
  try {
    const { competition_id } = JSON.parse(ctx.request.body) as { competition_id: string };
    const query = 'SELECT * FROM `rank` WHERE competition_id=? ORDER BY similarity DESC';
    const [result] = await Connect.query(query, [competition_id]);
    const rankList = Array.isArray(result)
      ? await Promise.all(
          result.map(async item => {
            const { user_email, similarity, ranking } = item as {
              user_email: string;
              similarity: number;
              ranking: number;
            };
            const [userInfo] = (await Connect.query('SELECT * FROM `users` WHERE email=?', [
              user_email
            ])) as RowDataPacket[];
            const user_avatar = fs
              .readFileSync(path.resolve(__dirname, `../public/images/avatar/${userInfo[0].avatar}`), {})
              .toString('base64');
            return {
              user_email: userInfo[0].email,
              user_name: userInfo[0].name,
              user_avatar,
              similarity,
              ranking
            };
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { rankList });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

export default router;
