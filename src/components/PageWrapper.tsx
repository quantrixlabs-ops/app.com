import React from 'react';
import { motion } from 'motion/react';
import { useNavigationType } from 'react-router-dom';

/**
 * Wraps each page with a slide + fade + scale transition.
 * Direction is aware of browser back/forward navigation:
 *   - Forward (PUSH / REPLACE) → slides in from the right, exits to the left
 *   - Back (POP)               → slides in from the left,  exits to the right
 */

type Variants = {
  initial: (back: boolean) => object;
  animate: object;
  exit: (back: boolean) => object;
};

const variants: Variants = {
  initial: (back: boolean) => ({
    x: back ? '-3%' : '3%',
    opacity: 0,
    scale: 0.98,
  }),
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (back: boolean) => ({
    x: back ? '3%' : '-3%',
    opacity: 0,
    scale: 0.98,
  }),
};

const transition = {
  type: 'tween' as const,
  ease: 'easeInOut',
  duration: 0.32,
};

type Props = { children: React.ReactNode };

export default function PageWrapper({ children }: Props) {
  const navType = useNavigationType();
  const isBack = navType === 'POP';

  return (
    <motion.div
      custom={isBack}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transition}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}
