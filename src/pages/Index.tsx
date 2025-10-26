import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import CalorieProgress from "@/components/CalorieProgress";
import ImageCapture from "@/components/ImageCapture";
import RecentMeals from "@/components/RecentMeals";
import AuthForm from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { User, LogOut, History, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [todayCalories, setTodayCalories] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const recentMealsRef = useRef<{ refresh: () => Promise<void> }>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    try {
      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      setProfile(profileData);

      // Load today's meals
      const today = new Date().toISOString().split("T")[0];
      const { data: mealsData } = await supabase
        .from("meals")
        .select("calories")
        .eq("user_id", user.id)
        .gte("created_at", today);

      const total = mealsData?.reduce((sum, meal) => sum + meal.calories, 0) || 0;
      setTodayCalories(total);

      // Check and update streak
      await checkStreak(profileData, total);

      // Subscribe to realtime updates
      const channel = supabase
        .channel("meals-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "meals",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadUserData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const checkStreak = async (profileData: any, todayCalories: number) => {
    const today = new Date().toISOString().split("T")[0];
    const lastCheck = profileData?.last_streak_check;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Only check once per day
    if (lastCheck === today) return;

    let newStreak = profileData?.streak_count || 0;
    let newLongest = profileData?.longest_streak || 0;

    // If last check was yesterday and goal was met
    if (lastCheck === yesterdayStr) {
      const { data: yesterdayMeals } = await supabase
        .from("meals")
        .select("calories")
        .eq("user_id", user.id)
        .gte("created_at", yesterdayStr)
        .lt("created_at", today);

      const yesterdayTotal = yesterdayMeals?.reduce((sum, meal) => sum + meal.calories, 0) || 0;
      
      if (yesterdayTotal >= (profileData?.daily_calorie_goal || 2000)) {
        newStreak += 1;
        if (newStreak > newLongest) {
          newLongest = newStreak;
        }
      } else {
        newStreak = 0;
      }
    } else if (lastCheck && lastCheck < yesterdayStr) {
      // Missed a day, reset streak
      newStreak = 0;
    }

    // Update profile with new streak
    await supabase
      .from("profiles")
      .update({
        streak_count: newStreak,
        longest_streak: newLongest,
        last_streak_check: today,
      })
      .eq("user_id", user.id);

    setProfile({ ...profileData, streak_count: newStreak, longest_streak: newLongest });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
  };

  const handleImageAnalyzed = async () => {
    // Refresh calorie count
    loadUserData();
    // Refresh recent meals list
    if (recentMealsRef.current) {
      await recentMealsRef.current.refresh();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold gradient-primary bg-clip-text text-transparent tracking-wide">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pt-20">
      {/* Gradient Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="gradient-header p-8 rounded-b-3xl shadow-lg mb-8"
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white tracking-wide">
              FoodVision+
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-white hover:bg-white/20"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>

          {/* Welcome Message */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-white/90 space-y-2"
          >
            <p className="text-xl font-medium tracking-wide">
              👋 Hi, {profile?.name || "there"}!
            </p>
            <p className="text-white/70 text-sm tracking-wide">
              You've consumed {todayCalories} / {profile?.daily_calorie_goal || 2000} calories today
            </p>
            {profile?.streak_count > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-white"
              >
                <Flame className="w-5 h-5 text-orange-400" />
                <span className="font-semibold">{profile.streak_count} Day Streak!</span>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>

      <div className="max-w-4xl mx-auto px-4 space-y-8">
        {/* Calorie Progress */}
        <CalorieProgress
          consumed={todayCalories}
          goal={profile?.daily_calorie_goal || 2000}
        />

        {/* Image Capture */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold mb-4 text-center tracking-wide">
            🥗 Track Your Meal
          </h2>
          <ImageCapture onImageAnalyzed={handleImageAnalyzed} />
        </motion.div>

        {/* Today's Meals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <RecentMeals ref={recentMealsRef} userId={user.id} />
        </motion.div>

        {/* Footer Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-foreground text-sm tracking-wide pb-4"
        >
          <p>Stay on top of your health goals 💪</p>
        </motion.div>
      </div>
    </div>
  );
};

export default Index;
