import mongoose from "mongoose";

const ScreeningSchema = new mongoose.Schema({
  jobTitle: String,
  skillsRequired: String,
  positions: Number,
  resumes: [String],
  result: Object, // AI Screening Result
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Screening", ScreeningSchema);
