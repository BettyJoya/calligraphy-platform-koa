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
import fs from 'fs';
import path from 'path';

const RSA = new NodeRSA({ b: 512 });
RSA.setOptions({ encryptionScheme: 'pkcs1' });

const router = new Router({
  prefix: '/api/articles'
});

router.post('/add-article', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { content, letter_id, user_file_name, title, similarity } = JSON.parse(ctx.request.body) as {
      content: string;
      letter_id: string;
      user_file_name: string;
      title: string;
      similarity: string;
    };
    await Connect.query(
      'INSERT INTO articles (id, content, letter_id, user_email, user_file_name, title, similarity) VALUES (?,?,?,?,?,?,?)',
      [generateUUID(), content, letter_id, email, user_file_name, title, similarity]
    );
    ctx.body = formatResponse(200, 'success', '发布成功');
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.get('/get-self-all-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [articles] = await Connect.query('SELECT * FROM articles WHERE user_email = ?', [email]);
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.get('/get-all-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [result] = await Connect.query('SELECT * FROM articles');
    const articles = Array.isArray(result)
      ? await Promise.all(
          result.map(async article => {
            const { content, title, user_file_name, id, letter_id, user_email } = article as {
              content: string;
              title: string;
              user_file_name: string;
              id: string;
              letter_id: string;
              user_email: string;
            };
            const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [
              user_email
            ])) as RowDataPacket[];
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [
              letter_id
            ])) as RowDataPacket[];
            if (letter.length !== 0) {
              const [copybook] = (await Connect.query('SELECT * FROM copybooks WHERE id = ?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              // 是否点赞
              const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
                id,
                email
              ])) as RowDataPacket[];
              const is_like = like.length === 0 ? false : true;
              // 是否收藏
              const [collect] = (await Connect.query(
                'SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?',
                [id, email]
              )) as RowDataPacket[];
              const is_collect = collect.length === 0 ? false : true;
              // 点赞数量
              const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const likes_count = likes.length;
              // 收藏数量
              const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const collects_count = collects.length;
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                content,
                title,
                id,
                letter_pic,
                user_pic,
                user_avatar,
                user_name,
                is_like,
                is_collect,
                likes_count,
                collects_count
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.get('/get-attention-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [attentions] = await Connect.query('SELECT * FROM attentions WHERE user_email = ?', [email]);

    const attentionArticles = Array.isArray(attentions)
      ? await Promise.all(
          attentions.map(async attention => {
            const { attention_user_email } = attention as {
              attention_user_email: string;
            };
            const [result] = (await Connect.query('SELECT * FROM articles WHERE user_email = ?', [
              attention_user_email
            ])) as RowDataPacket[];
            return result;
          })
        )
      : [];
    const attentionArticleList: {
      content: string;
      title: string;
      user_file_name: string;
      id: string;
      letter_id: string;
      user_email: string;
      similarity: string;
    }[] = [];
    attentionArticles.forEach(attentionArticle => {
      attentionArticle.forEach(
        (element: {
          content: string;
          title: string;
          user_file_name: string;
          id: string;
          letter_id: string;
          user_email: string;
          similarity: string;
        }) => {
          attentionArticleList.push(element);
        }
      );
    });

    const articles = Array.isArray(attentionArticleList)
      ? await Promise.all(
          attentionArticleList.map(async article => {
            const { content, title, user_file_name, id, letter_id, user_email } = article as {
              content: string;
              title: string;
              user_file_name: string;
              id: string;
              letter_id: string;
              user_email: string;
            };
            const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [
              user_email
            ])) as RowDataPacket[];
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [
              letter_id
            ])) as RowDataPacket[];
            if (letter.length !== 0) {
              const [copybook] = (await Connect.query('SELECT path FROM copybooks WHERE id = ?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              // 是否点赞
              const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
                id,
                email
              ])) as RowDataPacket[];
              const is_like = like.length === 0 ? false : true;
              // 是否收藏
              const [collect] = (await Connect.query(
                'SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?',
                [id, email]
              )) as RowDataPacket[];
              const is_collect = collect.length === 0 ? false : true;
              // 点赞数量
              const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const likes_count = likes.length;
              // 收藏数量
              const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const collects_count = collects.length;
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                content,
                title,
                id,
                letter_pic,
                user_pic,
                user_avatar,
                user_name,
                is_like,
                is_collect,
                likes_count,
                collects_count
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});
router.get('/get-like-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [likes] = await Connect.query('SELECT * FROM userLikes WHERE user_email = ?', [email]);

    const likeArticles = Array.isArray(likes)
      ? await Promise.all(
          likes.map(async like => {
            const { article_id } = like as {
              article_id: string;
            };
            const [result] = (await Connect.query('SELECT * FROM articles WHERE id = ?', [
              article_id
            ])) as RowDataPacket[];
            return result[0];
          })
        )
      : [];

    const articles = Array.isArray(likeArticles)
      ? await Promise.all(
          likeArticles.map(async article => {
            const { content, title, user_file_name, id, letter_id, user_email } = article as {
              content: string;
              title: string;
              user_file_name: string;
              id: string;
              letter_id: string;
              user_email: string;
            };
            const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [
              user_email
            ])) as RowDataPacket[];
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [
              letter_id
            ])) as RowDataPacket[];
            if (letter.length !== 0) {
              const [copybook] = (await Connect.query('SELECT path FROM copybooks WHERE id = ?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              // 是否点赞
              const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
                id,
                email
              ])) as RowDataPacket[];
              const is_like = like.length === 0 ? false : true;
              // 是否收藏
              const [collect] = (await Connect.query(
                'SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?',
                [id, email]
              )) as RowDataPacket[];
              const is_collect = collect.length === 0 ? false : true;
              // 点赞数量
              const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const likes_count = likes.length;
              // 收藏数量
              const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const collects_count = collects.length;
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                content,
                title,
                id,
                letter_pic,
                user_pic,
                user_avatar,
                user_name,
                is_like,
                is_collect,
                likes_count,
                collects_count
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});
router.get('/get-collect-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [collects] = await Connect.query('SELECT * FROM userCollects WHERE user_email = ?', [email]);

    const collectArticles = Array.isArray(collects)
      ? await Promise.all(
          collects.map(async collect => {
            const { article_id } = collect as {
              article_id: string;
            };
            const [result] = (await Connect.query('SELECT * FROM articles WHERE id = ?', [
              article_id
            ])) as RowDataPacket[];
            return result[0];
          })
        )
      : [];
    const articles = Array.isArray(collectArticles)
      ? await Promise.all(
          collectArticles.map(async article => {
            const { content, title, user_file_name, id, letter_id, user_email } = article as {
              content: string;
              title: string;
              user_file_name: string;
              id: string;
              letter_id: string;
              user_email: string;
            };
            const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [
              user_email
            ])) as RowDataPacket[];
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [
              letter_id
            ])) as RowDataPacket[];
            if (letter.length !== 0) {
              const [copybook] = (await Connect.query('SELECT path FROM copybooks WHERE id = ?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              // 是否点赞
              const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
                id,
                email
              ])) as RowDataPacket[];
              const is_like = like.length === 0 ? false : true;
              // 是否收藏
              const [collect] = (await Connect.query(
                'SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?',
                [id, email]
              )) as RowDataPacket[];
              const is_collect = collect.length === 0 ? false : true;
              // 点赞数量
              const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const likes_count = likes.length;
              // 收藏数量
              const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const collects_count = collects.length;
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                content,
                title,
                id,
                letter_pic,
                user_pic,
                user_avatar,
                user_name,
                is_like,
                is_collect,
                likes_count,
                collects_count
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});
router.get('/get-my-articles', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const [articleResult] = (await Connect.query('SELECT * FROM articles WHERE user_email = ?', [
      email
    ])) as RowDataPacket[];
    const articles = Array.isArray(articleResult)
      ? await Promise.all(
          articleResult.map(async article => {
            const { content, title, user_file_name, id, letter_id, user_email, similarity } = article as {
              content: string;
              title: string;
              user_file_name: string;
              id: string;
              letter_id: string;
              user_email: string;
              similarity: string;
            };
            const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [
              user_email
            ])) as RowDataPacket[];
            const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [
              letter_id
            ])) as RowDataPacket[];
            if (letter.length !== 0) {
              const [copybook] = (await Connect.query('SELECT path FROM copybooks WHERE id = ?', [
                letter[0].copybook_id
              ])) as RowDataPacket[];
              // 是否点赞
              const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
                id,
                email
              ])) as RowDataPacket[];
              const is_like = like.length === 0 ? false : true;
              // 是否收藏
              const [collect] = (await Connect.query(
                'SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?',
                [id, email]
              )) as RowDataPacket[];
              const is_collect = collect.length === 0 ? false : true;
              // 点赞数量
              const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const likes_count = likes.length;
              // 收藏数量
              const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
                id
              ])) as RowDataPacket[];
              const collects_count = collects.length;
              const letter_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
                .toString('base64');
              const user_pic = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
                .toString('base64');
              const user_avatar = fs
                .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
                .toString('base64');
              const user_name = user[0].name;
              return {
                content,
                title,
                id,
                letter_pic,
                user_pic,
                user_avatar,
                user_name,
                is_like,
                is_collect,
                likes_count,
                collects_count,
                similarity
              };
            }
          })
        )
      : [];
    ctx.body = formatResponse(200, 'success', { articles });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

