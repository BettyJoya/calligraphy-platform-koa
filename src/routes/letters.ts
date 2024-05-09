import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
// import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { RowDataPacket } from 'mysql2';
import NodeRSA from 'node-rsa';
// import Bcrypt from 'bcryptjs';
// import JWT from 'jsonwebtoken';
// import { SECRET } from '../global';
import fs from 'fs';
import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/letters'
});

interface Letter {
  id: string;
  title: string;
  copybook_id?: string;
  font_id?: string;
}

// 获取所有字
router.get('/list', async ctx => {
  try {
    // 获取查询参数中的页码和每页条数，默认为第一页，每页 50 条
    const page = parseInt(ctx.params.page) || 1;
    const pageSize = parseInt(ctx.params.pageSize) || 50;

    // 计算 OFFSET 值
    const offset = (page - 1) * pageSize;

    // 执行查询，根据分页参数限制结果
    const [result] = await Connect.query('SELECT id,title,copybook_id,font_id FROM letters LIMIT ? OFFSET ?', [
      pageSize,
      offset
    ]);

    const letters = Array.isArray(result)
      ? await Promise.all(
          result.map(async row => {
            const { id, title, copybook_id, font_id } = row as Letter;
            let pic;
            let source;
            if (!copybook_id) {
              const [font_path] = (await Connect.query(
                'SELECT name, path FROM fonts WHERE id = ?',
                font_id
              )) as RowDataPacket[];
              pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${font_path[0].path}`, `${title}.jpg`), {})
                .toString('base64');
              source = font_path[0].name;
            }
            if (!font_id) {
              const [pic_path] = (await Connect.query(
                'SELECT name, path FROM copybooks WHERE id = ?',
                copybook_id
              )) as RowDataPacket[];
              pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${pic_path[0].path}`, `${title}.jpg`), {})
                .toString('base64');
              source = pic_path[0].name;
            }
            return { id, title, source, pic };
          })
        )
      : [];
    // 查询总数，用于计算总页数
    const [countResult] = (await Connect.query('SELECT COUNT(*) as count FROM letters')) as RowDataPacket[];
    const totalCount = countResult[0].count;
    const totalPages = Math.ceil(totalCount / pageSize);

    // 返回分页结果
    ctx.body = formatResponse(200, 'success', { letters, totalPages, totalCount });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

export default router;
