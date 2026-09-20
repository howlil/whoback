import { useState } from 'react';

const views = [
  {
    id: 'overview',
    label: 'Overview',
    headline: '13',
    headlineLabel: "don't follow you back",
    metrics: [
      { value: '616', label: 'Followers', tone: 'neutral' },
      { value: '842', label: 'Following', tone: 'neutral' },
      { value: '408', label: 'Mutual', tone: 'positive' },
      { value: '21', label: "You don't follow back", tone: 'warn' },
    ],
    rows: [
      ['@marco', 'not following back', true],
      ['@clara', 'mutual', false],
      ['@syd', 'follows you', false],
    ],
  },
  {
    id: 'not-back',
    label: "Don't follow back",
    headline: '13',
    headlineLabel: 'accounts to review',
    metrics: [
      { value: '13', label: "Don't follow you back", tone: 'danger' },
      { value: '3', label: 'new since last check', tone: 'neutral' },
    ],
    rows: [
      ['@marco', 'not following back', true],
      ['@naya', 'not following back', true],
      ['@keiko', 'not following back', true],
    ],
  },
  {
    id: 'mutual',
    label: 'Mutual',
    headline: '408',
    headlineLabel: 'mutual connections',
    metrics: [
      { value: '408', label: 'Mutual', tone: 'positive' },
      { value: '616', label: 'Followers', tone: 'neutral' },
    ],
    rows: [
      ['@clara', 'mutual', false],
      ['@raka', 'mutual', false],
      ['@mika', 'mutual', false],
    ],
  },
  {
    id: 'fans',
    label: 'You follow',
    headline: '21',
    headlineLabel: 'people you do not follow back',
    metrics: [
      { value: '21', label: "You don't follow back", tone: 'warn' },
      { value: '616', label: 'Followers', tone: 'neutral' },
    ],
    rows: [
      ['@syd', 'follows you', false],
      ['@tariq', 'follows you', false],
      ['@lena', 'follows you', false],
    ],
  },
] as const;

type ViewId = (typeof views)[number]['id'];

export function ProductPreview() {
  const [viewId, setViewId] = useState<ViewId>('overview');
  const activeView = views.find((view) => view.id === viewId) ?? views[0];

  return (
    <div className="hero-preview-canvas">
      <div className="proof-card proof-card--before" aria-label="Sample browser session before checking relationships">
        <span className="proof-card__label">Before</span>
        <div className="browser-card">
          <div className="browser-card__bar">
            <span className="browser-card__dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>instagram.com</span>
          </div>
          <div className="browser-card__body">
            <div className="browser-card__profile">
              <div className="browser-card__avatar">H</div>
              <div>
                <strong>@howlil</strong>
                <span>Instagram session open</span>
              </div>
            </div>
            <div className="browser-card__stats">
              <span><strong>616</strong> followers</span>
              <span><strong>842</strong> following</span>
            </div>
            <div className="browser-card__empty">
              <span className="browser-card__empty-icon">?</span>
              <strong>Relationship gap</strong>
              <span>Not checked yet</span>
            </div>
          </div>
        </div>
      </div>

      <div className="proof-arrow" aria-hidden="true">
        <span>WhoBack</span>
        <svg viewBox="0 0 58 24" fill="none"><path d="M2 12h48m0 0-9-9m9 9-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>

      <div className="proof-card proof-card--after">
        <span className="proof-card__label">After</span>
        <div className="scan-preview--enter">
          <div className="scan-preview" role="group" aria-label="Interactive WhoBack extension snapshot">
        <div className="scan-preview__chrome">
          <strong>WhoBack</strong>
          <span>local snapshot</span>
        </div>

        <div className="scan-preview__body">
          <div className="scan-preview__account">
            <div className="flex min-w-0 items-center gap-3">
              <div className="scan-preview__avatar">H</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">@howlil</p>
                <p className="mt-0.5 text-[11px] text-muted">Connected</p>
              </div>
            </div>
            <span className="scan-preview__status">ready</span>
          </div>

          <div className="preview-tabs" role="tablist" aria-label="Sample relationship views">
            {views.map((view) => (
              <button
                type="button"
                role="tab"
                aria-selected={view.id === viewId}
                aria-controls="preview-panel"
                className={`preview-tab focus-ring ${view.id === viewId ? 'preview-tab--active' : ''}`}
                key={view.id}
                onClick={() => setViewId(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>

          <div className="preview-panel" id="preview-panel" key={activeView.id} role="tabpanel" aria-live="polite">
            <div className="preview-result">
              <strong>{activeView.headline}</strong>
              <span>{activeView.headlineLabel}</span>
            </div>

            <div className="scan-metrics" aria-label={`${activeView.label} metrics`}>
              {activeView.metrics.map((metric) => (
                <div className={`scan-metric scan-metric--${metric.tone}`} key={metric.label}>
                  <div className="scan-metric__value">{metric.value}</div>
                  <div className="scan-metric__label">{metric.label}</div>
                </div>
              ))}
            </div>

            <div className="preview-rows" aria-label={`${activeView.label} sample accounts`}>
              {activeView.rows.map(([handle, relation, signal]) => (
                <div className="preview-row" key={handle}>
                  <span>{handle}</span>
                  <span className={signal ? 'preview-row__signal' : ''}>{relation}</span>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className="scan-preview__cta pressable focus-ring" onClick={() => setViewId('not-back')}>
            View details
          </button>
          <div className="scan-preview__footer">Sample interaction · saved in this browser</div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
