import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Directory where we persist analysis results as JSON files
const resultsDir = path.join(process.cwd(), "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const { mudraName, description } = req.body;
    const imagePath = req.file.path;

    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY not found in .env");
    }

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Read and convert image to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString("base64");

    // Create the analysis prompt
    const prompt = `You are a kind and encouraging Bharatanatyam dance teacher analyzing a student's mudra attempt.

Student is performing: "${mudraName}" mudra

Correct formation for ${mudraName}:
"${description}"

IMPORTANT INSTRUCTIONS:
1. Be GENEROUS and ENCOURAGING in your evaluation
2. If the mudra is 10% or more accurate: Consider it CORRECT
3. Focus on the overall gesture rather than minor imperfections
4. Remember that small variations are natural and acceptable

RESPONSE FORMAT:

If the mudra is MOSTLY CORRECT (10-100% accurate):
"🎉 Great work! You have learned the ${mudraName} mudra! Your hand position captures the essence of this gesture beautifully. [Mention 1-2 positive specific things they did well]. Keep practicing to refine it further!"

If the mudra NEEDS IMPROVEMENT (below 10%):
"Good attempt at ${mudraName}! You're on the right track. Here's what to focus on:

**What to adjust:**
• [Most important fix - be specific but kind]
• [Second important fix if needed]

**You're doing well:**
• [Something positive they're doing correctly]

Keep practicing - you're making progress!"

Be warm, supportive, and focus on encouragement. Students learn better with positive reinforcement.`;

    // Generate content with image
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: req.file.mimetype || "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const feedback = response.text() || "No feedback generated.";

    // Persist the result to a JSON file so frontend (or user) can fetch it later
    const resultId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const resultPayload = {
      success: true,
      feedback,
      mudraName,
      timestamp: new Date().toISOString()
    };

    const resultPath = path.join(resultsDir, `${resultId}.json`);
    try {
      fs.writeFileSync(resultPath, JSON.stringify(resultPayload, null, 2), 'utf8');
      console.log('💾 Saved analysis result to', resultPath);
    } catch (writeErr) {
      console.warn('⚠️ Failed to save result file:', writeErr);
    }

    // Clean up uploaded file
    try { fs.unlinkSync(imagePath); } catch (e) { /* ignore */ }

    // Return the resultId so frontend can fetch the stored JSON if desired
    res.status(200).json({ 
      success: true,
      feedback,
      mudraName,
      resultId
    });

  } catch (error) {
    console.error("Error analyzing mudra:", error);
    
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      success: false,
      error: "Error analyzing mudra. Please try again.",
      details: error.message 
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Server is running", timestamp: new Date() });
});

// Serve stored analysis result by id
app.get('/result/:id', (req, res) => {
  const id = req.params.id;
  console.log('🔎 GET /result/' + id);
  const filePath = path.join(resultsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Result not found' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Failed to read result file:', err);
    return res.status(500).json({ success: false, error: 'Failed to read result' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ MudraSense Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`📸 Analysis endpoint: http://localhost:${port}/analyze`);
});