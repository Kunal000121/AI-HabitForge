import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/aIInsight.js";
import { chatCompletion, SYSTEM_PROMPTS } from "../utils/aiService.js";
import { lastNDays, calcStreak, todayKey } from "../utils/dateHelper.js";

const buildWeeklyContext = async (userId) => {
  const habits = await Habit.find({ userId, isArchived: false });
  const days = lastNDays(7);
  const logs = await HabitLog.find({
    userId,
    completedDate: { $gte: days[0], $lte: days[days.length - 1] },
  });

  const perHabit = habits.map((h) => {
    const completed = logs.filter(
      (l) => String(l.habitId) === String(h._id)
    ).length;
    return {
      name: h.name,
      category: h.category,
      frequency: h.frequency,
      completedDays: completed,
      targetDays: h.targetDays,
    };
  });
  return { days, perHabit };
};

// 1. Weekly Report API
export const weeklyReport = async (req, res) => {
  try {
    const ctx = await buildWeeklyContext(req.user._id);
    if (!ctx.perHabit.length) {
      return res.json({
        content:
          "You don't have any active habits yet. Create your first habit to start tracking - I'll generate a weekly report once you have some data.", 
      });
    }
    const userMsg = `Here is the user's habit data for the past 7 days (${ctx.days[0]} to ${ctx.days[6]}):\n${ctx.perHabit
  .map(
    (h) =>
      `- ${h.name} (${h.category}, ${h.frequency}): completed ${h.completedDays} of the past 7 days, target ${h.targetDays} days`
  )
  .join("\n")}\n\nPlease write the personalised weekly report now.`;

    const { content } = await chatCompletion({
      system: SYSTEM_PROMPTS.weekly,
      user: userMsg,
    });

    await AIInsight.create({
      userId: req.user._id,
      type: "weekly",
      content,
    });
    res.json({ content });
  } catch (error) {
    res.status(500).json({ message: error.message});
  }
};

// 2. Habit Suggestions API
export const suggestHabits = async (req, res) => {
  try {
    const { goals, productiveTime, struggles } = req.body;
    const userMessage = `Goals: ${goals}\nProductive Time: ${productiveTime}\nStruggles: ${struggles}`;
    
    const responseText = await chatCompletion(SYSTEM_PROMPTS.suggestion, userMessage);
    
    let suggestions;
    try {
      // Try to parse the response as JSON
      suggestions = JSON.parse(responseText); 
    } catch (parseError) {
      // Fallback defaults if the AI hiccups or returns malformed text
      suggestions = [
        { name: "Drink Water", description: "Drink 2L of water daily", category: "health", frequency: "daily", icon: "💧", reason: "Essential baseline for health and energy." },
        { name: "Read 15 mins", description: "Read a book", category: "learning", frequency: "daily", icon: "📚", reason: "Helps you wind down and learn." },
        { name: "Morning Stretch", description: "10 mins of stretching", category: "fitness", frequency: "daily", icon: "🧘", reason: "Great for building a productive morning." }
      ];
    }

    await AIInsight.create({
      userId: req.user.id,
      type: "suggestion",
      content: JSON.stringify(suggestions),
      meta: { goals, productiveTime, struggles }
    });

    res.status(200).json(suggestions);
  } catch (error) {
    res.status(500).json({ message: "Failed to generate suggestions" });
  }
};

// 3. Streak Recovery Plan API
export const recoveryPlan = async (req, res) => {
  try {
    const { habitId } = req.body; 
    const habit = await Habit.findById(habitId);
    
    if (!habit || habit.userId.toString() !== req.user.id) {
       return res.status(404).json({ message: "Habit not found" });
    }

    // Look up full log history
    const logs = await HabitLog.find({ habitId, userId: req.user.id }).sort({ completedDate: -1 });
    const logDates = logs.map(l => l.completedDate);
    
    // Compute current and longest streak
    const { current, longest } = calcStreak(logDates); 

    const userMessage = `Habit: ${habit.name}\nCategory: ${habit.category}\nCurrent Streak: ${current}\nLongest Streak: ${longest}`;
    const content = await chatCompletion(SYSTEM_PROMPTS.recovery, userMessage);

    const insight = await AIInsight.create({
      userId: req.user.id,
      type: "recovery",
      content,
      meta: { habitId }
    });

    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate recovery plan" });
  }
};

// 4. Chat Analysis API
export const chatAnalysis = async (req, res) => {
  try {
    const { question } = req.body;
   // console.log("req received", req.body);
    const habits = await Habit.find({ userId: req.user.id, isArchived: false });
    const past30Days = lastNDays(30);
    
    const logs = await HabitLog.find({ 
      userId: req.user.id, 
      completedDate: { $in: past30Days } 
    });

    // Compute completions per day of week (Sunday-Saturday)
    const stats = habits.map(habit => {
      const habitLogs = logs.filter(l => l.habitId.toString() === habit._id.toString());
      const dayOfWeekCounts = { Sun:0, Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0 };
      
      habitLogs.forEach(log => {
         const date = new Date(log.completedDate);
         const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
         // date.getDay() returns 0 for Sunday, 1 for Monday, etc.
         // For timezone-safe date parsing, you may need to append 'T00:00:00' to completedDate string
         dayOfWeekCounts[days[date.getDay()]]++; 
      });

      return {
         name: habit.name,
         category: habit.category,
         logsCount: habitLogs.length,
         dayOfWeekCounts
      };
    });

   // console.log("----")

    const userMessage = `Context Data:\n${JSON.stringify(stats)}\n\nUser Question: ${question}`;

    //console.log(userMessage);

   // console.log(SYSTEM_PROMPTS.chat)
    const content = await chatCompletion(SYSTEM_PROMPTS.chat, userMessage);


 //   console.log(content);
    await AIInsight.create({
      userId: req.user.id,
      type: "chat",
      content:JSON.stringify(content),
      meta: { question }
    });

 //   console.log(content);

    res.status(200).json({ content });
  } catch (error) {
   // console.log(error);
    res.status(500).json({ message: "Failed to chat with AI" });
  }
};

// 5. Morning Motivation API
export const morningMotivation = async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id, isArchived: false });
    const logs = await HabitLog.find({ userId: req.user.id });
    
    // Create a YYYY-MM-DD key for today
    const todayKey = new Date().toISOString().split('T')[0]; 
    let completedToday = 0;

    const habitContext = habits.map(habit => {
      const habitLogs = logs.filter(l => l.habitId.toString() === habit._id.toString());
      const logDates = habitLogs.map(l => l.completedDate).sort((a,b) => a < b ? 1 : -1);
      
      if (logDates.includes(todayKey)) {
          completedToday++;
      }
      
      const { current } = calcStreak(logDates);
      return { name: habit.name, currentStreak: current };
    });

    const userMessage = `Total Habits: ${habits.length}\nCompleted Today: ${completedToday}\nHabit Streaks: ${JSON.stringify(habitContext)}`;
    
    // Call AI with a slightly higher temperature (0.8) for more varied, creative responses
    const content = await chatCompletion(SYSTEM_PROMPTS.morning, userMessage, 0.8);

    await AIInsight.create({
      userId: req.user.id,
      type: "morning",
      content:JSON.stringify(content),
    });

    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate morning motivation" });
  }
};