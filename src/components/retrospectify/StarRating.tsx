"use client";

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  count?: number;
  value: number;
  onChange: (value: number) => void;
  size?: number;
  className?: string;
}

export function StarRating({
  count = 5,
  value,
  onChange,
  size = 24,
  className,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | undefined>(undefined);

  const stars = Array.from({ length: count }, (_, i) => i + 1);

  const handleClick = (newValue: number) => {
    onChange(newValue);
  };

  const handleMouseEnter = (newValue: number) => {
    setHoverValue(newValue);
  };

  const handleMouseLeave = () => {
    setHoverValue(undefined);
  };

  return (
    <div className={cn("flex space-x-1", className)}>
      {stars.map((starValue) => {
        const isFilled = (hoverValue ?? value) >= starValue;
        return (
          <Star
            key={starValue}
            size={size}
            className={cn(
              "cursor-pointer transition-colors duration-150",
              isFilled ? "text-accent fill-accent" : "text-muted-foreground"
            )}
            onClick={() => handleClick(starValue)}
            onMouseEnter={() => handleMouseEnter(starValue)}
            onMouseLeave={handleMouseLeave}
            aria-label={`Rate ${starValue} out of ${count} stars`}
          />
        );
      })}
    </div>
  );
}
