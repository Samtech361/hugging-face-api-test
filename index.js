// server.js
import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize OpenAI client for Hugging Face
const client = new OpenAI({
  baseURL: 'https://api-inference.huggingface.co/v1/',
  apiKey: process.env.HUGGINGFACE_API_KEY
});

// Serve the HTML interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Resume Enhancer</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
        .container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        textarea { width: 100%; height: 200px; margin: 10px 0; }
        .recommendations { white-space: pre-wrap; margin: 20px 0; padding: 15px; border: 1px solid #ccc; }
        .score { font-size: 1.5em; font-weight: bold; color: #2c5282; }
        button { padding: 10px 20px; background: #2c5282; color: white; border: none; cursor: pointer; }
        button:hover { background: #2d3748; }
      </style>
    </head>
    <body>
      <h1>Resume Enhancement System</h1>
      <div class="container">
        <div>
          <h2>Job Description</h2>
          <textarea id="jobDescription" placeholder="Paste job description here..."></textarea>
        </div>
        <div>
          <h2>Resume</h2>
          <textarea id="resume" placeholder="Paste resume here..."></textarea>
        </div>
      </div>
      <button onclick="analyzeResume()">Analyze and Get Recommendations</button>
      <div id="score" class="score"></div>
      <div id="recommendations" class="recommendations"></div>

      <script>
        async function analyzeResume() {
          const jobDescription = document.getElementById('jobDescription').value;
          const resume = document.getElementById('resume').value;
          const recommendationsDiv = document.getElementById('recommendations');
          const scoreDiv = document.getElementById('score');
          
          recommendationsDiv.textContent = 'Analyzing...';
          scoreDiv.textContent = '';

          try {
            const response = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobDescription, resume })
            });

            if (!response.ok) {
              throw new Error(await response.text());
            }

            recommendationsDiv.textContent = '';
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let fullText = '';
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              
              const text = decoder.decode(value);
              fullText += text;
              recommendationsDiv.textContent = fullText;

              // Extract and display score if present
              const scoreMatch = fullText.match(/Match Score: (\d+)%/);
              if (scoreMatch) {
                scoreDiv.textContent = scoreMatch[0];
              }
            }
          } catch (error) {
            recommendationsDiv.textContent = 'Error: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Helper function to create a structured prompt for Phi-3
function createAnalysisPrompt(jobDescription, resume) {
  return `You are an expert resume consultant. Analyze the following resume against the job description and provide specific recommendations to improve the match. First calculate a match percentage based on key requirements, then provide detailed suggestions.

Job Description:
${jobDescription}

Resume:
${resume}

Please provide your analysis in the following format:
1. Match Score: [percentage]%
2. Key Missing Skills:
   - [List specific skills from job description missing in resume]
3. Experience Gaps:
   - [List any experience requirements not adequately addressed]
4. Specific Recommendations:
   - [Provide actionable recommendations to improve the resume]
5. Keyword Optimization:
   - [Suggest relevant keywords to add]

Focus on concrete, actionable recommendations that will improve the match score.`;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { jobDescription, resume } = req.body;

    if (!jobDescription || !resume) {
      throw new Error('Both job description and resume are required');
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await client.chat.completions.create({
      model: 'microsoft/Phi-3-mini-4k-instruct',
      messages: [
        { 
          role: 'user', 
          content: createAnalysisPrompt(jobDescription, resume)
        }
      ],
      max_tokens: 1000,
      stream: true,
      temperature: 0.7, // Balanced between creativity and consistency
    });

    // Stream the response
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const content = chunk.choices[0].delta.content;
        if (content) {
          res.write(content);
        }
      }
    }

    res.end();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send(error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});