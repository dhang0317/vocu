'use client';

import React from 'react';
import {
  BookOpen,
  GraduationCap,
  Briefcase,
  Bookmark,
  Plane,
  CreditCard,
  AlertTriangle,
  Sparkles,
  Snowflake,
  Clock,
} from 'lucide-react';
import { SetIconKey, WordWeightStatus } from '@/types/vocu';

export function SetIcon({
  icon,
  className = 'w-5 h-5',
  style,
}: {
  icon: SetIconKey;
  className?: string;
  style?: React.CSSProperties;
}) {
  switch (icon) {
    case 'graduation-cap':
      return <GraduationCap className={className} style={style} />;
    case 'briefcase':
      return <Briefcase className={className} style={style} />;
    case 'bookmark':
      return <Bookmark className={className} style={style} />;
    case 'plane':
      return <Plane className={className} style={style} />;
    case 'credit-card':
      return <CreditCard className={className} style={style} />;
    case 'book':
    default:
      return <BookOpen className={className} style={style} />;
  }
}

export function WeightStatusBadge({
  status,
  compact = false,
}: {
  status: WordWeightStatus;
  compact?: boolean;
}) {
  if (status === 'weakness') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F472B6]/15 text-[#F472B6] border border-[#F472B6]/30">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>弱點優先</span>
      </span>
    );
  }
  if (status === 'untested') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#52B788]/15 text-[#52B788] border border-[#52B788]/30">
        <Sparkles className="w-3 h-3 shrink-0" />
        <span>尚未測驗</span>
      </span>
    );
  }
  if (status === 'cooldown') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#60A5FA]/15 text-[#60A5FA] border border-[#60A5FA]/30">
        <Snowflake className="w-3 h-3 shrink-0" />
        <span>冷卻中</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30">
      <Clock className="w-3 h-3 shrink-0" />
      <span>{compact ? '待複習' : '久未複習'}</span>
    </span>
  );
}
