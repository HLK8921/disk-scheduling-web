# 磁盘调度实验：静态版

该目录是可部署到 GitHub Pages 的纯前端版本，不依赖 Java 服务、数据库或构建工具。六种算法都在浏览器内计算。

## 本地预览

在此目录启动任意静态文件服务器，例如：

```powershell
python -m http.server 8094 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8094/`。

## 测试

```powershell
node tests/scheduler.test.js
```

测试覆盖课堂示例六种算法总移动磁道数、SSTF 访问序列、SCAN 平均寻道长度、重复请求、磁道边界和单请求场景。

## 部署

静态文件可以直接发布到 GitHub Pages、Cloudflare Pages 或 Netlify。仓库根目录需要包含 `index.html`、`assets` 和 `tests`：

- 构建命令：无
- 发布目录：`/`
- 启动命令：无
