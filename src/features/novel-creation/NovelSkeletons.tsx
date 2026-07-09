// 骨架屏 / 可见错误恢复：加载与失败态占位。中文文案集中在本文件，接入点保持纯 ASCII。
// 错误横幅带重试入口，只服务当前入口的可见恢复，不做全局重试框架。
interface NovelErrorBannerProps {
  message: string;
  busy?: boolean;
  onRetry: () => void;
}

export function NovelErrorBanner({ message, busy, onRetry }: NovelErrorBannerProps) {
  return (
    <div className="novel-error-banner" role="alert">
      <span className="novel-error-banner__text">{message}</span>
      <button className="novel-flow__ghost" disabled={busy} onClick={onRetry} type="button">重试</button>
    </div>
  );
}

export function NovelListSkeleton() {
  return (
    <div className="novel-project-grid novel-project-grid--skeleton" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div className="novel-project-card novel-project-card--skeleton" key={key}>
          <div className="novel-skeleton-line novel-skeleton-line--title" />
          <div className="novel-skeleton-line" />
          <div className="novel-skeleton-line novel-skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}
