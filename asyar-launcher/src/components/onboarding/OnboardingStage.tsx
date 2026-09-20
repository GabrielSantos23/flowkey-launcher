import React from 'react';

export interface OnboardingStageProps {
  image: string;
  lean?: 'left' | 'right';
}

export default function OnboardingStage({ image, lean = 'right' }: OnboardingStageProps) {
  const isLeft = lean === 'left';

  return (
    <div className="relative h-full overflow-hidden">
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={`absolute top-1/2 w-[130%] rounded-[var(--radius-lg)] blur-[48px] saturate-[1.4] opacity-60 scale-110 pointer-events-none ${
          isLeft
            ? 'left-[48%] -translate-x-[74%] -translate-y-1/2 -rotate-6'
            : 'left-[52%] -translate-x-[26%] -translate-y-1/2 rotate-6'
        }`}
      />
      <img
        src={image}
        alt=""
        className={`absolute top-1/2 w-[130%] rounded-[var(--radius-lg)] shadow-2xl border border-[var(--border-color)] object-cover ${
          isLeft
            ? 'left-[48%] -translate-x-[74%] -translate-y-1/2 -rotate-6'
            : 'left-[52%] -translate-x-[26%] -translate-y-1/2 rotate-6'
        }`}
      />
      <div
        className={`absolute inset-0 pointer-events-none ${
          isLeft
            ? 'bg-gradient-to-l from-[var(--bg-popup)] to-transparent'
            : 'bg-gradient-to-r from-[var(--bg-popup)] to-transparent'
        }`}
      />
    </div>
  );
}
