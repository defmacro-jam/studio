
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StarRating } from "./StarRating";
import { useState, useEffect } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

interface AdjustRatingModalProps {
  isOpen: boolean;
  currentRating: number;
  suggestedRating: number;
  onConfirm: (newRating: number) => void;
  onCancel: () => void;
}

export function AdjustRatingModal({
  isOpen,
  currentRating,
  suggestedRating,
  onConfirm,
  onCancel,
}: AdjustRatingModalProps) {
  const [newRating, setNewRating] = useState(suggestedRating);

  // Reset to suggested rating when modal opens or props change
  useEffect(() => {
    setNewRating(suggestedRating);
  }, [suggestedRating, isOpen]);

  const isIncrease = suggestedRating > currentRating;
  const isDecrease = suggestedRating < currentRating;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Adjust Your Sentiment Rating?</AlertDialogTitle>
          <AlertDialogDescription>
            You moved an item{" "}
            {isIncrease ? "from 'Improve' to 'Well'" : "from 'Well' to 'Improve'"}. Would you like
            to adjust your overall sentiment rating?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4 flex flex-col items-center space-y-3">
           <div className="flex items-center space-x-2 text-muted-foreground">
                <span>Current: {currentRating} ★</span>
                {isIncrease && <ArrowUp className="h-4 w-4 text-green-500" />}
                {isDecrease && <ArrowDown className="h-4 w-4 text-red-500" />}
                <span>Suggested: {suggestedRating} ★</span>
           </div>

          <StarRating value={newRating} onChange={setNewRating} size={32} />
          <p className="text-sm text-muted-foreground">
            Select a new rating or keep the suggested one.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep Original Rating ({currentRating} ★)</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(newRating)} disabled={newRating === currentRating}>
            Confirm New Rating ({newRating} ★)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

    