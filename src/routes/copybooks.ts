import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
import { RowDataPacket } from 'mysql2';
import fs from 'fs';
import path from 'path';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import generateUUID from '../../utils/uuidMiddleWare';
import moment from 'moment';

const router = new Router({
  prefix: '/api/copybook'
});

interface Copybook {
  id: string;
  name: string;
  author: string;
  path: string;
  description: string;
  content: string;
}

interface CopybookListInfo {
  id: string;
  name: string;
  author: string;
  mainPic: string;
}

interface CopybookDetail {
  id: string;
  name: string;
  author: string;
  mainPic: string;
  description: string;
  isCollected?: number;
}

router.post('/list', async ctx => {
  try {
    const { search } = JSON.parse(ctx.request.body) as { search: string };
    // 获取 copybooks 表的所数据并返回，可以模糊查询name和author
    const query = `SELECT * FROM copybooks WHERE name LIKE '%${search}%' OR author LIKE '%${search}%'`;
    const [result] = (await Connect.query(query)) as RowDataPacket[];

    const copybooks: Array<CopybookListInfo> = Array.isArray(result)
      ? result.map((row: Copybook) => {
          const { id, name, author } = row;
          // 读取文件夹下的第一张图片作为封面
          const firstPic = fs.readdirSync(path.join(__dirname, '../public', row.path.toString()))[0];
          const mainPic = fs
            .readFileSync(path.join(__dirname, '../public', row.path.toString(), firstPic), {})
            .toString('base64');
          return { id, name, author, mainPic };
        })
      : [];

    return (ctx.body = formatResponse(200, 'success', { copybooks }));
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

router.get('/copybook-detail/:id', async ctx => {
  try {
    const { id } = ctx.params;

    // const token = ctx.request.header.authorization as string;
    // const decoded = JWT.verify(token.split(' ')[1], SECRET);
    // const { email } = decoded as { email: string };

    const [result] = (await Connect.query('SELECT * FROM copybooks WHERE id = ?', [id])) as RowDataPacket[];

    const firstPic = fs.readdirSync(path.join(__dirname, '../public', result[0].path.toString()))[0];
    const mainPic = fs
      .readFileSync(path.join(__dirname, '../public', result[0].path.toString(), firstPic), {})
      .toString('base64');

    // 获取 userCollected 表中的 isCollected 字段
    // const [isCollected] = (await Connect.query(
    //   'SELECT isCollected FROM userCollected WHERE user_email = ? AND copybook_id = ?',
    //   [email, id]
    // )) as RowDataPacket[];

    const copybookDetail: CopybookDetail = {
      id: result[0].id,
      name: result[0].name,
      author: result[0].author,
      mainPic,
      description: result[0].description
    };
    // if (isCollected.length > 0) {
    //   copybookDetail.isCollected = isCollected[0].isCollected;
    // }
    return (ctx.body = formatResponse(200, 'success', { ...copybookDetail }));
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// // 收藏
// router.post('/collect', async ctx => {
//   try {
//     const token = ctx.request.headers.authorization as string;
//     const decoded = JWT.verify(token.split(' ')[1], SECRET);
//     const { email } = decoded as { email: string };

//     const { copybookId, isCollected } = ctx.request.body as { copybookId: string; isCollected: number };

//     // 查询数据库是否已经收藏
//     const [result] = (await Connect.query('SELECT * FROM userCollected WHERE user_email = ? AND copybook_id = ?', [
//       email,
//       copybookId
//     ])) as RowDataPacket[];

//     if (result.length > 0) {
//       // 更新数据库
//       const [res] = (await Connect.query(
//         'UPDATE userCollected SET isCollected = ? WHERE user_email = ? AND copybook_id = ?',
//         [isCollected, email, copybookId]
//       )) as RowDataPacket[];
//       if (res.affectedRows === 1) {
//         ctx.body = formatResponse(200, 'success', 'Collect successfully');
//       } else {
//         ctx.body = formatResponse(500, 'fail', 'Collect failed');
//       }
//     } else {
//       // 生成uuid
//       const id = generateUUID();
//       // 插入数据库
//       const [res] = (await Connect.query(
//         'INSERT INTO userCollected (id, user_email, copybook_id, isCollected) VALUES (?,?,?,?)',
//         [id, email, copybookId, isCollected]
//       )) as RowDataPacket[];
//       if (res.affectedRows === 1) {
//         ctx.body = formatResponse(200, 'success', 'Collect successfully');
//       } else {
//         ctx.body = formatResponse(500, 'fail', 'Collect failed');
//       }
//     }
//   } catch (error) {
//     if (error instanceof Error) {
//       ctx.body = formatResponse(500, 'fail', error.message);
//     }
//   }
// });

// 添加浏览记录
router.post('/addHistory', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };

    const { copybookId } = ctx.request.body as { copybookId: string };

    // 查询数据库是否已经存在
    const [result] = (await Connect.query(
      'SELECT * FROM userBrowsingHistory WHERE user_email = ? AND copybook_id = ?',
      [email, copybookId]
    )) as RowDataPacket[];

    const viewTime = moment().format('YYYY-MM-DD HH:mm:ss');

    if (result.length > 0) {
      // 更新数据库
      // 更新浏览的时间为当前时间，格式为timestamp

      const [res] = (await Connect.query(
        'UPDATE userBrowsingHistory SET viewTime = ? WHERE user_email = ? AND copybook_id = ?',
        [viewTime, email, copybookId]
      )) as RowDataPacket[];
      if (res.affectedRows === 1) {
        ctx.body = formatResponse(200, 'success', 'Add history successfully');
      } else {
        ctx.body = formatResponse(500, 'fail', 'Add history failed');
      }
    } else {
      // 生成uuid
      const id = generateUUID();
      // 插入数据库
      const [res] = (await Connect.query(
        'INSERT INTO userBrowsingHistory (id, user_email, copybook_id, viewTime) VALUES (?,?,?,?)',
        [id, email, copybookId, viewTime]
      )) as RowDataPacket[];
      if (res.affectedRows === 1) {
        ctx.body = formatResponse(200, 'success', 'Add history successfully');
      } else {
        ctx.body = formatResponse(500, 'fail', 'Add history failed');
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

export default router;
