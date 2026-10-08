import { useEffect, useState } from "react";
import type { AppDependencies } from "./dependencies";
import "../styles/analytics-admin.css";

interface Metric { accounts: number; percent: number | null; }
interface Report {
  registration_source: string; auth_complete_through: string | null;
  daily: Array<{ day: string; views: number; people: number; accounts: number; visitors: number; registrations: number }>;
  activity: Array<{ name: string; accounts: number; visitors: number; accounts_percent: number | null; visitors_percent: number | null }>;
  funnel: Array<Metric & { name: string; step_percent: number | null }>;
  conversions: Array<{ format: string; started: number; generated: number; percent: number | null; accounts_started: number; accounts_generated: number; visitors_started: number; visitors_generated: number; failures: Record<string, number> }>;
  retention: Array<{ day: string; accounts: number; d1: Metric & { status: string }; d7: Metric & { status: string } }>;
}
const labels: Record<string, string> = { registered: "注册", project_created: "创建项目", photos_imported: "成功导入", sequence_saved: "保存序列", export_generated: "生成导出文件", cancelled: "取消", permission: "权限", storage: "存储", conflict: "冲突", unavailable: "不可用", empty: "无可导入照片", partial: "部分失败", unknown: "未分类" };
const percent = (value: number | null) => value === null ? "—" : `${value}%`;
const day = (time: number) => new Date(time + 8 * 3600_000).toISOString().slice(0, 10);

export function AnalyticsAdminPage({ api }: { api: AppDependencies["analyticsAdmin"] }) {
  const [from, setFrom] = useState(day(Date.now() - 29 * 86400000));
  const [to, setTo] = useState(day(Date.now()));
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setReport(undefined); setError(undefined); setBusy(true);
    try {
      if (!api) throw new Error("disabled");
      setReport(await api.stats(from, to) as Report);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "analytics_forbidden" ? "此账号没有统计访问权限。" : "统计暂不可用，请检查日期范围（最多 90 天）或稍后重试。");
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [api]);
  return <main className="analytics-admin">
    <header><a href="#/">返回 PhotoFlex</a><h1>产品使用统计</h1><p>日期统一采用 Asia/Shanghai。管理员及配置的内部测试流量已排除。</p></header>
    <form onSubmit={(event) => { event.preventDefault(); void load(); }}><label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label><label>结束日期<input type="date" value={to} max={day(Date.now())} onChange={(event) => setTo(event.target.value)} required /></label><button disabled={busy}>{busy ? "加载中…" : "查看"}</button></form>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <p role="status">{report.registration_source === "complete_auth_export" ? "注册数来自完整认证账号快照。" : "注册数来自已核验的认证资料；未访问过的账号尚未覆盖，属于已观察注册人数。"} 注册时间来自认证系统，注册按钮点击不计入注册。</p>
      <section><h2>每日访问与注册</h2><p>人数 = 账号 + 未关联账号的访客。同一会话登录前后的访问合并为账号；共享设备不跨账号合并。</p><table><thead><tr>{["日期", "页面访问", "人数", "账号", "访客", "注册账号"].map(text => <th key={text}>{text}</th>)}</tr></thead><tbody>{report.daily.map(row => <tr key={row.day}>{[row.day, row.views, row.people, row.accounts, row.visitors, row.registrations].map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></section>
      <section><h2>核心操作活跃人数</h2><p>比例以所选日期内发生过任一核心操作的账号或访客为分母。</p><table><thead><tr><th>操作</th><th>账号人数 / 活跃占比</th><th>访客人数 / 活跃占比</th></tr></thead><tbody>{report.activity.map(row => <tr key={row.name}><td>{labels[row.name]}</td><td>{row.accounts} / {percent(row.accounts_percent)}</td><td>{row.visitors} / {percent(row.visitors_percent)}</td></tr>)}</tbody></table></section>
      <section><h2>注册激活漏斗</h2><p>所选日期注册的账号，按时间顺序完成各阶段；截止结束日期。保存序列指本地持久化成功，云同步另有原有状态提示。</p><table><thead><tr><th>阶段</th><th>账号人数</th><th>注册占比</th><th>上一步转换</th></tr></thead><tbody>{report.funnel.map(row => <tr key={row.name}><td>{labels[row.name]}</td><td>{row.accounts}</td><td>{percent(row.percent)}</td><td>{percent(row.step_percent)}</td></tr>)}</tbody></table></section>
      <section><h2>导出转换</h2><p>PDF/JPEG 的生成成功表示已触发浏览器下载，不代表已保存到磁盘。转换按同一次导出关联；完成结果可来自结束日期之后。</p><table><thead><tr><th>格式</th><th>开始次数</th><th>生成次数</th><th>转换</th><th>账号：开始 → 生成</th><th>访客：开始 → 生成</th><th>失败分类（次数）</th></tr></thead><tbody>{report.conversions.map(row => <tr key={row.format}><td>{row.format}</td><td>{row.started}</td><td>{row.generated}</td><td>{percent(row.percent)}</td><td>{row.accounts_started} → {row.accounts_generated}</td><td>{row.visitors_started} → {row.visitors_generated}</td><td>{Object.entries(row.failures).map(([kind, count]) => `${labels[kind] || kind}: ${count}`).join("；") || "—"}</td></tr>)}</tbody></table></section>
      <section><h2>注册后核心操作留存</h2><p>次日和第 7 日对应完整自然日，目标日期尚未结束时显示“未到期”，采集启用前的目标日期显示“未完整观测”。核心操作包括创建项目、成功导入、保存序列和生成导出。</p><table><thead><tr><th>注册日期</th><th>注册账号</th><th>次日人数 / 比例</th><th>第 7 日人数 / 比例</th></tr></thead><tbody>{report.retention.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.accounts}</td>{[row.d1, row.d7].map((value, index) => <td key={index}>{value.status === "pending" ? "未到期" : value.status === "unobserved" ? "未完整观测" : `${value.accounts} / ${percent(value.percent)}`}</td>)}</tr>)}</tbody></table></section>
    </>}
  </main>;
}
