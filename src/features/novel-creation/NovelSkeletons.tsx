// 骨架屏：加载态占位，替代文字提示的突现。纯 ASCII 标记，样式在 NovelCreation.css。
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
