# ScopeProof X/A 云端预试：研究者手册

## 项目边界

这是一个全新的独立部署：新 GitHub 仓库、新 Supabase 项目、新数据表。它不读取旧项目的密钥或数据。

## 被试入口

部署完成后，正式链接为：

`https://song-tuo.github.io/scopeproof-xa-study/`

不要给正式被试添加任何参数。系统会在 X 与 A 之间自动平衡分配。

预览链接不会写入数据库：

- X：`?form=X&preview=1`
- A：`?form=A&preview=1`
- 跳过介绍：再加 `&skip_intro=1`
- 指定先显示某刺激：再加 `&stimulus=P01`（也可用 S02、C05、D08）

## 查看招募进度

在 Supabase 的 SQL Editor 运行：

```sql
select * from public.xa_probe_researcher_status order by evidence_form;
```

完整会话列表：

```sql
select session_id, evidence_form, status, created_at, completed_at
from public.xa_probe_sessions
order by created_at desc;
```

## 导出分析数据

在 Supabase Table Editor 中分别导出以下表为 CSV：

1. `xa_probe_sessions`
2. `xa_probe_assignments`
3. `xa_probe_responses`
4. `xa_probe_poststudy`
5. `xa_probe_events`

以 `session_id` 连接。正式分析只保留 `xa_probe_sessions.status = 'complete'` 的会话。

## 安全设计

- 网页只持有 Supabase 的公开 anon key，不含 service role key。
- anon 角色不能直接查询、插入、更新或删除任何实验表。
- 每个会话有浏览器随机生成的 256-bit 令牌；数据库只保存令牌哈希。
- 写入函数同时验证会话编号、令牌、分配刺激和完成顺序。
- 预览模式完全本地运行，不污染正式数据。

## 招募前检查

- 用 X 与 A 预览链接逐项检查文字和布局。
- 用无参数正式链接完整填一遍，确认出现完成代码。
- 在 `xa_probe_researcher_status` 与五张表中确认测试记录完整。
- 删除测试记录时只按明确的测试 `session_id` 操作，不要清空整库。
