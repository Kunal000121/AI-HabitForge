import "dotenv/config";
import mongoose from "mongoose";
import { format, subDays } from "date-fns";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/aIInsight.js";

// Demo user constants
const DEMO_USER_EMAIL = "demo@example.com";
const DEMO_USER_PASSWORD = "password123";
const DEMO_USER_NAME = "Demo User";

// Define 8 habits with behavior controlling properties 
const habits = [
  {
    name: "Drink 2L of water",
    description: "Stay hydrated",
    category: "Health",
    frequency: "daily",
    targetDays: 7,
    color: "sky-blue",
    icon: "💧",
    _streakProb: 0.95, // 95% consistency
  },
  {
    name: "Morning Run",
    description: "Running outside",
    category: "Fitness",
    frequency: "daily",
    targetDays: 5,
    color: "emerald",
    icon: "🏃",
    _streakProb: 0.70,
    _pattern: "weekend-drop-off" // simulates struggle on weekends
  },
  {
    name: "Read 30 mins",
    description: "Read a book",
    category: "Learning",
    frequency: "daily",
    targetDays: 7,
    color: "indigo",
    icon: "📚",
    _streakProb: 0.80,
    _brokeAt: 15 // forces a 5-day broken streak around day 15
  },
  // Add 5 more habits following this structure to reach the 8 mentioned
];

const run = async () => {
  try {
    await connectDB();
    
    // Check if the demo user already exists
    let user = await User.findOne({ email: DEMO_USER_EMAIL });
    
    if (user) {
      // Wipe their existing habits, logs, and AI insights for a clean slate
      await Habit.deleteMany({ userId: user._id });
      await HabitLog.deleteMany({ userId: user._id });
      await AIInsight.deleteMany({ userId: user._id });
      
      // Reset name and password (pre-save hook hashes the new password automatically)
      user.name = DEMO_USER_NAME;
      user.password = DEMO_USER_PASSWORD;
      await user.save();
    } else {
      // Create user fresh
      user = await User.create({
        name: DEMO_USER_NAME,
        email: DEMO_USER_EMAIL,
        password: DEMO_USER_PASSWORD,
      });
    }

    const createdHabits = [];
    
    // Loop through the habits array and create each one
    for (const habitData of habits) {
      const { _streakProb, _pattern, _brokeAt, ...fields } = habitData;
      
      const habit = await Habit.create({
        ...fields,
        userId: user._id,
        // Backdate timestamps so stats page shows meaningful 30-day completion rates
        createdAt: subDays(new Date(), 90),
        updatedAt: subDays(new Date(), 90),
      });
      
      createdHabits.push({ habit, _streakProb, _pattern, _brokeAt });
    }

    const logsToInsert = [];
    
    // Date helper and logs builder: walk back 90 days for each habit
    for (const { habit, _streakProb, _pattern, _brokeAt } of createdHabits) {
      for (let i = 89; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateKey = format(date, "yyyy-MM-dd");
        
        // Deterministic pseudo-random function using day index and habit name length
        // This ensures the demo data is the exact same on every run
        let shouldComplete = (i + habit.name.length) % 100 < (_streakProb * 100);
        
        // Apply weekend reduction pattern
        if (_pattern === "weekend-drop-off" && (date.getDay() === 0 || date.getDay() === 6)) {
           shouldComplete = false;
        }

        // Apply forced streak break logic
        if (_brokeAt && i >= _brokeAt && i <= _brokeAt + 5) {
           shouldComplete = false;
        }
        
        if (shouldComplete) {
          logsToInsert.push({
            userId: user._id,
            habitId: habit._id,
            completedDate: dateKey
          });
        }
      }
    }

    // Make sure the first four habits are checked off for today
    for (let j = 0; j < Math.min(4, createdHabits.length); j++) {
       const todayKey = format(new Date(), "yyyy-MM-dd");
       logsToInsert.push({
          userId: user._id,
          habitId: createdHabits[j].habit._id,
          completedDate: todayKey
       });
    }

    // Bulk insert with ordered: false so duplicate keys don't stop the insert
    await HabitLog.insertMany(logsToInsert, { ordered: false }).catch(err => {
      // Catch and ignore expected duplicate key errors
    });

    // Log success summary
    console.log(`Seed complete: User "${user.email}", Password: "${DEMO_USER_PASSWORD}", Habits: ${createdHabits.length}, Approx Logs: ${logsToInsert.length}`);
    
    // Disconnect from Mongo
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    // Catch and log failures, exiting cleanly
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

run();