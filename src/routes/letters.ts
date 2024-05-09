import Router from 'koa-router';
import Connect from '../connect';
import { formatResponse } from '../../utils/common';
// import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { RowDataPacket } from 'mysql2';
import NodeRSA from 'node-rsa';
// import Bcrypt from 'bcryptjs';
import JWT from 'jsonwebtoken';
import { SECRET } from '../global';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import generateUUID from '../../utils/uuidMiddleWare';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/letters'
});

interface Letter {
  id: string;
  title: string;
  font_type: string;
  copybook_id?: string;
  font_id?: string;
}

// 获取所有字
router.post('/list', async ctx => {
  try {
    const { page, pageSize, fontType, letter, copybookId } = JSON.parse(ctx.request.body) as {
      page: number;
      pageSize: number;
      fontType: string;
      letter: string;
      copybookId: string;
    };

    // 解析查询参数
    const letterTitle = decodeURIComponent(letter);

    // 计算 OFFSET 值
    const offset = (page - 1) * pageSize;

    // 构建基础查询语句
    let baseQuery = `SELECT id, title, copybook_id, font_id FROM letters WHERE font_type=?`;
    const queryParams = [fontType];

    // 如果存在 letter 参数，则添加到查询条件中
    if (letter) {
      baseQuery += ' AND title LIKE ?';
      queryParams.push(`%${letterTitle}%`);
    }

    // 如果存在 copybookId 参数，则添加到查询条件中
    if (copybookId) {
      baseQuery += ' AND copybook_id=?';
      queryParams.push(copybookId);
    }

    // 执行查询，根据分页参数限制结果
    const [result] = (await Connect.query(`${baseQuery} LIMIT ?,?`, [
      ...queryParams,
      offset,
      pageSize
    ])) as RowDataPacket[];

    const letters = Array.isArray(result)
      ? await Promise.all(
          result.map(async row => {
            const { id, title, copybook_id, font_id } = row as Letter;
            let pic;
            let source;
            if (!copybook_id && copybookId) {
              const [font_path] = (await Connect.query('SELECT name, path FROM fonts WHERE id = ?', [
                font_id
              ])) as RowDataPacket[];
              pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${font_path[0].path}`, `${title}.png`), {})
                .toString('base64');
              source = font_path[0].name;
            }
            if (!font_id && !copybookId) {
              const [pic_path] = (await Connect.query('SELECT name, path FROM copybooks WHERE id = ?', [
                copybook_id
              ])) as RowDataPacket[];
              pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${pic_path[0].path}`, `${title}.png`), {})
                .toString('base64');
              source = pic_path[0].name;
            }
            if (!font_id && copybookId) {
              const [pic_path] = (await Connect.query('SELECT name, path FROM copybooks WHERE id = ?', [
                copybook_id
              ])) as RowDataPacket[];
              pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${pic_path[0].path}`, `${title}.png`), {})
                .toString('base64');
              source = pic_path[0].name;
            }
            return { id, title, source, pic };
          })
        )
      : [];

    // 查询总数，用于计算总页数
    const countResult = (await Connect.query(`${baseQuery}`, queryParams)) as RowDataPacket[];
    const totalCount = countResult[0].length;
    const totalPages = Math.ceil(totalCount / pageSize);

    // 返回分页结果
    ctx.body = formatResponse(200, 'success', { letters, totalPages, totalCount });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// 获取字详情
router.get('/letter-detail/:id', async ctx => {
  try {
    const { id } = ctx.params;
    const [result] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [id])) as RowDataPacket[];
    const letter = result[0] as Letter;
    let pic;
    let source;
    if (!letter.copybook_id) {
      const [font_path] = (await Connect.query(
        'SELECT name, path FROM fonts WHERE id = ?',
        letter.font_id
      )) as RowDataPacket[];
      pic = fs
        .readFileSync(path.resolve(__dirname, `../public/${font_path[0].path}`, `${letter.title}.png`), {})
        .toString('base64');
      source = font_path[0].name;
    }
    if (!letter.font_id) {
      const [pic_path] = (await Connect.query(
        'SELECT name, path FROM copybooks WHERE id = ?',
        letter.copybook_id
      )) as RowDataPacket[];
      pic = fs
        .readFileSync(path.resolve(__dirname, `../public/${pic_path[0].path}`, `${letter.title}.png`), {})
        .toString('base64');
      source = pic_path[0].name;
    }
    ctx.body = formatResponse(200, 'success', {
      id: letter.id,
      title: letter.title,
      fontType: letter.font_type,
      pic,
      source
    });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// 上传图片,返回保存的文件名
router.post('/upload', async ctx => {
  try {
    if (!Array.isArray(ctx.request.files!.writingLetter)) {
      const writingLetter = ctx.request.files!.writingLetter.newFilename;
      console.log(writingLetter);
      ctx.body = formatResponse(200, 'success', { writingLetterFileName: writingLetter });
    }
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});

// 对比两张图片的相似度，返回对比结果
router.post('/compare', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { writingLetterFileName, letterId } = JSON.parse(ctx.request.body) as {
      writingLetterFileName: string;
      letterId: string;
    };

    // 保存到writings表中
    const [insertResult] = (await Connect.query(
      'INSERT INTO writings (id, letter_id, user_copy_path, user_email) VALUES (?,?,?,?)',
      [generateUUID(), letterId, writingLetterFileName, email]
    )) as RowDataPacket[];

    if (insertResult.affectedRows !== 1) {
      throw new Error('Failed to save writing');
    }

    const [result] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [letterId])) as RowDataPacket[];
    const letter = result[0] as Letter;
    let letterPathParent;
    if (!letter.copybook_id) {
      const [font_path] = (await Connect.query(
        'SELECT name, path FROM fonts WHERE id = ?',
        letter.font_id
      )) as RowDataPacket[];
      letterPathParent = font_path[0].path;
    }
    if (!letter.font_id) {
      const [pic_path] = (await Connect.query(
        'SELECT name, path FROM copybooks WHERE id = ?',
        letter.copybook_id
      )) as RowDataPacket[];
      letterPathParent = pic_path[0].path;
    }

    const pythonProcess = spawn('python', [
      './utils/cutLetter.py',
      `./src/public/${letterPathParent}/${letter.title}.png`,
      `./src/public/images/avatar/${writingLetterFileName}`
    ]);
    let stdout = '';
    let stderr = '';
    pythonProcess.stdout.on('data', data => {
      stdout += data.toString();
    });
    pythonProcess.stderr.on('data', data => {
      stderr += data.toString();
    });
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', code => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          reject(stderr || 'Python process exited with error');
        } else {
          console.log('Python process completed successfully');
          resolve();
        }
      });
    });
    const yuanPath = path.resolve(__dirname, '../public/images/avatar', path.basename(stdout.split(' ')[0]));
    const linmoPath = path.resolve(__dirname, '../public/images/avatar', path.basename(stdout.split(' ')[1]));
    const exePath = 'C:/Users/15720/Desktop/SSPU/thesis/compareLetters/Demo/Demo/bin/Debug/Demo.exe'; // 替换为你的 .exe 文件路径
    const command = `${exePath} ${yuanPath} ${linmoPath}`;
    let similarity = '';
    // 处理输出
    const exeProgress = execSync(command);
    similarity = exeProgress.toString();

    ctx.body = formatResponse(200, 'success', { result: similarity });
  } catch (error) {
    if (error instanceof Error) {
      ctx.body = formatResponse(500, 'fail', error.message);
    }
  }
});
export default router;
