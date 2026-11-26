# tampermonkey
for scripts

## 学堂在线作业导出

[下载学堂在线作业导出](https://github.com/fusu19/tampermonkey/releases/latest/download/xuetangx-homework-exporter.user.js)

在 Tampermonkey 中安装一次。如果浏览器直接下载脚本文件，可在 Tampermonkey 的实用工具里导入该文件。后续版本由 Tampermonkey 按其更新检查设置获取。

刷新学堂在线的新版作业页，点击「导出作业」→「一键导出全课程」。脚本按目录读取作业题目，并自动下载一份合并的 Markdown。

## 发布

在脚本头部和面板版本中更新版本号后提交到 `main`。GitHub Actions 会构建安装脚本和更新元数据，测试通过后再发布到 Releases。