// 获得单个文章详情
router.post('/get-article-detail', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { article_id } = JSON.parse(ctx.request.body) as {
      article_id: string;
    };

    const [article] = (await Connect.query('SELECT * FROM articles WHERE id = ?', [article_id])) as RowDataPacket[];

    const { content, title, user_file_name, id, letter_id, user_email, similarity } = article[0] as {
      content: string;
      title: string;
      user_file_name: string;
      id: string;
      letter_id: string;
      user_email: string;
      similarity: string;
    };
    let articleDetail = {};
    const [user] = (await Connect.query('SELECT * FROM users WHERE email = ?', [user_email])) as RowDataPacket[];
    const [letter] = (await Connect.query('SELECT * FROM letters WHERE id = ?', [letter_id])) as RowDataPacket[];
    if (letter.length !== 0) {
      const [copybook] = (await Connect.query('SELECT * FROM copybooks WHERE id = ?', [
        letter[0].copybook_id
      ])) as RowDataPacket[];
      // 是否点赞
      const [like] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
        id,
        email
      ])) as RowDataPacket[];
      const is_like = like.length === 0 ? false : true;
      // 是否收藏
      const [collect] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?', [
        id,
        email
      ])) as RowDataPacket[];
      const is_collect = collect.length === 0 ? false : true;
      // 点赞数量
      const [likes] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ?', [id])) as RowDataPacket[];
      const likes_count = likes.length;
      // 收藏数量
      const [collects] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ?', [
        id
      ])) as RowDataPacket[];
      // 是否关注
      const [attention] = (await Connect.query(
        'SELECT * FROM attentions WHERE user_email = ? AND attention_user_email = ?',
        [email, user_email]
      )) as RowDataPacket[];
      const is_attention = attention.length === 0 ? false : true;
      const collects_count = collects.length;
      const letter_pic = fs
        .readFileSync(path.resolve(__dirname, `../public/${copybook[0].path}`, `${letter[0].title}.png`), {})
        .toString('base64');
      const user_pic = fs
        .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user_file_name}`), {})
        .toString('base64');
      const user_avatar = fs
        .readFileSync(path.resolve(__dirname, `../public/images/avatar/${user[0].avatar}`), {})
        .toString('base64');
      const user_name = user[0].name;
      articleDetail = {
        content,
        title,
        id,
        letter_pic,
        user_pic,
        user_avatar,
        user_name,
        user_email,
        is_like,
        is_collect,
        likes_count,
        collects_count,
        is_attention,
        similarity,
        font_type: copybook[0].font_type,
        source_book: copybook[0].name
      };
    }
    ctx.body = formatResponse(200, 'success', { articleDetail });
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.post('/like-article', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { article_id } = JSON.parse(ctx.request.body) as {
      article_id: string;
    };
    const [result] = (await Connect.query('SELECT * FROM userLikes WHERE article_id = ? AND user_email = ?', [
      article_id,
      email
    ])) as RowDataPacket[];
    if (result.length === 0) {
      await Connect.query('INSERT INTO userLikes (id, article_id, user_email) VALUES (?,?,?)', [
        generateUUID(),
        article_id,
        email
      ]);
      ctx.body = formatResponse(200, 'success', '点赞成功');
    } else {
      await Connect.query('DELETE FROM userLikes WHERE article_id = ? AND user_email = ?', [article_id, email]);
      ctx.body = formatResponse(200, 'success', '取消点赞成功');
    }
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});

router.post('/collect-article', async ctx => {
  try {
    const token = ctx.request.headers.authorization as string;
    const decoded = JWT.verify(token.split(' ')[1], SECRET);
    const { email } = decoded as { email: string };
    const { article_id } = JSON.parse(ctx.request.body) as {
      article_id: string;
    };
    const [result] = (await Connect.query('SELECT * FROM userCollects WHERE article_id = ? AND user_email = ?', [
      article_id,
      email
    ])) as RowDataPacket[];
    if (result.length === 0) {
      await Connect.query('INSERT INTO userCollects (id, article_id, user_email) VALUES (?,?,?)', [
        generateUUID(),
        article_id,
        email
      ]);
      ctx.body = formatResponse(200, 'success', '收藏成功');
    } else {
      await Connect.query('DELETE FROM userCollects WHERE article_id = ? AND user_email = ?', [article_id, email]);
      ctx.body = formatResponse(200, 'success', '取消收藏成功');
    }
  } catch (error) {
    if (error instanceof Error) {
      return (ctx.body = formatResponse(500, 'fail', error.message));
    }
  }
});
export default router;
