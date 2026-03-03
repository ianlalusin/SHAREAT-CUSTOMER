"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
};

export function CustomerFeedbackModal({ open, onOpenChange, customerName }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [suggestion, setSuggestion] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      // reset when closed
      setRating(0);
      setSuggestion("");
      setIsSubmitting(false);
      setSubmitted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => onOpenChange(false), 2000);
    return () => clearTimeout(t);
  }, [submitted, onOpenChange]);

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  async function onSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // TODO: wire to API (storeId/sessionId/customer, etc.)
      await new Promise((r) => setTimeout(r, 350));
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>Feedback</DialogTitle>
              <DialogDescription>
                Hello, <span className="font-semibold">{customerName}</span>, help us provide more fun and exciting sharelebration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="font-semibold">How would you rate your dining experience today?</div>
                <div className="flex items-center gap-2">
                  {stars.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      className="p-1 rounded-md hover:bg-zinc-100 active:scale-95 transition"
                      onClick={() => setRating(n)}
                    >
                      <Star
                        className={cn(
                          "h-8 w-8",
                          n <= rating ? "fill-yellow-400 text-yellow-400" : "fill-white text-zinc-300"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold">Why did you give us {rating || 0} star{rating === 1 ? "" : "s"}?</div>
                <Textarea
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  placeholder="Any suggestion?"
                  className="min-h-[120px]"
                />
              </div>

              <Button
                className="w-full"
                disabled={rating === 0 || isSubmitting}
                onClick={onSubmit}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </>
        ) : (
          <div className="py-10 text-center">
            <div className="text-xl font-black">Thank you for your feedback sharelebrator!</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
