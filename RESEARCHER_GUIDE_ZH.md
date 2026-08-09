# ScopeProof X/A 云端预试：研究者手册

## 项目边界

这是一个全新的独立部署：新 GitHub 仓库、新 Supabase 项目、新数据表。它不读取旧项目的密钥或数据。

## 被试入口

部署完成后，正式链接为：

`https://song-tuo.github.io/scopeproof-xa-study/`

数据库控制台：

`https://supabase.com/dashboard/project/fmslskayzdlafsvulfvn`

不要给正式被试添加任何参数。系统会在 X 与 A 之间自动平衡分配。

系统不设置总作答人数上限。每个新的回响用户 ID 都可以建立一个会话；同一 ID 只允许提交一次，以避免重复领酬。

预览链接不会写入数据库：

- X：`?form=X&preview=1`
- A：`?form=A&preview=1`
- 跳过介绍：再加 `&skip_intro=1`
- 指定先显示某刺激：再加 `&stimulus=P01`（也可用 S02、C05、D08）
- 查看尚未裁决的边界说明处理：再加 `&scope=1`。它只在预览模式生效，禁止放进正式招募链接。

## 材料版本与部署

当前材料版本为 `v6`，数据库中的 `consent_version` 为 `scopeproof-xa-zh-v6-huixiang`。
v6 将被试界面中的研究者术语改为日常中文；题干和选项均有变化，不得与 v5 或更早样本合并。

- 前端与 `supabase/migrations/20260809200000_materials_version_isolation.sql` 必须同批部署；不能只更新网页。
- 恢复会话时，服务器必须返回同一 `consent_version`，否则网页拒绝继续。
- X/A 人数平衡只在同一 `consent_version` 内计算，旧版记录不会影响新版分配。
- 以后任何改变被试所见材料的修订，都必须提升 `MATERIALS_VERSION` 并新增对应数据库迁移。
- 正式 2×2 若投放边界说明，必须由服务器分组并把条件写入会话记录，不能使用网址参数分组。

## 查看招募进度

在 Supabase 的 SQL Editor 运行：

```sql
select * from public.xa_probe_researcher_status order by evidence_form;
```

完整会话列表：

```sql
select session_id, consent_version, evidence_form, status, created_at, completed_at
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

以 `session_id` 连接。v6 分析只保留以下会话，不得与旧材料版本合并：

```sql
where xa_probe_sessions.status = 'complete'
  and xa_probe_sessions.consent_version = 'scopeproof-xa-zh-v6-huixiang'
```

`xa_probe_sessions.platform_user_id` 用于匹配回响身份，`completion_code` 是返回给作答者的 6 位完成码。

## 回响数据推送配置

问卷推送名称：

`电脑结果理解小测试（约 5–7 分钟）`

作答者填写前提示说明：

`本任务将跳转至外部实验页面，全程约五到七分钟，不需要专业知识。进入页面后，请完整粘贴回响数据平台提供的用户编号（编号长度不固定），用于核对答卷和发放报酬。完成全部问题后，页面会显示一个六位数字完成码；请复制或截图保存，并返回回响数据平台提交。请勿重复作答；若中途关闭，请在原来的手机或电脑上重新打开，以继续作答。`

完成后的返回地址：

`https://www.huixiangdata.com/transferPage?url=https%3A%2F%2Fwww.huixiangdata.com%2Fquestionnaire%2Fapi%2Fv1%2Fanswer%2Fthird%2Fcallback%2Fsubmit%2F202608085411`

## 安全设计

- 网页只持有 Supabase 的公开 anon key，不含 service role key。
- anon 角色不能直接查询、插入、更新或删除任何实验表。
- 每个会话有浏览器随机生成的 256-bit 令牌；数据库只保存令牌哈希。
- 写入函数同时验证会话编号、令牌、分配刺激和完成顺序。
- 预览模式完全本地运行，不污染正式数据。

## 招募前检查

- 用 X 与 A 预览链接逐项检查文字和布局。
- 确认正式地址即使追加 `?scope=1` 也不会显示边界说明；只有预览地址追加该参数才显示。
- 用无参数正式链接完整填一遍，确认出现完成代码。
- 确认新会话的 `consent_version` 为 `scopeproof-xa-zh-v6-huixiang`，且 X/A 平衡不受旧版记录影响。
- 在 `xa_probe_researcher_status` 与五张表中确认测试记录完整。
- 删除测试记录时只按明确的测试 `session_id` 操作，不要清空整库。
