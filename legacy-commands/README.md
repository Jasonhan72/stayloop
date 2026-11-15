# 旧脚本（不要运行）

2026-11-15 从仓库根目录挪到这里，并去掉了可执行位（代码审查 S3-21）。这些是 2026-06 到 2026-10
迁 Worker 之前的一次性脚本：有的 `git push origin main`（`main` 已不存在，推上去会新建它），
有的部署到旧的 Cloudflare Pages 项目。现在的部署只走仓库根目录的 `ship2-v53.command`。

`ship2-v53-pages.command` 是迁移前的 Pages 版部署脚本，只在需要刷新 Pages 回滚目标时才有用；
回滚本身用 `bash scripts/worker-routes.sh off`。

本目录下的 `*.command` 不入库（`.gitignore`）。确认不再需要时可以整个删掉。
