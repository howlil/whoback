import { motion, useReducedMotion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

export function ProductPreview() {
  const reduceMotion = useReducedMotion();

  const initial = (x: number, y: number, rotate: number) =>
    reduceMotion ? false : { opacity: 0, x, y, rotate: rotate * 0.45 };

  return (
    <div className="hero-cards" aria-label="WhoBack product preview">
      <motion.article
        className="hero-card hero-card--left"
        initial={initial(-24, 28, -5)}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, rotate: -5 }}
        transition={{ duration: 0.62, delay: 0.12, ease }}
      >
        <div className="hero-card__topline">
          <span>01</span>
          <span>Ready</span>
        </div>
        <div className="hero-card__body hero-card__body--action">
          <div className="mini-browser">
            <span className="mini-browser__dot" />
            <span>instagram.com</span>
          </div>
          <button type="button" tabIndex={-1} className="mini-action">Check now</button>
          <div className="hero-card__copy">
            <span>START HERE</span>
            <strong>Keep Instagram open.</strong>
            <p>WhoBack uses the session that is already signed in to Chrome.</p>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="hero-card hero-card--center"
        initial={initial(0, 36, 0)}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, rotate: 0 }}
        transition={{ duration: 0.66, delay: 0.2, ease }}
      >
        <div className="hero-card__topline">
          <span>02</span>
          <span className="status-dot"><i /> Connected</span>
        </div>
        <div className="hero-card__body">
          <div className="account-row">
            <div className="account-avatar">Y</div>
            <div>
              <strong>@youraccount</strong>
              <span>relationship snapshot</span>
            </div>
          </div>

          <div className="relation-chips">
            <span className="relation-chip relation-chip--danger">13 don&apos;t follow back</span>
            <span className="relation-chip relation-chip--positive">603 mutual</span>
          </div>

          <div className="hero-card__copy hero-card__copy--center">
            <span>THE ANSWER</span>
            <strong>See the gap without profile-by-profile checking.</strong>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="hero-card hero-card--right"
        initial={initial(24, 28, 5)}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, rotate: 5 }}
        transition={{ duration: 0.62, delay: 0.28, ease }}
      >
        <div className="hero-card__topline">
          <span>03</span>
          <span>Local</span>
        </div>
        <div className="hero-card__body">
          <div className="mini-chart" aria-hidden="true">
            <div className="mini-chart__bar" style={{ height: '38%' }} />
            <div className="mini-chart__bar" style={{ height: '64%' }} />
            <div className="mini-chart__bar mini-chart__bar--brand" style={{ height: '82%' }} />
            <div className="mini-chart__bar" style={{ height: '52%' }} />
            <div className="mini-chart__bar" style={{ height: '70%' }} />
            <span className="mini-chart__line" />
          </div>
          <div className="hero-card__copy">
            <span>STAYS WITH YOU</span>
            <strong>No WhoBack backend.</strong>
            <p>Scan progress and results stay in extension storage on this browser.</p>
          </div>
        </div>
      </motion.article>
    </div>
  );
}
