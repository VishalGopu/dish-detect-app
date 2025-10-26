import { useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Meal {
  id: string;
  dish_name: string;
  calories: number;
  image_url: string;
  created_at: string;
}

const RecentMeals = forwardRef<
  { refresh: () => Promise<void> },
  { userId: string }
>(({ userId }, ref) => {
  const [meals, setMeals] = useState<Meal[]>([]);

  const loadMeals = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", today)
      .order("created_at", { ascending: false });

    setMeals(data || []);
  };

  useImperativeHandle(ref, () => ({
    refresh: loadMeals,
  }));

  useEffect(() => {
    loadMeals();
  }, [userId]);

  const deleteMeal = async (id: string) => {
    try {
      const { error } = await supabase.from("meals").delete().eq("id", id);
      if (error) throw error;
      
      setMeals(meals.filter((m) => m.id !== id));
      toast.success("Meal deleted");
    } catch (error) {
      toast.error("Failed to delete meal");
    }
  };

  if (meals.length === 0) {
    return null;
  }

  return (
    <Card className="glass-card shadow-glass border-0">
      <CardHeader>
        <CardTitle className="tracking-wide">🍽️ Today's Meals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence mode="popLayout">
          {meals.map((meal, index) => (
            <motion.div
              key={meal.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, delay: 0 }}
              className="flex items-center gap-4 p-4 rounded-xl glass-card hover:shadow-md transition-all"
            >
              {meal.image_url && (
                <img
                  src={meal.image_url}
                  alt={meal.dish_name}
                  className="w-16 h-16 object-cover rounded-xl shadow-sm"
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium tracking-wide truncate">{meal.dish_name}</h4>
                <p className="text-sm text-primary font-medium">
                  {meal.calories} cal
                </p>
                <p className="text-xs text-muted-foreground tracking-wide">
                  {new Date(meal.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMeal(meal.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
});

RecentMeals.displayName = "RecentMeals";

export default RecentMeals;
