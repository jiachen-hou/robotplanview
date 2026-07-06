# 影刀任务计划看板

用于查看影刀常规定时任务、实时执行状态、排队任务和一周负载总览的轻量看板。

## 功能

- 读取影刀任务、机器人账号、机器人组和队列接口。
- 根据定时规则和历史运行时长生成未来任务甘特图。
- 展示实时运行、排队、离线、空闲等机器人状态。
- 总览页突出异常状态，例如队列数据滞后、离线仍有排队任务、同名任务多账号执行。
- 甘特图支持按任务或账号/分组查看，并支持日、周、月、年视角。

## 本地运行

```bash
npm install
npm run dev
```

默认服务地址为 `http://localhost:3000`。

## 验证

```bash
npm run lint
npm run build
```

如果需要运行单元测试：

```bash
npm run test
```

## 部署

项目包含 `netlify.toml` 和 `netlify/functions/api.ts`，Netlify 会将 `/api/*` 转发到 serverless function，再由服务端代理访问影刀接口。

## 密钥存储

登录页默认只把 Access Key Secret 保存在当前浏览器会话中。勾选“记住密钥到本机浏览器”后，才会将 Secret 写入本机浏览器的 `localStorage`。
