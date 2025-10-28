import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const upload = multer({ dest: "/tmp" });

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (req.method === "POST") {
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(500).json({ error: "Upload error" });
      }

      try {
        const { mudraName, description } = req.body;
        const imagePath = req.file.path;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
You are an expert Bharatanatyam teacher.
Analyze the uploaded image of a student performing the mudra "${mudraName}".
Compare it with this description:
"${description}"
Give specific feedback on hand positioning, finger alignment, and accuracy.
`;

        const imageBuffer = fs.readFileSync(imagePath);
        const imageBase64 = imageBuffer.toString("base64");

        const result = await model.generateContent([
          { text: prompt },
          { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
        ]);

        const feedback =
          result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "No feedback generated.";

        fs.unlinkSync(imagePath);
        res.status(200).json({ feedback });
      } catch (error) {
        console.error("Error analyzing:", error);
        res.status(500).json({ error: "Error analyzing mudra." });
      }
    });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
