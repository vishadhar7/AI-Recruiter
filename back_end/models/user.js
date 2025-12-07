import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  resumeText: { type: String },
  score: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
