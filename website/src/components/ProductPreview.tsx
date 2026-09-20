import { motion, useReducedMotion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

function floatingAnimation(
  rotate: number,
  yOffset = 0,
  xOffset = 0,
  delay = 0,
) {
  return {
    initial: {
      opacity: 0,
      y: 28 + yOffset,
      x: xOffset,
      rotate: rotate * 0.45,
      scale: 0.98,
    },
    animate: {
      opacity: 1,
      y: [0, -6, 0],
      x: [0, xOffset * 0.25, 0],
      rotate: [rotate, rotate + 0.9, rotate],
      scale: 1,
      transition: {
        opacity: { duration: 0.55, delay, ease },
        scale: { duration: 0.55, delay, ease },
        x: {
          duration: 4.8,
          delay: delay + 0.2,
          repeat: Infinity,
          repeatType: 'mirror' as const,
          ease,
        },
        y: {
          duration: 4.4,
          delay: delay + 0.15,
          repeat: Infinity,
          repeatType: 'mirror' as const,
          ease,
        },
        rotate: {
          duration: 5.2,
          delay: delay + 0.25,
          repeat: Infinity,
          repeatType: 'mirror' as const,
          ease,
        },
      },
    },
  };
}

export function ProductPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="hero-cards" role="img" aria-label="Illustrative WhoBack preview: use an existing Instagram session, scan relationships, and see a local result.">
      <motion.article
        className="hero-card hero-card--left"
        initial={reduceMotion ? false : floatingAnimation(-5, 0, -10, 0.05).initial}
        animate={reduceMotion ? undefined : floatingAnimation(-5, 0, -10, 0.05).animate}
        whileHover={
          reduceMotion
            ? undefined
            : {
                y: -8,
                rotate: -4.2,
                boxShadow:
                  '0 24px 44px rgba(18,19,26,0.11), 0 8px 20px rgba(18,19,26,0.06)',
                transition: { duration: 0.22 },
              }
        }
      >
        <div className="hero-card__chrome">
          <span />
          <span />
        </div>

        <div className="hero-card__body hero-card__body--left">
          <button type="button" tabIndex={-1} className="mini-action mini-action--soft">
            Check Account
          </button>

          <div className="hero-card__copy">
            <span>USE YOUR SESSION</span>
            <strong>Open Instagram. Check once.</strong>
            <p>No password form. No export workflow.</p>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="hero-card hero-card--center"
        initial={reduceMotion ? false : floatingAnimation(0, 4, 0, 0.16).initial}
        animate={reduceMotion ? undefined : floatingAnimation(0, 4, 0, 0.16).animate}
        whileHover={
          reduceMotion
            ? undefined
            : {
                y: -10,
                rotate: 0.6,
                boxShadow:
                  '0 28px 56px rgba(18,19,26,0.12), 0 10px 22px rgba(18,19,26,0.06)',
                transition: { duration: 0.22 },
              }
        }
      >
        <div className="hero-card__chrome">
          <span />
          <span />
        </div>

        <div className="hero-card__body hero-card__body--center">
          <div className="mini-profile-card">
            <div className="mini-profile-card__row">
              <div className="mini-profile-card__avatar">Y</div>
              <div>
                <strong>@youraccount</strong>
                <small>Relationship snapshot</small>
              </div>
            </div>

            <div className="mini-profile-card__pills">
              <span className="relation-chip relation-chip--danger">
                13 don&apos;t follow back
              </span>
              <span className="relation-chip relation-chip--positive">
                603 mutual
              </span>
            </div>
          </div>

          <div className="hero-card__copy hero-card__copy--center">
            <span>SEE THE ANSWER</span>
            <strong>Relationship status without profile-by-profile checking.</strong>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="hero-card hero-card--right"
        initial={reduceMotion ? false : floatingAnimation(5, 0, 10, 0.28).initial}
        animate={reduceMotion ? undefined : floatingAnimation(5, 0, 10, 0.28).animate}
        whileHover={
          reduceMotion
            ? undefined
            : {
                y: -8,
                rotate: 4.2,
                boxShadow:
                  '0 24px 44px rgba(18,19,26,0.11), 0 8px 20px rgba(18,19,26,0.06)',
                transition: { duration: 0.22 },
              }
        }
      >
        <div className="hero-card__chrome">
          <span />
          <span />
        </div>

        <div className="hero-card__body hero-card__body--right">
          <div className="mini-chart" aria-hidden="true">
            <div className="mini-chart__bar" style={{ height: '36%' }} />
            <div className="mini-chart__bar" style={{ height: '56%' }} />
            <div className="mini-chart__bar" style={{ height: '48%' }} />
            <div className="mini-chart__bar mini-chart__bar--brand" style={{ height: '80%' }} />
            <div className="mini-chart__line" />
          </div>

          <div className="hero-card__copy">
            <span>STAYS LOCAL</span>
            <strong>No WhoBack backend.</strong>
            <p>Your scan progress and results stay in extension storage.</p>
          </div>
        </div>
      </motion.article>
    </div>
  );
}
